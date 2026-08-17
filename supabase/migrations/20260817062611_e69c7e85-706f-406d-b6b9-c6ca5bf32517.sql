CREATE OR REPLACE FUNCTION public.prune_bybit_card_txns(p_max bigint DEFAULT 10000000, p_delete bigint DEFAULT 3000000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total bigint;
  removed bigint := 0;
BEGIN
  SELECT count(*) INTO total FROM public.bybit_card_txns;
  IF total >= p_max THEN
    WITH oldest AS (
      SELECT txn_id FROM public.bybit_card_txns ORDER BY txn_time ASC LIMIT p_delete
    )
    DELETE FROM public.bybit_card_txns t USING oldest o WHERE t.txn_id = o.txn_id;
    GET DIAGNOSTICS removed = ROW_COUNT;
  END IF;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_bybit_card_txns(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_bybit_card_txns(bigint, bigint) TO service_role;