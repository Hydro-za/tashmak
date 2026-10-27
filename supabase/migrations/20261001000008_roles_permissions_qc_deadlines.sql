-- PrintOps schema, part 5: custom roles & granular permissions, simple quality check, job names, deadline notifications.
-- (Already applied to the live project as migration "008_roles_permissions_qc_deadlines".)
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  description text,
  is_owner boolean not null default false,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index roles_name_uq on public.roles (lower(trim(name)));
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission text not null check (permission in ('jobs.view_all','jobs.manage','jobs.work_design','jobs.work_production','customers.view','customers.manage',
    'employees.view','employees.manage','roles.manage','qc.perform','salary.view','salary.manage','labour.manage','settings.manage','notifications.manage','reports.view')),
  primary key (role_id, permission)
);
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

insert into public.roles (name, description, is_owner, is_system) values
 ('Owner', 'Full access to everything. Cannot be edited.', true, true),
 ('Designer', 'Works on design stages of the jobs assigned to them.', false, true),
 ('Production', 'Works on production stages of the jobs assigned to them.', false, true);
insert into public.role_permissions (role_id, permission) select id, 'jobs.work_design' from public.roles where name = 'Designer';
insert into public.role_permissions (role_id, permission) select id, 'jobs.work_production' from public.roles where name = 'Production';

alter table public.profiles add column role_id uuid references public.roles(id), add column recovery_email text, add column deleted_at timestamptz;
alter table public.profiles add constraint profiles_recovery_email_chk check (recovery_email is null or recovery_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%designer%' loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;
alter table public.profiles add constraint profiles_role_chk check (role in ('owner','designer','production','staff'));
update public.profiles p set role_id = r.id from public.roles r where (p.role = 'owner' and r.name = 'Owner') or (p.role = 'designer' and r.name = 'Designer') or (p.role = 'production' and r.name = 'Production');

create or replace function public.has_perm(p_perm text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select pr.role = 'owner' or exists (select 1 from public.role_permissions rp where rp.role_id = pr.role_id and rp.permission = p_perm)
    from public.profiles pr where pr.id = (select auth.uid()) and pr.active and pr.deleted_at is null), false)
$$;
create or replace function public.user_has_perm(p_user uuid, p_perm text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select pr.role = 'owner' or exists (select 1 from public.role_permissions rp where rp.role_id = pr.role_id and rp.permission = p_perm)
    from public.profiles pr where pr.id = p_user and pr.active and pr.deleted_at is null), false)
$$;
create or replace function public.user_can_stage(p_user uuid, p_stage text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.user_has_perm(p_user, case p_stage when 'design' then 'jobs.work_design' when 'production' then 'jobs.work_production' else 'qc.perform' end)
$$;
create or replace function public.my_permissions() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('kind', pr.role, 'role_name', coalesce(r.name, pr.role),
      'permissions', case when pr.role = 'owner' then (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(array['jobs.view_all','jobs.manage','jobs.work_design','jobs.work_production','customers.view','customers.manage','employees.view','employees.manage','roles.manage','qc.perform','salary.view','salary.manage','labour.manage','settings.manage','notifications.manage','reports.view']) x)
        else (select coalesce(jsonb_agg(rp.permission), '[]'::jsonb) from public.role_permissions rp where rp.role_id = pr.role_id) end)
    from public.profiles pr left join public.roles r on r.id = pr.role_id where pr.id = (select auth.uid()) and pr.active and pr.deleted_at is null), 'null'::jsonb)
$$;

alter table public.jobs add column title text, add column title_auto boolean not null default true,
  add column qc_status text not null default 'not_checked' check (qc_status in ('not_checked','passed','not_passed')),
  add column qc_checked_by uuid references public.profiles(id), add column qc_checked_at timestamptz, add column qc_note text;
