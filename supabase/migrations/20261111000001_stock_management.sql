-- Stock management: raw-material inventory, audited movements and granular role permissions.
alter table public.role_permissions drop constraint if exists role_permissions_permission_check;
alter table public.role_permissions add constraint role_permissions_permission_check
  check (permission = any (array[
    'jobs.view_all','jobs.manage','jobs.work_design','jobs.work_production','customers.view','customers.manage',
    'employees.view','employees.manage','roles.manage','qc.perform','salary.view','salary.manage','labour.manage',
    'settings.manage','notifications.manage','reports.view','stock.view','stock.receive','stock.adjust','stock.history'
  ]));

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  material_id text references public.materials(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  unit text not null check (length(trim(unit)) between 1 and 24),
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  supplier text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop policy if exists materials_r on public.materials;\ncreate policy materials_stock_read on public.materials for select to authenticated using ((select public.is_owner()) or (select public.has_perm('stock.view')) or (select public.has_perm('stock.receive')) or (select public.has_perm('stock.adjust')) or (select public.has_perm('stock.history')));\n\ncreate unique index stock_items_material_uq on public.stock_items(material_id) where material_id is not null;
create index stock_items_name_idx on public.stock_items(lower(name));

create table public.stock_movements (
  id bigint generated always as identity primary key,
  stock_item_id uuid not null references public.stock_items(id),
  movement_type text not null check (movement_type in ('opening','received','adjustment','consumption','reversal')),
  quantity_change numeric(14,3) not null check (quantity_change <> 0),
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  supplier text,
  reference text,
  note text,
  performed_by uuid not null references public.profiles(id),
  performed_at timestamptz not null default now()
);
create index stock_movements_item_time_idx on public.stock_movements(stock_item_id, performed_at desc);

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.stock_items, public.stock_movements from anon, authenticated;
revoke all on sequence public.stock_movements_id_seq from anon, authenticated;

create or replace function public.my_permissions() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('kind', pr.role, 'role_name', coalesce(r.name, pr.role),
      'permissions', case when pr.role = 'owner' then
        (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(array[
          'jobs.view_all','jobs.manage','jobs.work_design','jobs.work_production','customers.view','customers.manage',
          'employees.view','employees.manage','roles.manage','qc.perform','salary.view','salary.manage','labour.manage',
          'settings.manage','notifications.manage','reports.view','stock.view','stock.receive','stock.adjust','stock.history'
        ]) x)
        else (select coalesce(jsonb_agg(rp.permission), '[]'::jsonb) from public.role_permissions rp where rp.role_id = pr.role_id) end)
    from public.profiles pr left join public.roles r on r.id = pr.role_id
    where pr.id = (select auth.uid()) and pr.active and pr.deleted_at is null), 'null'::jsonb)
$$;

create or replace function public.stock_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not (public.has_perm('stock.view') or public.has_perm('stock.receive') or public.has_perm('stock.adjust') or public.has_perm('stock.history')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(s) order by lower(s.name)) from public.stock_items s where s.active), '[]'::jsonb),
    'movements', case when public.has_perm('stock.history') then
      coalesce((select jsonb_agg(to_jsonb(recent) order by recent.performed_at desc) from (select m.id,m.stock_item_id,s.name as item_name,m.movement_type,m.quantity_change,m.quantity_after,m.supplier,m.reference,m.note,m.performed_at,p.full_name as performed_by_name from public.stock_movements m join public.stock_items s on s.id=m.stock_item_id join public.profiles p on p.id=m.performed_by order by m.performed_at desc limit 100) recent), '[]'::jsonb)
      else '[]'::jsonb end
  ) into result;
  return result;
end $$;

create or replace function public.stock_create_item(p_name text, p_unit text, p_minimum numeric default 0, p_supplier text default null, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); item public.stock_items%rowtype;
begin
  if me is null or not public.has_perm('stock.adjust') then raise exception 'forbidden' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120 or length(trim(coalesce(p_unit,''))) not between 1 and 24 then raise exception 'invalid_stock_item'; end if;
  if coalesce(p_minimum,0) < 0 then raise exception 'invalid_minimum'; end if;
  insert into public.stock_items(name,unit,minimum_quantity,supplier,notes,created_by,updated_by)
    values(trim(p_name),trim(p_unit),coalesce(p_minimum,0),nullif(trim(p_supplier),''),nullif(trim(p_notes),''),me,me)
    returning * into item;
  return to_jsonb(item);
end $$;

create or replace function public.stock_receive(p_item uuid, p_quantity numeric, p_supplier text default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); item public.stock_items%rowtype;
begin
  if me is null or not public.has_perm('stock.receive') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity_must_be_positive'; end if;
  select * into item from public.stock_items where id=p_item and active for update;
  if not found then raise exception 'stock_item_not_found'; end if;
  update public.stock_items set quantity=quantity+p_quantity,supplier=coalesce(nullif(trim(p_supplier),''),supplier),updated_by=me,updated_at=now() where id=p_item returning * into item;
  insert into public.stock_movements(stock_item_id,movement_type,quantity_change,quantity_after,supplier,note,performed_by)
    values(p_item,'received',p_quantity,item.quantity,nullif(trim(p_supplier),''),nullif(trim(p_note),''),me);
  return to_jsonb(item);
