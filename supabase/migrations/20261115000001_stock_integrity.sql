-- Harden stock ledger consistency without changing the existing stock workflow.
-- Existing RPCs lock stock_items rows (FOR UPDATE) and job deductions are protected
-- by a unique movement reference. These checks make the audit trail self-consistent.

alter table public.stock_movements
  add constraint stock_movements_type_sign_check
  check (
    (movement_type = 'received' and quantity_change > 0)
    or (movement_type = 'consumption' and quantity_change < 0)
    or movement_type = 'adjustment'
  ) not valid;
alter table public.stock_movements
  validate constraint stock_movements_type_sign_check;

create or replace function public.stock_validate_movement_balance()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare current_quantity numeric;
begin
  select quantity into current_quantity
  from public.stock_items
  where id = new.stock_item_id
  for update;

  if not found then
    raise exception 'stock_item_not_found' using errcode='23503';
  end if;

  -- Every RPC updates the locked balance before writing its movement record.
  -- This prevents an audit row from claiming a different balance.
  if current_quantity <> new.quantity_after then
    raise exception 'stock_movement_balance_mismatch' using errcode='23514';
  end if;

  if new.movement_type = 'received' and new.quantity_change <= 0 then
    raise exception 'received_quantity_must_be_positive' using errcode='23514';
  end if;
  if new.movement_type = 'consumption' and new.quantity_change >= 0 then
    raise exception 'consumption_quantity_must_be_negative' using errcode='23514';
  end if;
  if new.quantity_after < 0 then
    raise exception 'stock_cannot_be_negative' using errcode='23514';
  end if;

  return new;
end;
$$;

drop trigger if exists stock_movement_balance_guard on public.stock_movements;
create trigger stock_movement_balance_guard
before insert on public.stock_movements
for each row execute function public.stock_validate_movement_balance();

revoke all on function public.stock_validate_movement_balance() from public, anon, authenticated;

-- Keep stock ledger writes behind the owner-checked stock RPC functions.
revoke insert, update, delete on public.stock_items, public.stock_movements from anon, authenticated;
