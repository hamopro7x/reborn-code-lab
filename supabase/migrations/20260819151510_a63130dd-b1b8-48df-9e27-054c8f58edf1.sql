UPDATE public.bybit_card_txns SET status = 'success' WHERE status = 'pending';
UPDATE public.bybit_ledger SET status = 'success' WHERE status = 'pending';