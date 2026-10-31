CREATE OR REPLACE FUNCTION public.bybit_real_start_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'bybit_card_txns' THEN
    IF NEW.txn_time < 1793468102000 THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME = 'bybit_ledger' THEN
    IF NEW.occurred_at < TIMESTAMPTZ '2026-10-31 17:35:02+00' THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bybit_real_start_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bybit_real_start_card_guard BEFORE INSERT OR UPDATE ON public.bybit_card_txns FOR EACH ROW EXECUTE FUNCTION public.bybit_real_start_guard();
CREATE TRIGGER bybit_real_start_ledger_guard BEFORE INSERT OR UPDATE ON public.bybit_ledger FOR EACH ROW EXECUTE FUNCTION public.bybit_real_start_guard();
LOCK TABLE public.work_txn_entries, public.work_transfer_notes, public.work_txn_assignments, public.work_manual_card_txns, public.work_manual_txns, public.work_shifts, public.bybit_ledger, public.bybit_card_txns IN SHARE ROW EXCLUSIVE MODE;
DELETE FROM public.work_txn_entries;
DELETE FROM public.work_transfer_notes;
DELETE FROM public.work_txn_assignments;
DELETE FROM public.work_manual_card_txns;
DELETE FROM public.work_manual_txns;
DELETE FROM public.work_shifts;
DELETE FROM public.bybit_ledger;
DELETE FROM public.bybit_card_txns;
INSERT INTO public.site_settings(key,value) VALUES ('bybit_real_start', '{"started_at":1793468102000,"started_at_utc":"2026-10-31T17:35:02Z"}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
UPDATE public.bybit_sync_state SET last_result='{}'::jsonb WHERE id='ledger';