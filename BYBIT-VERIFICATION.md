# Bybit confirmation and reconciliation — review before Fly deployment

Base inspected: `5c49ede5048fdabb2cccb5c6b474acc66c87d2f2`. No commits are created by shell, no database tools are invoked, no production deployment is performed.

Automated verification: complete Vitest suite passed 162 tests across 16 files, including the installation SQL executed solely inside an isolated PGlite database (not Supabase). The harness's latest TypeScript/build entry is `build OK`; no manual build/typecheck is run because the preview harness owns them. Existing inputValidator deprecation warnings remain, not failures.

## Installation order
1. Review `supabase/manual/bybit_confirmation_reconciliation.sql` and apply it to the intended external database only after approval. This installation creates durable confirmation columns, admin-only cases/audit, transactional ingestion/decision RPCs, and protective triggers; it does not update historical rows.
2. Review `supabase/manual/bybit_targeted_20261101.sql`. Set the approving admin UUID; defaults abort. Exact account, card, amounts, IDs and raw statuses are checked and backed up. It defaults to ROLLBACK. The 2.79 correction is excluded. Do not run on demo/test accounts.
3. Merge/review the connected main changes; on the owner's Windows computer: `cd $HOME\hamo; git pull origin main; .\deploy.ps1`. The script pulls main itself and deploys Fly app `m-hamo`; if Windows blocks flyctl, the deploy tag workflow needs repository `FLY_API_TOKEN`.
4. Verify Fly background hook runs with no open visitors; inspect `bybit_sync_state.last_run_at/last_result`. `scripts/fly-start.mjs` already runs the secret-protected hook every 5 seconds after startup. Its persisted follow-up cursor walks one history page each tick, continuously restarting the effective cycle; no dedicated DB cron or 30-second HTTP sleep is installed.
5. First observation archives immediately; only a later request started >=30 seconds after database created_at can confirm. Unsupported/missing API responses never confirm absent records. Replays do not reset created_at. Existing records without confirmed_at are held until re-observed, intentionally not grandfathered.

## Financial interpretation
Pending and completed provider purchases retain the business display «ناجحة» after confirmation; pending does not prove settlement. When an unlinked reversal exists, matching candidates show «قيد مراجعة العكس» and are held OUTSIDE finalized spend/productivity (not an arbitrary one-amount deduction). Consequently these totals are provisional and may understate expenditure until an admin resolves the event. No candidate becomes failed by guesswork. Cases with no matching candidates remain visible in the admin queue.

Admin decisions are immutable, account scoped, with raw evidence backup and auth.uid role validation. Legacy linkedReversal without trusted provenance creates a review case; no bulk flip to success. The manual-20261031 mark is preserved. Side-2 events remain archived; triggers reject new ledger inserts and the staff list excludes old side-2 rows without deletion. No provider purchase/refund is executed by a decision.

## Limitations requiring production verification
No authenticated end-to-end check is available for this external Supabase project; real admin queue, fresh Bybit responses and Fly scheduler execution are unverified here. Installation is mandatory: missing RPCs fail closed rather than reverting to unsafe legacy writes. Full-cycle follow-up is resumable but its latency grows with accounts/history/API failures; a hard maximum 60-minute refresh SLA is not yet established by production measurements. Newest-page polling remains every tick; history is revisited indefinitely within the effective cycle.

No flyctl executable or FLY_API_TOKEN is available in this sandbox. Lovable publish does not deploy Fly, and is not used. No employee app release, account configuration or store-order changes are included.