CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  created_by uuid,
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage api keys" ON public.api_keys;
CREATE POLICY "Admins manage api keys" ON public.api_keys
FOR ALL TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON public.api_keys (key_hash);