create or replace function public.stock_ensure_material(
  p_material_id text,
  p_name text,
  p_unit text,
  p_supplier text default null,
  p_notes text default null,
  p_active boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := auth.uid();
  stock_unit text := lower(trim(coalesce(p_unit,'')));
  item public.stock_items%rowtype;
begin
  if me is null or not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_material_id is null or length(trim(p_material_id)) not between 1 and 80 then raise exception 'invalid_material_id'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'invalid_material_name'; end if;
  if stock_unit not in ('sheets','m²','m','kg','units') then raise exception 'invalid_stock_unit'; end if;
  if not exists(select 1 from public.materials where id=p_material_id) then raise exception 'material_not_found'; end if;
  insert into public.stock_items(material_id,name,unit,quantity,minimum_quantity,supplier,notes,active,created_by,updated_by)
  values(p_material_id,trim(p_name),stock_unit,0,0,nullif(trim(coalesce(p_supplier,'')),''),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_active,true),me,me)
  on conflict(material_id) do update set name=excluded.name,unit=excluded.unit,supplier=excluded.supplier,notes=excluded.notes,active=excluded.active,updated_by=me,updated_at=now()
  returning * into item;
  return to_jsonb(item);
end
$function$;
revoke all on function public.stock_ensure_material(text,text,text,text,text,boolean) from public, anon;
grant execute on function public.stock_ensure_material(text,text,text,text,text,boolean) to authenticated;