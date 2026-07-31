CREATE OR REPLACE FUNCTION public.agent_register(p_device_id text, p_secret text, p_employee_name text, p_device_label text, p_os text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing text;
  new_hash text := encode(sha256(p_secret::bytea), 'hex');
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 OR p_secret IS NULL OR length(p_secret) < 16 THEN
    RAISE EXCEPTION 'invalid registration';
  END IF;

  SELECT secret_hash INTO existing FROM public.agent_devices WHERE device_id = p_device_id;

  IF existing IS NULL THEN
    INSERT INTO public.agent_devices(device_id, secret_hash, employee_name, device_label, os, last_seen_at)
    VALUES (p_device_id, new_hash,
            nullif(trim(coalesce(p_employee_name,'')),''), nullif(trim(coalesce(p_device_label,'')),''),
            nullif(trim(coalesce(p_os,'')),''), now());
    RETURN true;
  END IF;

  IF existing <> new_hash THEN
    RAISE EXCEPTION 'device already registered';
  END IF;

  UPDATE public.agent_devices
     SET employee_name = coalesce(nullif(trim(coalesce(p_employee_name,'')),''), employee_name),
         device_label = coalesce(nullif(trim(coalesce(p_device_label,'')),''), device_label),
         os = coalesce(nullif(trim(coalesce(p_os,'')),''), os),
         last_seen_at = now()
   WHERE device_id = p_device_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agent_heartbeat(p_device_id text, p_secret text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ok boolean;
BEGIN
  UPDATE public.agent_devices
     SET last_seen_at = now()
   WHERE device_id = p_device_id
     AND secret_hash = encode(sha256(p_secret::bytea), 'hex')
     AND approved
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END;
$function$;