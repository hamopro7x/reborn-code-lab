CREATE TABLE IF NOT EXISTS public.work_manual_txns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  card text NOT NULL CHECK (card IN ('wrong','employee')),
  amount numeric,
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_manual_txns_user_card_idx ON public.work_manual_txns (user_id, card, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_manual_txns TO authenticated;
GRANT ALL ON public.work_manual_txns TO service_role;
ALTER TABLE public.work_manual_txns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own manual txns" ON public.work_manual_txns;
CREATE POLICY "own manual txns" ON public.work_manual_txns FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());