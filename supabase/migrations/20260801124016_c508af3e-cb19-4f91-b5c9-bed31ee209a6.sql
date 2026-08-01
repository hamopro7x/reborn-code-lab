CREATE TABLE public.agent_enroll_codes (
  code text PRIMARY KEY,
  employee_name text,
  note text,
  created_by uuid,
  used_by_device text,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_enroll_codes TO authenticated;
GRANT ALL ON public.agent_enroll_codes TO service_role;

ALTER TABLE public.agent_enroll_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read enroll codes" ON public.agent_enroll_codes
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff can insert enroll codes" ON public.agent_enroll_codes
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff can delete enroll codes" ON public.agent_enroll_codes
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.agent_create_enroll_code(p_employee_name text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  i int;
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  LOOP
    new_code := '';
    FOR i IN 1..8 LOOP
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agent_enroll_codes WHERE code = new_code);
  END LOOP;

  INSERT INTO public.agent_enroll_codes(code, employee_name, note, created_by)
  VALUES (new_code, nullif(trim(coalesce(p_employee_name,'')),''), nullif(trim(coalesce(p_note,'')),''), auth.uid());

  RETURN new_code;
END;
$$;

-- التسجيل أصبح يتطلب كودًا صادرًا من الإدارة
CREATE OR REPLACE FUNCTION public.agent_register(p_device_id text, p_secret text, p_employee_name text, p_device_label text, p_os text, p_version text DEFAULT NULL::text, p_enroll_code text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
   WHERE code = upper(trim(coalesce(p_enroll_code,''))) AND used_at IS NULL
   FOR UPDATE;

  IF code_row.code IS NULL THEN
    RAISE EXCEPTION 'invalid or used enrollment code';
  END IF;

  INSERT INTO public.agent_devices(device_id, secret_hash, employee_name, device_label, os, app_version, last_seen_at)
  VALUES (p_device_id, new_hash,
          coalesce(nullif(trim(coalesce(p_employee_name,'')),''), code_row.employee_name),
          nullif(trim(coalesce(p_device_label,'')),''),
          nullif(trim(coalesce(p_os,'')),''), nullif(trim(coalesce(p_version,'')),''), now());

  UPDATE public.agent_enroll_codes
     SET used_at = now(), used_by_device = p_device_id
   WHERE code = code_row.code;

  RETURN true;
END;
$$;

-- النسخة القديمة بدون كود ممنوعة
CREATE OR REPLACE FUNCTION public.agent_register(p_device_id text, p_secret text, p_employee_name text, p_device_label text, p_os text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'enrollment code required';
END;
$$;

-- تعطيل الربط القديم (البرنامج كان يولّد المفتاح بنفسه)
CREATE OR REPLACE FUNCTION public.agent_pair_request(p_device_id text, p_secret text, p_employee_name text, p_device_label text, p_os text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  h text := encode(sha256(p_secret::bytea), 'hex');
BEGIN
  IF EXISTS (SELECT 1 FROM public.agent_devices WHERE device_id = p_device_id AND secret_hash = h) THEN
    RETURN 'REGISTERED';
  END IF;
  RETURN 'NEED_CODE';
END;
$$;