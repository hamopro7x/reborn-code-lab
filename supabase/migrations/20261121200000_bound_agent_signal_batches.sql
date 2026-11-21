-- Bound the amount of JSON accepted by the public device-authenticated
-- signaling RPC. The desktop agent already caps its local queue at 250.
-- This limits memory/CPU and table-write amplification from a compromised device.
CREATE OR REPLACE FUNCTION public.agent_exchange_signals(
  p_device_id text,
  p_secret text,
  p_outgoing jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  incoming jsonb;
BEGIN
  -- Validate the JSON type before calling array-only functions. Keeping this
  -- in a separate IF avoids evaluating jsonb_array_length on scalar JSON.
  IF p_outgoing IS NULL OR jsonb_typeof(p_outgoing) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid signal batch' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_outgoing) > 250
     OR octet_length(p_outgoing::text) > 1048576 THEN
    RAISE EXCEPTION 'invalid signal batch' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agent_devices
    WHERE device_id = p_device_id
      AND secret_hash = encode(sha256(p_secret::bytea), 'hex')
      AND approved
  ) THEN
    RAISE EXCEPTION 'invalid device credentials';
  END IF;

  DELETE FROM public.screenshare_signals
  WHERE device_id = p_device_id
    AND expires_at <= now();

  INSERT INTO public.screenshare_signals(device_id, viewer_id, sender, payload)
  SELECT p_device_id, x->>'viewer_id', 'host', x->'payload'
  FROM jsonb_array_elements(p_outgoing) AS x
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
$function$;
