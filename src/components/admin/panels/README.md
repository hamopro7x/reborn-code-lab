# Admin panel module boundaries

The authenticated admin route is an application shell, not a place for panel implementation.

## Extracted admin modules

Each panel owns its UI, local state, queries, and panel-specific presentation:

- `OverviewTab.tsx`
- `CustomersTab.tsx`
- `ReviewsTab.tsx`
- `OrdersTab.tsx`
- `CategoriesTab.tsx`
- `PaymentsTab.tsx`
- `CurrenciesTab.tsx`
- `TimersTab.tsx`
- `SettingsTab.tsx`
- `EmployeesTab.tsx`
- `CoursesTab.tsx` (includes lesson management and course access UI)

The route keeps navigation, shared layout, role-aware visibility, and panel selection. Existing independent components remain in `src/components/admin/` (Bybit, Reports, Products, WorkSheet, Gmail, Staff Chat, remote device monitor, and others) and are not duplicated.

## Additional extracted domains

- Bybit visual primitives, card presentation/editor, account information card, P2P table, and transaction/asset tables now live under `src/components/admin/bybit/`.
- Checkout's reusable stepper, payment method icon, and order summary live in `src/components/checkout/CheckoutPresentation.tsx`.

## Rules for future modules

1. Move a panel without changing its user-visible behavior, route keys, or query keys.
2. Keep server authorization in server functions and database policies; hiding a tab is not authorization.
3. Keep domain-specific data access in that domain's `*.functions.ts` / server module, not in the route shell.
4. Shared UI belongs in `src/components/ui/`; reusable admin-only UI belongs in `src/components/admin/`.
5. A module may consume another domain only through a small explicit function/type interface. Avoid importing another panel's internals.
6. Do not change database schema, migrations, secrets, or deployment as part of UI extraction.
7. After each extraction, verify imports, TypeScript, production build, and the affected user flow before extracting the next panel.
8. Remove an apparently unused component only after searching all local call sites and confirming there is no route, lazy import, or dynamic reference.

## Verified cleanup

- The old inline `DevicesTab` implementation had no render or call sites in the admin route and was removed with its panel-only server-function imports.
- Imports moved with extracted panels were removed from the route shell.
- Static named-import reference scans were performed on the extracted admin modules and route shell; these are not a substitute for TypeScript compilation.

## Remaining work

Continue extracting the remaining large domains and review the rest of the application routes and server modules. The current work is a UI-boundary refactor, not a claim that every backend domain or every route has been modularized.

## Safety

This work is isolated on `refactor/modular-architecture`. Do not merge or deploy until the full TypeScript check, lint, production build, and role-specific regression checks pass.
