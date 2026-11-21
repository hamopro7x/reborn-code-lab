-- PostgreSQL row-level security does not apply to TRUNCATE, and clients
-- never need to create triggers or foreign keys on application data tables.
-- Remove these non-row-scoped privileges from API roles while preserving the
-- existing SELECT/INSERT/UPDATE/DELETE grants and RLS policy behavior.
BEGIN;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.agent_devices,
  public.agent_enroll_codes,
  public.bybit_account_info,
  public.bybit_accounts,
  public.bybit_card_txns,
  public.bybit_cards,
  public.bybit_ledger,
  public.work_shifts,
  public.work_transfer_notes,
  public.work_txn_assignments
FROM anon, authenticated;

COMMIT;
