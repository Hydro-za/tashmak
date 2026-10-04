-- PrintOps schema, part 3b: job workflow (single race-safe, idempotent entry point), QC, quantities, assignment, files, dashboards, search.
create or replace function public.job_action(p_job uuid, p_action text, p_note text default null, p_expected_status text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.jobs%rowtype; me uuid := (select auth.uid()); r text := public.current_role_name(); nm text; is_own boolean; asg_d boolean; asg_p boolean;
  ns text; msg text; target text; need_qc boolean; noop jsonb; req_status text;
begin
  if me is null or r is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  is_own := (r = 'owner');
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found'; end if;
  asg_d := public.job_stage_assigned(p_job, 'design'); asg_p := public.job_stage_assigned(p_job, 'production');
  if not (is_own or asg_d or asg_p) then raise exception 'forbidden' using errcode = '42501'; end if;
  if j.archived_at is not null then raise exception 'job_archived'; end if;
  nm := public.person_name(me);
  noop := jsonb_build_object('ok', true, 'noop', true, 'status', j.status);

  if p_action = 'design_start' then
    if not (is_own or asg_d) then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.design_started_at is not null then return noop; end if;
    if j.status <> 'design' then raise exception 'invalid_transition: design cannot be started from %', j.status; end if;
    update public.jobs set design_started_at = now(), design_started_by = me, version = version + 1 where id = p_job;
    msg := nm || ' started design';
  elsif p_action = 'design_complete' then
    if not (is_own or asg_d) then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.status <> 'design' then
      if j.design_completed_at is not null then return noop; end if;
      raise exception 'invalid_transition: design cannot be completed from %', j.status;
    end if;
    ns := case when j.design_approval_required then 'design_review' else 'queued' end;
    update public.jobs set status = ns, design_started_at = coalesce(design_started_at, now()), design_started_by = coalesce(design_started_by, me),
      design_completed_at = now(), design_completed_by = me, version = version + 1 where id = p_job;
    msg := nm || ' completed design';
  elsif p_action = 'design_approve' then
    if not is_own then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.status = 'queued' and j.design_completed_at is not null then return noop; end if;
    if j.status <> 'design_review' then raise exception 'invalid_transition: nothing to approve in status %', j.status; end if;
    update public.jobs set status = 'queued', version = version + 1 where id = p_job;
    msg := nm || ' approved the design';
  elsif p_action = 'design_reject' then
    if not is_own then raise exception 'forbidden' using errcode = '42501'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
    if j.status <> 'design_review' then raise exception 'invalid_transition: nothing to reject in status %', j.status; end if;
    update public.jobs set status = 'design', design_completed_at = null, design_completed_by = null, version = version + 1 where id = p_job;
    msg := nm || ' sent the design back for changes';
  elsif p_action = 'production_start' then
    if not (is_own or asg_p) then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.status = 'in_production' then return noop; end if;
    if j.status not in ('queued', 'rework') then raise exception 'invalid_transition: production cannot be started from %', j.status; end if;
    update public.jobs set status = 'in_production', production_started_at = coalesce(production_started_at, now()), production_started_by = coalesce(production_started_by, me), version = version + 1 where id = p_job;
    update public.job_items set status = 'in_production' where job_id = p_job and status in ('pending', 'rework');
    msg := nm || ' started production';
  elsif p_action = 'production_complete' then
    if not (is_own or asg_p) then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.status <> 'in_production' then
      if j.production_completed_at is not null then return noop; end if;
      raise exception 'invalid_transition: production cannot be completed from %', j.status;
    end if;
    need_qc := exists (select 1 from public.job_items where job_id = p_job and requires_qc);
    ns := case when need_qc then 'qc' else 'completed' end;
    update public.jobs set status = ns, production_completed_at = now(), production_completed_by = me, completed_at = case when ns = 'completed' then now() else completed_at end, version = version + 1 where id = p_job;
    update public.job_items set status = case when requires_qc then 'qc' else 'completed' end, qty_completed = case when qty_completed = 0 then qty_ordered else qty_completed end, qty_in_production = 0 where job_id = p_job;
    msg := nm || ' completed production' || case when need_qc then ' (awaiting QC)' else '' end;
  elsif p_action in ('ready_collection', 'ready_delivery') then
    if not is_own then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.status = p_action then return noop; end if;
    if j.status not in ('completed', 'ready_collection', 'ready_delivery') then raise exception 'invalid_transition: cannot mark ready from %', j.status; end if;
    update public.jobs set status = p_action, fulfilment = case p_action when 'ready_collection' then 'collection' else 'delivery' end, ready_at = now(), version = version + 1 where id = p_job;
    msg := format('Job %s marked ready for %s by %s', j.number, case p_action when 'ready_collection' then 'collection' else 'delivery' end, nm);
  elsif p_action in ('collected', 'delivered') then
    if not is_own then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.status = p_action then return noop; end if;
    req_status := case p_action when 'collected' then 'ready_collection' else 'ready_delivery' end;
    if j.status <> req_status then raise exception 'invalid_transition: cannot mark % from %', p_action, j.status; end if;
    update public.jobs set status = p_action, fulfilled_at = now(), fulfilled_by = me, fulfilment_note = nullif(trim(coalesce(p_note, '')), ''), version = version + 1 where id = p_job;
    msg := format('Job %s %s (recorded by %s)', j.number, p_action, nm);
  elsif p_action = 'ready_invoice' then
    if not is_own then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.status = 'ready_invoice' then return noop; end if;
    if j.status not in ('collected', 'delivered') then raise exception 'invalid_transition: cannot mark ready for invoice from %', j.status; end if;
    update public.jobs set status = 'ready_invoice', invoice_ready_at = now(), invoice_ready_by = me, version = version + 1 where id = p_job;
    msg := format('Job %s marked ready for invoice by %s', j.number, nm);
  elsif p_action = 'cancel' then
    if not is_own then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.status = 'cancelled' then return noop; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
    update public.jobs set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_note), version = version + 1 where id = p_job;
    msg := format('Job %s cancelled by %s', j.number, nm);
  elsif p_action in ('reopen_design', 'reopen_queued', 'reopen_production') then
    if not is_own then raise exception 'forbidden' using errcode = '42501'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'reason_required'; end if;
    if j.status not in ('completed', 'ready_collection', 'ready_delivery', 'collected', 'delivered', 'ready_invoice', 'cancelled') then raise exception 'invalid_transition: job is still active'; end if;
    target := case p_action when 'reopen_design' then 'design' when 'reopen_production' then 'in_production' else 'queued' end;
    if target = 'design' and not j.design_required then raise exception 'invalid_transition: this job has no design stage'; end if;
    update public.jobs set status = target, reopened_count = reopened_count + 1, completed_at = null, ready_at = null, fulfilled_at = null, fulfilled_by = null, fulfilment_note = null,
      invoice_ready_at = null, invoice_ready_by = null, cancelled_at = null, cancel_reason = null,
      design_completed_at = case when target = 'design' then null else design_completed_at end, design_started_at = case when target = 'design' then null else design_started_at end,
      production_completed_at = null, version = version + 1 where id = p_job;
    update public.job_items set status = case when target = 'design' then 'pending' else 'rework' end where job_id = p_job;
    msg := format('Job %s reopened by %s', j.number, nm);
  else
    raise exception 'unknown_action: %', p_action;
  end if;

  select status into ns from public.jobs where id = p_job;
  perform public.log_activity(p_job, j.quote_id, j.customer_id, p_action, msg, p_note);

  if p_action = 'design_complete' then
    perform public.notify_owners('design_complete', format('Design complete — job %s', j.number), nm || case when ns = 'design_review' then ' — waiting for your approval' else '' end, p_job, null, 'job:' || p_job::text || ':design_complete');
    if ns = 'queued' then perform public.notify_stage(p_job, 'production', 'ready_for_production', format('Job %s ready for production', j.number), 'Design is complete.', 'job:' || p_job::text || ':ready_prod'); end if;
  elsif p_action = 'design_approve' then
    perform public.notify_stage(p_job, 'production', 'ready_for_production', format('Job %s ready for production', j.number), 'Design approved.', 'job:' || p_job::text || ':ready_prod');
  elsif p_action = 'design_reject' then
    perform public.notify_stage(p_job, 'design', 'design_changes', format('Changes requested — job %s', j.number), p_note, 'job:' || p_job::text || ':design_reject:' || (j.version + 1)::text);
  elsif p_action = 'production_start' then
    perform public.notify_owners('production_started', format('Production started — job %s', j.number), nm, p_job, null, 'job:' || p_job::text || ':prod_start:' || (j.version + 1)::text);
  elsif p_action = 'production_complete' then
    perform public.notify_owners('production_complete', format('Production complete — job %s', j.number), nm || case when ns = 'qc' then ' — QC needed' else '' end, p_job, null, 'job:' || p_job::text || ':prod_done:' || (j.version + 1)::text);
  elsif p_action in ('ready_collection', 'ready_delivery') then
    perform public.notify_owners(p_action, format('Job %s ready for %s', j.number, case p_action when 'ready_collection' then 'collection' else 'delivery' end), j.customer_name, p_job, null, 'job:' || p_job::text || ':' || p_action || ':' || (j.version + 1)::text);
  elsif p_action like 'reopen_%' or p_action = 'cancel' then
    perform public.notify_stage(p_job, 'design', 'job_update', format('Job %s %s', j.number, case when p_action = 'cancel' then 'cancelled' else 'reopened' end), p_note, 'job:' || p_job::text || ':' || p_action || ':d:' || (j.version + 1)::text);
    perform public.notify_stage(p_job, 'production', 'job_update', format('Job %s %s', j.number, case when p_action = 'cancel' then 'cancelled' else 'reopened' end), p_note, 'job:' || p_job::text || ':' || p_action || ':p:' || (j.version + 1)::text);
  end if;
  return jsonb_build_object('ok', true, 'status', ns);
