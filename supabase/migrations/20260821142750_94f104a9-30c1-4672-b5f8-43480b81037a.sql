ALTER TABLE public.work_manual_txns
  ADD COLUMN IF NOT EXISTS amount_saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS details_saved_at timestamptz;