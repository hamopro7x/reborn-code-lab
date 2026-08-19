CREATE INDEX IF NOT EXISTS bybit_ledger_kind_time_idx ON public.bybit_ledger (kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS bybit_ledger_kind_status_time_idx ON public.bybit_ledger (kind, status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS bybit_ledger_account_time_idx ON public.bybit_ledger (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS bybit_card_txns_account_time_idx ON public.bybit_card_txns (account_id, txn_time DESC);
CREATE INDEX IF NOT EXISTS bybit_card_txns_account_status_time_idx ON public.bybit_card_txns (account_id, status, txn_time DESC);
ANALYZE public.bybit_ledger;
ANALYZE public.bybit_card_txns;