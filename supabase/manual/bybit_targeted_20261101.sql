-- MANUAL REVIEW ONLY. Apply installation first, inspect SELECTs, then approve.
-- Target account/card/IDs only. 2.79 manual-20261031 is NOT changed.
BEGIN;
DO $$
DECLARE acc uuid:='fffe1106-4336-446d-bb51-ad9ff9596d42'; g record;
        actor uuid:=NULL; -- REQUIRED: replace NULL with the approving admin UUID.
        rows_count integer; candidates text[];
BEGIN
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role::text='admin')
    THEN RAISE EXCEPTION 'Set the approving admin UUID before executing'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(acc::text,0));
  FOR g IN SELECT * FROM (VALUES
    ('3000000683749966','3000000683750004','3000000683764413',3.61::numeric),
    ('3000000683935780','3000000683935812','3000000683972959',3.08::numeric)
  ) AS v(first_id,retry_id,event_id,amount) LOOP
    PERFORM 1 FROM public.bybit_card_txns WHERE account_id=acc
      AND txn_id IN (g.first_id,g.retry_id,g.event_id) FOR UPDATE;
    SELECT count(*) INTO rows_count FROM public.bybit_card_txns WHERE account_id=acc AND pan4='0540'
      AND abs(amount)=g.amount AND (
        (txn_id=g.first_id AND detail->>'side'='1' AND detail->>'tradeStatus'='1' AND status='success') OR
        (txn_id=g.retry_id AND detail->>'side'='1' AND detail->>'tradeStatus'='0' AND status='success') OR
        (txn_id=g.event_id AND detail->>'side'='2' AND detail->>'tradeStatus'='1' AND status='failed'));
    IF rows_count<>3 THEN RAISE EXCEPTION 'Changed/missing raw preconditions for %',g.event_id; END IF;
    IF EXISTS(SELECT 1 FROM public.bybit_reversal_cases WHERE account_id=acc AND event_id=g.event_id AND state='resolved')
      THEN RAISE EXCEPTION 'Resolution already exists: %',g.event_id; END IF;
    -- Audit is the backup, including archive + central + shift-assignment snapshot.
    INSERT INTO public.bybit_reversal_audit(account_id,event_id,target_id,source,decided_by,evidence)
    SELECT acc,g.event_id,g.first_id,'manual-user-20261101',actor,jsonb_build_object(
      'archive',(SELECT jsonb_agg(to_jsonb(a)) FROM public.bybit_card_txns a WHERE account_id=acc AND txn_id IN(g.first_id,g.retry_id,g.event_id)),
      'ledger',(SELECT jsonb_agg(to_jsonb(l)) FROM public.bybit_ledger l WHERE account_id=acc AND ref_id IN(g.first_id,g.retry_id,g.event_id)),
      'assignments',(SELECT jsonb_agg(to_jsonb(w)) FROM public.work_txn_assignments w JOIN public.bybit_ledger l ON l.id=w.ledger_id WHERE l.account_id=acc AND l.ref_id IN(g.first_id,g.retry_id,g.event_id)));
    INSERT INTO public.bybit_reversal_cases(account_id,event_id,candidate_ids,state,target_id,source,decided_by,decided_at)
      VALUES(acc,g.event_id,ARRAY[g.first_id,g.retry_id],'resolved',g.first_id,'manual-user-20261101',actor,clock_timestamp())
    ON CONFLICT(account_id,event_id) DO UPDATE SET state='resolved',target_id=EXCLUDED.target_id,
      source=EXCLUDED.source,decided_by=EXCLUDED.decided_by,decided_at=EXCLUDED.decided_at;
  END LOOP;
  -- Reconcile ONLY these two pairs, never the account's other ambiguous rows.
  UPDATE public.bybit_card_txns SET detail=detail || jsonb_build_object(
    'reconciliationState','resolved','resolutionTarget',txn_id,'projectedStatus','reversed')
    WHERE account_id=acc AND txn_id IN('3000000683749966','3000000683935780');
  UPDATE public.bybit_card_txns SET detail=detail || jsonb_build_object(
    'reconciliationState','clear','projectedStatus','success')
    WHERE account_id=acc AND txn_id IN('3000000683750004','3000000683935812');
  UPDATE public.bybit_card_txns SET detail=detail || jsonb_build_object('reconciliationState','resolved')
    WHERE account_id=acc AND txn_id IN('3000000683764413','3000000683972959');
  -- Ledger trigger applies persisted resolutions and keeps unconfirmed rows held.
  UPDATE public.bybit_ledger SET detail=detail WHERE account_id=acc
    AND ref_id IN('3000000683749966','3000000683750004','3000000683935780','3000000683935812');
END $$;
-- Inspect these projections and backup before replacing ROLLBACK with COMMIT.
SELECT txn_id,status,detail->>'projectedStatus' AS display_status,detail->>'tradeStatus' AS provider_status
FROM public.bybit_card_txns WHERE account_id='fffe1106-4336-446d-bb51-ad9ff9596d42'
AND txn_id IN('3000000683749966','3000000683750004','3000000683935780','3000000683935812');
ROLLBACK;