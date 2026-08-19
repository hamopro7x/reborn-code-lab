CREATE TABLE public.work_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text,
  verified_face boolean NOT NULL DEFAULT false,
  verified_device boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX work_shifts_single_open ON public.work_shifts ((ended_at IS NULL)) WHERE ended_at IS NULL;
CREATE INDEX work_shifts_user_started ON public.work_shifts (user_id, started_at DESC);

GRANT SELECT ON public.work_shifts TO authenticated;
GRANT ALL ON public.work_shifts TO service_role;
ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read shifts" ON public.work_shifts FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE TABLE public.work_txn_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL UNIQUE REFERENCES public.bybit_ledger(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.work_shifts(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  kind text NOT NULL,
  assign_mode text NOT NULL DEFAULT 'auto' CHECK (assign_mode IN ('auto','manual')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid
);
CREATE INDEX work_assign_user_time ON public.work_txn_assignments (user_id, occurred_at DESC);
CREATE INDEX work_assign_shift ON public.work_txn_assignments (shift_id);

GRANT SELECT ON public.work_txn_assignments TO authenticated;
GRANT ALL ON public.work_txn_assignments TO service_role;
ALTER TABLE public.work_txn_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read assignments" ON public.work_txn_assignments FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE TABLE public.employee_face_enroll (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.employee_face_enroll TO authenticated;
GRANT ALL ON public.employee_face_enroll TO service_role;
ALTER TABLE public.employee_face_enroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin read face enroll" ON public.employee_face_enroll FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

CREATE TABLE public.webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX webauthn_user ON public.webauthn_credentials (user_id);
GRANT SELECT ON public.webauthn_credentials TO authenticated;
GRANT ALL ON public.webauthn_credentials TO service_role;
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own read credentials" ON public.webauthn_credentials FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

CREATE TABLE public.work_auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge text NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_auth_challenges_user ON public.work_auth_challenges (user_id, purpose);
GRANT ALL ON public.work_auth_challenges TO service_role;
ALTER TABLE public.work_auth_challenges ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.work_claim_shift(p_face boolean, p_device boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur public.work_shifts;
  fresh public.work_shifts;
BEGIN
  IF uid IS NULL OR NOT private.is_staff(uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT coalesce(p_face, false) OR NOT coalesce(p_device, false) THEN
    RAISE EXCEPTION 'verification required';
  END IF;

  SELECT * INTO cur FROM public.work_shifts WHERE ended_at IS NULL FOR UPDATE;

  IF cur.id IS NOT NULL AND cur.user_id = uid THEN
    RETURN to_jsonb(cur);
  END IF;

  IF cur.id IS NOT NULL THEN
    UPDATE public.work_shifts
       SET ended_at = now(), ended_reason = 'handover'
     WHERE id = cur.id;
  END IF;

  INSERT INTO public.work_shifts(user_id, verified_face, verified_device)
  VALUES (uid, true, true)
  RETURNING * INTO fresh;

  RETURN to_jsonb(fresh);
END;
$$;

CREATE OR REPLACE FUNCTION public.work_assign_txn(p_ledger_id uuid, p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  sh public.work_shifts;
  led public.bybit_ledger;
  ins public.work_txn_assignments;
BEGIN
  IF uid IS NULL OR NOT private.is_admin(uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO sh FROM public.work_shifts WHERE id = p_shift_id;
  IF sh.id IS NULL THEN RAISE EXCEPTION 'shift not found'; END IF;

  SELECT * INTO led FROM public.bybit_ledger WHERE id = p_ledger_id;
  IF led.id IS NULL THEN RAISE EXCEPTION 'transaction not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.work_txn_assignments WHERE ledger_id = p_ledger_id) THEN
    RAISE EXCEPTION 'already assigned';
  END IF;

  INSERT INTO public.work_txn_assignments(ledger_id, shift_id, user_id, occurred_at, kind, assign_mode, assigned_by)
  VALUES (p_ledger_id, sh.id, sh.user_id, led.occurred_at, led.kind, 'manual', uid)
  RETURNING * INTO ins;

  RETURN to_jsonb(ins);
END;
$$;