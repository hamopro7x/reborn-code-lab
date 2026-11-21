# MG Pro Modular Refactor & Performance Plan

## Status
- Work branch: `refactor/modular-performance-foundation`
- Baseline inspected: 2026-11-21
- Production database and deployment are not modified by this plan commit.

## Implementation progress
- Phase 0: branch and architecture plan created; baseline source inventory completed.
- Phase 1 (admin foundation): extracted the `PanelKey` registry, role-resolution hook, employee base-panel policy, panel visibility policy, and last-selected-panel storage helper into `src/modules/admin/admin-access.ts`.
- Extracted admin sidebar navigation metadata and employee-filtered navigation projection into `src/modules/admin/admin-navigation.ts`; the route now consumes both modules.
- Extracted the unread staff-chat sidebar badge and admin back-navigation button into `src/modules/admin/components/`, removing their component implementations and hook dependencies from the route file.
- Extracted the overview dashboard and customers panels into `src/modules/admin/components/OverviewTab.tsx` and `CustomersTab.tsx`; their existing React Query keys and query behavior are retained.
- Extracted the reviews panel into `src/modules/admin/components/ReviewsTab.tsx`; the existing filter persistence namespace, React Query keys, Supabase operations, and review-management UI are retained. The admin route now imports the standalone panel.
- Extracted the orders, categories, currencies, timers, site settings, and device-management panels into standalone components under `src/modules/admin/components/`; their existing UI flows, React Query keys, server-function calls, and Supabase operations are retained. The route now composes these extracted modules.
- Removed the inline role hook, panel registry, navigation metadata, employee base-panel list, navigation filtering, and local-storage read helper from `admin.tsx` while preserving the existing route keys, storage key, labels, role values, and panel visibility behavior.
- The first extraction keeps panel implementations in the route for now; moving them requires dependency-by-dependency extraction to preserve their server functions and state contracts.
- Performance/security slice: overview cards now use exact-count HEAD queries and fetch only revenue totals in bounded pages; customer aggregation reads orders in 1,000-row pages against a fixed timestamp snapshot, and the server function enforces the existing employee `customers` panel-sharing rule instead of relying on UI hiding. Query errors are surfaced rather than silently converted to empty data.
- Work isolation hardening: employee shift lookups are now scoped to the authenticated user; cross-employee shift history requires admin; shared-shift self-read checks the caller's role; transfer-note writes require an active employee shift and a withdrawal within that shift, and employees cannot overwrite another user's note.
- Bybit access hardening: account lists, account-level transaction/card/asset reads, central ledger, spend totals, and sync endpoints now require admin authorization at the server boundary. The employee Bybit panel no longer renders global account/ledger data or starts account-wide sync; employees continue to use shift-scoped work data. Card-brand lookup remains available for employee work rows.
- Employee refresh remains live without granting deep-sync access: the employee shift read no longer launches `pullFromBybit()`; a separate authenticated refresh endpoint runs only the throttled recent-ingestion pass and returns no account or ledger data. Admin screens retain the full sync path.
- Database RLS hardening: a new migration removes employee direct-read policies from the global Bybit ledger, account metadata, card records (including full PAN/CVV/expiry), account-info credentials/MFA, raw card transactions, and Bybit documents. Shift and assignment reads are narrowed to own rows plus admins. Server work-sheet reads continue through service-role functions. The migration is committed but must be reviewed and applied to Supabase before deployment.
- Transfer-note reads are also narrowed to the owning employee plus admins; manual transaction and work-entry tables retain their existing own-row policies.
- Validation status: GitHub Actions run `44849198185` for the current branch completed successfully; dependency installation and the `Card status, reversal, mirror and ledger regressions` test step passed. This does not establish that lint, typecheck, or production build passed; those checks remain unverified and must run before merge.

## Baseline findings
- `src/routes/_authenticated/admin.tsx`: 2,337 lines (~122.8 KB); route composition, data access, state, and many panel implementations are colocated.
- `src/lib/work.server.ts`: 2,370 lines (~89.6 KB).
- `src/lib/bybit.server.ts`: 2,607 lines (~102.1 KB).
- `src/lib/work.functions.ts`: 713 lines; `src/lib/bybit.functions.ts`: 512 lines.
- Realtime exists at both global and work-sheet scopes; subscriptions and invalidation behavior need a single documented ownership model before changing either.
- Bybit auto-sync currently defaults to a 5-second interval while enabled. This is a high-priority performance investigation item; do not simply lengthen it without verifying transaction freshness requirements and realtime fallback behavior.
- Supabase Performance Advisor (2026-11-20) reports 89 RLS initplan findings, 25 unindexed foreign keys, 22 multiple-permissive-policy findings, and one Auth connection allocation notice. These require query/policy-level review; no blanket policy rewrite or index removal is safe.
- Auth logs contain several slow `GET /user` events in the 2.5–22.6 second range. The log sample alone does not establish the root cause; correlate with request IDs, Auth service health, and client call patterns.

