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

COMMIT;
