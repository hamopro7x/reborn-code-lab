-- Security hardening (review, then run once in the Supabase SQL Editor).
BEGIN;

-- 1) Exchange keys: only the server (service role) may read or write them.
REVOKE ALL ON FUNCTION public.bybit_account_get_keys(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bybit_account_set_keys(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_account_get_keys(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bybit_account_set_keys(uuid,text,text,uuid) TO service_role;

-- 2) Enrollment codes: admins only, cryptographically random codes.
CREATE OR REPLACE FUNCTION public.agent_create_enroll_code(p_employee_name text DEFAULT NULL, p_note text DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text; raw bytea; i int;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  LOOP
    raw := decode(replace(gen_random_uuid()::text,'-',''),'hex') || decode(replace(gen_random_uuid()::text,'-',''),'hex');
    new_code := '';
    FOR i IN 0..9 LOOP
      new_code := new_code || substr(alphabet, 1 + (get_byte(raw, i) % 32), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agent_enroll_codes WHERE code = new_code);
  END LOOP;
  INSERT INTO public.agent_enroll_codes(code, employee_name, note, created_by, target_user_id)
  VALUES (new_code, nullif(trim(coalesce(p_employee_name,'')),''), nullif(trim(coalesce(p_note,'')),''), auth.uid(), p_user_id);
  RETURN new_code;
END $$;

CREATE OR REPLACE FUNCTION public.agent_create_enroll_code(p_employee_name text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.agent_create_enroll_code(p_employee_name, p_note, NULL::uuid);
$$;

REVOKE ALL ON FUNCTION public.agent_create_enroll_code(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_create_enroll_code(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_create_enroll_code(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_create_enroll_code(text,text,uuid) TO authenticated;

DROP POLICY IF EXISTS "staff can insert enroll codes" ON public.agent_enroll_codes;
DROP POLICY IF EXISTS "staff can delete enroll codes" ON public.agent_enroll_codes;
CREATE POLICY "admins delete enroll codes" ON public.agent_enroll_codes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 3) Devices: only admins may change or delete device rows (approval, owner).
DROP POLICY IF EXISTS "staff update devices" ON public.agent_devices;
DROP POLICY IF EXISTS "staff delete devices" ON public.agent_devices;
CREATE POLICY "admins update devices" ON public.agent_devices FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "admins delete devices" ON public.agent_devices FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 4) Shift claim: only the server may claim, after it verified the PIN.
CREATE OR REPLACE FUNCTION public.work_claim_shift_for(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur public.work_shifts; fresh public.work_shifts;
BEGIN
  IF p_user IS NULL OR NOT private.is_staff(p_user) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO cur FROM public.work_shifts WHERE ended_at IS NULL FOR UPDATE;
  IF cur.id IS NOT NULL AND cur.user_id = p_user THEN RETURN to_jsonb(cur); END IF;
  IF cur.id IS NOT NULL THEN
    UPDATE public.work_shifts SET ended_at = now(), ended_reason = 'handover' WHERE id = cur.id;
  END IF;
  INSERT INTO public.work_shifts(user_id, verified_face, verified_device) VALUES (p_user, true, true) RETURNING * INTO fresh;
  RETURN to_jsonb(fresh);
END $$;
REVOKE ALL ON FUNCTION public.work_claim_shift_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_claim_shift_for(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.work_claim_shift(boolean,boolean) FROM PUBLIC, anon, authenticated;

COMMIT;
