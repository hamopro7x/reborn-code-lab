-- TikTok coins auto-charge jobs (run once in Supabase SQL Editor)
CREATE TABLE IF NOT EXISTS public.tiktok_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  coins integer NOT NULL CHECK (coins > 0),
  amount_egp numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','starting','qr_ready','scanned','charging','done','manual')),
  qr_image text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.tiktok_jobs TO authenticated;
GRANT ALL ON public.tiktok_jobs TO service_role;

ALTER TABLE public.tiktok_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage tiktok jobs" ON public.tiktok_jobs;
CREATE POLICY "admins manage tiktok jobs" ON public.tiktok_jobs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'));

CREATE INDEX IF NOT EXISTS tiktok_jobs_status_idx ON public.tiktok_jobs (status, created_at);
