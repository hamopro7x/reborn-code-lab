-- تحكم كامل في شكل كل وسيلة دفع من لوحة الإدارة.
alter table public.payment_methods
  alter column account_number drop not null,
  add column if not exists display_type text not null default 'local_transfer'
    check (display_type in ('local_transfer', 'wallet', 'bank_transfer', 'crypto')),
  add column if not exists account_label text not null default 'رقم الحساب',
  add column if not exists account_name_label text not null default 'اسم صاحب الحساب',
  add column if not exists network_icon text,
  add column if not exists show_account_name boolean not null default true,
  add column if not exists show_instructions boolean not null default true,
  add column if not exists show_amount boolean not null default true;

update public.payment_methods
set display_type = 'crypto', account_label = 'عنوان الشبكة', account_name_label = 'اسم الشبكة'
where lower(type) in ('binance', 'bybit');

drop view if exists public.payment_methods_public;
create view public.payment_methods_public as
select id, name, type, icon, country_code, sort_order, display_type
from public.payment_methods
where active = true;
grant select on public.payment_methods_public to anon, authenticated;

drop function if exists public.payment_method_details(uuid);
create function public.payment_method_details(p_id uuid)
returns table (
  id uuid, name text, type text, account_number text, account_name text,
  instructions text, display_type text, account_label text,
  network_icon text,
  account_name_label text, show_account_name boolean,
  show_instructions boolean, show_amount boolean
)
language sql stable security definer set search_path = public
as $$
  select pm.id, pm.name, pm.type, pm.account_number, pm.account_name, pm.instructions,
    pm.display_type, pm.account_label, pm.network_icon, pm.account_name_label,
    pm.show_account_name, pm.show_instructions, pm.show_amount
  from public.payment_methods pm
  where pm.id = p_id and pm.active = true
$$;
revoke all on function public.payment_method_details(uuid) from public;
grant execute on function public.payment_method_details(uuid) to anon, authenticated;

notify pgrst, 'reload schema';