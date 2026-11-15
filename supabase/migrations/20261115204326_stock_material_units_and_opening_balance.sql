-- Align stock unit labels with calculator usage and allow opening balances when adding inventory.
update public.stock_items s
set unit = case
  when m.data->>'costBasis' = 'sheet' then 'sheets'
  when m.data->>'costBasis' = 'sqm' then 'm²'
  when m.data->>'costBasis' = 'metre' then 'm'
  when m.data->>'costBasis' = 'kg' then 'kg'
  else 'units'
end
from public.materials m
where m.id=s.material_id
  and s.unit <> case
    when m.data->>'costBasis' = 'sheet' then 'sheets'
    when m.data->>'costBasis' = 'sqm' then 'm²'
    when m.data->>'costBasis' = 'metre' then 'm'
    when m.data->>'costBasis' = 'kg' then 'kg'
    else 'units'
  end;

create or replace function public.stock_create_item(
 p_material_id text,p_unit text,p_minimum numeric,p_supplier text,p_notes text,p_initial_quantity numeric
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); item public.stock_items%rowtype; material public.materials%rowtype;
begin
 if me is null or not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 if length(trim(coalesce(p_unit,''))) not between 1 and 24
   or coalesce(p_minimum,0)<0
   or coalesce(p_initial_quantity,0)<0 then
   raise exception 'invalid_stock_item';
 end if;
 select * into material from public.materials where id=p_material_id and active;
 if not found then raise exception 'material_not_found'; end if;
 if exists(select 1 from public.stock_items where material_id=material.id) then
   raise exception 'material_already_tracked';
 end if;
 insert into public.stock_items(material_id,name,unit,quantity,minimum_quantity,supplier,notes,created_by,updated_by)
 values(material.id,material.name,trim(p_unit),coalesce(p_initial_quantity,0),coalesce(p_minimum,0),nullif(trim(p_supplier),''),nullif(trim(p_notes),''),me,me)
 returning * into item;
 if item.quantity>0 then
   insert into public.stock_movements(stock_item_id,movement_type,quantity_change,quantity_after,supplier,note,performed_by)
   values(item.id,'received',item.quantity,item.quantity,item.supplier,'Opening stock balance',me);
 end if;
 return to_jsonb(item);
end $$;
revoke all on function public.stock_create_item(text,text,numeric,text,text,numeric) from public,anon;
grant execute on function public.stock_create_item(text,text,numeric,text,text,numeric) to authenticated;
