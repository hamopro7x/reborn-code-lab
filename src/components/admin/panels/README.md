# Modular feature boundaries

The route layer should compose features, not own their implementation. The authenticated admin route is now primarily responsible for navigation, role-aware visibility, shared layout, and panel selection.

## Admin panel modules

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

Existing independent admin modules remain in place: Bybit, Reports, Products, WorkSheet, Gmail, Staff Chat, remote device monitor, and shared admin tools.

## Extracted domain UI

- **Bybit:** account view, account summary, card editor/presentation, account information card, P2P table, transaction/asset tables, and visual primitives live under `src/components/admin/bybit/`. The parent `BybitTab.tsx` is now a smaller coordinator.
- **Work & shifts:** employee/shift pickers are in `WorkSheetPickers.tsx`; P2P orders are in `P2POrdersTable.tsx`; manual entry, transaction detail, and manual card UI are in `EmployeeWorkTables.tsx`; shared number formatting is in `EmployeeWorkFormatters.ts`.
- **Gmail:** account management, composer, thread view, activity log, notifications/realtime, and sender formatting are separated under `src/components/admin/mail/`.
- **Checkout:** shared stepper, payment-method icon, and order summary live in `src/components/checkout/CheckoutPresentation.tsx`.
- **Hero banners:** the banner renderer is in `src/components/site/HeroBannerView.tsx`; editor preview and field controls are in `src/components/admin/HeroBannerEditorUI.tsx`.

## Engineering rules

1. Move UI without changing user-visible behavior, route keys, query keys, or data contracts.
2. Server authorization remains in server functions and database policies; hiding a tab is not authorization.
3. Keep domain-specific data access in that domain's server module, not in route shells.
4. Shared UI belongs in `src/components/ui/`; reusable admin UI belongs in `src/components/admin/`.
5. Cross-feature imports should use small explicit interfaces; do not import another panel's internals.
6. Do not change database schema, migrations, secrets, or deployment during UI extraction.
7. Verify imports, TypeScript, production build, and affected role-specific flows after each extraction.
8. Remove code only after checking all static, route, lazy, and dynamic call sites.

## Verified cleanup

- The old inline admin `DevicesTab` had no render or call sites and was removed with its panel-only imports.
- Moved imports were removed from the owning route/component.
- Static named-import scans were run on the extracted modules and their route shells. This is not a substitute for TypeScript compilation.

## Remaining work

This is not a claim that the whole application is finished. Remaining large areas still need dependency mapping and incremental extraction, especially:
- `src/components/admin/StaffChat.tsx`
- `src/components/admin/HeroBannerManager.tsx`
- `src/components/admin/EmployeeWorkView.tsx`
- `src/lib/bybit.server.ts` and `src/lib/work.server.ts`
- other large server-function and route modules identified by the repository inventory

## Safety

All refactor work is isolated on `refactor/modular-architecture`. Do not merge or deploy until TypeScript, lint, production build, and role-specific regression checks pass.
