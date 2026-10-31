create table public.job_accounting_completions (
  job_id uuid primary key references public.jobs(id) on delete restrict,
  completed_at timestamptz not null default now(),
  completed_by uuid not null references public.profiles(id),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object')
);

alter table public.job_accounting_completions enable row level security;

revoke all on public.job_accounting_completions from public, anon, authenticated;
grant select, insert, update on public.job_accounting_completions to authenticated;

create policy job_accounting_completions_owner_read
  on public.job_accounting_completions
  for select to authenticated
  using (public.is_owner());

create policy job_accounting_completions_owner_insert
  on public.job_accounting_completions
  for insert to authenticated
  with check (
    public.is_owner()
    and completed_by = (select auth.uid())
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.archived_at is null
        and j.status in ('ready_invoice', 'collected', 'delivered')
    )
  );

create policy job_accounting_completions_owner_update
  on public.job_accounting_completions
  for update to authenticated
  using (
    public.is_owner()
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.archived_at is null
        and j.status in ('ready_invoice', 'collected', 'delivered')
    )
  )
  with check (
    public.is_owner()
    and completed_by = (select auth.uid())
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.archived_at is null
        and j.status in ('ready_invoice', 'collected', 'delivered')
    )
  );