update public.jobs j set title = (select coalesce(string_agg(x.product_name, ', ' order by x.position) filter (where x.position <= 2), '') || case when count(*) > 2 then ' +' || (count(*) - 2) || ' more' else '' end from public.job_items x where x.job_id = j.id);
update public.jobs set qc_status = 'passed' where status in ('completed','ready_collection','ready_delivery','collected','delivered','ready_invoice') and exists (select 1 from public.job_items i where i.job_id = jobs.id and i.requires_qc) and exists (select 1 from public.qc_checks c where c.job_id = jobs.id and c.result = 'passed');

create or replace function public.set_job_title() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs j set title = (select coalesce(string_agg(x.product_name, ', ' order by x.position) filter (where x.position <= 2), '') || case when count(*) > 2 then ' +' || (count(*) - 2) || ' more' else '' end from public.job_items x where x.job_id = new.job_id)
   where j.id = new.job_id and j.title_auto;
  return new;
end $$;
create trigger job_items_title after insert on public.job_items for each row execute function public.set_job_title();

create or replace function public.notify_perm(p_perm text, p_type text, p_title text, p_body text, p_job uuid, p_quote uuid, p_dedupe text) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in select pr.id from public.profiles pr where pr.active and pr.deleted_at is null and (pr.role = 'owner' or exists (select 1 from public.role_permissions rp where rp.role_id = pr.role_id and rp.permission = p_perm)) loop
    perform public.notify(u, p_type, p_title, p_body, p_job, p_quote, p_dedupe || ':' || u::text);
  end loop;
end $$;
create or replace function public.notify_managers(p_type text, p_title text, p_body text, p_job uuid, p_quote uuid, p_dedupe text) returns void language plpgsql security definer set search_path = '' as $$
begin perform public.notify_perm('jobs.manage', p_type, p_title, p_body, p_job, p_quote, p_dedupe); end $$;

-- Rewrites existing functions (defined in earlier migrations) so they check permissions instead of fixed role names.
create or replace function pg_temp.rw(p_name text, p_pairs text[]) returns void language plpgsql as $$
declare d text; i int; b text; fn oid;
begin
  select p.oid into fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = p_name;
  if fn is null then raise exception 'function % not found', p_name; end if;
  d := pg_get_functiondef(fn);
  for i in 1..array_length(p_pairs, 1) by 2 loop
    b := d; d := replace(d, p_pairs[i], p_pairs[i + 1]);
    if d = b then raise exception 'rewrite of % found nothing for: %', p_name, p_pairs[i]; end if;
  end loop;
  execute d;
end $$;

select pg_temp.rw('job_action', array[
  $q$is_own := (r = 'owner');$q$, $q$is_own := public.has_perm('jobs.manage');$q$,
  $q$public.notify_owners($q$, $q$public.notify_managers($q$,
  $q$status = ns, production_completed_at = now(),$q$, $q$status = ns, qc_status = 'not_checked', qc_checked_by = null, qc_checked_at = null, qc_note = null, production_completed_at = now(),$q$,
  $q$':prod_done:' || (j.version + 1)::text);$q$, $q$':prod_done:' || (j.version + 1)::text);
    if ns = 'qc' then perform public.notify_perm('qc.perform', 'qc_needed', format('Quality check needed — job %s', j.number), j.customer_name, p_job, null, 'job:' || p_job::text || ':qcneeded:' || (j.version + 1)::text); end if;$q$]);
select pg_temp.rw('job_assign', array[
  $q$public.is_owner()$q$, $q$public.has_perm('jobs.manage')$q$,
  $q$not exists (select 1 from public.profiles where id = u and active and (need_role is null or role = need_role or (p_stage = 'qc' and role in ('owner', 'production'))))$q$, $q$not public.user_can_stage(u, p_stage)$q$]);
