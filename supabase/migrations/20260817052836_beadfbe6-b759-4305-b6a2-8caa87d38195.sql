CREATE UNIQUE INDEX IF NOT EXISTS bybit_card_txns_account_txn_uniq
  ON public.bybit_card_txns (account_id, txn_id) NULLS NOT DISTINCT;