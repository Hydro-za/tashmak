-- Restrict staff directory RPCs to the same employee-view permission as the UI.
-- These SECURITY DEFINER functions bypass profiles RLS, so each one must check
-- permission internally as well as requiring an authenticated caller.
create or replace function public.staff_directory()
returns table (id uuid, full_name text, role text, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_perm('employees.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, p.role, p.active
    from public.profiles p;
end;
$$;

create or replace function public.staff_directory_v2()
returns table (
  id uuid,
  full_name text,
  role text,
  active boolean,
  deleted boolean,
  role_name text,
  can_design boolean,
  can_produce boolean,
  can_qc boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_perm('employees.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select
      p.id,
      p.full_name,
      p.role,
      p.active and p.deleted_at is null,
      p.deleted_at is not null,
      coalesce(r.name, p.role),
      public.user_has_perm(p.id, 'jobs.work_design'),
      public.user_has_perm(p.id, 'jobs.work_production'),
      public.user_has_perm(p.id, 'qc.perform')
    from public.profiles p
    left join public.roles r on r.id = p.role_id;
end;
$$;

revoke all on function public.staff_directory() from public, anon, authenticated;
revoke all on function public.staff_directory_v2() from public, anon, authenticated;
grant execute on function public.staff_directory() to authenticated;
grant execute on function public.staff_directory_v2() to authenticated;
