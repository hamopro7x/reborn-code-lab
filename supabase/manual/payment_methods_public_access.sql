-- Public (anon) access to payment methods WITHOUT exposing account numbers in bulk.
-- 1) Safe list via a view that hides sensitive columns.
-- 2) Transfer details for ONE explicitly selected method via a security-definer function.

create or replace view public.payment_methods_public as
select id, name, type, icon, country_code, sort_order
from public.payment_methods
where active = true;

grant select on public.payment_methods_public to anon, authenticated;

create or replace function public.payment_method_details(p_id uuid)
returns table (
  id uuid,
  name text,
  type text,
  account_number text,
  account_name text,
  instructions text
)
language sql
stable
security definer
set search_path = public
as $$
  select pm.id, pm.name, pm.type, pm.account_number, pm.account_name, pm.instructions
  from public.payment_methods pm
  where pm.id = p_id and pm.active = true
$$;

revoke all on function public.payment_method_details(uuid) from public;
grant execute on function public.payment_method_details(uuid) to anon, authenticated;