select pg_temp.rw('job_update_details', array[
  $q$public.is_owner()$q$, $q$public.has_perm('jobs.manage')$q$,
  $q$if p_patch ? 'design_approval_required' then$q$, $q$if p_patch ? 'title' then
    update public.jobs set title = nullif(trim(coalesce(p_patch ->> 'title', '')), ''), title_auto = (nullif(trim(coalesce(p_patch ->> 'title', '')), '') is null) where id = p_job;
    perform public.log_activity(p_job, j.quote_id, j.customer_id, 'title_changed', format('Job name changed by %s', nm));
  end if;
  if p_patch ? 'design_approval_required' then$q$]);
select pg_temp.rw('add_job_note', array[$q$public.is_owner()$q$, $q$public.has_perm('jobs.manage')$q$]);
select pg_temp.rw('record_supplied_item', array[$q$public.is_owner()$q$, $q$public.has_perm('jobs.manage')$q$]);
select pg_temp.rw('update_item_progress', array[$q$public.is_owner()$q$, $q$public.has_perm('jobs.manage')$q$]);
select pg_temp.rw('record_qc', array[$q$public.is_owner()$q$, $q$public.has_perm('qc.perform')$q$, $q$public.notify_owners($q$, $q$public.notify_managers($q$]);
select pg_temp.rw('register_file', array[$q$public.is_owner()$q$, $q$public.has_perm('jobs.manage')$q$]);
select pg_temp.rw('set_final_file', array[$q$public.is_owner()$q$, $q$public.has_perm('jobs.manage')$q$, $q$public.notify_owners($q$, $q$public.notify_managers($q$]);
select pg_temp.rw('can_access_path', array[$q$public.is_owner()$q$, $q$public.has_perm('jobs.view_all')$q$]);
select pg_temp.rw('dashboard_counts', array[$q$public.is_owner()$q$, $q$public.has_perm('jobs.view_all')$q$]);
select pg_temp.rw('generate_overdue_notifications', array[$q$public.is_owner()$q$, $q$public.has_perm('jobs.view_all')$q$, $q$public.notify_owners($q$, $q$public.notify_managers($q$]);
select pg_temp.rw('employee_workload', array[$q$public.is_owner()$q$, $q$public.has_perm('employees.view')$q$]);
select pg_temp.rw('start_job', array[
  $q$not exists (select 1 from public.profiles where id = p_designer and role = 'designer' and active)$q$, $q$not public.user_can_stage(p_designer, 'design')$q$,
  $q$not exists (select 1 from public.profiles where id = u and role = 'production' and active)$q$, $q$not public.user_can_stage(u, 'production')$q$,
  $q$public.notify_owners('new_job'$q$, $q$public.notify_managers('new_job'$q$]);

create or replace function public.global_search(p_q text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%'; empty jsonb := '[]'::jsonb;
begin
  if public.current_role_name() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(p_q)) < 2 then return jsonb_build_object('customers', empty, 'quotes', empty, 'jobs', empty, 'employees', empty); end if;
  return jsonb_build_object(
    'customers', case when public.has_perm('customers.view') then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'company', company)) from (select id, name, company from public.customers where (name || ' ' || coalesce(company, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '')) ilike q order by name limit 8) c), empty) else empty end,
    'quotes', case when public.is_owner() then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'status', status, 'customer', cn)) from (select qt.id, qt.number, qt.status, cu.name as cn from public.quotes qt join public.customers cu on cu.id = qt.customer_id
        where qt.number ilike q or cu.name ilike q or exists (select 1 from public.quote_items qi where qi.quote_id = qt.id and qi.product_name ilike q) order by qt.created_at desc limit 8) x), empty) else empty end,
    'jobs', case when public.has_perm('jobs.view_all') then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'title', title, 'status', status, 'customer', customer_name)) from (select jb.id, jb.number, jb.title, jb.status, jb.customer_name from public.jobs jb
        where jb.number ilike q or jb.customer_name ilike q or coalesce(jb.title, '') ilike q or exists (select 1 from public.job_items ji where ji.job_id = jb.id and ji.product_name ilike q) order by jb.created_at desc limit 8) y), empty) else empty end,
    'employees', case when public.has_perm('employees.view') then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'role', role)) from (select id, full_name, role from public.profiles where deleted_at is null and (full_name ilike q or username ilike q) order by full_name limit 6) e), empty) else empty end);
