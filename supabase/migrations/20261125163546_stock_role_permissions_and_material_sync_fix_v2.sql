-- Extend the canonical role permission list with Stock access.
create or replace function public.valid_permissions()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'jobs.view_all','jobs.manage','jobs.work_design','jobs.work_production',
    'customers.view','customers.manage','employees.view','employees.manage','roles.manage',
    'qc.perform','salary.view','salary.manage','labour.manage','settings.manage',
    'notifications.manage','reports.view','stock.manage'
  ]::text[]
$$;

alter table public.role_permissions
  drop constraint if exists role_permissions_permission_check;
alter table public.role_permissions
  add constraint role_permissions_permission_check
  check (permission = any(public.valid_permissions()));

drop policy if exists products_stock_read on public.products;
create policy products_stock_read on public.products
  for select to authenticated using ((select public.has_perm('stock.manage')));

-- Update every overload of the existing stock RPCs, plus purchase-order RPCs.
do $migration$
declare
  fn record;
  definition text;
  changed text;
  names text[] := array[
    'stock_snapshot','stock_create_item','stock_create_material',
    'stock_receive','stock_adjust','stock_use',
    'purchase_order_snapshot','purchase_order_create',
    'purchase_order_set_status','purchase_order_receive'
  ];
begin
  for fn in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(names)
  loop
    definition := pg_get_functiondef(fn.oid);
    changed := replace(definition, 'not public.is_owner()', 'not (public.is_owner() or public.has_perm(''stock.manage''))');
    if changed = definition then
      raise exception 'Could not safely update permission guard in public.%', fn.proname;
    end if;
    execute changed;
  end loop;
end
$migration$;

create or replace function public.stock_ensure_material(
  p_material_id text,
  p_name text,
  p_unit text,
  p_supplier text default null,
  p_notes text default null,
  p_active boolean default true
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  me uuid := auth.uid();
  stock_unit text := lower(trim(coalesce(p_unit,'')));
  item public.stock_items%rowtype;
begin
  if me is null or not (public.is_owner() or public.has_perm('stock.manage')) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_material_id is null or length(trim(p_material_id)) not between 1 and 80 then
    raise exception 'invalid_material_id';
  end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120 then
    raise exception 'invalid_material_name';
  end if;
  if stock_unit not in ('sheets','m²','m','kg','units') then
    raise exception 'invalid_stock_unit';
  end if;
  if not exists(select 1 from public.materials where id=p_material_id) then
    raise exception 'material_not_found';
  end if;
  insert into public.stock_items(material_id,name,unit,quantity,minimum_quantity,supplier,notes,active,created_by,updated_by)
  values(p_material_id,trim(p_name),stock_unit,0,0,nullif(trim(coalesce(p_supplier,'')),''),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_active,true),me,me)
  on conflict(material_id) do update
    set name=excluded.name,unit=excluded.unit,supplier=excluded.supplier,notes=excluded.notes,
        active=excluded.active,updated_by=me,updated_at=now()
  returning * into item;
  return to_jsonb(item);
end
$function$;
revoke all on function public.stock_ensure_material(text,text,text,text,text,boolean) from public, anon;
grant execute on function public.stock_ensure_material(text,text,text,text,text,boolean) to authenticated;
