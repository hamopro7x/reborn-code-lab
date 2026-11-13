-- Additive rollout only. Run once BEFORE deploying the matching application.
-- No existing rows, uniqueness constraints, ledger fields, or shift fields change.
BEGIN;

CREATE TABLE IF NOT EXISTS public.work_p2p_shift_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES public.bybit_ledger(id) ON DELETE RESTRICT,
  shift_id uuid REFERENCES public.work_shifts(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  linked_by uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  shift_started_at timestamptz NOT NULL,
  shift_ended_at timestamptz,
  UNIQUE (ledger_id, shift_id)
);
GRANT SELECT ON public.work_p2p_shift_links TO authenticated;
GRANT ALL ON public.work_p2p_shift_links TO service_role;
ALTER TABLE public.work_p2p_shift_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY p2p_links_read ON public.work_p2p_shift_links FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS work_p2p_links_user ON public.work_p2p_shift_links(user_id, linked_at DESC);
CREATE INDEX IF NOT EXISTS work_p2p_links_shift ON public.work_p2p_shift_links(shift_id);

CREATE TABLE IF NOT EXISTS public.work_p2p_hidden_shifts (
  user_id uuid NOT NULL,
  shift_id uuid NOT NULL REFERENCES public.work_shifts(id) ON DELETE CASCADE,
  hidden boolean NOT NULL DEFAULT true,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shift_id)
);
GRANT SELECT ON public.work_p2p_hidden_shifts TO authenticated;
GRANT ALL ON public.work_p2p_hidden_shifts TO service_role;
ALTER TABLE public.work_p2p_hidden_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY p2p_hidden_read ON public.work_p2p_hidden_shifts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.work_p2p_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  ledger_id uuid,
  shift_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.work_p2p_audit TO authenticated;
GRANT SELECT, INSERT ON public.work_p2p_audit TO service_role;
ALTER TABLE public.work_p2p_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY p2p_audit_read ON public.work_p2p_audit FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR private.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS work_p2p_audit_actor ON public.work_p2p_audit(actor_id, created_at DESC);

-- UNION compatibility, not a backfill. A colour group is NOT provider/link evidence.
-- Explicit predicate also scopes the legacy table's broad staff-read policy.
CREATE OR REPLACE VIEW public.work_p2p_effective_links WITH (security_invoker = true) AS
  SELECT l.id::text AS id, l.ledger_id, l.shift_id, l.user_id,
    l.linked_by, l.linked_at,
    coalesce(s.started_at, l.shift_started_at) AS started_at,
    coalesce(s.ended_at, l.shift_ended_at) AS ended_at,
    s.link_group AS legacy_group, 'explicit'::text AS source
  FROM public.work_p2p_shift_links l LEFT JOIN public.work_shifts s ON s.id = l.shift_id
  WHERE auth.role() = 'service_role' OR l.user_id = auth.uid() OR private.is_admin(auth.uid())
  UNION ALL
  SELECT a.id::text, a.ledger_id, a.shift_id, a.user_id, a.assigned_by, a.assigned_at,
    s.started_at, s.ended_at, s.link_group, 'legacy-assignment'::text
  FROM public.work_txn_assignments a LEFT JOIN public.work_shifts s ON s.id = a.shift_id
  WHERE a.kind IN ('p2p_buy', 'p2p_sell')
    AND (auth.role() = 'service_role' OR a.user_id = auth.uid() OR private.is_admin(auth.uid()))
    AND NOT EXISTS (SELECT 1 FROM public.work_p2p_shift_links l
      WHERE l.ledger_id = a.ledger_id AND l.user_id = a.user_id
        AND l.shift_id IS NOT DISTINCT FROM a.shift_id);
GRANT SELECT ON public.work_p2p_effective_links TO authenticated, service_role;
REVOKE ALL ON public.work_p2p_effective_links FROM anon;

