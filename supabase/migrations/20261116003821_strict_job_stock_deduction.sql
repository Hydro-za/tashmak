create or replace function public.stock_deduct_completed_job()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ji record;
  usage_row jsonb;
  material_key text;
  used numeric;
  stock public.stock_items%rowtype;
  ref text;
  available_qty numeric;
begin
  if new.status <> 'job_done' or old.status = 'job_done' then return new; end if;
  for ji in select id,stock_usage from public.job_items where job_id=new.id loop
    for usage_row in select value from jsonb_array_elements(coalesce(ji.stock_usage,'[]'::jsonb)) loop
      material_key := usage_row->>'materialId';
      used := coalesce((usage_row->>'quantity')::numeric,0);
      if material_key is null or used <= 0 then continue; end if;
      ref := 'job:'||new.id::text||':item:'||ji.id::text||':material:'||material_key;
      if exists(select 1 from public.stock_movements where reference=ref and movement_type='consumption') then continue; end if;
      -- Keep deductions linked to historical stock even after a material is disabled.
      select * into stock from public.stock_items where material_id=material_key for update;
      if not found then raise exception 'stock_material_not_found for material %',material_key; end if;
      if stock.unit <> coalesce(usage_row->>'unit',stock.unit) then
        raise exception 'Stock unit mismatch for %: inventory %, quote %',stock.name,stock.unit,usage_row->>'unit';
      end if;
      available_qty := stock.quantity;
      update public.stock_items
      set quantity=quantity-used,updated_at=now(),updated_by=coalesce(auth.uid(),new.production_completed_by,new.created_by)
      where id=stock.id and quantity>=used
      returning * into stock;
      if not found then raise exception 'Insufficient stock for %: % required, % available',stock.name,used,available_qty; end if;
      insert into public.stock_movements(stock_item_id,movement_type,quantity_change,quantity_after,reference,note,performed_by)
      values(stock.id,'consumption',-used,stock.quantity,ref,'Automatic deduction for completed job '||new.number,coalesce(auth.uid(),new.production_completed_by,new.created_by));
    end loop;
  end loop;
  return new;
end
$function$;
