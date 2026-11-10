-- OKX accounts share public.bybit_accounts and the central ledger.
-- Safe to run more than once. Adds one column; existing rows stay Bybit.
-- Nothing is deleted or changed in existing transactions.
BEGIN;

ALTER TABLE public.bybit_accounts
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'bybit';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bybit_accounts_provider_check'
  ) THEN
    ALTER TABLE public.bybit_accounts
      ADD CONSTRAINT bybit_accounts_provider_check CHECK (provider IN ('bybit', 'okx'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bybit_accounts_provider_idx ON public.bybit_accounts (provider);

COMMIT;

-- Check: every existing account must show provider = 'bybit'.
SELECT provider, count(*) FROM public.bybit_accounts GROUP BY provider;