end $$;

create or replace function public.record_qc(p_job uuid, p_item uuid, p_result text, p_checked numeric, p_rejected numeric, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.jobs%rowtype; me uuid := (select auth.uid()); nm text; pending int; ns text;
begin
  if not (public.is_owner() or public.job_stage_assigned(p_job, 'qc')) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_result not in ('passed', 'failed', 'rework_required') then raise exception 'invalid_result'; end if;
  if coalesce(p_checked, -1) < 0 or coalesce(p_rejected, -1) < 0 or p_rejected > p_checked then raise exception 'invalid_quantities'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.status <> 'qc' then raise exception 'invalid_transition: job is not awaiting QC (status %)', j.status; end if;
  if p_item is not null and not exists (select 1 from public.job_items where id = p_item and job_id = p_job) then raise exception 'invalid_item'; end if;
  nm := public.person_name(me);
  insert into public.qc_checks(job_id, job_item_id, result, qty_checked, qty_rejected, notes, checked_by) values (p_job, p_item, p_result, p_checked, p_rejected, nullif(trim(coalesce(p_notes, '')), ''), me);
  if p_result = 'passed' then
    update public.job_items set status = 'completed', qty_rejected = qty_rejected + coalesce(p_rejected, 0) where job_id = p_job and requires_qc and (p_item is null or id = p_item);
  else
    update public.job_items set status = 'rework', qty_rework = qty_rework + greatest(coalesce(p_rejected, 0), 0), qty_rejected = qty_rejected + coalesce(p_rejected, 0) where job_id = p_job and requires_qc and (p_item is null or id = p_item);
  end if;
  select count(*) into pending from public.job_items where job_id = p_job and requires_qc and status <> 'completed';
  if p_result <> 'passed' then
    update public.jobs set status = 'rework', production_completed_at = null, version = version + 1 where id = p_job;
    perform public.log_activity(p_job, j.quote_id, j.customer_id, 'qc_failed', format('QC FAILED on job %s (%s) — rework required, by %s', j.number, p_result, nm), p_notes);
    perform public.notify_stage(p_job, 'production', 'rework', format('Rework needed — job %s', j.number), p_notes, 'job:' || p_job::text || ':rework:' || (j.version + 1)::text);
    perform public.notify_owners('qc_failed', format('QC failed — job %s', j.number), p_notes, p_job, null, 'job:' || p_job::text || ':qcfail:' || (j.version + 1)::text);
    ns := 'rework';
  elsif pending = 0 then
    update public.jobs set status = 'completed', completed_at = now(), version = version + 1 where id = p_job;
    perform public.log_activity(p_job, j.quote_id, j.customer_id, 'qc_passed', format('QC passed on job %s by %s', j.number, nm), p_notes);
    perform public.notify_owners('qc_passed', format('QC passed — job %s', j.number), j.customer_name, p_job, null, 'job:' || p_job::text || ':qcpass:' || (j.version + 1)::text);
    ns := 'completed';
  else
    perform public.log_activity(p_job, j.quote_id, j.customer_id, 'qc_item_passed', format('QC passed for an item on job %s by %s', j.number, nm), p_notes);
    ns := 'qc';
  end if;
  return jsonb_build_object('ok', true, 'status', ns);
end $$;

create or replace function public.update_item_progress(p_item uuid, p_in_production numeric, p_completed numeric, p_rejected numeric, p_rework numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it public.job_items%rowtype; j public.jobs%rowtype;
begin
  select * into it from public.job_items where id = p_item for update;
  if not found then raise exception 'item_not_found'; end if;
  select * into j from public.jobs where id = it.job_id;
  if not (public.is_owner() or public.job_stage_assigned(it.job_id, 'production')) then raise exception 'forbidden' using errcode = '42501'; end if;
  if least(coalesce(p_in_production, 0), coalesce(p_completed, 0), coalesce(p_rejected, 0), coalesce(p_rework, 0)) < 0 then raise exception 'invalid_quantities'; end if;
  if coalesce(p_completed, 0) > it.qty_ordered then raise exception 'completed_exceeds_ordered'; end if;
  update public.job_items set qty_in_production = coalesce(p_in_production, 0), qty_completed = coalesce(p_completed, 0), qty_rejected = coalesce(p_rejected, 0), qty_rework = coalesce(p_rework, 0) where id = p_item;
  perform public.log_activity(it.job_id, j.quote_id, j.customer_id, 'progress', format('%s: completed %s of %s, rejected %s (by %s)', it.product_name, coalesce(p_completed, 0), it.qty_ordered, coalesce(p_rejected, 0), public.person_name((select auth.uid()))));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.job_assign(p_job uuid, p_stage text, p_users uuid[]) returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.jobs%rowtype; me uuid := (select auth.uid()); u uuid; need_role text; old uuid;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_stage not in ('design', 'production', 'qc') then raise exception 'invalid_stage'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found'; end if;
  need_role := case p_stage when 'design' then 'designer' when 'production' then 'production' else null end;
  foreach u in array coalesce(p_users, '{}'::uuid[]) loop
    if not exists (select 1 from public.profiles where id = u and active and (need_role is null or role = need_role or (p_stage = 'qc' and role in ('owner', 'production')))) then raise exception 'invalid_employee_for_stage'; end if;
  end loop;
  if p_stage = 'design' and coalesce(array_length(p_users, 1), 0) > 1 then raise exception 'one_designer_only'; end if;
  for old in select user_id from public.job_assignments where job_id = p_job and stage = p_stage and active and not (user_id = any (coalesce(p_users, '{}'::uuid[]))) loop
    update public.job_assignments set active = false where job_id = p_job and stage = p_stage and user_id = old;
    perform public.log_activity(p_job, j.quote_id, j.customer_id, 'unassigned', format('%s removed from %s on job %s', public.person_name(old), p_stage, j.number));
    perform public.notify(old, 'reassigned', format('Job %s reassigned', j.number), 'You are no longer assigned to this job.', p_job, null, 'unassign:' || p_job::text || ':' || p_stage || ':' || old::text || ':' || j.version::text);
  end loop;
  foreach u in array coalesce(p_users, '{}'::uuid[]) loop
    if not exists (select 1 from public.job_assignments where job_id = p_job and stage = p_stage and user_id = u and active) then
      insert into public.job_assignments(job_id, user_id, stage, assigned_by) values (p_job, u, p_stage, me)
      on conflict (job_id, user_id, stage) do update set active = true, assigned_by = me, assigned_at = now();
      perform public.log_activity(p_job, j.quote_id, j.customer_id, 'assigned', format('Job %s assigned to %s for %s', j.number, public.person_name(u), p_stage));
      perform public.notify(u, 'assigned', format('Job %s assigned to you (%s)', j.number, p_stage), j.customer_name, p_job, null, 'assign:' || p_job::text || ':' || p_stage || ':' || u::text || ':' || j.version::text);
    end if;
  end loop;
  update public.jobs set version = version + 1 where id = p_job;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.job_update_details(p_job uuid, p_patch jsonb, p_expected_version int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.jobs%rowtype; nd date; np text; me uuid := (select auth.uid()); nm text;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found'; end if;
  if p_expected_version is not null and p_expected_version <> j.version then raise exception 'version_conflict'; end if;
  nm := public.person_name(me);
  if p_patch ? 'priority' then
    np := p_patch ->> 'priority';
    if np not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid_priority'; end if;
    if np <> j.priority then
      update public.jobs set priority = np where id = p_job;
      perform public.log_activity(p_job, j.quote_id, j.customer_id, 'priority_changed', format('Priority changed from %s to %s by %s', j.priority, np, nm));
      perform public.notify_stage(p_job, 'design', 'priority', format('Priority changed — job %s', j.number), format('Now %s', upper(np)), 'job:' || p_job::text || ':prio:d:' || (j.version + 1)::text);
      perform public.notify_stage(p_job, 'production', 'priority', format('Priority changed — job %s', j.number), format('Now %s', upper(np)), 'job:' || p_job::text || ':prio:p:' || (j.version + 1)::text);
    end if;
  end if;
  if p_patch ? 'due_date' then
    nd := nullif(p_patch ->> 'due_date', '')::date;
    if nd is distinct from j.due_date then
      update public.jobs set due_date = nd where id = p_job;
      perform public.log_activity(p_job, j.quote_id, j.customer_id, 'due_changed', format('Due date changed from %s to %s by %s', coalesce(j.due_date::text, 'none'), coalesce(nd::text, 'none'), nm));
      perform public.notify_stage(p_job, 'design', 'due_date', format('Due date changed — job %s', j.number), coalesce(nd::text, 'no due date'), 'job:' || p_job::text || ':due:d:' || (j.version + 1)::text);
      perform public.notify_stage(p_job, 'production', 'due_date', format('Due date changed — job %s', j.number), coalesce(nd::text, 'no due date'), 'job:' || p_job::text || ':due:p:' || (j.version + 1)::text);
    end if;
  end if;
  if p_patch ? 'instructions' then
    update public.jobs set instructions = nullif(trim(coalesce(p_patch ->> 'instructions', '')), '') where id = p_job;
    perform public.log_activity(p_job, j.quote_id, j.customer_id, 'instructions_changed', format('Instructions updated by %s', nm));
  end if;
  if p_patch ? 'design_approval_required' then
    update public.jobs set design_approval_required = (p_patch ->> 'design_approval_required')::boolean where id = p_job;
  end if;
  update public.jobs set version = version + 1 where id = p_job;
  return jsonb_build_object('ok', true, 'version', j.version + 1);
end $$;

create or replace function public.add_job_note(p_job uuid, p_note text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.jobs%rowtype; me uuid := (select auth.uid()); nid uuid;
begin
  select * into j from public.jobs where id = p_job;
  if not found then raise exception 'job_not_found'; end if;
  if not (public.is_owner() or public.is_assigned(p_job)) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.job_notes(job_id, user_id, note) values (p_job, me, p_note) returning id into nid;
  perform public.log_activity(p_job, j.quote_id, j.customer_id, 'note_added', format('%s added a note', public.person_name(me)), p_note);
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function public.record_supplied_item(p_job uuid, p_item uuid, p_description text, p_qty numeric, p_condition text, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.jobs%rowtype; me uuid := (select auth.uid()); sid uuid;
begin
  select * into j from public.jobs where id = p_job;
  if not found then raise exception 'job_not_found'; end if;
  if not (public.is_owner() or public.job_stage_assigned(p_job, 'production')) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_item is not null and not exists (select 1 from public.job_items where id = p_item and job_id = p_job) then raise exception 'invalid_item'; end if;
  insert into public.customer_supplied_items(job_id, job_item_id, description, qty_received, condition, received_by, notes) values (p_job, p_item, p_description, p_qty, p_condition, me, p_notes) returning id into sid;
  perform public.log_activity(p_job, j.quote_id, j.customer_id, 'supplied_item', format('Customer-supplied item received: %s x %s (%s)', p_qty, p_description, coalesce(p_condition, 'condition not noted')), p_notes);
  return jsonb_build_object('ok', true, 'id', sid);
end $$;

create or replace function public.register_file(p_job uuid, p_quote uuid, p_customer uuid, p_item uuid, p_kind text, p_path text, p_name text, p_mime text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); j public.jobs%rowtype; fid uuid; ver int;
begin
  if p_job is not null then
    select * into j from public.jobs where id = p_job;
    if not found then raise exception 'job_not_found'; end if;
    if not (public.is_owner() or public.is_assigned(p_job)) then raise exception 'forbidden' using errcode = '42501'; end if;
    if p_path not like 'jobs/' || p_job::text || '/%' then raise exception 'invalid_path'; end if;
    if p_item is not null and not exists (select 1 from public.job_items where id = p_item and job_id = p_job) then raise exception 'invalid_item'; end if;
  else
    if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
    if not ((p_quote is not null and p_path like 'quotes/' || p_quote::text || '/%') or (p_customer is not null and p_path like 'customers/' || p_customer::text || '/%')) then raise exception 'invalid_path'; end if;
  end if;
  insert into public.file_attachments(job_id, job_item_id, quote_id, customer_id, kind, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_job, p_item, p_quote, p_customer, p_kind, p_path, p_name, p_mime, p_size, me) returning id, version into fid, ver;
  if p_job is not null then
    perform public.log_activity(p_job, j.quote_id, j.customer_id, 'file_uploaded', format('%s uploaded %s (%s v%s)', public.person_name(me), p_name, p_kind, ver));
  end if;
  return jsonb_build_object('ok', true, 'id', fid, 'version', ver);
end $$;

create or replace function public.set_final_file(p_file uuid, p_confirm boolean default false, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.file_attachments%rowtype; j public.jobs%rowtype; cur public.file_attachments%rowtype; me uuid := (select auth.uid()); nm text; after_start boolean; had_cur boolean;
begin
  select * into f from public.file_attachments where id = p_file for update;
  if not found or f.job_id is null then raise exception 'file_not_found'; end if;
  if f.kind not in ('artwork', 'design', 'print_ready', 'dtf_artwork') then raise exception 'not_artwork'; end if;
  if not (public.is_owner() or public.job_stage_assigned(f.job_id, 'design')) then raise exception 'forbidden' using errcode = '42501'; end if;
  if f.is_final then return jsonb_build_object('ok', true, 'noop', true); end if;
  select * into j from public.jobs where id = f.job_id for update;
  nm := public.person_name(me);
  select * into cur from public.file_attachments where job_id = f.job_id and job_item_id is not distinct from f.job_item_id and is_final and archived_at is null and kind in ('artwork', 'design', 'print_ready', 'dtf_artwork');
  had_cur := found;
  after_start := j.production_started_at is not null and j.status <> 'cancelled';
  if had_cur and after_start and not coalesce(p_confirm, false) then raise exception 'confirm_required: production has already started'; end if;
  if had_cur and after_start and coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if had_cur then update public.file_attachments set is_final = false where id = cur.id; end if;
  update public.file_attachments set is_final = true where id = p_file;
  if had_cur and after_start then
    perform public.log_activity(f.job_id, j.quote_id, j.customer_id, 'artwork_changed_after_production', format('FINAL artwork changed after production started: %s replaced by %s (by %s)', cur.file_name, f.file_name, nm), p_reason);
    perform public.notify_stage(f.job_id, 'production', 'artwork_changed', format('Artwork changed — job %s', j.number), 'The approved production file was replaced. Check before continuing.', 'file:' || p_file::text || ':changed');
    perform public.notify_owners('artwork_changed', format('Artwork changed after production started — job %s', j.number), p_reason, f.job_id, null, 'file:' || p_file::text || ':changed_o');
  else
    perform public.log_activity(f.job_id, j.quote_id, j.customer_id, 'artwork_final', format('%s marked %s (v%s) as FINAL / PRODUCTION READY', nm, f.file_name, f.version));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.generate_overdue_notifications() returns int language plpgsql security definer set search_path = '' as $$
declare j record; n int := 0; today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  for j in select id, number, customer_name, due_date, status from public.jobs where archived_at is null and public.job_overdue_days(due_date, status) > 0 loop
    perform public.notify_owners('job_overdue', format('Job %s is overdue', j.number), format('%s — due %s', j.customer_name, j.due_date), j.id, null, 'overdue:' || j.id::text || ':' || today::text);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.dashboard_counts() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'due_today', count(*) filter (where due_date = today and status not in ('completed','ready_collection','ready_delivery','collected','delivered','ready_invoice','cancelled')),
    'overdue', count(*) filter (where public.job_overdue_days(due_date, status) > 0),
    'waiting', count(*) filter (where status = 'queued'),
    'design', count(*) filter (where status in ('design', 'design_review')),
    'in_production', count(*) filter (where status in ('in_production', 'rework')),
    'qc', count(*) filter (where status = 'qc'),
    'completed', count(*) filter (where status = 'completed'),
    'ready_collection', count(*) filter (where status = 'ready_collection'),
    'ready_delivery', count(*) filter (where status = 'ready_delivery'),
    'ready_invoice', count(*) filter (where status = 'ready_invoice'))
    from public.jobs where archived_at is null);
end $$;

create or replace function public.employee_workload() returns table (user_id uuid, full_name text, role text, active_jobs int, overdue_jobs int, completed_jobs int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select p.id, p.full_name, p.role,
    (count(distinct j.id) filter (where j.status not in ('completed','ready_collection','ready_delivery','collected','delivered','ready_invoice','cancelled')))::int,
    (count(distinct j.id) filter (where public.job_overdue_days(j.due_date, j.status) > 0))::int,
    (count(distinct j.id) filter (where j.status in ('completed','ready_collection','ready_delivery','collected','delivered','ready_invoice')))::int
  from public.profiles p
  left join public.job_assignments a on a.user_id = p.id and a.active
  left join public.jobs j on j.id = a.job_id and j.archived_at is null
  where p.active and p.role <> 'owner'
  group by p.id, p.full_name, p.role order by p.full_name;
end $$;

create or replace function public.global_search(p_q text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%';
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(p_q)) < 2 then return jsonb_build_object('customers', '[]'::jsonb, 'quotes', '[]'::jsonb, 'jobs', '[]'::jsonb, 'employees', '[]'::jsonb); end if;
  return jsonb_build_object(
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'company', company)) from (select id, name, company from public.customers where (name || ' ' || coalesce(company, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '')) ilike q order by name limit 8) c), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'status', status, 'customer', cn)) from (select qt.id, qt.number, qt.status, cu.name as cn from public.quotes qt join public.customers cu on cu.id = qt.customer_id
        where qt.number ilike q or cu.name ilike q or exists (select 1 from public.quote_items qi where qi.quote_id = qt.id and qi.product_name ilike q) order by qt.created_at desc limit 8) x), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'status', status, 'customer', customer_name)) from (select jb.id, jb.number, jb.status, jb.customer_name from public.jobs jb
        where jb.number ilike q or jb.customer_name ilike q or exists (select 1 from public.job_items ji where ji.job_id = jb.id and ji.product_name ilike q) order by jb.created_at desc limit 8) y), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'role', role)) from (select id, full_name, role from public.profiles where full_name ilike q or username ilike q order by full_name limit 6) e), '[]'::jsonb));
