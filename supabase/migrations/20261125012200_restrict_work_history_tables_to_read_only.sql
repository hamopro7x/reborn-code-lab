BEGIN;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.work_manual_card_txns FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.work_shifts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.work_txn_assignments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.work_txn_entries FROM authenticated;
GRANT SELECT ON TABLE public.work_manual_card_txns, public.work_shifts, public.work_txn_assignments, public.work_txn_entries TO authenticated;
COMMIT;
