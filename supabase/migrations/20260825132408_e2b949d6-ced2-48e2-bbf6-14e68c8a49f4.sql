ALTER TABLE public.bybit_ledger REPLICA IDENTITY FULL;
ALTER TABLE public.work_txn_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.work_manual_card_txns REPLICA IDENTITY FULL;
ALTER TABLE public.work_manual_txns REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bybit_ledger;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_txn_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_manual_card_txns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_manual_txns;