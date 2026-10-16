-- عند تسليم الشغل: الشفت المنتهي يُحذف نهائيًا بدل بقائه في القائمة.
-- طلبات P2P المربوطة تُفصل عن الشفت (shift_id = NULL) مع بقاء صف الربط،
-- حتى لا تعود للظهور كطلبات متاحة. باقي الروابط والمعاملات اليدوية تُحذف.
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
    -- فصل طلبات P2P عن الشفت مع بقاء صف الربط
    UPDATE public.work_txn_assignments
       SET shift_id = NULL
     WHERE shift_id = cur.id
       AND kind IN ('p2p_buy', 'p2p_sell');

    -- حذف باقي الروابط والمعاملات اليدوية التابعة للشفت
    DELETE FROM public.work_txn_assignments
     WHERE shift_id = cur.id
       AND kind NOT IN ('p2p_buy', 'p2p_sell');
    DELETE FROM public.work_manual_card_txns WHERE shift_id = cur.id;
    DELETE FROM public.work_manual_txns WHERE shift_id = cur.id;

    -- حذف الشفت نفسه نهائيًا
    DELETE FROM public.work_shifts WHERE id = cur.id;
  END IF;

  INSERT INTO public.work_shifts(user_id, verified_face, verified_device)
  VALUES (uid, true, true)
  RETURNING * INTO fresh;

  RETURN to_jsonb(fresh);
END;
$$;

REVOKE ALL ON FUNCTION public.work_claim_shift(boolean, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.work_claim_shift(boolean, boolean) TO authenticated;
