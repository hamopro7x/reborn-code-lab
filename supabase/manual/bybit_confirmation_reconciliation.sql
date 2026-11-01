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

-- Shared by every projection. Raw provider fields are never overwritten by decisions.
CREATE OR REPLACE FUNCTION public.bybit_reconcile_account(p_account uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; ids text[]; strong_ids text[]; chosen text; c record; d jsonb;
        result_status text; result_detail jsonb; baseline text; pending_review boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text,0));
  FOR e IN SELECT * FROM public.bybit_card_txns
    WHERE account_id=p_account AND COALESCE(NULLIF(detail->>'side',''),txn_type)='2'
  LOOP
    SELECT COALESCE(array_agg(a.txn_id ORDER BY a.txn_time,a.txn_id),'{}') INTO ids
    FROM public.bybit_card_txns a WHERE a.account_id=p_account
      AND COALESCE(NULLIF(a.detail->>'side',''),a.txn_type)='1'
      AND a.pan4=e.pan4 AND a.merchant=e.merchant AND abs(a.amount)=abs(e.amount)
      AND a.txn_time BETWEEN e.txn_time-3600000 AND e.txn_time
      AND COALESCE(a.detail->>'tradeStatus','') NOT IN ('2','3','4');
    -- Shared named identifiers only; no nearest/unique-amount heuristic.
    SELECT COALESCE(array_agg(a.txn_id),'{}') INTO strong_ids
    FROM public.bybit_card_txns a WHERE a.account_id=p_account
      AND COALESCE(NULLIF(a.detail->>'side',''),a.txn_type)='1'
      AND EXISTS (SELECT 1 FROM unnest(ARRAY['txnId','orderNo','paymentId']) k
        WHERE NULLIF(e.detail->>k,'') IS NOT NULL
        AND lower(e.detail->>k) NOT IN ('0','null','undefined','none','-','n/a')
        AND a.detail->>k=e.detail->>k);
    chosen := NULL;
    -- Preserve the explicitly confirmed 31 October correction without relinking it.
    SELECT a.txn_id INTO chosen FROM public.bybit_card_txns a
      WHERE a.account_id=p_account AND a.txn_id=ANY(ids)
      AND a.detail->>'linkedBy'='manual-20261031' AND a.detail->>'linkedReversal'='1';
    IF chosen IS NOT NULL THEN
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids,state,target_id,source)
      VALUES(p_account,e.txn_id,ids,'resolved',chosen,'manual-20261031')
      ON CONFLICT(account_id,event_id) DO NOTHING;
    ELSIF cardinality(strong_ids)=1 THEN
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids,state,target_id,source)
      VALUES(p_account,e.txn_id,strong_ids,'resolved',strong_ids[1],'provider-shared-id')
      ON CONFLICT(account_id,event_id) DO UPDATE SET
        candidate_ids=EXCLUDED.candidate_ids,state='resolved',target_id=EXCLUDED.target_id,source=EXCLUDED.source
      WHERE bybit_reversal_cases.state='needs_review';
    ELSE
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids)
      VALUES(p_account,e.txn_id,ids)
      ON CONFLICT(account_id,event_id) DO UPDATE SET candidate_ids=EXCLUDED.candidate_ids
      WHERE bybit_reversal_cases.state='needs_review';
    END IF;
    UPDATE public.bybit_card_txns SET detail=detail || jsonb_build_object('reconciliationState',
      CASE WHEN EXISTS(SELECT 1 FROM public.bybit_reversal_cases WHERE account_id=p_account AND event_id=e.txn_id AND state='resolved')
      THEN 'resolved' ELSE 'needs_review' END) WHERE account_id=p_account AND txn_id=e.txn_id;
  END LOOP;

  FOR c IN SELECT * FROM public.bybit_card_txns WHERE account_id=p_account
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
      WHERE account_id=p_account AND state='needs_review' AND c.txn_id=ANY(candidate_ids));
    -- Unproven legacy flags are held for review, never silently flipped to success.
    IF d->>'linkedReversal'='1' AND NULLIF(d->>'linkedBy','') IS NULL AND chosen IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.bybit_reversal_cases
        WHERE account_id=p_account AND state='resolved' AND c.txn_id=ANY(candidate_ids)) THEN
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids,source)
      VALUES(p_account,'legacy:'||c.txn_id,ARRAY[c.txn_id],'legacy-unproven')
      ON CONFLICT(account_id,event_id) DO NOTHING;
      pending_review := true;
    END IF;
    result_detail := d - 'reconciliationState' - 'confirmationState' - 'resolutionTarget' - 'projectedStatus';
    result_detail := result_detail || jsonb_build_object('confirmationState',
      CASE WHEN c.confirmed_at >= c.created_at+interval '30 seconds' THEN 'confirmed' ELSE 'waiting' END);
    result_status := baseline;
    IF chosen IS NOT NULL OR (d->>'linkedBy'='manual-20261031' AND d->>'linkedReversal'='1') THEN
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
      WHERE account_id=p_account AND ref_id=c.txn_id AND kind IN ('card','refund');
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.bybit_reconcile_account(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_reconcile_account(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.bybit_ingest_confirmed(p_account uuid,p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; prev public.bybit_card_txns; observed timestamptz; n integer:=0;
BEGIN
  IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>2000 THEN RAISE EXCEPTION 'invalid batch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text,0));
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF length(r->>'txn_id') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid id'; END IF;
    observed := (r->>'observed_at')::timestamptz;
    IF observed IS NULL OR observed>clock_timestamp()+interval '1 second' THEN RAISE EXCEPTION 'invalid observation'; END IF;
    SELECT * INTO prev FROM public.bybit_card_txns WHERE account_id=p_account AND txn_id=r->>'txn_id' FOR UPDATE;
    IF FOUND THEN
      IF observed<=COALESCE(prev.last_observed_at,'-infinity'::timestamptz) THEN CONTINUE; END IF;
      UPDATE public.bybit_card_txns SET
        merchant=r->>'merchant',amount=(r->>'amount')::numeric,currency=r->>'currency',
        txn_time=(r->>'txn_time')::bigint,pan4=r->>'pan4',txn_type=r->>'txn_type',
        status=CASE WHEN prev.detail->>'linkedBy'='manual-20261031' THEN prev.status ELSE r->>'status' END,
        detail=(r->'detail') || CASE WHEN prev.detail->>'linkedBy'='manual-20261031'
          THEN jsonb_build_object('linkedBy','manual-20261031','linkedReversal',prev.detail->'linkedReversal')
          ELSE CASE WHEN prev.detail->>'linkedReversal'='1'
            THEN jsonb_build_object('linkedReversal',1,'linkedBy',prev.detail->'linkedBy') ELSE '{}'::jsonb END END,
        last_observed_at=observed,
        confirmed_at=CASE WHEN observed>=prev.created_at+interval '30 seconds' THEN observed ELSE prev.confirmed_at END
      WHERE account_id=p_account AND txn_id=r->>'txn_id';
    ELSE
      INSERT INTO public.bybit_card_txns(account_id,txn_id,merchant,amount,currency,status,txn_time,pan4,txn_type,detail,last_observed_at)
      VALUES(p_account,r->>'txn_id',r->>'merchant',(r->>'amount')::numeric,r->>'currency',r->>'status',
        (r->>'txn_time')::bigint,r->>'pan4',r->>'txn_type',r->'detail',observed);
    END IF;
    n:=n+1;
  END LOOP;
  PERFORM public.bybit_reconcile_account(p_account);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bybit_ingest_confirmed(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_ingest_confirmed(uuid,jsonb) TO service_role;

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
  SELECT * INTO a FROM public.bybit_card_txns WHERE account_id=NEW.account_id AND txn_id=NEW.ref_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF COALESCE(NULLIF(a.detail->>'side',''),a.txn_type) IN ('2','3') THEN RETURN NULL; END IF;
  NEW.detail:=(NEW.detail-'linkedReversal'-'reconciliationState'-'confirmationState'-'resolutionTarget')||(a.detail-'raw');
  IF a.confirmed_at IS NULL OR a.confirmed_at<a.created_at+interval '30 seconds' THEN
    IF TG_OP='INSERT' THEN RETURN NULL; END IF;
    NEW.status:='holding';
  ELSIF a.detail->>'reconciliationState'='needs_review' THEN NEW.status:='review';
  ELSIF a.detail->>'resolutionTarget'=a.txn_id OR
    (a.detail->>'linkedBy'='manual-20261031' AND a.detail->>'linkedReversal'='1') THEN NEW.status:='reversed';
  ELSIF a.detail->>'tradeStatus' IN ('3','4') THEN NEW.status:='reversed';
  ELSIF a.detail->>'tradeStatus'='2' THEN NEW.status:='failed';
  ELSIF COALESCE(a.detail->>'side',a.txn_type) IN ('4','5','6','8','9','10','11') THEN NEW.status:='refund';
  ELSE NEW.status:='success'; END IF;
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
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text,0));
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
  PERFORM public.bybit_reconcile_account(p_account);
END $$;
REVOKE ALL ON FUNCTION public.bybit_resolve_case(uuid,text,text,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bybit_resolve_case(uuid,text,text,text[],text) TO authenticated;
COMMIT;