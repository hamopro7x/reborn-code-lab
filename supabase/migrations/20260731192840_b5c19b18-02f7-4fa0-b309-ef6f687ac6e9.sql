CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.agent_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  secret_hash text NOT NULL,
  employee_name text,
  device_label text,
  os text,
  approved boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.agent_devices TO authenticated;
GRANT ALL ON public.agent_devices TO service_role;
ALTER TABLE public.agent_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read devices" ON public.agent_devices
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff update devices" ON public.agent_devices
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff delete devices" ON public.agent_devices
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

CREATE TRIGGER agent_devices_updated_at BEFORE UPDATE ON public.agent_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.agent_register(
  p_device_id text, p_secret text, p_employee_name text, p_device_label text, p_os text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing text;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 OR p_secret IS NULL OR length(p_secret) < 16 THEN
    RAISE EXCEPTION 'invalid registration';
  END IF;

  SELECT secret_hash INTO existing FROM public.agent_devices WHERE device_id = p_device_id;

  IF existing IS NULL THEN
    INSERT INTO public.agent_devices(device_id, secret_hash, employee_name, device_label, os, last_seen_at)
    VALUES (p_device_id, encode(digest(p_secret, 'sha256'), 'hex'),
            nullif(trim(coalesce(p_employee_name,'')),''), nullif(trim(coalesce(p_device_label,'')),''),
            nullif(trim(coalesce(p_os,'')),''), now());
    RETURN true;
  END IF;

  IF existing <> encode(digest(p_secret, 'sha256'), 'hex') THEN
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
$$;

CREATE OR REPLACE FUNCTION public.agent_heartbeat(p_device_id text, p_secret text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ok boolean;
BEGIN
  UPDATE public.agent_devices
     SET last_seen_at = now()
   WHERE device_id = p_device_id
     AND secret_hash = encode(digest(p_secret, 'sha256'), 'hex')
     AND approved
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.agent_register(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_heartbeat(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_register(text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agent_heartbeat(text, text) TO anon, authenticated, service_role;