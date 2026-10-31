CREATE OR REPLACE FUNCTION public.bybit_real_start_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'bybit_card_txns' THEN
    IF NEW.txn_time < 1793404800000 THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME = 'bybit_ledger' THEN
    IF NEW.occurred_at < TIMESTAMPTZ '2026-10-31 00:00:00+00' THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bybit_real_start_guard() FROM PUBLIC, anon, authenticated;
INSERT INTO public.site_settings(key,value) VALUES ('bybit_real_start', '{"started_at":1793404800000,"started_at_utc":"2026-10-31T00:00:00Z"}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
UPDATE public.bybit_sync_state SET last_result='{}'::jsonb WHERE id='ledger';