-- REVIEW AND APPLY MANUALLY. Never run automatically at startup/deploy.
-- No historical transaction UPDATE/DELETE and no seeds in this installation.
BEGIN;
ALTER TABLE public.bybit_card_txns ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE public.bybit_card_txns ADD COLUMN IF NOT EXISTS last_observed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.bybit_reversal_cases (
  account_id uuid NOT NULL REFERENCES public.bybit_accounts(id),
  event_id text NOT NULL,
  candidate_ids text[] NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'needs_review' CHECK (state IN ('needs_review','resolved')),
  target_id text,
  source text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  PRIMARY KEY(account_id,event_id)
);
GRANT SELECT ON public.bybit_reversal_cases TO authenticated;
GRANT ALL ON public.bybit_reversal_cases TO service_role;
ALTER TABLE public.bybit_reversal_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bybit_cases_admin_read ON public.bybit_reversal_cases;
CREATE POLICY bybit_cases_admin_read ON public.bybit_reversal_cases FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='admin'));

CREATE TABLE IF NOT EXISTS public.bybit_reversal_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL,
  event_id text NOT NULL,
  target_id text,
  source text NOT NULL,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  evidence jsonb NOT NULL
);
GRANT SELECT ON public.bybit_reversal_audit TO authenticated;
GRANT ALL ON public.bybit_reversal_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bybit_reversal_audit_id_seq TO service_role;
ALTER TABLE public.bybit_reversal_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bybit_audit_admin_read ON public.bybit_reversal_audit;
CREATE POLICY bybit_audit_admin_read ON public.bybit_reversal_audit FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='admin'));

-- Indexed, account-local event discovery: no per-tick full archive traversal.
CREATE INDEX IF NOT EXISTS bybit_card_candidate_idx ON public.bybit_card_txns
  (account_id,pan4,merchant,(abs(amount)),txn_time);
CREATE INDEX IF NOT EXISTS bybit_card_provider_ids_idx ON public.bybit_card_txns USING gin(detail jsonb_path_ops);
CREATE INDEX IF NOT EXISTS bybit_case_candidates_idx ON public.bybit_reversal_cases USING gin(candidate_ids);
CREATE INDEX IF NOT EXISTS bybit_case_targets_idx ON public.bybit_reversal_cases(account_id,target_id);

-- One ordering fence per accepted account batch, NOT one rewrite per archived row.
CREATE TABLE IF NOT EXISTS public.bybit_ingest_fences (
  account_id uuid PRIMARY KEY REFERENCES public.bybit_accounts(id), observed_at timestamptz NOT NULL
);
GRANT ALL ON public.bybit_ingest_fences TO service_role;
ALTER TABLE public.bybit_ingest_fences ENABLE ROW LEVEL SECURITY;

-- Explicitly preserve existing approved decisions; never trust this source on other IDs.
CREATE OR REPLACE FUNCTION public.bybit_trusted_manual(a public.bybit_card_txns)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(a.detail->>'linkedReversal'='1' AND (
   a.detail->>'linkedBy'='manual-20261031' OR (
     a.detail->>'linkedBy'='manual-user-20261101'
     AND a.account_id='fffe1106-4336-446d-bb51-ad9ff9596d42'::uuid
     AND a.pan4='0540' AND a.currency='USD'
     AND coalesce(nullif(a.detail->>'side',''),a.txn_type)='1'
     AND ((a.txn_id='3000000683749966' AND abs(a.amount)=3.61)
       OR (a.txn_id='3000000683935780' AND abs(a.amount)=3.08))
   )),false)
$$;
REVOKE ALL ON FUNCTION public.bybit_trusted_manual(public.bybit_card_txns) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_trusted_manual(public.bybit_card_txns) TO service_role;

