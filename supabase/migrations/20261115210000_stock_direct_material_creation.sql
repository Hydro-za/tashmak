create or replace function public.stock_create_material(
  p_name text,
  p_unit text,
  p_minimum numeric default 0,
  p_supplier text default null,
  p_notes text default null,
  p_initial_quantity numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := auth.uid();
  material_id text;
  basis text;
  stock_unit text := lower(trim(coalesce(p_unit,'')));
  item public.stock_items%rowtype;
  material_name text := trim(coalesce(p_name,''));
begin
  if me is null or not public.is_owner() then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if length(material_name) not between 1 and 120 then raise exception 'invalid_material_name'; end if;
  if stock_unit not in ('sheets','m²','m','kg','units') then raise exception 'invalid_stock_unit'; end if;
  if coalesce(p_minimum,0) < 0 or coalesce(p_initial_quantity,0) < 0 then raise exception 'invalid_stock_quantity'; end if;
  if exists(select 1 from public.materials where lower(name)=lower(material_name) and active) then
    raise exception 'material_name_exists';
  end if;
  basis := case stock_unit when 'sheets' then 'sheet' when 'm²' then 'sqm' when 'm' then 'metre' when 'kg' then 'kg' else 'unit' end;
  material_id := 'stock_' || replace(gen_random_uuid()::text,'-','');
  insert into public.materials(id,name,data)
  values(material_id,material_name,jsonb_build_object(
    'id',material_id,'name',material_name,'type','general','costBasis',basis,'cost',0,
    'supplier',coalesce(nullif(trim(p_supplier),''),''),'wastagePct',0,'stock',0,
    'minStock',coalesce(p_minimum,0),'tags',jsonb_build_array('stock-only'),'notes',coalesce(nullif(trim(p_notes),''),''),
    'active',true,'demo',false,'stockOnly',true
  ));
  insert into public.stock_items(material_id,name,unit,quantity,minimum_quantity,supplier,notes,created_by,updated_by)
  values(material_id,material_name,stock_unit,coalesce(p_initial_quantity,0),coalesce(p_minimum,0),
    nullif(trim(p_supplier),''),nullif(trim(p_notes),''),me,me)
  returning * into item;
  if item.quantity > 0 then
    insert into public.stock_movements(stock_item_id,movement_type,quantity_change,quantity_after,supplier,note,performed_by)
    values(item.id,'received',item.quantity,item.quantity,item.supplier,'Opening stock balance',me);
  end if;
  return to_jsonb(item);
end
$function$;
revoke all on function public.stock_create_material(text,text,numeric,text,text,numeric) from public, anon;
grant execute on function public.stock_create_material(text,text,numeric,text,text,numeric) to authenticated;