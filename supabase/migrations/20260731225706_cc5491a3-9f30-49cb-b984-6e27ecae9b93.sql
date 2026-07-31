CREATE TABLE IF NOT EXISTS public.agent_pairings (
  code text PRIMARY KEY,
  device_id text NOT NULL UNIQUE,
  secret_hash text NOT NULL,
  employee_name text,
  device_label text,
  os text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.agent_pairings TO authenticated;
GRANT ALL ON public.agent_pairings TO service_role;
ALTER TABLE public.agent_pairings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read pairings" ON public.agent_pairings;
CREATE POLICY "staff read pairings" ON public.agent_pairings
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "staff delete pairings" ON public.agent_pairings;
CREATE POLICY "staff delete pairings" ON public.agent_pairings
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.agent_pair_request(
  p_device_id text, p_secret text, p_employee_name text, p_device_label text, p_os text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  h text := encode(sha256(p_secret::bytea), 'hex');
  existing_code text;
  new_code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 OR p_secret IS NULL OR length(p_secret) < 16 THEN
    RAISE EXCEPTION 'invalid pairing request';
  END IF;

  IF EXISTS (SELECT 1 FROM public.agent_devices WHERE device_id = p_device_id AND secret_hash = h) THEN
    RETURN 'REGISTERED';
  END IF;

  SELECT code INTO existing_code FROM public.agent_pairings
   WHERE device_id = p_device_id AND secret_hash = h;

  IF existing_code IS NOT NULL THEN
    UPDATE public.agent_pairings
       SET last_seen_at = now(),
           employee_name = coalesce(nullif(trim(coalesce(p_employee_name,'')),''), employee_name),
           device_label = coalesce(nullif(trim(coalesce(p_device_label,'')),''), device_label),
           os = coalesce(nullif(trim(coalesce(p_os,'')),''), os)
     WHERE code = existing_code;
    RETURN existing_code;
  END IF;

  DELETE FROM public.agent_pairings WHERE device_id = p_device_id;

  LOOP
    new_code := '';
    FOR i IN 1..8 LOOP
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agent_pairings WHERE code = new_code);
  END LOOP;

  INSERT INTO public.agent_pairings(code, device_id, secret_hash, employee_name, device_label, os)
  VALUES (new_code, p_device_id, h,
          nullif(trim(coalesce(p_employee_name,'')),''),
          nullif(trim(coalesce(p_device_label,'')),''),
          nullif(trim(coalesce(p_os,'')),''));

  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_claim_pairing(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.agent_pairings;
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO r FROM public.agent_pairings
   WHERE code = upper(trim(coalesce(p_code,'')));

  IF r.code IS NULL THEN
    RAISE EXCEPTION 'invalid pairing key';
  END IF;

  DELETE FROM public.agent_devices WHERE device_id = r.device_id;

  INSERT INTO public.agent_devices(device_id, secret_hash, employee_name, device_label, os, last_seen_at)
  VALUES (r.device_id, r.secret_hash, r.employee_name, r.device_label, r.os, now());

  DELETE FROM public.agent_pairings WHERE code = r.code;

  RETURN jsonb_build_object('device_id', r.device_id, 'employee_name', r.employee_name);
END;
$$;

REVOKE ALL ON FUNCTION public.agent_pair_request(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_claim_pairing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_pair_request(text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agent_claim_pairing(text) TO authenticated, service_role;