end $$;

create or replace function public.stock_adjust(p_item uuid, p_new_quantity numeric, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); item public.stock_items%rowtype; delta numeric;
begin
  if me is null or not public.has_perm('stock.adjust') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_new_quantity is null or p_new_quantity < 0 or length(trim(coalesce(p_note,''))) < 3 then raise exception 'adjustment_requires_valid_quantity_and_note'; end if;
  select * into item from public.stock_items where id=p_item and active for update;
  if not found then raise exception 'stock_item_not_found'; end if;
  delta := p_new_quantity-item.quantity;
  if delta=0 then return to_jsonb(item); end if;
  update public.stock_items set quantity=p_new_quantity,updated_by=me,updated_at=now() where id=p_item returning * into item;
  insert into public.stock_movements(stock_item_id,movement_type,quantity_change,quantity_after,note,performed_by)
    values(p_item,'adjustment',delta,item.quantity,trim(p_note),me);
  return to_jsonb(item);
end $$;

revoke all on function public.stock_snapshot(), public.stock_create_item(text,text,numeric,text,text), public.stock_receive(uuid,numeric,text,text), public.stock_adjust(uuid,numeric,text) from public, anon;
grant execute on function public.stock_snapshot(), public.stock_create_item(text,text,numeric,text,text), public.stock_receive(uuid,numeric,text,text), public.stock_adjust(uuid,numeric,text) to authenticated;

-- Keep estimated material quantities from the quote line on each job item.
alter table public.job_items add column if not exists stock_usage jsonb not null default '[]'::jsonb
  check (jsonb_typeof(stock_usage) = 'array');

do $$
declare fn oid; body text; old_sql text; new_sql text;
begin
  select p.oid into fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='start_job' and pg_get_function_identity_arguments(p.oid) like 'p_quote uuid%';
  if fn is null then raise exception 'start_job function not found'; end if;
  body := pg_get_functiondef(fn);
  old_sql := 'insert into public.job_items(job_id, position, quote_item_id, product_name, category_name, profile, qty_ordered, spec, instructions, requires_qc)' || chr(10) ||
    '    values (jid, pos, (it ->> ''quote_item_id'')::uuid, it ->> ''product_name'', it ->> ''category_name'', it ->> ''profile'', (it ->> ''qty_ordered'')::numeric,' || chr(10) ||
    '      coalesce(it -> ''spec'', ''[]''::jsonb), it ->> ''instructions'', coalesce((it ->> ''requires_qc'')::boolean, false));';
  new_sql := 'insert into public.job_items(job_id, position, quote_item_id, product_name, category_name, profile, qty_ordered, spec, instructions, requires_qc, stock_usage)' || chr(10) ||
    '    values (jid, pos, (it ->> ''quote_item_id'')::uuid, it ->> ''product_name'', it ->> ''category_name'', it ->> ''profile'', (it ->> ''qty_ordered'')::numeric,' || chr(10) ||
    '      coalesce(it -> ''spec'', ''[]''::jsonb), it ->> ''instructions'', coalesce((it ->> ''requires_qc'')::boolean, false), coalesce(it -> ''stock_usage'', ''[]''::jsonb));';
  if position(old_sql in body)=0 then raise exception 'Could not locate start_job item insert for safe rewrite'; end if;
  body := replace(body, old_sql, new_sql);
  execute body;
end $$;

-- Deduct quoted material estimates exactly once when a job reaches Completed.
create or replace function public.stock_deduct_completed_job() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ji record; usage_row jsonb; material_key text; used numeric; stock public.stock_items%rowtype; ref text;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  for ji in select id, stock_usage from public.job_items where job_id=new.id loop
    for usage_row in select value from jsonb_array_elements(coalesce(ji.stock_usage,'[]'::jsonb)) loop
      material_key := usage_row ->> 'materialId';
      used := coalesce((usage_row ->> 'quantity')::numeric,0);
      if material_key is null or used <= 0 then continue; end if;
      ref := 'job:' || new.id::text || ':item:' || ji.id::text || ':material:' || material_key;
      if exists(select 1 from public.stock_movements where reference=ref and movement_type='consumption') then continue; end if;
      select * into stock from public.stock_items where material_id=material_key and active for update;
      if not found then continue; end if;
      update public.stock_items set quantity=quantity-used,updated_at=now(),updated_by=new.production_completed_by
        where id=stock.id and quantity >= used returning * into stock;
      if not found then raise exception 'insufficient_stock:%:required:%:available:%', stock.name, used, stock.quantity; end if;
      insert into public.stock_movements(stock_item_id,movement_type,quantity_change,quantity_after,reference,note,performed_by)
        values(stock.id,'consumption',-used,stock.quantity,ref,'Automatically deducted when job ' || new.number || ' was marked completed',coalesce(new.production_completed_by,auth.uid()));
    end loop;
  end loop;
  return new;
end $$;
create trigger stock_deduct_when_job_completed after update of status on public.jobs
  for each row execute function public.stock_deduct_completed_job();
revoke all on function public.stock_deduct_completed_job() from public, anon, authenticated;
