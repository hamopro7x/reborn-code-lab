-- Enrollment codes are one-time credentials. Bound their lifetime so
-- unused codes cannot remain valid indefinitely if copied or exposed.
-- Existing rows are retained; old codes simply stop being accepted.
BEGIN;

CREATE OR REPLACE FUNCTION public.agent_register(
  p_device_id text,
  p_secret text,
  p_employee_name text DEFAULT NULL::text,
  p_device_label text DEFAULT NULL::text,
  p_os text DEFAULT NULL::text,
  p_version text DEFAULT NULL::text,
  p_enroll_code text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing text;
  new_hash text := encode(sha256(p_secret::bytea), 'hex');
  code_row public.agent_enroll_codes;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 OR p_secret IS NULL OR length(p_secret) < 16 THEN
    RAISE EXCEPTION 'invalid registration';
  END IF;

  SELECT secret_hash INTO existing FROM public.agent_devices WHERE device_id = p_device_id;

  IF existing IS NOT NULL THEN
    IF existing <> new_hash THEN
      RAISE EXCEPTION 'device already registered';
    END IF;
    UPDATE public.agent_devices
       SET employee_name = coalesce(nullif(trim(coalesce(p_employee_name,'')),''), employee_name),
           device_label = coalesce(nullif(trim(coalesce(p_device_label,'')),''), device_label),
           os = coalesce(nullif(trim(coalesce(p_os,'')),''), os),
           app_version = coalesce(nullif(trim(coalesce(p_version,'')),''), app_version),
           last_seen_at = now()
     WHERE device_id = p_device_id;
    RETURN true;
  END IF;

  SELECT * INTO code_row FROM public.agent_enroll_codes
   WHERE code = upper(trim(coalesce(p_enroll_code,'')))
     AND used_at IS NULL
     AND created_at >= now() - interval '30 days'
   FOR UPDATE;

  IF code_row.code IS NULL THEN
    RAISE EXCEPTION 'invalid, expired, or used enrollment code';
  END IF;

  INSERT INTO public.agent_devices(device_id, secret_hash, employee_name, device_label, os, app_version, last_seen_at, user_id)
  VALUES (p_device_id, new_hash,
          coalesce(nullif(trim(coalesce(p_employee_name,'')),''), code_row.employee_name),
          nullif(trim(coalesce(p_device_label,'')),''), nullif(trim(coalesce(p_os,'')),''), nullif(trim(coalesce(p_version,'')),''), now(),
          code_row.target_user_id);

  UPDATE public.agent_enroll_codes
     SET used_at = now(), used_by_device = p_device_id
   WHERE code = code_row.code;

  RETURN true;
END;
$function$;

COMMIT;
