# P2P shift linking rollout (not applied)

## Inspected live schema
`work_txn_assignments.ledger_id` has a UNIQUE constraint. `work_link_p2p_atomic` is service-role-only and previously chose the newest selected shift and consumed ended shifts. Read-only inspection found 40 historical P2P assignments, 61 grouped shifts, and 56 `p2p_used` shifts. One colour group contains two orders, so colour membership cannot reconstruct an exact order-to-shift selection.

## SQL and application steps
1. Back up the database using your normal backup procedure.
2. Review and run **`supabase/manual/p2p_shift_links_v2.sql`** once in the connected database's SQL Editor. It is a single transaction. It adds three tables, explicit grants/RLS, a security-invoker compatibility view, new service-role-only RPCs, an old-signature wrapper, and Realtime publication for links. It does **not** update/delete/backfill any existing row, drop a constraint, change credentials, or rewrite the ledger or shift lifecycle.
3. Only after SQL succeeds, release the matching application through the normal owner-controlled process. **No deployment/publication was performed in this task.** Do not re-run the older `p2p_link_atomic.sql`: it restores the previous consuming behavior.
4. Verify with two employee accounts and an admin: select multiple own shifts, link an order, reuse them for another order, hide exactly one, restore it from المخفية, and confirm the admin sees both orders and every related shift. Following the owner's subsequent request, historical ended `p2p_used` and direct legacy-assigned shifts remain excluded from the default picker as before rollout; they can be restored explicitly from المخفية without rewriting shift fields. New explicit links do not hide or consume shifts.

Before application rollout, old application screens may still exclude used shifts. The compatibility RPC stops new consumption, but only the new screens expose explicit hiding and all links. Missing SQL blocks new link/hide operations with a clear message; read-only legacy assignment history remains readable.

## Historical compatibility and preservation
- Effective links UNION explicit links with old direct assignments, de-duplicated by order/shift/owner. No guessed backfill from colour groups.
- `link_group`, `ended_reason`, `archived_at`, old assignments and original ledger fields remain unchanged.
- A single new compatibility anchor is inserted only when no assignment exists. It preserves old readers and existing retention protection; it is not the authoritative list of related shifts. It uses the first input selection, not the newest shift.
- Explicit links are authoritative for every selected shift. Admin P2P tables/details and employee summaries read all effective links; summaries de-duplicate each order. Other historical single-assignment productivity reports retain their existing counting semantics rather than silently multiplying financial totals.
- Admin shift-history counts exclude single P2P anchors and count the effective links for each shift. Archived/history visibility does not query employee hiding.
- New links retain their timestamps if a shift is explicitly deleted through the existing lifecycle. The ledger reference uses RESTRICT so an order with explicit links cannot disappear through a cascading ledger deletion. No existing deletion process was run.
- Hide/unhide and link audit is written atomically, without UPDATE/DELETE grants to clients or service-role on the audit table. Hiding does not modify shift fields; restoration keeps the visibility row and an audit event.

## Changed implementation files
- `supabase/manual/p2p_shift_links_v2.sql`
- `src/lib/p2p-links.server.ts`
- `src/lib/work.server.ts`, `src/lib/work.functions.ts`
- `src/components/admin/P2PShiftLinkMenu.tsx`, `P2POrderLinks.tsx`
- `src/components/admin/EmployeeWorkView.tsx`, `WorkSheetPanel.tsx`, `BybitLedgerPanel.tsx`
- `src/lib/use-work-realtime.ts`
- `src/lib/p2p-link.test.ts`, `p2p-reads.test.ts`, `bybit-shift-counts.test.ts`
- `AGENTS.md`, `roadmap.md`, approved plan, and this rollout report.

## Verification
Run: `bunx vitest run src/lib/p2p-link.test.ts src/lib/p2p-reads.test.ts src/lib/shift-history.test.ts src/lib/bybit-shift-counts.test.ts src/lib/work-assign-settlement.test.ts src/lib/refresh-queries.test.ts`.

Result: **28 tests passed in 6 files**. The automatic application build check also passed. Final live SELECT confirmed the original 40 P2P assignments, 56 consumed markers and 61 grouped shifts remain present, and the new tables have not been applied.

SQL tests run in isolated PGlite, never against production. They exercise real table grants/RLS, owner checks, multiple links, shift reuse, no automatic hiding, unhide audit, rollback, old RPC compatibility, immutable existing assignments/ledger values, and legacy history. Application-read tests exercise owner-scoped related links, admin visibility/counts, restoration of used shifts, and missing-migration behavior.

Authenticated end-to-end verification on the real app is **not available** for this external Supabase integration, and the migration is intentionally unapplied. Local tests do not establish that the SQL is installed or that real-account UI flows have passed. No credentials, OAuth, Bybit data or existing production rows were modified.