CREATE OR REPLACE FUNCTION public.work_link_p2p_many(
  p_ledger_id uuid, p_actor_id uuid, p_shift_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE selected_ids uuid[]; led public.bybit_ledger%ROWTYPE; sh public.work_shifts%ROWTYPE; new_id uuid;
BEGIN
  IF NOT coalesce(private.is_staff(p_actor_id), false) THEN
    RETURN jsonb_build_object('ok',false,'error','غير مصرح لك بالربط.');
  END IF;
  IF p_shift_ids IS NULL OR cardinality(p_shift_ids) NOT BETWEEN 1 AND 100
    OR array_position(p_shift_ids, NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','اختيار الشفتات غير صالح.');
  END IF;
  SELECT array_agg(DISTINCT id ORDER BY id) INTO selected_ids FROM unnest(p_shift_ids) ids(id);
  -- Shared ownership locks do not consume shifts; separate orders can reuse them.
  PERFORM id FROM public.work_shifts WHERE id=ANY(selected_ids) ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.work_shifts WHERE id=ANY(selected_ids) AND user_id=p_actor_id)
      <> cardinality(selected_ids) THEN
    RETURN jsonb_build_object('ok',false,'error','لا يمكنك ربط الطلب بشفتات موظف آخر.');
  END IF;
  SELECT * INTO led FROM public.bybit_ledger WHERE id=p_ledger_id FOR SHARE;
  IF NOT FOUND OR led.kind NOT IN ('p2p_buy','p2p_sell') THEN
    RETURN jsonb_build_object('ok',false,'error','هذا الطلب غير متاح للربط.');
  END IF;
  -- Retain the existing single-assignment constraint for older readers/retention.
  -- This anchor never replaces an existing assignment and is NOT the link list.
  INSERT INTO public.work_txn_assignments
    (ledger_id,shift_id,user_id,occurred_at,kind,assign_mode,assigned_by)
  VALUES (led.id,p_shift_ids[1],p_actor_id,led.occurred_at,led.kind,'manual',p_actor_id)
  ON CONFLICT (ledger_id) DO NOTHING;
  FOR sh IN SELECT * FROM public.work_shifts WHERE id=ANY(selected_ids) ORDER BY id LOOP
    new_id := NULL;
    INSERT INTO public.work_p2p_shift_links
      (ledger_id,shift_id,user_id,linked_by,shift_started_at,shift_ended_at)
    VALUES (led.id,sh.id,p_actor_id,p_actor_id,sh.started_at,sh.ended_at)
    ON CONFLICT (ledger_id,shift_id) DO NOTHING RETURNING id INTO new_id;
    IF new_id IS NOT NULL THEN
      INSERT INTO public.work_p2p_audit(actor_id,action,ledger_id,shift_id,detail)
      VALUES(p_actor_id,'link',led.id,sh.id,jsonb_build_object('link_id',new_id));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true);
END $function$;
REVOKE ALL ON FUNCTION public.work_link_p2p_many(uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_link_p2p_many(uuid,uuid,uuid[]) TO service_role;

-- Old clients keep their signature but no longer consume shifts or select newest.
CREATE OR REPLACE FUNCTION public.work_link_p2p_atomic(
  p_ledger_id uuid, p_shift_id uuid, p_actor_id uuid, p_used_shift_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $function$
BEGIN
  RETURN public.work_link_p2p_many(p_ledger_id,p_actor_id,
    array_append(coalesce(p_used_shift_ids,ARRAY[]::uuid[]),p_shift_id));
END $function$;
REVOKE ALL ON FUNCTION public.work_link_p2p_atomic(uuid,uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_link_p2p_atomic(uuid,uuid,uuid,uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.work_set_p2p_shift_hidden(
  p_actor_id uuid, p_shift_id uuid, p_hidden boolean
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE changed uuid;
BEGIN
  IF p_hidden IS NULL OR NOT coalesce(private.is_staff(p_actor_id), false) THEN
    RETURN jsonb_build_object('ok',false,'error','غير مصرح لك بالإخفاء.');
  END IF;
  PERFORM id FROM public.work_shifts WHERE id=p_shift_id AND user_id=p_actor_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','هذا الشفت ليس ملكك.'); END IF;
  INSERT INTO public.work_p2p_hidden_shifts(user_id,shift_id,hidden)
  VALUES(p_actor_id,p_shift_id,p_hidden)
  ON CONFLICT(user_id,shift_id) DO UPDATE SET hidden=EXCLUDED.hidden,changed_at=now()
    WHERE work_p2p_hidden_shifts.hidden IS DISTINCT FROM EXCLUDED.hidden
  RETURNING shift_id INTO changed;
  IF changed IS NOT NULL THEN
    INSERT INTO public.work_p2p_audit(actor_id,action,shift_id)
    VALUES(p_actor_id,CASE WHEN p_hidden THEN 'hide' ELSE 'unhide' END,p_shift_id);
  END IF;
  RETURN jsonb_build_object('ok',true);
END $function$;
REVOKE ALL ON FUNCTION public.work_set_p2p_shift_hidden(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_set_p2p_shift_hidden(uuid,uuid,boolean) TO service_role;
-- Notify scoped subscribers about link changes; polling remains a fallback.
DO $block$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
      AND schemaname='public' AND tablename='work_p2p_shift_links') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_p2p_shift_links;
  END IF;
END $block$;
COMMIT;