# Bybit reversal linkage: permanent fix (needs_review + admin resolution)

## Findings (read-only, verified this turn)
- All 9 rows (2.79 / 3.61 / 3.08 groups) are the same pattern: purchase A (side 1, tradeStatus 1), retry B 3 s later (side 1, tradeStatus 0), reversal R 20-21 min later (side 2, tradeStatus 1).
- R has its own orderNo/orderId/paymentId/txnId/canonicalId. `authCode`, `eventCode`, `terminalId`, `storeId`, `responseCode`, `updatedAt` are all NULL in stored detail. **No stored field links R to A or B.** Same merchant (PAYPAL *TIKTOK INC), card, amount.
- Current code (`findLinkedReversals`, bybit-spend.ts 220-283): links by shared id, else only when exactly one same-card/amount candidate exists in 60 min. With two candidates it links nothing, so: both purchases show «ناجحة», R stays a non-purchase, and the spend total counts both purchases (overstated by the reversed amount). No guess is made, which is correct, but nothing flags it.
- 2.79: manual outcome (`linkedBy=manual-20261031`) exists only as a detail flag; nothing in the sync explicitly protects it as the top priority. Old `linkedReversal=1` marks (21 rows) come from the earlier guessing logic, and the code at bybit.server.ts 1200/1233/2200 keeps them "sticky".
- Bybit's public Card API docs define side 2 = Authorization Reversal but document no field pointing at the original authorisation. Unconfirmed: whether the unstored `raw` payload or another endpoint has one. Step 1 checks this.

## Algorithm
Resolution priority per purchase (highest first):
1. **Admin resolution** (new table `bybit_reversal_resolutions`): reversal R -> purchase X, or "R voids none". Final, survives every sync.
2. **Strong provider link**: R shares orderNo/txnId/paymentId (or a field found in step 1) with X.
3. **Unique candidate**: exactly one same-account/card/amount/merchant side-1 purchase within the window, not already consumed.
4. **Otherwise ambiguous**: R goes into the `needs_review` queue with its candidate ids. No purchase is marked failed.

Rules:
- Legacy `linkedReversal=1` counts only if it has `linkedBy` (manual) or its reversal re-qualifies under 2/3. Unproven marks show as review items; they are never silently kept or flipped.
- Each reversal voids at most one purchase. Manual resolutions are never overwritten.
- Display stays as it is (success+pending -> «ناجحة»). Spend: a reversal still pending review subtracts its amount once from the account/monthly total, flagged "قيد المراجعة". The figure stays right without picking which purchase was reversed. **Decision needed** (see below).

## Admin queue
- New "مراجعة العكس" panel in the central ledger. For each pending R it shows the candidate purchases (time, tradeStatus, ids) and three actions: "العملية دي اتعكست" / "ولا واحدة" / later.
- The decision is saved through an authenticated, admin-checked server function. Then a single recompute pass updates `bybit_card_txns`, the matching `bybit_ledger` row and shift assignments/productivity, and invalidates the spend cache.

## Tests (vitest)
- The three groups (2.79, 3.61, 3.08) across two accounts synced together, including the same amount on different accounts:
  - no resolution: both purchases «ناجحة», 3 review items, spend reduced once per group;
  - resolution applied: the chosen purchase becomes «فاشلة» and the review item is gone;
  - resync with changed tradeStatus: the resolution persists;
  - the manual 2.79 outcome beats a legacy `linkedReversal`;
  - a strong shared id still auto-links; a unique candidate auto-links;
  - the archive, ledger, shift and spend outputs agree.

## Steps
1. Read-only: pull raw Bybit records for the 3 groups (all query types) and compare every field. Look for any linkage field. If one is found, add it to the strong-link rule.
2. Migration: `bybit_reversal_resolutions` (reversal_txn_id PK, account_id, voided_txn_id nullable, decided_by, decided_at, source) with an admin-only RLS policy plus grants.
3. Refactor `findLinkedReversals` to return `{voided, pendingReview}` and apply the priority order above. Use it in `linkReversalsBeforeSave`, ledger mirroring, spend and shift paths. Replace the sticky-legacy branches.
4. Add the server functions and the admin panel. Write tests and run them.
5. No data changes. The existing 2.79 manual outcome is migrated as a resolution row only after approval. Deploy only by the owner via `deploy.ps1`.

## Decision needed
For an unresolved reversal: should spend subtract it immediately (my recommendation, accurate totals), or count both purchases until an admin decides?