## Target module boundaries
Each business domain owns its UI, client queries/hooks, server functions, server-only implementation, schemas/types, and tests. Cross-domain imports should go through explicit public entrypoints; server-only code must never enter client bundles.

```text
src/modules/
  auth/
  catalog/          # products, categories, pricing, currencies
  checkout/         # cart, checkout, payments
  orders/
  customers/
  employees/
  shifts/
  transactions/     # work ledger, assignments, manual entries
  integrations/
    bybit/
  messaging/
    mail/
    staff-chat/
  learning/         # courses, lessons, device access
  reporting/
  site-content/     # banners, footer, settings, timers
```

## Refactor rules
1. Preserve all current behavior, routes, permissions, RLS semantics, data shapes, and external integrations unless a separately reviewed change explicitly requires otherwise.
2. Extract by domain in small vertical slices: move implementation, retain compatibility exports, update imports, run focused tests, then remove obsolete wrappers only after all callers are migrated.
3. Keep route files thin. Use route-level lazy loading for heavy admin panels only after checking TanStack Router conventions and ensuring no server-only imports leak into browser chunks.
4. Give each module a documented public API. Prohibit cross-module imports into another module's internal files.
5. Keep React Query keys and invalidation contracts owned by the relevant module. Realtime listeners should invalidate only the owning module's keys; avoid broad invalidations and duplicate subscriptions.
6. Use pagination and narrow select projections for large ledgers and message lists. Avoid unbounded reads and sequential N+1 requests.
7. Treat external API synchronization as a separate workload: one in-flight sync per account, shared lock across tabs/instances where appropriate, bounded concurrency, backoff on rate limits, and explicit freshness indicators.
8. Do not apply generic database index or RLS changes. First inspect query plans, table sizes, existing indexes, policy definitions, and observed query patterns; add only evidence-backed changes.
9. Never expose secrets or service-role credentials to browser code.

## Execution sequence
### Phase 0 — safety and baseline
- Work on this feature branch, never directly on the default branch.
- Capture baseline build/test/typecheck results and route chunk sizes.
- Inventory route-to-module dependencies, server/client boundaries, query keys, realtime channels, and polling intervals.

### Phase 1 — admin shell decomposition
- Extract the admin shell/navigation/role gate from panel implementations.
- Move one low-risk panel at a time to its own module.
- Lazy-load heavy panels while retaining the existing URL panel parameter and employee visibility rules.
- Validate admin and employee access for every panel.

### Phase 2 — business-domain extraction
- Extract catalog, orders, customers, employees, learning, site-content, mail, and staff-chat in small slices.
- Preserve existing server function signatures through compatibility exports during migration.

### Phase 3 — transaction and Bybit isolation
- Split work server code by shifts, ledger reads/writes, assignments, P2P, transfers, manual transactions, and reports.
- Split Bybit code by accounts/credentials, card transactions, ledger synchronization, on-chain data, spend, and reversals.
- Preserve account isolation and current audit/settlement rules. Add regression tests before moving each behavior.

### Phase 4 — performance work
- Measure route navigation, initial render, request counts, database query latency, and sync freshness.
- Fix proven N+1/unbounded queries; add pagination and selective projections.
- Reduce redundant Auth calls and consolidate Realtime ownership.
- Review RLS initplans, foreign-key indexes, and permissive policies individually against actual access patterns.
- Tune sync cadence based on measured freshness and provider limits, not arbitrary aggressive polling.

### Phase 5 — verification and release
- Run lint, typecheck, unit/regression tests, production build, and smoke tests.
- Verify public storefront, checkout, admin, employee, shifts, Bybit, mail, and chat.
- Review deployment configuration and migration diff.
- Deploy only after the feature branch passes checks and changes are reviewed; verify production health and rollback readiness.

## Acceptance criteria
- No business domain's implementation remains embedded in the admin route.
- No module imports another module's private implementation.
- Existing routes, roles, data visibility, transaction accounting, and integrations behave identically.
- No unbounded ledger/message reads; pagination is explicit.
- No duplicate active Realtime subscriptions for the same scope.
- No aggressive sync loop without a documented freshness requirement and concurrency guard.
- Build, typecheck, lint, regression tests, and production smoke tests pass.
- Performance improvements are demonstrated with before/after measurements rather than assumed.
