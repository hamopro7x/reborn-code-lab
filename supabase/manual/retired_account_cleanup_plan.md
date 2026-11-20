# Retired account cleanup — review only

## Boundary

OKX is permanently removed from application code. No SQL in this plan has been executed. No production database, Fly setting, deployment, Bybit account, Bybit credential, ledger record, shift, or employee workflow has been modified during this request.

The owner is handling the account-specific production cleanup separately. The owner's reported inventory is **one** `public.bybit_accounts` row with `provider='okx'`, **22** associated `public.bybit_ledger` rows, **12** associated `public.work_txn_assignments` rows, and **one** `private.bybit_account_keys` row. These counts are user-provided, not independently verified in this session.

## Owner's manual cleanup checklist (not an executable migration)

1. Take a secure backup before cleanup. Do not paste credential values into logs, chat, or reports.
2. Identify the retired account by its exact UUID and discriminator. Do not select by name, amount, timestamps, or shared transaction reference alone.
3. Enumerate its ledger UUIDs through `bybit_ledger.account_id`; enumerate assignments only through those exact `work_txn_assignments.ledger_id` values. Count the credential row by the same exact account UUID without reading its secret values.
4. Inspect all foreign keys, dependent tables, cascades, and DELETE triggers against the live schema before deleting anything. The repository's schema history is not proof of current production dependencies. Stop if deleting the account would cascade outside the approved account-specific scope, including employee entries, notes, P2P links, or shifts.
5. Capture baseline Bybit account/credential counts and unaffected ledger/assignment/shift IDs. If the reported retired inventory differs, stop and reconcile it before deletion; do not broaden the scope to make counts match.
6. In one owner-controlled transaction, remove only approved assignments for the exact retired ledger IDs, the exact retired ledger rows, the single account-scoped credential row, and finally the single retired account. Do not delete shifts, shared tables, Bybit rows, or alter roles/RLS/RPCs. Roll back on unexpected row counts or collateral effects.
7. Verify the retired account, its credentials, its 22 ledger rows and its 12 assignments are gone while all unrelated/Bybit baseline IDs and counts are unchanged before committing. This plan does not supply or run a deletion script because production row removal is separately managed by the owner.

## Shared discriminator: leave it, its constraint, and its index in place

Do **not** drop `public.bybit_accounts.provider`, `bybit_accounts_provider_check`, or `bybit_accounts_provider_idx` in this request.

Remaining code still deliberately depends on the shared column:

- `src/lib/bybit.server.ts` / `listAccounts()` keeps `provider IS NULL OR provider='bybit'` filtering so independently pending account cleanup cannot send retired credentials to Bybit or alter visa numbering.
- `src/lib/account-labels.server.ts` reads `provider` and excludes non-Bybit accounts while retaining legacy null/missing-column compatibility for existing schemas.

Therefore the condition for safely removing the column is **not met**. The existing shared check/index do not run an integration or expose its UI; their production definitions may retain the retired provider literal until a separately approved schema change. Removing the OKX-only installation SQL from the repository does not remove any deployed schema object.

Future discriminator removal requires independent confirmation of completed row cleanup, a full live-schema dependency review (views, functions, policies, triggers and consumers outside this repository), and a separate compatible code change. Never use `DROP ... CASCADE`, drop shared tables, or alter Bybit credentials/rows as part of this removal.