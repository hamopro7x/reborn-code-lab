UPDATE public.bybit_ledger l
SET status = t.status,
    kind = CASE WHEN t.status = 'refund' THEN 'refund' ELSE 'card' END
FROM public.bybit_card_txns t
WHERE l.ref_id = t.txn_id
  AND l.kind IN ('card','refund')
  AND t.status IN ('success','failed','refund','pending')
  AND l.status IS DISTINCT FROM t.status;