CREATE OR REPLACE FUNCTION public.bybit_affected_events(p_account uuid,p_ids text[])
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(array_agg(DISTINCT event_id),'{}') FROM (
   SELECT a.txn_id AS event_id FROM public.bybit_card_txns a
     WHERE a.account_id=p_account AND a.txn_id=ANY(p_ids)
       AND coalesce(nullif(a.detail->>'side',''),a.txn_type)='2'
   UNION
   SELECT c.event_id FROM public.bybit_reversal_cases c
     WHERE c.account_id=p_account AND (c.candidate_ids && p_ids OR c.target_id=ANY(p_ids) OR c.event_id=ANY(p_ids))
   UNION
   SELECT e.txn_id FROM public.bybit_card_txns a JOIN public.bybit_card_txns e
     ON e.account_id=a.account_id AND e.pan4=a.pan4 AND e.merchant=a.merchant AND abs(e.amount)=abs(a.amount)
     AND e.txn_time BETWEEN a.txn_time AND a.txn_time+3600000
     WHERE a.account_id=p_account AND a.txn_id=ANY(p_ids)
       AND coalesce(nullif(e.detail->>'side',''),e.txn_type)='2'
   UNION
   SELECT e.txn_id FROM public.bybit_card_txns a CROSS JOIN unnest(ARRAY['txnId','orderNo','paymentId']) k
     JOIN public.bybit_card_txns e ON e.detail @> jsonb_build_object(k,a.detail->k)
       AND e.account_id=a.account_id AND e.pan4=a.pan4 AND e.merchant=a.merchant AND abs(e.amount)=abs(a.amount)
       AND e.txn_time>=a.txn_time
     WHERE a.account_id=p_account AND a.txn_id=ANY(p_ids)
       AND nullif(a.detail->>k,'') IS NOT NULL
       AND lower(a.detail->>k) NOT IN ('0','null','undefined','none','-','n/a')
       AND coalesce(nullif(e.detail->>'side',''),e.txn_type)='2'
 ) affected