end $$;

create or replace function public.staff_directory_v2() returns table (id uuid, full_name text, role text, active boolean, deleted boolean, role_name text, can_design boolean, can_produce boolean, can_qc boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.role, p.active and p.deleted_at is null, p.deleted_at is not null, coalesce(r.name, p.role),
    public.user_has_perm(p.id, 'jobs.work_design'), public.user_has_perm(p.id, 'jobs.work_production'), public.user_has_perm(p.id, 'qc.perform')
  from public.profiles p left join public.roles r on r.id = p.role_id where public.current_role_name() is not null
$$;

create or replace function public.set_qc_result(p_job uuid, p_result text, p_note text default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.jobs%rowtype; me uuid := (select auth.uid()); nm text; note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.has_perm('qc.perform') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_result not in ('passed', 'not_passed') then raise exception 'invalid_result'; end if;
  if note is not null and length(note) > 500 then raise exception 'note_too_long'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.status <> 'qc' then
    if j.qc_status = p_result and j.qc_checked_at is not null then return jsonb_build_object('ok', true, 'noop', true, 'status', j.status); end if;
    raise exception 'invalid_transition: the job is not awaiting a quality check (status %)', j.status;
  end if;
  nm := public.person_name(me);
  if p_result = 'passed' then
    update public.jobs set status = 'completed', completed_at = now(), qc_status = 'passed', qc_checked_by = me, qc_checked_at = now(), qc_note = note, version = version + 1 where id = p_job;
    update public.job_items set status = 'completed' where job_id = p_job;
    perform public.log_activity(p_job, j.quote_id, j.customer_id, 'qc_passed', format('Quality check PASSED on job %s by %s', j.number, nm), note);
    perform public.notify_managers('qc_passed', format('Quality check passed — job %s', j.number), j.customer_name, p_job, null, 'job:' || p_job::text || ':qcpass:' || (j.version + 1)::text);
  else
    update public.jobs set status = 'rework', production_completed_at = null, qc_status = 'not_passed', qc_checked_by = me, qc_checked_at = now(), qc_note = note, version = version + 1 where id = p_job;
    update public.job_items set status = 'rework' where job_id = p_job and requires_qc;
    perform public.log_activity(p_job, j.quote_id, j.customer_id, 'qc_failed', format('Quality check NOT PASSED on job %s by %s — back to production', j.number, nm), note);
    perform public.notify_stage(p_job, 'production', 'rework', format('Not passed — job %s needs rework', j.number), coalesce(note, 'See the job for details.'), 'job:' || p_job::text || ':rework:' || (j.version + 1)::text);
    perform public.notify_managers('qc_failed', format('Quality check not passed — job %s', j.number), coalesce(note, j.customer_name), p_job, null, 'job:' || p_job::text || ':qcfail:' || (j.version + 1)::text);
  end if;
  insert into public.qc_checks(job_id, result, qty_checked, qty_rejected, notes, checked_by) values (p_job, case when p_result = 'passed' then 'passed' else 'failed' end, 0, 0, note, me);
  return jsonb_build_object('ok', true, 'status', case when p_result = 'passed' then 'completed' else 'rework' end);
end $$;

create or replace function public.refresh_deadline_notifications() returns int language plpgsql security definer set search_path = '' as $$
declare j record; n int := 0; u uuid; today date := (now() at time zone 'Africa/Johannesburg')::date; late boolean; ttl text;
begin
  if public.current_role_name() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  for j in select id, number, customer_name, due_date from public.jobs where archived_at is null and due_date is not null and due_date <= today + 1
      and status not in ('completed','ready_collection','ready_delivery','collected','delivered','ready_invoice','cancelled') loop
    late := j.due_date < today;
    ttl := case when late then format('Job %s is overdue', j.number) else format('Job %s is due %s', j.number, case when j.due_date = today then 'today' else 'tomorrow' end) end;
    perform public.notify_perm('jobs.manage', case when late then 'job_overdue' else 'due_soon' end, ttl, j.customer_name, j.id, null, case when late then 'overdue:' else 'duesoon:' end || j.id::text || ':' || today::text);
    for u in select user_id from public.job_assignments where job_id = j.id and active loop
      perform public.notify(u, case when late then 'job_overdue' else 'due_soon' end, ttl, j.customer_name, j.id, null, case when late then 'overdue-s:' else 'duesoon-s:' end || j.id::text || ':' || today::text || ':' || u::text);
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;

-- row-level security rebuilt on permissions
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('profiles','customers','jobs','job_items','job_assignments','job_activity','job_notes','file_attachments','qc_checks','customer_supplied_items','system_settings') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.has_perm('employees.view')));
create policy customers_read on public.customers for select to authenticated using ((select public.has_perm('customers.view')) or (select public.has_perm('customers.manage')));
create policy customers_insert on public.customers for insert to authenticated with check ((select public.has_perm('customers.manage')));
create policy customers_update on public.customers for update to authenticated using ((select public.has_perm('customers.manage'))) with check ((select public.has_perm('customers.manage')));
create policy jobs_r on public.jobs for select to authenticated using ((select public.has_perm('jobs.view_all')) or (select public.is_assigned(id)));
create policy job_items_r on public.job_items for select to authenticated using ((select public.has_perm('jobs.view_all')) or (select public.is_assigned(job_id)));
create policy job_assign_r on public.job_assignments for select to authenticated using ((select public.has_perm('jobs.view_all')) or (select public.is_assigned(job_id)));
create policy job_activity_r on public.job_activity for select to authenticated using ((select public.is_owner()) or (job_id is not null and ((select public.has_perm('jobs.view_all')) or (select public.is_assigned(job_id)))));
create policy job_notes_r on public.job_notes for select to authenticated using ((select public.has_perm('jobs.view_all')) or (select public.is_assigned(job_id)));
create policy files_r on public.file_attachments for select to authenticated using ((select public.is_owner()) or (job_id is not null and archived_at is null and ((select public.has_perm('jobs.view_all')) or (select public.is_assigned(job_id)))));
create policy qc_r on public.qc_checks for select to authenticated using ((select public.has_perm('jobs.view_all')) or (select public.is_assigned(job_id)));
create policy supplied_r on public.customer_supplied_items for select to authenticated using ((select public.has_perm('jobs.view_all')) or (select public.is_assigned(job_id)));
create policy sys_r on public.system_settings for select to authenticated using ((select public.has_perm('settings.manage')) or key in ('business', 'workflow'));
create policy sys_u on public.system_settings for update to authenticated using ((select public.has_perm('settings.manage'))) with check ((select public.has_perm('settings.manage')));
create policy roles_r on public.roles for select to authenticated using ((select public.has_perm('roles.manage')) or (select public.has_perm('employees.view')) or (select public.has_perm('employees.manage')));
create policy role_perms_r on public.role_permissions for select to authenticated using ((select public.has_perm('roles.manage')) or (select public.has_perm('employees.view')) or (select public.has_perm('employees.manage')));
revoke update on public.profiles from authenticated;
revoke insert, update, delete, truncate on public.roles, public.role_permissions from authenticated;

revoke execute on function public.notify_perm(text, text, text, text, uuid, uuid, text), public.notify_managers(text, text, text, uuid, uuid, text), public.user_has_perm(uuid, text), public.user_can_stage(uuid, text), public.set_job_title() from public, anon, authenticated;
grant execute on function public.has_perm(text), public.my_permissions(), public.staff_directory_v2(), public.set_qc_result(uuid, text, text), public.refresh_deadline_notifications(), public.global_search(text) to authenticated;
