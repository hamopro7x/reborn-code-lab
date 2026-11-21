-- Restrict agent device metadata and enrollment bearer codes to admins.
-- Employee access to the agent itself continues through the device-secret RPCs.
BEGIN;

-- Device metadata is only needed by the admin device-management UI.
DROP POLICY IF EXISTS "staff read devices" ON public.agent_devices;
DROP POLICY IF EXISTS "admins read devices" ON public.agent_devices;
CREATE POLICY "admins read devices" ON public.agent_devices
  FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

-- Keep device approval, reassignment, and removal admin-only.
DROP POLICY IF EXISTS "staff update devices" ON public.agent_devices;
DROP POLICY IF EXISTS "admins update devices" ON public.agent_devices;
CREATE POLICY "admins update devices" ON public.agent_devices
  FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "staff delete devices" ON public.agent_devices;
DROP POLICY IF EXISTS "admins delete devices" ON public.agent_devices;
CREATE POLICY "admins delete devices" ON public.agent_devices
  FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()));

-- Enrollment codes are bearer credentials: employees must not be able to
-- read unused codes or create/delete them directly. Registration consumes a
-- code inside the SECURITY DEFINER agent_register RPC.
DROP POLICY IF EXISTS "staff can read enroll codes" ON public.agent_enroll_codes;
DROP POLICY IF EXISTS "admins can read enroll codes" ON public.agent_enroll_codes;
CREATE POLICY "admins can read enroll codes" ON public.agent_enroll_codes
  FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "staff can insert enroll codes" ON public.agent_enroll_codes;
DROP POLICY IF EXISTS "staff can delete enroll codes" ON public.agent_enroll_codes;
DROP POLICY IF EXISTS "admins delete enroll codes" ON public.agent_enroll_codes;
CREATE POLICY "admins delete enroll codes" ON public.agent_enroll_codes
  FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()));


-- The enrollment-code RPC was originally callable by any staff member.
-- Lock the SECURITY DEFINER entrypoint itself to admins as well as the table RLS.
CREATE OR REPLACE FUNCTION public.agent_create_enroll_code(
  p_employee_name text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $agent$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  raw bytea;
  i int;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  LOOP
    raw := decode(replace(gen_random_uuid()::text, '-', ''), 'hex')
        || decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    new_code := '';
    FOR i IN 0..9 LOOP
      new_code := new_code || substr(alphabet, 1 + (get_byte(raw, i) % 32), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agent_enroll_codes WHERE code = new_code);
  END LOOP;

  INSERT INTO public.agent_enroll_codes(code, employee_name, note, created_by, target_user_id)
  VALUES (
    new_code,
    nullif(trim(coalesce(p_employee_name, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid(),
    p_user_id
  );
  RETURN new_code;
END;
$agent$;

-- Preserve the two-argument API used by older admin screens.
CREATE OR REPLACE FUNCTION public.agent_create_enroll_code(
  p_employee_name text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $agent$
  SELECT public.agent_create_enroll_code(p_employee_name, p_note, NULL::uuid);
$agent$;

REVOKE ALL ON FUNCTION public.agent_create_enroll_code(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_create_enroll_code(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_create_enroll_code(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_create_enroll_code(text, text, uuid) TO authenticated;

COMMIT;
