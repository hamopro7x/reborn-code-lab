CREATE TABLE public.screenshare_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  viewer_id text NOT NULL,
  sender text NOT NULL CHECK (sender IN ('viewer', 'host')),
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 minute'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.screenshare_signals TO authenticated;
GRANT ALL ON public.screenshare_signals TO service_role;

ALTER TABLE public.screenshare_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read screenshare signals"
ON public.screenshare_signals FOR SELECT TO authenticated
USING (private.is_admin(auth.uid()));

CREATE POLICY "admins send screenshare signals"
ON public.screenshare_signals FOR INSERT TO authenticated
WITH CHECK (private.is_admin(auth.uid()) AND sender = 'viewer' AND expires_at <= now() + interval '2 minutes');

CREATE POLICY "admins delete screenshare signals"
ON public.screenshare_signals FOR DELETE TO authenticated
USING (private.is_admin(auth.uid()));

CREATE INDEX screenshare_signals_device_created_idx
ON public.screenshare_signals (device_id, created_at);

CREATE OR REPLACE FUNCTION public.agent_exchange_signals(
  p_device_id text,
  p_secret text,
  p_outgoing jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  incoming jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.agent_devices
    WHERE device_id = p_device_id
      AND secret_hash = encode(sha256(p_secret::bytea), 'hex')
      AND approved
  ) THEN
    RAISE EXCEPTION 'invalid device credentials';
  END IF;

  DELETE FROM public.screenshare_signals WHERE expires_at <= now();

  INSERT INTO public.screenshare_signals(device_id, viewer_id, sender, payload)
  SELECT p_device_id, x->>'viewer_id', 'host', x->'payload'
  FROM jsonb_array_elements(coalesce(p_outgoing, '[]'::jsonb)) AS x
  WHERE jsonb_typeof(x->'payload') = 'object'
    AND length(coalesce(x->>'viewer_id', '')) BETWEEN 6 AND 100;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'viewer_id', viewer_id,
    'payload', payload
  ) ORDER BY created_at), '[]'::jsonb)
  INTO incoming
  FROM public.screenshare_signals
  WHERE device_id = p_device_id
    AND sender = 'viewer'
    AND expires_at > now();

  DELETE FROM public.screenshare_signals
  WHERE device_id = p_device_id AND sender = 'viewer';

  RETURN incoming;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_exchange_signals(text, text, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_exchange_signals(text, text, jsonb) TO anon, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.screenshare_signals;