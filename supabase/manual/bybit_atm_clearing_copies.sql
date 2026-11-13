-- Bybit next-day ATM clearing copies (side 13) are never new charges.
-- 1) Stop projecting them into the central ledger.
CREATE OR REPLACE FUNCTION public.bybit_guard_ledger_projection()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a public.bybit_card_txns;
BEGIN
  IF NEW.kind NOT IN ('card','refund') THEN RETURN NEW; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(NEW.account_id::text,0)) THEN RAISE EXCEPTION 'account busy; retry' USING ERRCODE='55P03'; END IF;
  SELECT * INTO a FROM public.bybit_card_txns WHERE account_id=NEW.account_id AND txn_id=NEW.ref_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF COALESCE(NULLIF(a.detail->>'side',''),a.txn_type) IN ('2','3','13') THEN RETURN NULL; END IF;
  NEW.detail:=((CASE WHEN jsonb_typeof(NEW.detail)='object' THEN NEW.detail ELSE '{}'::jsonb END)-'linkedReversal'-'reconciliationState'-'confirmationState'-'resolutionTarget')
    ||((CASE WHEN jsonb_typeof(a.detail)='object' THEN a.detail ELSE '{}'::jsonb END)-'raw');
  IF a.detail->>'reconciliationState'='clear' THEN NEW.detail:=NEW.detail-'linkedReversal'; END IF;
  IF a.confirmed_at IS NULL OR a.confirmed_at<a.created_at+interval '30 seconds' THEN
    IF TG_OP='INSERT' THEN RETURN NULL; END IF;
    NEW.status:='holding';
  ELSIF a.detail->>'resolutionTarget'=a.txn_id OR public.bybit_trusted_manual(a) THEN NEW.status:='reversed';
  ELSIF a.detail->>'tradeStatus' IN ('3','4') THEN NEW.status:='reversed';
  ELSIF a.detail->>'tradeStatus'='2' THEN NEW.status:='failed';
  ELSIF COALESCE(a.detail->>'side',a.txn_type) IN ('4','5','6','8','9','10','11') OR a.detail->>'tradeStatus'='5' THEN NEW.status:='refund';
  ELSIF a.detail->>'reconciliationState'='needs_review' THEN NEW.status:='review';
  ELSE NEW.status:='success'; END IF;
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
  RETURN NEW;
END $function$;

-- 2) Remove existing ledger copies and their shift links (raw archive kept for audit).
BEGIN;
DELETE FROM public.work_txn_assignments wa USING public.bybit_ledger l, public.bybit_card_txns c
 WHERE wa.ledger_id=l.id AND l.kind IN ('card','refund') AND c.account_id=l.account_id AND c.txn_id=l.ref_id AND c.detail->>'side'='13';
DELETE FROM public.work_transfer_notes n USING public.bybit_ledger l, public.bybit_card_txns c
 WHERE n.ledger_id=l.id AND l.kind IN ('card','refund') AND c.account_id=l.account_id AND c.txn_id=l.ref_id AND c.detail->>'side'='13';
DELETE FROM public.work_txn_entries e USING public.bybit_ledger l, public.bybit_card_txns c
 WHERE e.ledger_id=l.id AND l.kind IN ('card','refund') AND c.account_id=l.account_id AND c.txn_id=l.ref_id AND c.detail->>'side'='13';
DELETE FROM public.bybit_ledger l USING public.bybit_card_txns c
 WHERE l.kind IN ('card','refund') AND c.account_id=l.account_id AND c.txn_id=l.ref_id AND c.detail->>'side'='13';
COMMIT;
