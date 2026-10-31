-- Make the Completed tab mean the job has been handed off and its invoice has been sent.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs
  add constraint jobs_status_check
  check (status in ('queued','design','design_review','in_production','qc','rework','completed','ready_collection','ready_delivery','collected','delivered','ready_invoice','job_done','cancelled'));

CREATE OR REPLACE FUNCTION public.invoice_job_snapshot(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare out jsonb;
begin
 if not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 select jsonb_build_object(
   'job_id',j.id,'job_number',j.number,'job_title',coalesce(j.title,''),
   'customer_name',coalesce(nullif(trim(j.customer_name),''),c.name),
   'quote_id',q.id,'quote_number',q.number,
   'sales_amount',nullif(q.totals->>'revenue','')::numeric,
   'vat_treatment',case when coalesce((q.totals->>'vatEnabled')::boolean,false)
      then upper(coalesce(q.totals->>'vatMode',''))||' VAT @ '||coalesce(q.totals->>'vatRate','')||'%'
      else 'No VAT' end,
   'vat_amount',nullif(q.totals->>'vat','')::numeric,
   'materials_cost',coalesce((select sum(coalesce(nullif(qi.item #>> '{calc,groups,material}','')::numeric,0)) from public.quote_items qi where qi.quote_id=q.id),0),
   'labour_cost',coalesce((select sum(coalesce(nullif(qi.item #>> '{calc,groups,labour}','')::numeric,0)) from public.quote_items qi where qi.quote_id=q.id),0),
   'invoice_total',nullif(q.totals->>'total','')::numeric,
   'quote_totals',q.totals,
   'items',coalesce((select jsonb_agg(jsonb_build_object('product_name',qi.product_name,'category_name',qi.category_name,'profile',qi.profile,'description',qi.description,'quantity',qi.quantity,'unit_price',qi.unit_price,'line_total',qi.line_total,'item',qi.item) order by qi.position) from public.quote_items qi where qi.quote_id=q.id),'[]'::jsonb),
   'item_count',(select count(*) from public.quote_items qi where qi.quote_id=q.id),
   'items_valid',coalesce((select bool_and(coalesce((qi.item #>> '{calc,ok}')::boolean,false) and jsonb_typeof(qi.item #> '{calc,groups}')='object') from public.quote_items qi where qi.quote_id=q.id),false)
 ) into out
 from public.jobs j
 left join public.customers c on c.id=j.customer_id
 left join public.quotes q on q.id=j.quote_id
 where j.id=p_job_id and j.archived_at is null;
 return out;
end $function$
;

CREATE OR REPLACE FUNCTION public.job_overdue_days(p_due date, p_status text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select case when p_due is not null
      and p_status not in ('job_done','cancelled')
      and p_due < (now() at time zone 'Africa/Johannesburg')::date
    then ((now() at time zone 'Africa/Johannesburg')::date - p_due) else 0 end $function$
;

CREATE OR REPLACE FUNCTION public.dashboard_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if not public.has_perm('jobs.view_all') then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'due_today', count(*) filter (where due_date = today and status not in ('job_done','cancelled')),
    'overdue', count(*) filter (where public.job_overdue_days(due_date, status) > 0),
    'waiting', count(*) filter (where status = 'queued'),
    'design', count(*) filter (where status in ('design', 'design_review')),
    'in_production', count(*) filter (where status in ('in_production', 'rework')),
    'qc', count(*) filter (where status = 'qc'),
    'completed', count(*) filter (where status = 'job_done'),
    'ready_collection', count(*) filter (where status = 'ready_collection'),
    'ready_delivery', count(*) filter (where status = 'ready_delivery'),
    'ready_invoice', count(*) filter (where status = 'ready_invoice'))
    from public.jobs where archived_at is null);
end $function$
;

CREATE OR REPLACE FUNCTION public.employee_workload()
 RETURNS TABLE(user_id uuid, full_name text, role text, active_jobs integer, overdue_jobs integer, completed_jobs integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.has_perm('employees.view') then raise exception 'forbidden' using errcode='42501'; end if;
 return query
 select p.id,p.full_name,
   coalesce((select string_agg(r.name, ', ' order by r.name) from public.profile_roles x join public.roles r on r.id=x.role_id where x.user_id=p.id),r.name,p.role),
   (count(distinct j.id) filter (where j.status not in ('job_done','cancelled')))::int,
   (count(distinct j.id) filter (where public.job_overdue_days(j.due_date,j.status)>0))::int,
   (count(distinct j.id) filter (where j.status = 'job_done'))::int
 from public.profiles p
 left join public.roles r on r.id=p.role_id
 left join public.job_assignments a on a.user_id=p.id and a.active
 left join public.jobs j on j.id=a.job_id and j.archived_at is null
 where p.active and p.role<>'owner'
 group by p.id,p.full_name,p.role,r.name
 order by p.full_name;
end $function$
;

CREATE OR REPLACE FUNCTION public.job_action(p_job uuid, p_action text, p_note text DEFAULT NULL::text, p_expected_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.jobs%rowtype; me uuid := (select auth.uid()); r text := public.current_role_name(); nm text; is_own boolean; asg_d boolean; asg_p boolean;
  ns text; msg text; target text; need_qc boolean; noop jsonb; req_status text; completed_snapshot jsonb; finished_at timestamptz;
begin
  if me is null or r is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  is_own := public.has_perm('jobs.manage');
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
    update public.jobs set status = ns, qc_status = 'not_checked', qc_checked_by = null, qc_checked_at = null, qc_note = null, production_completed_at = now(), production_completed_by = me, completed_at = case when ns = 'completed' then now() else completed_at end, version = version + 1 where id = p_job;
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
  elsif p_action = 'complete_job' then
    if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
    if p_note is distinct from 'confirm_handoff_and_invoice_sent' then raise exception 'completion_confirmation_required'; end if;
    if j.status not in ('collected', 'delivered', 'ready_invoice') or j.fulfilled_at is null then
      raise exception 'job_not_ready_for_accounting';
    end if;
    completed_snapshot := public.invoice_job_snapshot(p_job);
    if completed_snapshot is null or completed_snapshot->>'quote_id' is null
       or coalesce((completed_snapshot->>'items_valid')::boolean, false) is not true
       or coalesce((completed_snapshot->>'item_count')::integer, 0) = 0
       or coalesce(jsonb_array_length(completed_snapshot->'items'), 0) = 0
       or nullif(trim(coalesce(completed_snapshot->>'customer_name', '')), '') is null
       or nullif(completed_snapshot->>'sales_amount', '') is null
       or nullif(completed_snapshot->>'vat_amount', '') is null
       or nullif(completed_snapshot->>'invoice_total', '') is null then
      raise exception 'accounting_figures_need_review';
    end if;
    finished_at := now();
    completed_snapshot := completed_snapshot || jsonb_build_object(
      'handoff_confirmed', true,
      'invoice_sent_confirmed', true,
      'completion_confirmation_method', 'manual_owner_confirmation'
    );
    insert into public.job_accounting_completions (job_id, completed_by, completed_at, source_snapshot)
    values (p_job, me, finished_at, completed_snapshot)
    on conflict (job_id) do update
      set completed_by = excluded.completed_by,
          completed_at = excluded.completed_at,
          source_snapshot = excluded.source_snapshot;
    update public.jobs
    set status = 'job_done', completed_at = finished_at, version = version + 1
    where id = p_job;
    msg := format('Job %s completed after handoff and invoice sent', j.number);
  elsif p_action = 'cancel' then
    if not is_own then raise exception 'forbidden' using errcode = '42501'; end if;
    if j.status = 'cancelled' then return noop; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
    update public.jobs set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_note), version = version + 1 where id = p_job;
    msg := format('Job %s cancelled by %s', j.number, nm);
  elsif p_action in ('reopen_design', 'reopen_queued', 'reopen_production') then
    if not is_own then raise exception 'forbidden' using errcode = '42501'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'reason_required'; end if;
    if j.status not in ('completed', 'ready_collection', 'ready_delivery', 'collected', 'delivered', 'ready_invoice', 'job_done', 'cancelled') then raise exception 'invalid_transition: job is still active'; end if;
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
  perform public.log_activity(p_job, j.quote_id, j.customer_id, case when p_action = 'complete_job' then 'job_done' else p_action end, msg, case when p_action = 'complete_job' then 'Owner confirmed handoff was complete and the invoice had been entered in Sage and sent.' else p_note end);

  if p_action = 'design_complete' then
    perform public.notify_managers('design_complete', format('Design complete — job %s', j.number), nm || case when ns = 'design_review' then ' — waiting for your approval' else '' end, p_job, null, 'job:' || p_job::text || ':design_complete');
    if ns = 'queued' then perform public.notify_stage(p_job, 'production', 'ready_for_production', format('Job %s ready for production', j.number), 'Design is complete.', 'job:' || p_job::text || ':ready_prod'); end if;
  elsif p_action = 'design_approve' then
    perform public.notify_stage(p_job, 'production', 'ready_for_production', format('Job %s ready for production', j.number), 'Design approved.', 'job:' || p_job::text || ':ready_prod');
  elsif p_action = 'design_reject' then
    perform public.notify_stage(p_job, 'design', 'design_changes', format('Changes requested — job %s', j.number), p_note, 'job:' || p_job::text || ':design_reject:' || (j.version + 1)::text);
  elsif p_action = 'production_start' then
    perform public.notify_managers('production_started', format('Production started — job %s', j.number), nm, p_job, null, 'job:' || p_job::text || ':prod_start:' || (j.version + 1)::text);
  elsif p_action = 'production_complete' then
    perform public.notify_managers('production_complete', format('Production complete — job %s', j.number), nm || case when ns = 'qc' then ' — QC needed' else '' end, p_job, null, 'job:' || p_job::text || ':prod_done:' || (j.version + 1)::text);
    if ns = 'qc' then perform public.notify_perm('qc.perform', 'qc_needed', format('Quality check needed — job %s', j.number), j.customer_name, p_job, null, 'job:' || p_job::text || ':qcneeded:' || (j.version + 1)::text); end if;
  elsif p_action in ('ready_collection', 'ready_delivery') then
    perform public.notify_managers(p_action, format('Job %s ready for %s', j.number, case p_action when 'ready_collection' then 'collection' else 'delivery' end), j.customer_name, p_job, null, 'job:' || p_job::text || ':' || p_action || ':' || (j.version + 1)::text);
  elsif p_action like 'reopen_%' or p_action = 'cancel' then
    perform public.notify_stage(p_job, 'design', 'job_update', format('Job %s %s', j.number, case when p_action = 'cancel' then 'cancelled' else 'reopened' end), p_note, 'job:' || p_job::text || ':' || p_action || ':d:' || (j.version + 1)::text);
    perform public.notify_stage(p_job, 'production', 'job_update', format('Job %s %s', j.number, case when p_action = 'cancel' then 'cancelled' else 'reopened' end), p_note, 'job:' || p_job::text || ':' || p_action || ':p:' || (j.version + 1)::text);
  end if;
  return jsonb_build_object('ok', true, 'status', ns);
end $function$
;

create or replace function public.clear_job_accounting_completion_on_reopen()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.status = 'job_done' and new.status <> 'job_done' then
    delete from public.job_accounting_completions where job_id = old.id;
  end if;
  return new;
end
$function$;

revoke all on function public.clear_job_accounting_completion_on_reopen() from public, anon, authenticated;
drop trigger if exists clear_job_accounting_completion_on_reopen on public.jobs;
create trigger clear_job_accounting_completion_on_reopen
  before update of status on public.jobs
  for each row
  when (old.status = 'job_done' and new.status <> 'job_done')
  execute function public.clear_job_accounting_completion_on_reopen();
