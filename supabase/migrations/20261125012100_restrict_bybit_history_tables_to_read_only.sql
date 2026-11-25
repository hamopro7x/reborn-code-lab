BEGIN;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bybit_card_txns FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bybit_ledger FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bybit_reversal_audit FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bybit_reversal_cases FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.bybit_sync_state FROM authenticated;
GRANT SELECT ON TABLE public.bybit_card_txns, public.bybit_ledger, public.bybit_reversal_audit, public.bybit_reversal_cases, public.bybit_sync_state TO authenticated;
COMMIT;