end $$;

-- employee administration (all privileged work stays inside the database; the app never holds a service-role key)
create or replace function public.create_employee(p_username text, p_full_name text, p_role text, p_password text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := gen_random_uuid(); em text; uname text := lower(trim(coalesce(p_username, '')));
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('designer', 'production') then raise exception 'invalid_role'; end if;
  if uname !~ '^[a-z0-9._-]{3,32}$' then raise exception 'invalid_username'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 1 then raise exception 'name_required'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'password_too_short'; end if;
  if exists (select 1 from public.profiles where username = uname) then raise exception 'username_taken'; end if;
  em := uname || '@employees.invalid';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, extensions.crypt(p_password, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '', '', '', '', '', false);
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', uid::text, now(), now(), now());
  insert into public.profiles (id, username, full_name, role, active, must_change_password, created_by) values (uid, uname, trim(p_full_name), p_role, true, true, (select auth.uid()));
  insert into public.config_audit(table_name, record_id, action, new_data, user_id) values ('profiles', uid::text, 'EMPLOYEE_CREATED', jsonb_build_object('username', uname, 'role', p_role), (select auth.uid()));
  return uid;
end $$;

create or replace function public.reset_employee_password(p_user uuid, p_password text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'password_too_short'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role <> 'owner') then raise exception 'not_an_employee'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
  update public.profiles set must_change_password = true where id = p_user;
  insert into public.config_audit(table_name, record_id, action, user_id) values ('profiles', p_user::text, 'EMPLOYEE_PASSWORD_RESET', (select auth.uid()));
end $$;

create or replace function public.set_employee_active(p_user uuid, p_active boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role <> 'owner') then raise exception 'not_an_employee'; end if;
  update public.profiles set active = p_active where id = p_user;
  update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end where id = p_user;
  insert into public.config_audit(table_name, record_id, action, user_id) values ('profiles', p_user::text, case when p_active then 'EMPLOYEE_ACTIVATED' else 'EMPLOYEE_DEACTIVATED' end, (select auth.uid()));
end $$;

create or replace function public.update_employee(p_user uuid, p_full_name text, p_role text, p_phone text default null) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('designer', 'production') then raise exception 'invalid_role'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 1 then raise exception 'name_required'; end if;
  update public.profiles set full_name = trim(p_full_name), role = p_role, phone = nullif(trim(coalesce(p_phone, '')), '') where id = p_user and role <> 'owner';
  if not found then raise exception 'not_an_employee'; end if;
end $$;

create or replace function public.archive_record(p_kind text, p_id uuid, p_archive boolean default true) returns void language plpgsql security definer set search_path = '' as $$
declare ts timestamptz := case when p_archive then now() else null end; nm text;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind = 'customer' then
    update public.customers set archived_at = ts where id = p_id returning name into nm;
    if not found then raise exception 'not_found'; end if;
    perform public.log_activity(null, null, p_id, case when p_archive then 'customer_archived' else 'customer_restored' end, format('Customer %s %s', nm, case when p_archive then 'archived' else 'restored' end));
  elsif p_kind = 'quote' then
    update public.quotes set archived_at = ts where id = p_id returning number into nm;
    if not found then raise exception 'not_found'; end if;
    perform public.log_activity(null, p_id, null, case when p_archive then 'quote_archived' else 'quote_restored' end, format('Quote %s %s', nm, case when p_archive then 'archived' else 'restored' end));
  elsif p_kind = 'job' then
    update public.jobs set archived_at = ts where id = p_id returning number into nm;
    if not found then raise exception 'not_found'; end if;
    perform public.log_activity(p_id, null, null, case when p_archive then 'job_archived' else 'job_restored' end, format('Job %s %s', nm, case when p_archive then 'archived' else 'restored' end));
  else raise exception 'invalid_kind'; end if;
end $$;
