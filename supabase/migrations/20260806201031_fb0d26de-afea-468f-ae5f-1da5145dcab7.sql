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

  WITH claimed AS (
    DELETE FROM public.screenshare_signals
    WHERE device_id = p_device_id
      AND sender = 'viewer'
      AND expires_at > now()
    RETURNING id, viewer_id, payload, created_at
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'viewer_id', viewer_id,
        'payload', payload
      )
      ORDER BY created_at
    ),
    '[]'::jsonb
  )
  INTO incoming
  FROM claimed;

  RETURN incoming;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_exchange_signals(text, text, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_exchange_signals(text, text, jsonb) TO anon, service_role;