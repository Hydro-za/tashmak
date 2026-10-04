-- PrintOps schema, part 3a: helpers, numbering, quotes, start_job.  (All writes go through these SECURITY DEFINER functions.)
create or replace function public.person_name(p_user uuid) returns text language sql stable security definer set search_path = '' as
$$ select coalesce((select full_name from public.profiles where id = p_user), 'Someone') $$;

create or replace function public.is_assigned(p_job uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select coalesce(exists (select 1 from public.job_assignments a join public.profiles p on p.id = a.user_id and p.active
    where a.job_id = p_job and a.user_id = (select auth.uid()) and a.active), false) $$;

create or replace function public.job_stage_assigned(p_job uuid, p_stage text) returns boolean language sql stable security definer set search_path = '' as
$$ select coalesce(exists (select 1 from public.job_assignments a join public.profiles p on p.id = a.user_id and p.active
    where a.job_id = p_job and a.user_id = (select auth.uid()) and a.active and a.stage = p_stage), false) $$;

create or replace function public.can_access_path(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_owner() or (p_name ~ '^jobs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' and public.is_assigned(split_part(p_name, '/', 2)::uuid))
$$;

create or replace function public.password_changed() returns void language sql security definer set search_path = '' as
$$ update public.profiles set must_change_password = false where id = (select auth.uid()) $$;

create or replace function public.staff_directory() returns table (id uuid, full_name text, role text, active boolean)
language sql stable security definer set search_path = '' as
$$ select p.id, p.full_name, p.role, p.active from public.profiles p where public.current_role_name() is not null $$;

create or replace function public.log_activity(p_job uuid, p_quote uuid, p_customer uuid, p_action text, p_message text, p_notes text default null, p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.job_activity(job_id, quote_id, customer_id, user_id, action, message, notes, meta)
  values (p_job, p_quote, p_customer, (select auth.uid()), p_action, p_message, nullif(trim(coalesce(p_notes,'')), ''), coalesce(p_meta, '{}'::jsonb));
end $$;

create or replace function public.notify(p_user uuid, p_type text, p_title text, p_body text, p_job uuid, p_quote uuid, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or not exists (select 1 from public.profiles where id = p_user and active) then return; end if;
  insert into public.notifications(user_id, type, title, body, job_id, quote_id, dedupe_key)
  values (p_user, p_type, p_title, p_body, p_job, p_quote, p_dedupe) on conflict (dedupe_key) do nothing;
end $$;

create or replace function public.notify_owners(p_type text, p_title text, p_body text, p_job uuid, p_quote uuid, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
declare o uuid;
begin
  for o in select id from public.profiles where role = 'owner' and active loop
    perform public.notify(o, p_type, p_title, p_body, p_job, p_quote, p_dedupe || ':' || o::text);
  end loop;
end $$;

create or replace function public.notify_stage(p_job uuid, p_stage text, p_type text, p_title text, p_body text, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in select user_id from public.job_assignments where job_id = p_job and stage = p_stage and active loop
    perform public.notify(u, p_type, p_title, p_body, p_job, null, p_dedupe || ':' || u::text);
  end loop;
end $$;

create or replace function public.next_number(p_kind text) returns text language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; yr int := extract(year from (now() at time zone 'Africa/Johannesburg'))::int; start_n int; do_reset boolean; s int; ys text; sep text; len int; pre text;
begin
  select value into cfg from public.system_settings where key = case p_kind when 'quote' then 'quotes' else 'jobs' end;
  if cfg is null then raise exception 'numbering_not_configured'; end if;
  start_n := greatest(1, coalesce((cfg ->> 'startNumber')::int, 1));
  do_reset := coalesce((cfg ->> 'resetYearly')::boolean, false);
  insert into public.counters(kind, year, seq) values (p_kind, yr, start_n)
  on conflict (kind) do update set
    seq = case when do_reset and public.counters.year <> excluded.year then excluded.seq else greatest(public.counters.seq + 1, excluded.seq) end,
    year = excluded.year
  returning seq into s;
  ys := case coalesce(cfg ->> 'yearFormat', 'none') when 'YYYY' then yr::text when 'YY' then right(yr::text, 2) else '' end;
  sep := coalesce(cfg ->> 'separator', '-'); len := greatest(1, coalesce((cfg ->> 'length')::int, 4)); pre := coalesce(cfg ->> 'prefix', '');
  return array_to_string(array_remove(array[pre, ys, lpad(s::text, len, '0')], ''), sep);
end $$;

create or replace function public.job_overdue_days(p_due date, p_status text) returns int language sql stable set search_path = '' as
$$ select case when p_due is not null
      and p_status not in ('completed','ready_collection','ready_delivery','collected','delivered','ready_invoice','cancelled')
      and p_due < (now() at time zone 'Africa/Johannesburg')::date
    then ((now() at time zone 'Africa/Johannesburg')::date - p_due) else 0 end $$;

create or replace function public.save_quote(p_quote jsonb, p_items jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); q public.quotes%rowtype; qid uuid; num text; it jsonb; pos int := 0;
  cust public.customers%rowtype; req text := nullif(p_quote ->> 'client_request_id', ''); dup public.quotes%rowtype; tot numeric;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'quote_needs_items'; end if;
  select * into cust from public.customers where id = (p_quote ->> 'customer_id')::uuid and archived_at is null;
  if not found then raise exception 'customer_required'; end if;
  tot := coalesce((p_quote -> 'totals' ->> 'total')::numeric, 0);
  if tot < 0 then raise exception 'invalid_total'; end if;
  qid := nullif(p_quote ->> 'id', '')::uuid;
  if qid is null then
    if req is not null then
      select * into dup from public.quotes where client_request_id = req;
      if found then return jsonb_build_object('id', dup.id, 'number', dup.number, 'version', dup.version, 'duplicate', true); end if;
    end if;
    num := public.next_number('quote');
    insert into public.quotes(number, customer_id, quote_date, valid_until, reference, notes, terms, payment_terms, discount, pricing_snapshot, totals, total, copied_from, client_request_id, created_by)
    values (num, cust.id, coalesce((p_quote ->> 'quote_date')::date, current_date), nullif(p_quote ->> 'valid_until', '')::date, p_quote ->> 'reference', p_quote ->> 'notes', p_quote ->> 'terms', p_quote ->> 'payment_terms',
      coalesce(p_quote -> 'discount', '{}'::jsonb), p_quote -> 'pricing_snapshot', p_quote -> 'totals', tot, nullif(p_quote ->> 'copied_from', '')::uuid, req, me)
    returning id into qid;
    perform public.log_activity(null, qid, cust.id, 'quote_created', format('Quote %s created by %s', num, public.person_name(me)));
  else
    select * into q from public.quotes where id = qid for update;
    if not found then raise exception 'quote_not_found'; end if;
    if q.status not in ('draft', 'sent') then raise exception 'quote_locked'; end if;
    if p_quote ? 'expected_version' and (p_quote ->> 'expected_version')::int <> q.version then raise exception 'version_conflict'; end if;
    update public.quotes set customer_id = cust.id, quote_date = coalesce((p_quote ->> 'quote_date')::date, quote_date), valid_until = nullif(p_quote ->> 'valid_until', '')::date,
      reference = p_quote ->> 'reference', notes = p_quote ->> 'notes', terms = p_quote ->> 'terms', payment_terms = p_quote ->> 'payment_terms',
      discount = coalesce(p_quote -> 'discount', '{}'::jsonb), pricing_snapshot = p_quote -> 'pricing_snapshot', totals = p_quote -> 'totals', total = tot, version = version + 1
    where id = qid returning number into num;
    delete from public.quote_items where quote_id = qid;
    perform public.log_activity(null, qid, cust.id, 'quote_edited', format('Quote %s edited by %s', num, public.person_name(me)));
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    pos := pos + 1;
    insert into public.quote_items(quote_id, position, product_id, product_name, category_name, profile, description, quantity, unit_price, line_total, item)
    values (qid, pos, it ->> 'product_id', it ->> 'product_name', it ->> 'category_name', it ->> 'profile', it ->> 'description',
      (it ->> 'quantity')::numeric, (it ->> 'unit_price')::numeric, (it ->> 'line_total')::numeric, it -> 'item');
  end loop;
  return jsonb_build_object('id', qid, 'number', num, 'version', (select version from public.quotes where id = qid));
end $$;

create or replace function public.set_quote_status(p_quote uuid, p_status text, p_note text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; me uuid := (select auth.uid()); allowed boolean; lbl text;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'quote_not_found'; end if;
  if q.status = p_status then return jsonb_build_object('ok', true, 'noop', true, 'status', q.status); end if;
  allowed := case q.status
    when 'draft' then p_status in ('sent', 'accepted', 'declined', 'cancelled')
    when 'sent' then p_status in ('draft', 'accepted', 'declined', 'cancelled')
    when 'accepted' then p_status = 'cancelled' and q.job_id is null
    when 'declined' then p_status = 'draft'
    when 'cancelled' then p_status = 'draft'
    else false end;
  if not allowed then raise exception 'invalid_transition: % to %', q.status, p_status; end if;
  update public.quotes set status = p_status, version = version + 1,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    accepted_by = case p_status when 'accepted' then me when 'draft' then null else accepted_by end,
    accepted_at = case p_status when 'accepted' then now() when 'draft' then null else accepted_at end,
    declined_by = case p_status when 'declined' then me when 'draft' then null else declined_by end,
    declined_at = case p_status when 'declined' then now() when 'draft' then null else declined_at end
  where id = p_quote;
  lbl := initcap(p_status);
  perform public.log_activity(null, p_quote, q.customer_id, 'quote_' || p_status, format('Quote %s marked %s by %s', q.number, lbl, public.person_name(me)), p_note);
  if p_status = 'accepted' then
    perform public.notify_owners('quote_accepted', format('Quote %s accepted', q.number), 'Ready to start the job.', null, p_quote, 'quote:' || p_quote::text || ':accepted');
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

create or replace function public.start_job(p_quote uuid, p_due date, p_priority text, p_design_required boolean, p_design_approval boolean,
  p_designer uuid, p_production uuid[], p_items jsonb, p_instructions text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; me uuid := (select auth.uid()); jid uuid; jnum text; cust public.customers%rowtype; it jsonb; pos int := 0; u uuid; dup public.jobs%rowtype;
begin
  if not public.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'quote_not_found'; end if;
  select * into dup from public.jobs where quote_id = p_quote;
  if found then return jsonb_build_object('id', dup.id, 'number', dup.number, 'duplicate', true); end if;
  if q.status <> 'accepted' then raise exception 'quote_not_accepted'; end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid_priority'; end if;
  if p_due is not null and p_due < (now() at time zone 'Africa/Johannesburg')::date then raise exception 'due_date_in_past'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'job_needs_items'; end if;
  if p_design_required then
    if p_designer is null or not exists (select 1 from public.profiles where id = p_designer and role = 'designer' and active) then raise exception 'designer_required'; end if;
  elsif coalesce(array_length(p_production, 1), 0) = 0 then
    raise exception 'production_employee_required';
  end if;
  foreach u in array coalesce(p_production, '{}'::uuid[]) loop
    if not exists (select 1 from public.profiles where id = u and role = 'production' and active) then raise exception 'invalid_production_employee'; end if;
  end loop;
  select * into cust from public.customers where id = q.customer_id;
  jnum := public.next_number('job');
  insert into public.jobs(number, customer_id, customer_name, quote_id, status, priority, due_date, design_required, design_approval_required, instructions, created_by)
  values (jnum, q.customer_id, cust.name || coalesce(' (' || nullif(cust.company, '') || ')', ''), p_quote, case when p_design_required then 'design' else 'queued' end, p_priority, p_due,
    coalesce(p_design_required, false), coalesce(p_design_approval, false) and coalesce(p_design_required, false), nullif(trim(coalesce(p_instructions, '')), ''), me)
  returning id into jid;
  for it in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.quote_items where id = (it ->> 'quote_item_id')::uuid and quote_id = p_quote) then raise exception 'invalid_item'; end if;
    pos := pos + 1;
    insert into public.job_items(job_id, position, quote_item_id, product_name, category_name, profile, qty_ordered, spec, instructions, requires_qc)
    values (jid, pos, (it ->> 'quote_item_id')::uuid, it ->> 'product_name', it ->> 'category_name', it ->> 'profile', (it ->> 'qty_ordered')::numeric,
      coalesce(it -> 'spec', '[]'::jsonb), it ->> 'instructions', coalesce((it ->> 'requires_qc')::boolean, false));
  end loop;
  if p_design_required then insert into public.job_assignments(job_id, user_id, stage, assigned_by) values (jid, p_designer, 'design', me); end if;
  foreach u in array coalesce(p_production, '{}'::uuid[]) loop
    insert into public.job_assignments(job_id, user_id, stage, assigned_by) values (jid, u, 'production', me);
  end loop;
  update public.quotes set status = 'converted', job_id = jid, version = version + 1 where id = p_quote;
  perform public.log_activity(jid, p_quote, q.customer_id, 'job_created', format('Job %s created from quote %s by %s', jnum, q.number, public.person_name(me)));
  perform public.log_activity(null, p_quote, q.customer_id, 'quote_converted', format('Quote %s converted to job %s', q.number, jnum));
  if p_design_required then
    perform public.log_activity(jid, p_quote, q.customer_id, 'assigned', format('Job %s assigned to %s for design', jnum, public.person_name(p_designer)));
    perform public.notify(p_designer, 'assigned', format('New job %s to design', jnum), cust.name, jid, null, 'assign:' || jid::text || ':design:' || p_designer::text);
  end if;
  foreach u in array coalesce(p_production, '{}'::uuid[]) loop
    perform public.log_activity(jid, p_quote, q.customer_id, 'assigned', format('Job %s assigned to %s for production', jnum, public.person_name(u)));
    perform public.notify(u, 'assigned', format('New job %s for production', jnum), cust.name, jid, null, 'assign:' || jid::text || ':production:' || u::text);
  end loop;
  perform public.notify_owners('new_job', format('Job %s created', jnum), cust.name, jid, p_quote, 'job:' || jid::text || ':created');
  return jsonb_build_object('id', jid, 'number', jnum);
end $$;
