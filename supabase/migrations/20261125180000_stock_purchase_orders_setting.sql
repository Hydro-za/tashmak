-- Keep purchase orders as an optional section inside the single Stock area.
alter table public.system_settings drop constraint if exists system_settings_key_check;
alter table public.system_settings add constraint system_settings_key_check
  check (key in ('business','quotes','jobs','workflow','notifications','stock'));
insert into public.system_settings(key, value)
values ('stock', '{"purchaseOrdersEnabled": true}'::jsonb)
on conflict (key) do nothing;
