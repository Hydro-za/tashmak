-- Multiple employee roles: permission union, owner-only assignment management.
create table if not exists public.profile_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
insert into public.profile_roles(user_id, role_id)
select p.id, p.role_id from public.profiles p
join public.roles r on r.id = p.role_id
where p.role <> 'owner' and not r.is_owner
on conflict do nothing;
alter table public.profile_roles enable row level security;
drop policy if exists profile_roles_owner_read on public.profile_roles;
create policy profile_roles_owner_read on public.profile_roles for select to authenticated using (public.is_owner());
revoke insert, update, delete on public.profile_roles from anon, authenticated;

create or replace function public.has_perm(p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce((select pr.role = 'owner' or exists (
   select 1 from public.profile_roles x join public.role_permissions rp on rp.role_id=x.role_id
   where x.user_id=pr.id and rp.permission=p_perm
 ) or (not exists(select 1 from public.profile_roles x where x.user_id=pr.id)
       and exists(select 1 from public.role_permissions rp where rp.role_id=pr.role_id and rp.permission=p_perm))
 from public.profiles pr where pr.id=(select auth.uid()) and pr.active and pr.deleted_at is null),false)
$$;
create or replace function public.user_has_perm(p_user uuid,p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce((select pr.role='owner' or exists (
   select 1 from public.profile_roles x join public.role_permissions rp on rp.role_id=x.role_id
   where x.user_id=pr.id and rp.permission=p_perm
 ) or (not exists(select 1 from public.profile_roles x where x.user_id=pr.id)
       and exists(select 1 from public.role_permissions rp where rp.role_id=pr.role_id and rp.permission=p_perm))
 from public.profiles pr where pr.id=p_user and pr.active and pr.deleted_at is null),false)
$$;
create or replace function public.my_permissions() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce((select jsonb_build_object(
   'kind',pr.role,
   'role_name',case when pr.role='owner' then 'owner' else coalesce((
      select string_agg(r.name, ', ' order by r.name)
      from public.profile_roles x join public.roles r on r.id=x.role_id where x.user_id=pr.id
   ),r.name,pr.role) end,
   'permissions',case when pr.role='owner' then
     (select coalesce(jsonb_agg(x),'[]'::jsonb) from unnest(public.valid_permissions()) x)
   else (select coalesce(jsonb_agg(distinct rp.permission),'[]'::jsonb)
     from public.role_permissions rp
     where rp.role_id in (
       select x.role_id from public.profile_roles x where x.user_id=pr.id
       union all select pr.role_id where not exists(select 1 from public.profile_roles x where x.user_id=pr.id)
     )) end
 ) from public.profiles pr left join public.roles r on r.id=pr.role_id
 where pr.id=(select auth.uid()) and pr.active and pr.deleted_at is null),'null'::jsonb)
$$;

create or replace function public.assert_can_assign_roles(p_roles uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare rid uuid; perm text;
begin
 if p_roles is null or cardinality(p_roles)=0 then raise exception 'role_required'; end if;
 if cardinality(p_roles) <> (select count(distinct x) from unnest(p_roles) x) then raise exception 'duplicate_role'; end if;
 foreach rid in array p_roles loop
   if not exists(select 1 from public.roles where id=rid and not is_owner) then raise exception 'role_not_found_or_locked'; end if;
   for perm in select permission from public.role_permissions where role_id=rid loop
     if not public.user_has_perm((select auth.uid()),perm) then
       raise exception 'cannot_grant: you can only assign roles whose permissions you hold yourself (%)',perm;
     end if;
   end loop;
 end loop;
end $$;

create or replace function public.create_employee_multi(
 p_username text,p_full_name text,p_role_ids uuid[],p_password text,
 p_recovery_email text default null,p_phone text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid; primary_role uuid;
begin
 if not public.has_perm('employees.manage') then raise exception 'forbidden' using errcode='42501'; end if;
 perform public.assert_can_assign_roles(p_role_ids);
 primary_role := p_role_ids[1];
 uid := public.create_employee(p_username,p_full_name,primary_role,p_password,p_recovery_email,p_phone);
 insert into public.profile_roles(user_id,role_id)
 select uid, x from unnest(p_role_ids) x on conflict do nothing;
 return uid;
end $$;

create or replace function public.update_employee_multi(
 p_user uuid,p_full_name text,p_role_ids uuid[],p_phone text,
 p_recovery_email text default null,p_clear_recovery boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare primary_role uuid; target public.profiles%rowtype;
begin
 if not public.has_perm('employees.manage') then raise exception 'forbidden' using errcode='42501'; end if;
 select * into target from public.profiles where id=p_user and deleted_at is null for update;
 if not found or target.role='owner' then raise exception 'not_an_employee'; end if;
 perform public.assert_can_assign_roles(p_role_ids);
 primary_role := p_role_ids[1];
 perform public.update_employee(p_user,p_full_name,primary_role,p_phone,p_recovery_email,p_clear_recovery);
 delete from public.profile_roles where user_id=p_user;
 insert into public.profile_roles(user_id,role_id)
 select p_user,x from unnest(p_role_ids) x;
end $$;

grant execute on function public.create_employee_multi(text,text,uuid[],text,text,text) to authenticated;
grant execute on function public.update_employee_multi(uuid,text,uuid[],text,text,boolean) to authenticated;
grant execute on function public.assert_can_assign_roles(uuid[]) to authenticated;

-- Keep operational role labels and permission notifications accurate for role unions.
create or replace function public.employee_workload()
returns table(user_id uuid, full_name text, role text, active_jobs integer, overdue_jobs integer, completed_jobs integer)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.has_perm('employees.view') then raise exception 'forbidden' using errcode='42501'; end if;
 return query
 select p.id,p.full_name,
   coalesce((select string_agg(r.name, ', ' order by r.name) from public.profile_roles x join public.roles r on r.id=x.role_id where x.user_id=p.id),r.name,p.role),
   (count(distinct j.id) filter (where j.status not in ('completed','ready_collection','ready_delivery','collected','delivered','ready_invoice','cancelled')))::int,
   (count(distinct j.id) filter (where public.job_overdue_days(j.due_date,j.status)>0))::int,
   (count(distinct j.id) filter (where j.status in ('completed','ready_collection','ready_delivery','collected','delivered','ready_invoice')))::int
 from public.profiles p
 left join public.roles r on r.id=p.role_id
 left join public.job_assignments a on a.user_id=p.id and a.active
 left join public.jobs j on j.id=a.job_id and j.archived_at is null
 where p.active and p.role<>'owner'
 group by p.id,p.full_name,p.role,r.name
 order by p.full_name;
end $$;

create or replace function public.notify_perm(p_perm text,p_type text,p_title text,p_body text,p_job uuid,p_quote uuid,p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
 for u in
   select pr.id from public.profiles pr
   where pr.active and pr.deleted_at is null and (
     pr.role='owner'
     or exists(select 1 from public.profile_roles x join public.role_permissions rp on rp.role_id=x.role_id where x.user_id=pr.id and rp.permission=p_perm)
     or (not exists(select 1 from public.profile_roles x where x.user_id=pr.id)
         and exists(select 1 from public.role_permissions rp where rp.role_id=pr.role_id and rp.permission=p_perm))
   )
 loop
   perform public.notify(u,p_type,p_title,p_body,p_job,p_quote,p_dedupe||':'||u::text);
 end loop;
end $$;
