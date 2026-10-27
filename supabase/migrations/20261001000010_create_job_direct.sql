-- Create a job directly (no quote). NOT YET APPLIED to the live project — run this file once in the Supabase SQL editor.
create or replace function public.create_job(p_customer uuid, p_title text, p_due date, p_priority text, p_design_required boolean, p_design_approval boolean,
  p_designer uuid, p_production uuid[], p_items jsonb, p_instructions text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); cust public.customers%rowtype; jid uuid; jnum text; it jsonb; pos int := 0; u uuid; ttl text := nullif(trim(coalesce(p_title, '')), ''); nm text; qty numeric;
begin
  if not public.has_perm('jobs.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into cust from public.customers where id = p_customer and archived_at is null;
  if not found then raise exception 'customer_required'; end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid_priority'; end if;
  if p_due is not null and p_due < (now() at time zone 'Africa/Johannesburg')::date then raise exception 'due_date_in_past'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'job_needs_items'; end if;
  if p_design_required then
    if p_designer is null or not public.user_can_stage(p_designer, 'design') then raise exception 'designer_required'; end if;
  elsif coalesce(array_length(p_production, 1), 0) = 0 then
    raise exception 'production_employee_required';
  end if;
  foreach u in array coalesce(p_production, '{}'::uuid[]) loop
    if not public.user_can_stage(u, 'production') then raise exception 'invalid_production_employee'; end if;
  end loop;
  jnum := public.next_number('job');
  insert into public.jobs(number, customer_id, customer_name, quote_id, status, priority, due_date, design_required, design_approval_required, instructions, title, title_auto, created_by)
  values (jnum, cust.id, cust.name || coalesce(' (' || nullif(cust.company, '') || ')', ''), null, case when p_design_required then 'design' else 'queued' end, p_priority, p_due,
    coalesce(p_design_required, false), coalesce(p_design_approval, false) and coalesce(p_design_required, false), nullif(trim(coalesce(p_instructions, '')), ''), ttl, ttl is null, me)
  returning id into jid;
  for it in select * from jsonb_array_elements(p_items) loop
    nm := nullif(trim(coalesce(it ->> 'product_name', '')), '');
    qty := (it ->> 'qty_ordered')::numeric;
    if nm is null or length(nm) > 200 then raise exception 'invalid_item'; end if;
    if qty is null or qty <= 0 then raise exception 'invalid_quantities'; end if;
    pos := pos + 1;
    insert into public.job_items(job_id, position, product_name, category_name, profile, qty_ordered, spec, instructions, requires_qc)
    values (jid, pos, nm, nullif(it ->> 'category_name', ''), 'general', qty,
      case when nullif(trim(coalesce(it ->> 'details', '')), '') is not null then jsonb_build_array(jsonb_build_object('label', 'Details', 'value', trim(it ->> 'details'))) else '[]'::jsonb end,
      nullif(trim(coalesce(it ->> 'instructions', '')), ''), coalesce((it ->> 'requires_qc')::boolean, false));
  end loop;
  if p_design_required then insert into public.job_assignments(job_id, user_id, stage, assigned_by) values (jid, p_designer, 'design', me); end if;
  foreach u in array coalesce(p_production, '{}'::uuid[]) loop
    insert into public.job_assignments(job_id, user_id, stage, assigned_by) values (jid, u, 'production', me);
  end loop;
  perform public.log_activity(jid, null, cust.id, 'job_created', format('Job %s created by %s (no quote)', jnum, public.person_name(me)));
  if p_design_required then
    perform public.log_activity(jid, null, cust.id, 'assigned', format('Job %s assigned to %s for design', jnum, public.person_name(p_designer)));
    perform public.notify(p_designer, 'assigned', format('New job %s to design', jnum), cust.name, jid, null, 'assign:' || jid::text || ':design:' || p_designer::text);
  end if;
  foreach u in array coalesce(p_production, '{}'::uuid[]) loop
    perform public.log_activity(jid, null, cust.id, 'assigned', format('Job %s assigned to %s for production', jnum, public.person_name(u)));
    perform public.notify(u, 'assigned', format('New job %s for production', jnum), cust.name, jid, null, 'assign:' || jid::text || ':production:' || u::text);
  end loop;
  perform public.notify_managers('new_job', format('Job %s created', jnum), cust.name, jid, null, 'job:' || jid::text || ':created');
  return jsonb_build_object('id', jid, 'number', jnum);
end $$;
revoke execute on function public.create_job(uuid, text, date, text, boolean, boolean, uuid, uuid[], jsonb, text) from public, anon;
grant execute on function public.create_job(uuid, text, date, text, boolean, boolean, uuid, uuid[], jsonb, text) to authenticated;
