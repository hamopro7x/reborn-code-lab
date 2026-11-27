BEGIN;
REVOKE ALL ON TABLE
  public.bybit_account_info,
  public.bybit_accounts,
  public.bybit_card_txns,
  public.bybit_cards,
  public.bybit_ledger,
  public.bybit_reversal_audit,
  public.bybit_reversal_cases,
  public.bybit_sync_state,
  public.work_manual_card_txns,
  public.work_manual_txns,
  public.work_shifts,
  public.work_txn_assignments,
  public.work_txn_entries
FROM anon;
COMMIT;
