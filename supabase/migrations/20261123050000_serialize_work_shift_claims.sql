-- Serialize all staff shift claims/handover attempts, including the no-open-shift case.
-- CREATE OR REPLACE preserves the existing function signature and grants.
BEGIN;

CREATE OR REPLACE FUNCTION public.work_claim_shift_for(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cur public.work_shifts;
  fresh public.work_shifts;
BEGIN
  IF p_user IS NULL OR NOT private.is_staff(p_user) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- A row lock cannot serialize an empty result. A transaction advisory lock
  -- makes every invocation re-read the current open shift after prior claims commit.
  PERFORM pg_advisory_xact_lock(hashtextextended('mgpro-work-shift-claim-v1', 0));

  SELECT * INTO cur
  FROM public.work_shifts
  WHERE ended_at IS NULL
  FOR UPDATE;

  IF cur.id IS NOT NULL AND cur.user_id = p_user THEN
    RETURN to_jsonb(cur);
  END IF;

  IF cur.id IS NOT NULL THEN
    UPDATE public.work_shifts
    SET ended_at = now(), ended_reason = 'handover'
    WHERE id = cur.id;
  END IF;

  INSERT INTO public.work_shifts(user_id, verified_face, verified_device)
  VALUES (p_user, true, true)
  RETURNING * INTO fresh;

  RETURN to_jsonb(fresh);
END
$function$;

COMMIT;
