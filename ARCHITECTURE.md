# MG Pro application architecture

MG Pro remains a **modular monolith**: one TanStack Start application, one deployment target, and the existing Supabase project. Features are separated in source code; this refactor does not create new services, databases, or deployment environments.

## Application layers

### Routes

`src/routes/` contains file-based TanStack routes. Route files should compose feature components and own route-level navigation/search state. They should not become containers for the implementation of every panel.

- `src/routes/_authenticated/admin.tsx` is the authenticated admin shell: role-aware navigation, panel selection, shared layout, and visibility rules.
- `src/routeTree.gen.ts` is generated. Never edit it manually.

### Feature UI

- **Storefront:** `src/components/site/` — header, product cards, product rails, hero carousel/banner view, footer, and shared storefront UI.
- **Checkout:** `src/components/checkout/` — checkout presentation; route orchestration remains in `src/routes/checkout.tsx`.
- **Admin panels:** `src/components/admin/panels/` — independently rendered dashboard, orders, customers, reviews, catalog, employees, courses, payments, currencies, timers, and settings panels.
- **Work & shifts:** `WorkSheetPanel.tsx`, `EmployeeWorkView.tsx`, `EmployeeWorkTables.tsx`, `EmployeeTransfersTable.tsx`, and related pickers/formatters.
- **Bybit:** `src/components/admin/bybit/` and the Bybit tab/ledger components.
- **Gmail:** `src/components/admin/mail/` plus the Gmail inbox and message-row/body components.
- **Courses:** `CoursesTab.tsx`, `CourseLessonsManager.tsx`, and `LessonUploader.tsx`.
- **Staff chat:** `StaffChat.tsx` and its message, media, voice, gate, and viewer components.
- **Hero banners:** `HeroBannerManager.tsx`, `HeroBannerEditorUI.tsx`, and `src/components/site/HeroBannerView.tsx`.

### Server functions and domain services

Server-function facades preserve stable imports while implementations are grouped by responsibility:

- `work.functions.ts` → overview, employee actions, admin/history actions, and shared-shift access modules.
- `bybit.functions.ts` → account, read/sync, card administration, conversion, and ledger endpoints.
- `mail.functions.ts` → account lifecycle, message operations, composition, and notifications.
- `admin.functions.ts` → employee management and admin operations.
- `courses.functions.ts` → device management and course-access operations.

Domain services and persistence logic remain under `src/lib/`. Server-only helpers should use the `.server.ts` suffix. Keep credentials and privileged Supabase access on the server.

## Module boundaries

1. Preserve existing public facade paths when moving implementations so consumers do not need broad import rewrites.
2. Keep UI state and presentation inside the feature that owns them; keep shared navigation/layout in route shells.
3. Every server function must perform authentication and authorization on the server. Hiding a navigation item is not an authorization boundary.
4. Avoid importing another feature's internal implementation. Expose a narrow function/type interface when cross-feature access is required.
5. Keep database writes and financial/shift invariants in their existing domain services. UI extraction must not change query keys, row ownership, reconciliation, assignment, or history semantics.
6. Do not delete code solely because it looks unused. Confirm it has no call sites and is not part of an external contract first.
7. Database migrations, live database changes, secrets, and deployment are separate reviewed operations; they are not part of a source-only refactor.

## Validation

The refactor validation workflow runs:

- `bunx vitest run` for unit and regression tests.
- ESLint on extracted/changed feature modules.
- `bun run build` for the production bundle.

Do not merge or deploy until the latest commit has all required checks passing and role-specific workflows have been reviewed.
