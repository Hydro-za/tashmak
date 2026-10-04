-- PrintOps schema, part 1: people, customers, calculator catalogue, settings, counters, config audit.
create extension if not exists pg_trgm with schema extensions;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  role text not null check (role in ('owner','designer','production')),
  active boolean not null default true,
  must_change_password boolean not null default false,
  phone text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.current_role_name() returns text language sql stable security definer set search_path = '' as
$$ select role from public.profiles where id = (select auth.uid()) and active $$;
create or replace function public.is_owner() returns boolean language sql stable security definer set search_path = '' as
$$ select coalesce((select role = 'owner' from public.profiles where id = (select auth.uid()) and active), false) $$;

create or replace function public.protect_last_owner() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and old.active and (new.role <> 'owner' or not new.active) then
    if (select count(*) from public.profiles where role = 'owner' and active and id <> old.id) = 0 then
      raise exception 'last_owner: at least one active owner is required';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_last_owner before update on public.profiles for each row execute function public.protect_last_owner();

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  company text,
  phone text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address text,
  notes text,
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_unique_active on public.customers (lower(trim(name)), lower(trim(coalesce(company,'')))) where archived_at is null;
create index customers_search on public.customers using gin ((name || ' ' || coalesce(company,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(email,'')) extensions.gin_trgm_ops);
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();

-- calculator catalogue: records keep the calculator's own JSON shape in "data"
create or replace function public.sync_catalogue() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.data ->> 'name' is null or length(trim(new.data ->> 'name')) = 0 then raise exception 'name_required'; end if;
  new.name := trim(new.data ->> 'name');
  new.active := coalesce((new.data ->> 'active')::boolean, true);
  new.demo := coalesce((new.data ->> 'demo')::boolean, false);
  new.data := jsonb_set(new.data, '{id}', to_jsonb(new.id));
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['product_categories','products','materials','machines','labour_types','finishing_options'] loop
    execute format($f$create table public.%I (
      id text primary key check (id ~ '^[A-Za-z0-9_.-]{1,80}$'),
      name text not null,
      active boolean not null default true,
      demo boolean not null default false,
      data jsonb not null check (jsonb_typeof(data) = 'object'),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      updated_by uuid references public.profiles(id))$f$, t);
    execute format('create unique index %I on public.%I (lower(name))', t || '_name_uq', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.sync_catalogue()', t || '_sync', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

alter table public.materials add constraint materials_valid check (
  (data ->> 'costBasis') in ('sheet','sqm','metre','kg','unit') and coalesce((data ->> 'cost')::numeric, -1) >= 0);
alter table public.products add constraint products_valid check (
  (data ->> 'method') in ('per_item','per_sqm','per_metre','per_sheet','per_page','per_print','per_garment','fixed','tiered')
  and (data ->> 'profile') in ('paper','large','dtf','general'));
alter table public.finishing_options add constraint finishing_valid check (
  (data ->> 'method') in ('fixed','per_item','per_metre','per_sqm','per_page','percent','labour') and coalesce((data ->> 'price')::numeric, -1) >= 0);
alter table public.labour_types add constraint labour_valid check (coalesce((data ->> 'hourly')::numeric, -1) >= 0);
alter table public.machines add constraint machines_valid check (coalesce((data ->> 'costPerHour')::numeric, -1) >= 0);

create table public.pricing_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create table public.system_settings (
  key text primary key check (key in ('business','quotes','jobs','workflow','notifications')),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create table public.counters (
  kind text primary key check (kind in ('quote','job')),
  year int not null,
  seq int not null
);
create table public.config_audit (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);
create index config_audit_time on public.config_audit (created_at desc);

create or replace function public.log_config_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare rid text;
begin
  rid := coalesce(case when tg_op = 'DELETE' then to_jsonb(old) ->> 'id' else to_jsonb(new) ->> 'id' end, to_jsonb(new) ->> 'key', to_jsonb(old) ->> 'key');
  insert into public.config_audit(table_name, record_id, action, old_data, new_data, user_id)
  values (tg_table_name, rid, tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end, (select auth.uid()));
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['product_categories','products','materials','machines','labour_types','finishing_options','pricing_settings','system_settings'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_config_change()', t || '_audit', t);
  end loop;
end $$;

-- default numbering / workflow settings (business details are filled in by the owner)
insert into public.system_settings(key, value) values
 ('business', '{"name":"Your Printing Company (Pty) Ltd","address":"","phone":"","email":"","website":"","regNo":"","vatNo":"","logo":""}'),
 ('quotes', '{"prefix":"Q","yearFormat":"none","separator":"-","length":4,"startNumber":1001,"resetYearly":false,"expiryDays":14,"paymentTerms":"50% deposit on acceptance, balance before collection/delivery.","terms":"Quote valid until the date shown. Prices are based on the artwork and specifications supplied; changes may be charged separately. Production starts after acceptance and artwork approval.","defaultNotes":""}'),
 ('jobs', '{"prefix":"J","yearFormat":"none","separator":"-","length":4,"startNumber":1001,"resetYearly":false,"defaultPriority":"normal","defaultDueDays":7}'),
 ('workflow', '{"designApprovalDefault":false,"qcCategories":[]}'),
 ('notifications', '{"inApp":true}');
insert into public.pricing_settings(id, data) values (1, '{"demo":true,"pricing":{"defaultMarkup":45,"maxMarkup":500,"defaultWastagePct":0,"minCharge":0,"minOrder":0,"rounding":{"step":1,"mode":"nearest"}},"calc":{"includeMachine":true,"includeLabour":true,"includeFinishing":true,"includePackaging":true,"includeWastage":true,"includeOther":true,"wastageAppliesTo":"materials_print","markupMode":"markup","gutterMm":3},"vat":{"enabled":true,"rate":15,"mode":"exclusive"},"discount":{"allowStaff":true,"staffMaxPct":5,"managerMaxPct":20,"requireApproval":true,"discountReducesVat":true}}');
