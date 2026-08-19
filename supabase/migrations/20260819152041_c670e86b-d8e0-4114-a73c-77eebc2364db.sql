CREATE TABLE IF NOT EXISTS public.bybit_sync_state (
  id text PRIMARY KEY,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  paused boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.bybit_sync_state TO authenticated;
GRANT ALL ON public.bybit_sync_state TO service_role;
ALTER TABLE public.bybit_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sync state admin read" ON public.bybit_sync_state;
CREATE POLICY "sync state admin read" ON public.bybit_sync_state FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
INSERT INTO public.bybit_sync_state(id) VALUES ('ledger') ON CONFLICT (id) DO NOTHING;