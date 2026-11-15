create sequence if not exists public.purchase_order_number_seq;

create table if not exists public.purchase_orders (
 id uuid primary key default gen_random_uuid(),
 number text not null unique,
 supplier text not null,
 status text not null default 'draft' check (status in ('draft','ordered','part_received','received','cancelled')),
 expected_date date,
 notes text,
 total numeric(14,2) not null default 0 check (total >= 0),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.purchase_order_items (
 id uuid primary key default gen_random_uuid(),
 purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
 stock_item_id uuid not null references public.stock_items(id),
 item_name text not null,
 unit text not null,
 quantity_ordered numeric(14,3) not null check (quantity_ordered > 0),
 quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0 and quantity_received <= quantity_ordered),
 unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
 line_total numeric(14,2) generated always as (quantity_ordered * unit_cost) stored,
 created_at timestamptz not null default now()
);
create index if not exists purchase_orders_created_at_idx on public.purchase_orders(created_at desc);
create index if not exists purchase_order_items_order_idx on public.purchase_order_items(purchase_order_id);
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
revoke all on public.purchase_orders,public.purchase_order_items from anon,authenticated;

create or replace function public.purchase_order_snapshot()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',po.id,'number',po.number,'supplier',po.supplier,'status',po.status,'expected_date',po.expected_date,'notes',po.notes,'total',po.total,'created_at',po.created_at,'items',coalesce(lines.items,'[]'::jsonb)) order by po.created_at desc),'[]'::jsonb)
 into result from public.purchase_orders po
 left join lateral (select jsonb_agg(jsonb_build_object('id',i.id,'stock_item_id',i.stock_item_id,'item_name',i.item_name,'unit',i.unit,'quantity_ordered',i.quantity_ordered,'quantity_received',i.quantity_received,'unit_cost',i.unit_cost,'line_total',i.line_total) order by i.created_at) items from public.purchase_order_items i where i.purchase_order_id=po.id) lines on true;
 return coalesce(result,'[]'::jsonb);
end $$;

create or replace function public.purchase_order_create(p_supplier text,p_expected_date date,p_notes text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); po_id uuid; po_number text; total_cost numeric(14,2); line jsonb; stock_row public.stock_items%rowtype;
begin
 if me is null or not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 if length(trim(coalesce(p_supplier,''))) not between 1 and 160 then raise exception 'invalid_supplier'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'invalid_items'; end if;
 po_number := 'PO-' || to_char(now(),'YYMM') || '-' || lpad(nextval('public.purchase_order_number_seq')::text,5,'0');
 insert into public.purchase_orders(number,supplier,expected_date,notes,created_by) values(po_number,trim(p_supplier),p_expected_date,nullif(trim(coalesce(p_notes,'')),''),me) returning id into po_id;
 total_cost:=0;
 for line in select * from jsonb_array_elements(p_items) loop
  select * into stock_row from public.stock_items where id=(line->>'stock_item_id')::uuid and active for share;
  if not found then raise exception 'stock_item_not_found'; end if;
  if coalesce((line->>'quantity')::numeric,0)<=0 or coalesce((line->>'unit_cost')::numeric,0)<0 then raise exception 'invalid_line_values'; end if;
  insert into public.purchase_order_items(purchase_order_id,stock_item_id,item_name,unit,quantity_ordered,unit_cost)
  values(po_id,stock_row.id,stock_row.name,stock_row.unit,(line->>'quantity')::numeric,coalesce((line->>'unit_cost')::numeric,0));
  total_cost:=total_cost+((line->>'quantity')::numeric*coalesce((line->>'unit_cost')::numeric,0));
 end loop;
 update public.purchase_orders set total=total_cost where id=po_id;
 return jsonb_build_object('id',po_id,'number',po_number);
end $$;

create or replace function public.purchase_order_set_status(p_order uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 if p_status not in ('ordered','cancelled') then raise exception 'invalid_status'; end if;
 update public.purchase_orders set status=p_status,updated_at=now() where id=p_order and status='draft';
 if not found then raise exception 'purchase_order_not_editable'; end if;
 return jsonb_build_object('id',p_order,'status',p_status);
end $$;

create or replace function public.purchase_order_receive(p_order uuid,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); po public.purchase_orders%rowtype; line jsonb; item public.purchase_order_items%rowtype; stock public.stock_items%rowtype; add_qty numeric; received_all boolean;
begin
 if me is null or not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 select * into po from public.purchase_orders where id=p_order for update;
 if not found or po.status not in ('ordered','part_received') then raise exception 'purchase_order_not_receivable'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'invalid_receipt'; end if;
 for line in select * from jsonb_array_elements(p_lines) loop
  select * into item from public.purchase_order_items where id=(line->>'item_id')::uuid and purchase_order_id=p_order for update;
  if not found then raise exception 'purchase_order_item_not_found'; end if;
  add_qty:=coalesce((line->>'quantity')::numeric,0);
  if add_qty<=0 or item.quantity_received+add_qty>item.quantity_ordered then raise exception 'receipt_exceeds_ordered_quantity'; end if;
  select * into stock from public.stock_items where id=item.stock_item_id for update;
  update public.stock_items set quantity=quantity+add_qty,updated_at=now(),updated_by=me where id=stock.id returning * into stock;
  update public.purchase_order_items set quantity_received=quantity_received+add_qty where id=item.id;
  insert into public.stock_movements(stock_item_id,movement_type,quantity_change,quantity_after,supplier,reference,note,performed_by)
  values(stock.id,'received',add_qty,stock.quantity,po.supplier,po.number,'Purchase order receipt',me);
 end loop;
 select bool_and(quantity_received=quantity_ordered) into received_all from public.purchase_order_items where purchase_order_id=p_order;
 update public.purchase_orders set status=case when received_all then 'received' else 'part_received' end,updated_at=now() where id=p_order;
 return jsonb_build_object('id',p_order,'status',case when received_all then 'received' else 'part_received' end);
end $$;

revoke all on function public.purchase_order_snapshot(),public.purchase_order_create(text,date,text,jsonb),public.purchase_order_set_status(uuid,text),public.purchase_order_receive(uuid,jsonb) from public,anon;
grant execute on function public.purchase_order_snapshot(),public.purchase_order_create(text,date,text,jsonb),public.purchase_order_set_status(uuid,text),public.purchase_order_receive(uuid,jsonb) to authenticated;
