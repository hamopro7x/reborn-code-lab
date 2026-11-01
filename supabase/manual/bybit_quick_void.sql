-- Quick-void resolution: a purchase with exactly one candidate reversal event
-- within 60 seconds, where Bybit took no funds for either record
-- (cryptoSold=false), is resolved as reversed. Ambiguous cases (2+ candidates,
-- e.g. the 20.55 pair) stay in review. Replaces one function, then re-runs it
-- for open single-candidate cases only. No deletes.
BEGIN;
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
      AND NULLIF(e.detail->>k,'') IS NOT NULL
      AND lower(e.detail->>k) NOT IN ('0','null','undefined','none','-','n/a');
    chosen := NULL;
    -- Preserve the explicitly confirmed 31 October correction without relinking it.
    SELECT a.txn_id INTO chosen FROM public.bybit_card_txns a
      WHERE a.account_id=p_account AND a.txn_id=ANY(ids)
      AND public.bybit_trusted_manual(a)
      AND ((a.txn_id='3000000683626441' AND e.txn_id='3000000683640474'
          AND a.account_id='fffe1106-4336-446d-bb51-ad9ff9596d42'::uuid)
        OR (a.txn_id='3000000683749966' AND e.txn_id='3000000683764413')
        OR (a.txn_id='3000000683935780' AND e.txn_id='3000000683972959'))
      ORDER BY a.txn_id LIMIT 1;
    IF chosen IS NOT NULL THEN
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids,state,target_id,source)
      VALUES(p_account,e.txn_id,ids,'resolved',chosen,(SELECT detail->>'linkedBy' FROM public.bybit_card_txns WHERE account_id=p_account AND txn_id=chosen))
      ON CONFLICT(account_id,event_id) DO NOTHING;
    ELSIF cardinality(strong_ids)=0 AND cardinality(ids)=1
      AND coalesce(e.detail->>'tradeStatus','')='1'
      AND lower(coalesce(e.detail->>'cryptoSold',''))='false'
      AND EXISTS(SELECT 1 FROM public.bybit_card_txns a
        WHERE a.account_id=p_account AND a.txn_id=ids[1]
          AND coalesce(a.detail->>'tradeStatus','')='1'
          AND lower(coalesce(a.detail->>'cryptoSold',''))='false'
          AND e.txn_time-a.txn_time BETWEEN 0 AND 60000)
      AND NOT EXISTS(SELECT 1 FROM public.bybit_reversal_cases o
        WHERE o.account_id=p_account AND o.event_id<>e.txn_id AND o.state='resolved' AND o.target_id=ids[1]) THEN
      -- Quick void: the only matching purchase, voided within 60s, and Bybit
      -- took no funds for either record (cryptoSold=false on both).
      INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids,state,target_id,source)
      VALUES(p_account,e.txn_id,ids,'resolved',ids[1],'provider-quick-void')
      ON CONFLICT(account_id,event_id) DO UPDATE SET
        candidate_ids=EXCLUDED.candidate_ids,state='resolved',target_id=EXCLUDED.target_id,source=EXCLUDED.source
      WHERE bybit_reversal_cases.state='needs_review';
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
    d := CASE WHEN jsonb_typeof(c.detail)='object' THEN c.detail ELSE '{}'::jsonb END;
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
    ELSIF baseline IN ('reversed','failed','refund') THEN
      result_detail := result_detail || jsonb_build_object('reconciliationState','clear');
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
      detail=((CASE WHEN jsonb_typeof(detail)='object' THEN detail ELSE '{}'::jsonb END) - 'linkedReversal' - 'reconciliationState' - 'confirmationState' - 'resolutionTarget') ||
        (result_detail - 'raw'), amount=CASE WHEN result_status='refund' THEN abs(c.amount) ELSE -abs(c.amount) END
      WHERE account_id=p_account AND ref_id=c.txn_id AND kind IN ('card','refund')
      AND (status IS DISTINCT FROM result_status
        OR amount IS DISTINCT FROM CASE WHEN result_status='refund' THEN abs(c.amount) ELSE -abs(c.amount) END
        OR detail IS DISTINCT FROM (((CASE WHEN jsonb_typeof(detail)='object' THEN detail ELSE '{}'::jsonb END) - 'linkedReversal' - 'reconciliationState' - 'confirmationState' - 'resolutionTarget') || (result_detail - 'raw')));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.bybit_reconcile_dirty(uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_reconcile_dirty(uuid,text[]) TO service_role;

SELECT c.event_id, public.bybit_reconcile_dirty(c.account_id, ARRAY[c.event_id])
FROM public.bybit_reversal_cases c
WHERE c.state='needs_review' AND cardinality(c.candidate_ids)=1 AND c.event_id NOT LIKE 'legacy:%';

SELECT event_id, candidate_ids, state, source FROM public.bybit_reversal_cases
WHERE source='provider-quick-void' ORDER BY event_id;
COMMIT;
