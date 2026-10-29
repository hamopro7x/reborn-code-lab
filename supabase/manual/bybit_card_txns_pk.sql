-- NOT APPLIED. Review before running manually on production.
-- bybit_card_txns still has PRIMARY KEY (txn_id) besides the unique
-- (account_id, txn_id). The same Bybit txnId under two accounts then fails the
-- archive upsert. This moves the identity to (account_id, txn_id) only.
BEGIN;
ALTER TABLE public.bybit_card_txns DROP CONSTRAINT IF EXISTS bybit_card_txns_pkey;
ALTER TABLE public.bybit_card_txns ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.bybit_card_txns ADD PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS bybit_card_txns_txn_idx ON public.bybit_card_txns (txn_id);
COMMIT;
-- prune_bybit_card_txns deletes by txn_id; after this change review it so it
-- deletes by id (or account_id, txn_id).
