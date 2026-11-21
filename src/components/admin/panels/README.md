# Admin panel module boundaries

The authenticated admin route is an application shell, not a place for panel implementation.

## Current extraction pattern

Each panel lives in its own file under `src/components/admin/panels/` and owns its UI, local state, queries, and panel-specific presentation:

- `OverviewTab.tsx`
- `CustomersTab.tsx`
- `ReviewsTab.tsx`

The route imports these components and remains responsible for navigation, shared layout, role-aware visibility, and panel selection.

## Rules for future modules

1. Move a panel without changing its user-visible behavior or query keys.
2. Keep server authorization in server functions and database policies; hiding a tab is not authorization.
3. Keep domain-specific data access in that domain's `*.functions.ts` / server module, not in the route shell.
4. Shared UI belongs in `src/components/ui/`; reusable admin-only UI belongs in `src/components/admin/`.
5. A module may consume another domain only through a small explicit function/type interface. Avoid importing another panel's internals.
6. Do not change database schema, migrations, secrets, or deployment as part of UI extraction.
7. After each extraction, verify imports, TypeScript, production build, and the affected user flow before extracting the next panel.

## Intended next boundaries

Orders, Catalog (products/categories/timers), Employees, Courses, Devices, Payments, Bybit, Work & Shifts, Gmail, Staff Chat, and Settings each receive their own panel module. Their server/data layers are separated afterward in small, behavior-preserving steps.

## Safety

This branch is an isolated refactor branch. Do not merge or deploy until the full build and role-specific regression checks pass.
