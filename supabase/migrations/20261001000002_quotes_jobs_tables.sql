-- PrintOps schema, part 2: quotes, jobs, items, assignments, activity, notes, files, notifications, QC, supplied items.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','converted','cancelled')),
  quote_date date not null default current_date,
  valid_until date,
  reference text, notes text, terms text, payment_terms text,
  discount jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null,
  totals jsonb not null,
  total numeric(14,2) not null default 0 check (total >= 0),
  version int not null default 1,
  client_request_id text unique,
  copied_from uuid references public.quotes(id),
  sent_at timestamptz,
  accepted_by uuid references public.profiles(id), accepted_at timestamptz,
  declined_by uuid references public.profiles(id), declined_at timestamptz,
  job_id uuid,
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= quote_date)
);
create index quotes_customer on public.quotes (customer_id, created_at desc);
create index quotes_status on public.quotes (status, created_at desc);
create trigger quotes_touch before update on public.quotes for each row execute function public.touch_updated_at();

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  position int not null check (position >= 1),
  product_id text,                      -- plain text on purpose: history must survive catalogue changes
  product_name text not null,
  category_name text,
  profile text,
  description text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  item jsonb not null,                  -- exact calculator line incl. calculation snapshot
  unique (quote_id, position)
);
create index quote_items_product on public.quote_items (product_name);

create or replace function public.freeze_quote_items() returns trigger language plpgsql security definer set search_path = '' as $$
declare qid uuid := coalesce(new.quote_id, old.quote_id); st text;
begin
  select status into st from public.quotes where id = qid;
  if st in ('accepted','converted') then raise exception 'quote_locked: accepted quotes cannot be changed'; end if;
  return coalesce(new, old);
end $$;
create trigger quote_items_freeze before insert or update or delete on public.quote_items for each row execute function public.freeze_quote_items();

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_name text not null,
  quote_id uuid unique references public.quotes(id) on delete restrict,
  source_job_id uuid references public.jobs(id),
  status text not null default 'queued' check (status in ('queued','design','design_review','in_production','qc','rework','completed','ready_collection','ready_delivery','collected','delivered','ready_invoice','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date date,
  design_required boolean not null default false,
  design_approval_required boolean not null default false,
  fulfilment text check (fulfilment in ('collection','delivery')),
  instructions text,
  design_started_at timestamptz, design_started_by uuid references public.profiles(id),
  design_completed_at timestamptz, design_completed_by uuid references public.profiles(id),
  production_started_at timestamptz, production_started_by uuid references public.profiles(id),
  production_completed_at timestamptz, production_completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  ready_at timestamptz,
  fulfilled_at timestamptz, fulfilled_by uuid references public.profiles(id), fulfilment_note text,
  invoice_ready_at timestamptz, invoice_ready_by uuid references public.profiles(id),
  cancelled_at timestamptz, cancel_reason text,
  reopened_count int not null default 0,
  version int not null default 1,
  client_request_id text unique,
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quotes add constraint quotes_job_fk foreign key (job_id) references public.jobs(id);
create index jobs_status on public.jobs (status, due_date);
create index jobs_customer on public.jobs (customer_id, created_at desc);
create index jobs_search on public.jobs using gin ((number || ' ' || customer_name) extensions.gin_trgm_ops);
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();

create table public.job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  position int not null check (position >= 1),
  quote_item_id uuid references public.quote_items(id) on delete set null,
  product_name text not null,
  category_name text,
  profile text,
  qty_ordered numeric(14,3) not null check (qty_ordered > 0),
  spec jsonb not null default '[]'::jsonb,       -- employee-safe [{label,value}] list; never contains prices or costs
  instructions text,
  requires_qc boolean not null default false,
  status text not null default 'pending' check (status in ('pending','in_production','qc','completed','rework')),
  qty_in_production numeric(14,3) not null default 0 check (qty_in_production >= 0),
  qty_completed numeric(14,3) not null default 0 check (qty_completed >= 0),
  qty_rejected numeric(14,3) not null default 0 check (qty_rejected >= 0),
  qty_rework numeric(14,3) not null default 0 check (qty_rework >= 0),
  unique (job_id, position)
);
create index job_items_job on public.job_items (job_id);

create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  stage text not null check (stage in ('design','production','qc')),
  active boolean not null default true,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unique (job_id, user_id, stage)
);
create index job_assignments_user on public.job_assignments (user_id) where active;

create table public.job_activity (
  id bigint generated always as identity primary key,
  job_id uuid references public.jobs(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  user_id uuid references public.profiles(id),
  action text not null,
  message text not null,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (job_id is not null or quote_id is not null or customer_id is not null)
);
create index job_activity_job on public.job_activity (job_id, created_at);
create index job_activity_quote on public.job_activity (quote_id, created_at);
create index job_activity_recent on public.job_activity (created_at desc);
create or replace function public.activity_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'activity_immutable: the activity log cannot be edited or deleted'; end $$;
create trigger job_activity_no_change before update or delete on public.job_activity for each row execute function public.activity_immutable();

create table public.job_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  note text not null check (length(trim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index job_notes_job on public.job_notes (job_id, created_at);

create table public.file_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete restrict,
  job_item_id uuid references public.job_items(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  kind text not null check (kind in ('artwork','logo','design','print_ready','reference','dtf_artwork','garment_ref','production','photo','other')),
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 52428800),
  version int not null default 1,
  is_final boolean not null default false,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (job_id is not null or quote_id is not null or customer_id is not null)
);
create index file_attachments_job on public.file_attachments (job_id, created_at);
create unique index file_final_unique on public.file_attachments (job_id, coalesce(job_item_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_final and archived_at is null and kind in ('artwork','design','print_ready','dtf_artwork');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  job_id uuid references public.jobs(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, read_at, created_at desc);

create table public.qc_checks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  job_item_id uuid references public.job_items(id) on delete cascade,
  result text not null check (result in ('passed','failed','rework_required')),
  qty_checked numeric(14,3) not null check (qty_checked >= 0),
  qty_rejected numeric(14,3) not null default 0 check (qty_rejected >= 0),
  notes text,
  checked_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (qty_rejected <= qty_checked)
);
create index qc_checks_job on public.qc_checks (job_id, created_at);

create table public.customer_supplied_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  job_item_id uuid references public.job_items(id) on delete set null,
  description text not null check (length(trim(description)) > 0),
  qty_received numeric(14,3) not null check (qty_received > 0),
  condition text,
  received_at timestamptz not null default now(),
  received_by uuid not null references public.profiles(id),
  notes text
);
create index supplied_job on public.customer_supplied_items (job_id);

create or replace function public.set_file_version() returns trigger language plpgsql set search_path = '' as $$
begin
  select coalesce(max(version), 0) + 1 into new.version from public.file_attachments
   where job_id is not distinct from new.job_id and job_item_id is not distinct from new.job_item_id and kind = new.kind;
  return new;
end $$;
create trigger file_attachments_version before insert on public.file_attachments for each row execute function public.set_file_version();

do $$ declare t text; begin
  foreach t in array array['quotes','quote_items','jobs','job_items','job_assignments','job_activity','job_notes','file_attachments','notifications','qc_checks','customer_supplied_items','profiles','customers','pricing_settings','system_settings','counters','config_audit'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
