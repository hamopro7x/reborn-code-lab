CREATE TABLE IF NOT EXISTS public.remote_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID,
  employee_name TEXT NOT NULL,
  device_label TEXT,
  remote_url TEXT NOT NULL,
  access_code TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remote_access TO authenticated;
GRANT ALL ON public.remote_access TO service_role;

ALTER TABLE public.remote_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage remote access entries" ON public.remote_access;
CREATE POLICY "Admins manage remote access entries"
ON public.remote_access FOR ALL TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS remote_access_set_updated_at ON public.remote_access;
CREATE TRIGGER remote_access_set_updated_at
BEFORE UPDATE ON public.remote_access
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();