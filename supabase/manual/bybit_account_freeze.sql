alter table public.bybit_accounts add column if not exists frozen boolean not null default false;
notify pgrst, 'reload schema';
