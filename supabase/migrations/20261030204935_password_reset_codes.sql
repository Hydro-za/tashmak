-- Secure, one-time four-digit password reset codes.
create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null check (length(code_hash) = 64),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_codes_email_created
  on public.password_reset_codes (lower(email), created_at desc);
alter table public.password_reset_codes enable row level security;
revoke all on public.password_reset_codes from public, anon, authenticated;

create or replace function public.consume_password_reset_code(p_email text, p_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare reset_row public.password_reset_codes%rowtype;
begin
  select * into reset_row
  from public.password_reset_codes
  where lower(email) = lower(trim(p_email)) and consumed_at is null
  order by created_at desc
  limit 1
  for update;

  if not found or reset_row.expires_at <= now() or reset_row.attempts >= 5 then
    return null;
  end if;

  if reset_row.code_hash <> p_code_hash then
    update public.password_reset_codes set attempts = attempts + 1 where id = reset_row.id;
    return null;
  end if;

  update public.password_reset_codes set consumed_at = now() where id = reset_row.id;
  return reset_row.user_id;
end;
$$;

revoke all on function public.consume_password_reset_code(text, text) from public, anon, authenticated;
grant execute on function public.consume_password_reset_code(text, text) to service_role;
