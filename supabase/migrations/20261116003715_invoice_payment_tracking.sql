create table if not exists public.job_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.job_invoices(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','eft','card','other')),
  reference text,
  note text,
  received_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id)
);

create index if not exists job_invoice_payments_invoice_received_idx
  on public.job_invoice_payments(invoice_id, received_at desc);

alter table public.job_invoice_payments enable row level security;

drop policy if exists job_invoice_payments_owner_read on public.job_invoice_payments;
create policy job_invoice_payments_owner_read
  on public.job_invoice_payments
  for select to authenticated
  using (public.is_owner());

grant select on public.job_invoice_payments to authenticated;
revoke insert, update, delete on public.job_invoice_payments from anon, authenticated;

create or replace function public.record_job_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me uuid := auth.uid();
  invoice_row public.job_invoices%rowtype;
  paid_before numeric(14,2);
  paid_after numeric(14,2);
  balance_after numeric(14,2);
  payment_id uuid;
begin
  if me is null or not public.is_owner() then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_payment_amount'; end if;
  if p_method not in ('cash','eft','card','other') then raise exception 'invalid_payment_method'; end if;

  select * into invoice_row from public.job_invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if invoice_row.status <> 'invoice_sent' then raise exception 'invoice_not_sent_for_payment'; end if;

  select coalesce(sum(amount),0)::numeric(14,2) into paid_before
  from public.job_invoice_payments where invoice_id = p_invoice_id;

  if paid_before + p_amount > invoice_row.verified_total + 0.01 then
    raise exception 'payment_exceeds_invoice_balance';
  end if;

  insert into public.job_invoice_payments(invoice_id,amount,method,reference,note,recorded_by)
  values(p_invoice_id,round(p_amount,2),p_method,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_note,'')),''),me)
  returning id into payment_id;

  paid_after := paid_before + round(p_amount,2);
  balance_after := greatest(invoice_row.verified_total - paid_after,0);

  return jsonb_build_object(
    'payment_id',payment_id,
    'paid_total',paid_after,
    'balance',balance_after,
    'payment_status',case when balance_after <= 0.01 then 'paid' when paid_after > 0 then 'partially_paid' else 'unpaid' end
  );
end
$function$;

revoke all on function public.record_job_invoice_payment(uuid,numeric,text,text,text) from public;
grant execute on function public.record_job_invoice_payment(uuid,numeric,text,text,text) to authenticated;
