-- Run on the site's database before deploying the updated P2P linking code.
BEGIN;
ALTER TABLE public.work_shifts ADD COLUMN IF NOT EXISTS link_group text;
CREATE INDEX IF NOT EXISTS work_shifts_link_group_idx ON public.work_shifts (link_group);

CREATE OR REPLACE FUNCTION public.work_link_p2p_atomic(
  p_ledger_id uuid, p_shift_id uuid, p_actor_id uuid, p_used_shift_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  selected_ids uuid[];
  target public.work_shifts%ROWTYPE;
  ledger public.bybit_ledger%ROWTYPE;
  group_id text;
BEGIN
  SELECT array_agg(DISTINCT id) INTO selected_ids
  FROM unnest(array_append(coalesce(p_used_shift_ids, ARRAY[]::uuid[]), p_shift_id)) AS ids(id);
  IF p_actor_id IS NULL OR p_shift_id IS NULL OR cardinality(selected_ids) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'اختيار الشفتات غير صالح.');
  END IF;

  -- Consistent lock order prevents concurrent orders consuming the same ended shift.
  PERFORM id FROM public.work_shifts WHERE id = ANY(selected_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.work_shifts WHERE id = ANY(selected_ids) AND user_id = p_actor_id)
      <> cardinality(selected_ids) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'لا يمكنك ربط الطلب بهذه الشفتات.');
  END IF;
  SELECT * INTO target FROM public.work_shifts WHERE id = p_shift_id;
  IF EXISTS (SELECT 1 FROM public.work_shifts WHERE id = ANY(selected_ids) AND started_at > target.started_at) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'لازم ربط الطلب بأحدث شفت من المحددين.');
  END IF;

  SELECT * INTO ledger FROM public.bybit_ledger WHERE id = p_ledger_id FOR UPDATE;
  IF ledger.id IS NULL OR ledger.kind NOT IN ('p2p_buy', 'p2p_sell') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'هذا الطلب غير متاح للربط.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.work_txn_assignments WHERE ledger_id = p_ledger_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'هذا الطلب تم ربطه بالفعل.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.work_shifts s WHERE s.id = ANY(selected_ids) AND s.ended_at IS NOT NULL
    AND (s.ended_reason = 'p2p_used' OR EXISTS (
      SELECT 1 FROM public.work_txn_assignments a WHERE a.shift_id = s.id AND a.kind IN ('p2p_buy', 'p2p_sell')
    ))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'شفت من المحددين اتربط قبل كده. افتح القائمة من جديد.');
  END IF;

  -- Reusing an open shift must not split its previously linked colour group.
  group_id := coalesce(target.link_group, gen_random_uuid()::text);
  INSERT INTO public.work_txn_assignments
    (ledger_id, shift_id, user_id, occurred_at, kind, assign_mode, assigned_by)
  VALUES (ledger.id, target.id, p_actor_id, ledger.occurred_at, ledger.kind, 'manual', p_actor_id);
  UPDATE public.work_shifts SET
    link_group = group_id,
    ended_reason = CASE WHEN ended_at IS NOT NULL THEN 'p2p_used' ELSE ended_reason END
  WHERE id = ANY(selected_ids) AND user_id = p_actor_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Only the authenticated server wrapper may supply the verified actor ID.
REVOKE ALL ON FUNCTION public.work_link_p2p_atomic(uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_link_p2p_atomic(uuid, uuid, uuid, uuid[]) TO service_role;
COMMIT;