$$;
REVOKE ALL ON FUNCTION public.bybit_affected_events(uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_affected_events(uuid,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.bybit_reconcile_dirty(p_account uuid,p_ids text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; ids text[]; strong_ids text[]; chosen text; c public.bybit_card_txns; d jsonb;
        result_status text; result_detail jsonb; baseline text; pending_review boolean; dirty text[]; events text[]; old_ids text[];
BEGIN
  IF cardinality(p_ids)=0 OR p_ids IS NULL THEN RETURN; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_account::text,0)) THEN
    RAISE EXCEPTION 'account ingest busy; retry' USING ERRCODE='55P03';
  END IF;
  dirty:=p_ids;
  events:=public.bybit_affected_events(p_account,p_ids);
  FOR e IN SELECT * FROM public.bybit_card_txns
    WHERE account_id=p_account AND txn_id=ANY(events) AND COALESCE(NULLIF(detail->>'side',''),txn_type)='2'
  LOOP
    SELECT candidate_ids INTO old_ids FROM public.bybit_reversal_cases
      WHERE account_id=p_account AND event_id=e.txn_id;
    dirty:=dirty||coalesce(old_ids,'{}');
    SELECT COALESCE(array_agg(a.txn_id ORDER BY a.txn_time,a.txn_id),'{}') INTO ids
    FROM public.bybit_card_txns a WHERE a.account_id=p_account
      AND COALESCE(NULLIF(a.detail->>'side',''),a.txn_type)='1'
      AND a.pan4=e.pan4 AND a.merchant=e.merchant AND abs(a.amount)=abs(e.amount)
      AND a.txn_time BETWEEN e.txn_time-3600000 AND e.txn_time
      AND COALESCE(a.detail->>'tradeStatus','') NOT IN ('2','3','4');
    -- Shared named identifiers only; no nearest/unique-amount heuristic.
    SELECT COALESCE(array_agg(DISTINCT a.txn_id),'{}') INTO strong_ids
    FROM unnest(ARRAY['txnId','orderNo','paymentId']) k JOIN public.bybit_card_txns a
      ON a.detail @> jsonb_build_object(k,e.detail->k)
    WHERE a.account_id=p_account AND COALESCE(NULLIF(a.detail->>'side',''),a.txn_type)='1'
      AND a.pan4=e.pan4 AND a.merchant=e.merchant AND abs(a.amount)=abs(e.amount)
      AND a.txn_time<=e.txn_time AND NULLIF(e.detail->>k,'') IS NOT NULL
      AND lower(e.detail->>k) NOT IN ('0','null','undefined','none','-','n/a');
    chosen := NULL;
    -- Preserve the explicitly confirmed 31 October correction without relinking it.
    SELECT a.txn_id INTO chosen FROM public.bybit_card_txns a
      WHERE a.account_id=p_account AND a.txn_id=ANY(ids)
      AND public.bybit_trusted_manual(a)
      AND (a.detail->>'linkedBy'='manual-20261031'
        OR (a.txn_id='3000000683749966' AND e.txn_id='3000000683764413')
        OR (a.txn_id='3000000683935780' AND e.txn_id='3000000683972959'))
      ORDER BY a.txn_id LIMIT 1;
    IF chosen IS NOT NULL THEN
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids,state,target_id,source)
      VALUES(p_account,e.txn_id,ids,'resolved',chosen,(SELECT detail->>'linkedBy' FROM public.bybit_card_txns WHERE account_id=p_account AND txn_id=chosen))
      ON CONFLICT(account_id,event_id) DO NOTHING;
    ELSIF cardinality(strong_ids)=1 THEN
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids,state,target_id,source)
      VALUES(p_account,e.txn_id,strong_ids,'resolved',strong_ids[1],'provider-shared-id')
      ON CONFLICT(account_id,event_id) DO UPDATE SET
        candidate_ids=EXCLUDED.candidate_ids,state='resolved',target_id=EXCLUDED.target_id,source=EXCLUDED.source
      WHERE bybit_reversal_cases.state='needs_review' AND (bybit_reversal_cases.candidate_ids IS DISTINCT FROM EXCLUDED.candidate_ids OR bybit_reversal_cases.target_id IS DISTINCT FROM EXCLUDED.target_id OR bybit_reversal_cases.state IS DISTINCT FROM EXCLUDED.state);
    ELSE
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids)
      VALUES(p_account,e.txn_id,ids)
      ON CONFLICT(account_id,event_id) DO UPDATE SET candidate_ids=EXCLUDED.candidate_ids
      WHERE bybit_reversal_cases.state='needs_review' AND bybit_reversal_cases.candidate_ids IS DISTINCT FROM EXCLUDED.candidate_ids;
    END IF;
    dirty:=dirty||ids||strong_ids;
    UPDATE public.bybit_card_txns SET detail=detail || jsonb_build_object('reconciliationState',
      CASE WHEN EXISTS(SELECT 1 FROM public.bybit_reversal_cases WHERE account_id=p_account AND event_id=e.txn_id AND state='resolved')
      THEN 'resolved' ELSE 'needs_review' END) WHERE account_id=p_account AND txn_id=e.txn_id
      AND detail->>'reconciliationState' IS DISTINCT FROM CASE WHEN EXISTS(SELECT 1 FROM public.bybit_reversal_cases WHERE account_id=p_account AND event_id=e.txn_id AND state='resolved') THEN 'resolved' ELSE 'needs_review' END;
  END LOOP;

  -- A confirmed event decision also settles any older legacy-only case for
  -- its explicit candidate set. No other legacy rows are flipped.
  UPDATE public.bybit_reversal_cases legacy SET state='resolved',target_id=resolved.target_id,
    source=resolved.source,decided_by=resolved.decided_by,decided_at=resolved.decided_at
    FROM public.bybit_reversal_cases resolved
    WHERE legacy.account_id=p_account AND resolved.account_id=p_account
      AND legacy.event_id LIKE 'legacy:%' AND legacy.state='needs_review'
      AND resolved.event_id=ANY(events) AND resolved.state='resolved'
      AND legacy.candidate_ids <@ resolved.candidate_ids;

  FOR c IN SELECT * FROM public.bybit_card_txns WHERE account_id=p_account AND txn_id=ANY(dirty)
    AND COALESCE(NULLIF(detail->>'side',''),txn_type) NOT IN ('2','3')
  LOOP
    d := c.detail;
    baseline := CASE
      WHEN COALESCE(d->>'side',c.txn_type) IN ('4','5','6','8','9','10','11') OR d->>'tradeStatus'='5' THEN 'refund'
      WHEN d->>'tradeStatus' IN ('3','4') THEN 'reversed'
      WHEN d->>'tradeStatus'='2' THEN 'failed'
      WHEN d->>'tradeStatus' IN ('0','1') THEN 'success'
      ELSE COALESCE(c.status,'pending') END;
    chosen := NULL;
    SELECT target_id INTO chosen FROM public.bybit_reversal_cases
      WHERE account_id=p_account AND state='resolved' AND target_id=c.txn_id LIMIT 1;
    pending_review := EXISTS(SELECT 1 FROM public.bybit_reversal_cases
      WHERE account_id=p_account AND state='needs_review' AND candidate_ids @> ARRAY[c.txn_id]);
    -- Unproven legacy flags are held for review, never silently flipped to success.
    IF d->>'linkedReversal'='1' AND NULLIF(d->>'linkedBy','') IS NULL AND chosen IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.bybit_reversal_cases
        WHERE account_id=p_account AND state='resolved' AND candidate_ids @> ARRAY[c.txn_id]) THEN
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids,source)
      VALUES(p_account,'legacy:'||c.txn_id,ARRAY[c.txn_id],'legacy-unproven')
      ON CONFLICT(account_id,event_id) DO NOTHING;
      pending_review := true;
    END IF;
    result_detail := d - 'reconciliationState' - 'confirmationState' - 'resolutionTarget' - 'projectedStatus';
    result_detail := result_detail || jsonb_build_object('confirmationState',
      CASE WHEN c.confirmed_at >= c.created_at+interval '30 seconds' THEN 'confirmed' ELSE 'waiting' END);
    result_status := baseline;
    IF chosen IS NOT NULL OR public.bybit_trusted_manual(c) THEN
      result_status := 'reversed';
      result_detail := result_detail || jsonb_build_object('reconciliationState','resolved','resolutionTarget',c.txn_id);
    ELSIF pending_review THEN
      result_status := 'review';
      result_detail := result_detail || jsonb_build_object('reconciliationState','needs_review');
    ELSE
      -- A resolved retry follows the raw status; remove only the derived projection flag.
      result_detail := result_detail || jsonb_build_object('reconciliationState','clear');
    END IF;
    result_detail := result_detail || jsonb_build_object('projectedStatus',result_status);
    IF c.confirmed_at IS NULL OR c.confirmed_at<c.created_at+interval '30 seconds' THEN result_status:='holding'; END IF;
    UPDATE public.bybit_card_txns SET detail=result_detail WHERE account_id=p_account AND txn_id=c.txn_id
      AND detail IS DISTINCT FROM result_detail;
    UPDATE public.bybit_ledger SET status=result_status,
      detail=(detail - 'linkedReversal' - 'reconciliationState' - 'confirmationState' - 'resolutionTarget') ||
        (result_detail - 'raw'), amount=CASE WHEN result_status='refund' THEN abs(c.amount) ELSE -abs(c.amount) END
      WHERE account_id=p_account AND ref_id=c.txn_id AND kind IN ('card','refund')
      AND (status IS DISTINCT FROM result_status
        OR amount IS DISTINCT FROM CASE WHEN result_status='refund' THEN abs(c.amount) ELSE -abs(c.amount) END
        OR detail IS DISTINCT FROM ((detail - 'linkedReversal' - 'reconciliationState' - 'confirmationState' - 'resolutionTarget') || (result_detail - 'raw')));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.bybit_reconcile_dirty(uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_reconcile_dirty(uuid,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.bybit_ingest_confirmed(p_account uuid,p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; prev public.bybit_card_txns; observed timestamptz; fence timestamptz;
  newest timestamptz; n integer:=0; dirty text[]:='{}'; prior_events text[]:='{}';
  next_detail jsonb; next_status text; next_confirmed timestamptz;
BEGIN
  IF p_account IS NULL THEN RAISE EXCEPTION 'account required'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'invalid batch'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_account::text,0)) THEN
    RAISE EXCEPTION 'account ingest busy; retry' USING ERRCODE='55P03';
  END IF;
  SELECT observed_at INTO fence FROM public.bybit_ingest_fences WHERE account_id=p_account;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF r->>'txn_id' IS NULL OR length(r->>'txn_id') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid id'; END IF;
    observed:=(r->>'observed_at')::timestamptz;
    IF observed IS NULL OR observed>clock_timestamp()+interval '1 second' THEN RAISE EXCEPTION 'invalid observation'; END IF;
    newest:=greatest(newest,observed);
    SELECT * INTO prev FROM public.bybit_card_txns WHERE account_id=p_account AND txn_id=r->>'txn_id';
    IF FOUND THEN
      -- The account fence rejects stale in-flight responses even after a no-op poll.
      -- Equality is allowed: different pages/types can share one request timestamp.
      IF observed<coalesce(fence,'-infinity'::timestamptz) OR observed<=coalesce(prev.last_observed_at,'-infinity'::timestamptz) THEN CONTINUE; END IF;
      next_detail:=(r->'detail')-'observedAt';
      IF next_detail ? 'raw' THEN next_detail:=jsonb_set(next_detail,'{raw}',(next_detail->'raw')-'__observedAt'); END IF;
      -- Preserve derived flags, not stale provider fields; strip request timestamps
      -- so an unchanged response cannot dirty every row on every polling tick.
      SELECT next_detail || coalesce(jsonb_object_agg(key,value),'{}') INTO next_detail
        FROM jsonb_each(prev.detail) WHERE key IN
          ('reconciliationState','confirmationState','resolutionTarget','projectedStatus','linkedBy','linkedReversal');
      IF prev.detail ? 'linkedBy' THEN next_detail:=next_detail||jsonb_build_object('linkedBy',prev.detail->'linkedBy'); END IF;
      IF prev.detail ? 'linkedReversal' THEN next_detail:=next_detail||jsonb_build_object('linkedReversal',prev.detail->'linkedReversal'); END IF;
      next_status:=CASE WHEN public.bybit_trusted_manual(prev) THEN prev.status ELSE r->>'status' END;
      next_confirmed:=coalesce(prev.confirmed_at,CASE WHEN observed>=prev.created_at+interval '30 seconds' THEN observed END);
      IF ROW(prev.merchant,prev.amount,prev.currency,prev.txn_time,prev.pan4,prev.txn_type,prev.status,prev.detail,prev.confirmed_at)
         IS NOT DISTINCT FROM ROW(r->>'merchant',(r->>'amount')::numeric,r->>'currency',(r->>'txn_time')::bigint,r->>'pan4',r->>'txn_type',next_status,next_detail,next_confirmed) THEN CONTINUE; END IF;
      prior_events:=prior_events||public.bybit_affected_events(p_account,ARRAY[prev.txn_id]);
      UPDATE public.bybit_card_txns SET merchant=r->>'merchant',amount=(r->>'amount')::numeric,currency=r->>'currency',
        txn_time=(r->>'txn_time')::bigint,pan4=r->>'pan4',txn_type=r->>'txn_type',status=next_status,
        detail=next_detail,last_observed_at=observed,confirmed_at=next_confirmed
        WHERE account_id=p_account AND txn_id=r->>'txn_id';
    ELSE
      -- Never lose a newly discovered ID just because another page finished first.
      next_detail:=(r->'detail')-'observedAt';
      IF next_detail ? 'raw' THEN next_detail:=jsonb_set(next_detail,'{raw}',(next_detail->'raw')-'__observedAt'); END IF;
      INSERT INTO public.bybit_card_txns(account_id,txn_id,merchant,amount,currency,status,txn_time,pan4,txn_type,detail,last_observed_at)
        VALUES(p_account,r->>'txn_id',r->>'merchant',(r->>'amount')::numeric,r->>'currency',r->>'status',
          (r->>'txn_time')::bigint,r->>'pan4',r->>'txn_type',next_detail,observed);
    END IF;
    dirty:=array_append(dirty,r->>'txn_id'); n:=n+1;
  END LOOP;
  IF newest IS NOT NULL AND (fence IS NULL OR newest>fence) THEN
    INSERT INTO public.bybit_ingest_fences VALUES(p_account,newest)
      ON CONFLICT(account_id) DO UPDATE SET observed_at=EXCLUDED.observed_at
        WHERE bybit_ingest_fences.observed_at<EXCLUDED.observed_at;
  END IF;
  PERFORM public.bybit_reconcile_dirty(p_account,dirty||prior_events);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bybit_ingest_confirmed(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_ingest_confirmed(uuid,jsonb) TO service_role;

-- Deprecated full-account entry point cannot accidentally start an O(history) scan.
CREATE OR REPLACE FUNCTION public.bybit_reconcile_account(p_account uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Use bybit_reconcile_dirty(account, explicit IDs); full reconciliation disabled'; END $$;
REVOKE ALL ON FUNCTION public.bybit_reconcile_account(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_reconcile_account(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.bybit_preserve_first_seen()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.created_at:=OLD.created_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bybit_first_seen_immutable ON public.bybit_card_txns;
CREATE TRIGGER bybit_first_seen_immutable BEFORE UPDATE ON public.bybit_card_txns
FOR EACH ROW EXECUTE FUNCTION public.bybit_preserve_first_seen();

-- Protect projections from stale in-flight sync overwriting a later admin decision.
CREATE OR REPLACE FUNCTION public.bybit_guard_ledger_projection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.bybit_card_txns; decision text;
BEGIN
  IF NEW.kind NOT IN ('card','refund') THEN RETURN NEW; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(NEW.account_id::text,0)) THEN RAISE EXCEPTION 'account busy; retry' USING ERRCODE='55P03'; END IF;
  SELECT * INTO a FROM public.bybit_card_txns WHERE account_id=NEW.account_id AND txn_id=NEW.ref_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF COALESCE(NULLIF(a.detail->>'side',''),a.txn_type) IN ('2','3') THEN RETURN NULL; END IF;
  NEW.detail:=(NEW.detail-'linkedReversal'-'reconciliationState'-'confirmationState'-'resolutionTarget')||(a.detail-'raw');
  IF a.detail->>'reconciliationState'='clear' THEN NEW.detail:=NEW.detail-'linkedReversal'; END IF;
  IF a.confirmed_at IS NULL OR a.confirmed_at<a.created_at+interval '30 seconds' THEN
    IF TG_OP='INSERT' THEN RETURN NULL; END IF;
    NEW.status:='holding';
  ELSIF a.detail->>'reconciliationState'='needs_review' THEN NEW.status:='review';
  ELSIF a.detail->>'resolutionTarget'=a.txn_id OR
    public.bybit_trusted_manual(a) THEN NEW.status:='reversed';
  ELSIF a.detail->>'tradeStatus' IN ('3','4') THEN NEW.status:='reversed';
  ELSIF a.detail->>'tradeStatus'='2' THEN NEW.status:='failed';
  ELSIF COALESCE(a.detail->>'side',a.txn_type) IN ('4','5','6','8','9','10','11') OR a.detail->>'tradeStatus'='5' THEN NEW.status:='refund';
  ELSE NEW.status:='success'; END IF;
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bybit_ledger_projection_guard ON public.bybit_ledger;
CREATE TRIGGER bybit_ledger_projection_guard BEFORE INSERT OR UPDATE ON public.bybit_ledger
FOR EACH ROW EXECUTE FUNCTION public.bybit_guard_ledger_projection();

CREATE OR REPLACE FUNCTION public.bybit_resolve_case(p_account uuid,p_event text,p_target text,p_expected text[],p_source text DEFAULT 'admin-review')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.bybit_reversal_cases; evidence jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_source NOT IN ('admin-review','manual-user-20261101') THEN RAISE EXCEPTION 'invalid source'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_account::text,0)) THEN RAISE EXCEPTION 'account busy; retry' USING ERRCODE='55P03'; END IF;
  SELECT * INTO c FROM public.bybit_reversal_cases WHERE account_id=p_account AND event_id=p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case missing'; END IF;
  IF c.state='resolved' THEN
    IF c.target_id IS NOT DISTINCT FROM p_target THEN RETURN; END IF;
    RAISE EXCEPTION 'decision already saved';
  END IF;
  IF c.candidate_ids IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'candidates changed'; END IF;
  IF p_target IS NOT NULL AND NOT p_target=ANY(c.candidate_ids) THEN RAISE EXCEPTION 'invalid target'; END IF;
  SELECT jsonb_agg(to_jsonb(a)) INTO evidence FROM public.bybit_card_txns a
    WHERE account_id=p_account AND (txn_id=p_event OR txn_id=ANY(c.candidate_ids));
  INSERT INTO public.bybit_reversal_audit(account_id,event_id,target_id,source,decided_by,evidence)
    VALUES(p_account,p_event,p_target,p_source,auth.uid(),evidence);
  UPDATE public.bybit_reversal_cases SET state='resolved',target_id=p_target,source=p_source,
    decided_by=auth.uid(),decided_at=clock_timestamp() WHERE account_id=p_account AND event_id=p_event;
  PERFORM public.bybit_reconcile_dirty(p_account,array_append(c.candidate_ids,p_event));
END $$;
REVOKE ALL ON FUNCTION public.bybit_resolve_case(uuid,text,text,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bybit_resolve_case(uuid,text,text,text[],text) TO authenticated;
COMMIT;