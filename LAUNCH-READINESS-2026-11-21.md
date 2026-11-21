# MG Pro — launch candidate, 21 November 2026

## Status
Code fixes implemented, not deployed. This is **not yet a certified production-ready release**: Fly production artifact execution, authenticated staff flows, provider observation and the items below remain release gates. No production SQL, data writes, secret rotation, Fly/DNS changes or Agent release occurred.

## Existing-Supabase clarification — 21 November, 20:52 UTC
- Production stays on **kcdsdaytrnzoiharmyxo**, with its existing Auth/Storage/users/UUIDs/Bybit ledger/shifts/history. Release is application/runtime-only; no new project, database export/import/migration, auth.users copying, storage moving or provider credential rotation/re-entry.
- Replaced the still-obsolete `selfhost/VPS-CHECKLIST.md` database-move procedure; expanded `selfhost/README.md` and corrected `.env.example` comments to verify existing secure configuration rather than overwrite .env/generate secrets. Exact build/runtime/provider variable names and Fly-vs-VPS scheduler differences are documented. Existing jobs, OAuth, secrets, Fly/DNS and database remain untouched.
- `src/start.ts` now uses `src/lib/production-host.ts`: preserve 410 for default Fly pages/RPCs/writes; permit only GET/HEAD of the exact already-public `/api/public/build-version` liveness endpoint. Custom-domain/internal hosts are unaffected; endpoint authorization and forwarded-host handling are unchanged. Nine regression cases cover this contract; rule recorded in `src/lib/AGENTS.md` (root instructions at their size budget).
- Full suite **47 files / 360 tests passed**, started 20:51:52 UTC, duration 15.42s; automatic compiler **build OK 20:52:08 UTC**. No standalone production artifact build/boot was run.
- Attempted actual development HTTP with Host `m-hamo.fly.dev`: Vite rejects that host with **403 before application middleware**, so it cannot establish target 410/200 behavior. No Vite allowlist was weakened. Host-policy unit tests pass; correct self-hosted Node integration/health probes remain an owner-side gate. fly.toml still has no HTTP check; no running job or production setting was changed.
- This pass changes only checklist/README/environment example, host policy/middleware/test, lib instructions, readiness report and roadmap. Retained list caps, atomic PIN/handover, guest-order owner proof, compatible TURN auth, real authenticated checks and production build gates remain open as described below.

## Explicit production architecture and hosting audit

**Production is exclusively the owner's self-hosted Fly.io/VPS Node deployment using the existing Supabase project/services. Lovable is editor/agent/development preview only; it is never a production hosting or database target.** No Lovable publishing, Fly/VPS deployment, DNS/domain change, secret/OAuth change, production write/migration or PR4 merge occurred.

### Inspected and safely corrected
- Root `Dockerfile`: Bun frozen install, public VITE_* arguments, explicit `NITRO_PRESET=node-server`/`.output`, Node 22-slim runtime, Fly launcher CMD and exposed port 3000. Retained unchanged.
- `selfhost/Dockerfile` attempted `COPY selfhost/.env ./.env` despite `.dockerignore` excluding runtime .env files. This can fail the image build and would copy private runtime credentials into the build stage if the exclusion were loosened. Removed that COPY; existing public Compose build arguments and runtime `env_file` remain unchanged.
- `vite.config.ts` now defaults to `node-server` rather than a production fallback of `cloudflare-module`; both deployment Dockerfiles already explicitly select Node. Kept Lovable's config plugins and development integration. Inspected installed config package: it distinguishes sandbox builds from ordinary external builds and can override the editor build target internally. That development behavior is not the production runtime.
- `scripts/start.mjs` now refuses a missing `.output/server/index.mjs` under NODE_ENV=production instead of invoking a build in the runtime image. Nonproduction fallback remains. Filesystem entry import uses `pathToFileURL`, preserving Windows/space-containing paths; PORT/HOST → NITRO_PORT/NITRO_HOST mapping stays unchanged.
- `scripts/fly-start.mjs` keeps database validation, bind configuration, secret fallback, direct Nitro import and existing single-flight/backoff Bybit loop. Only diagnostics changed: missing-variable message names existing app m-hamo; errors/sync responses no longer print provider/DB bodies. No secret value, scheduler cadence or runtime startup behavior was changed.
- `client.server.ts` missing-environment diagnostic no longer instructs connecting Lovable Cloud; it directs secure configuration of existing self-hosted Supabase credentials. Lazy server-only client, URL identity guard and RLS/admin boundaries are unchanged.
- Selfhost scheduler scripts now log HTTP status without response bodies. Preserved their actual scheduling/auth behavior; they still classify HTTP 2xx as success without inspecting an `ok:false` JSON payload, which remains a documented scheduler-observability gap.
- `README.md`, `FLYIO.md` and `selfhost/README.md` now describe the existing deployment and remove obsolete launch guidance to create/migrate a Supabase project, replay all migrations, change DNS, manipulate Lovable Cloud or schedule through the intentionally blocked fly.dev hostname. No migration/infra script was run or deleted.

### Boot, health and environment evidence
- fly.toml remains unchanged: app m-hamo, fra, internal_port 3000, HTTPS service, shared CPU/512MB, automatic stop/start and min_machines_running=0. There is **no configured HTTP healthcheck** in this file. Idle stop/zero running Machines is a potential interruption to the in-process Bybit loop; actual deployed override/machine state was not read or changed.
- VPS Compose healthchecks `/api/public/build-version` (30s interval, 10s timeout, 5 retries, 40s grace). This is HTTP liveness only, not DB/provider readiness or a successful private workflow. Existing nginx forwards Host/WebSocket headers and allows 50MB uploads with 300s read timeout; no proxy setting changed.
- Fly starts `.output/server/index.mjs` through fly-start and runs Bybit locally. VPS starts Nitro directly with separate Bybit/mail cron containers; preserving this distinction avoids duplicate scheduler paths. Fly has no in-process Gmail loop, so its existing external Gmail scheduler must be verified by the owner.
- Public build names: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID. Runtime names: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PROJECT_ID, with legacy public-key aliases preserved by fly-start. SUPABASE_SERVICE_ROLE_KEY is never a VITE_* variable. Existing URL/project identity is pinned deliberately; no environment values were printed or changed.
- Node-only API imports currently found in active server helpers use node:crypto, which is appropriate for self-hosted Node. Launch scripts use fs/child_process/url, also Node-only by design. Web Crypto/fetch/AbortSignal operations are available in the configured Node 22 runtime; no executable/browser automation was moved into SSR. Nitro/framework dependency compatibility still requires a real artifact build/boot.
- Development preview auth storage, optional Lovable error-capture bridge, config/editor plugins, bundled asset pointer files and MCP application tooling were retained; their names alone are not a production-hosting dependency.

### Remaining hosting-specific owner gates
1. Docker/Node production artifact build and real HTTP boot on the owner-controlled target. No Docker CLI was available here; project builds/typechecks are prohibited manually by the editing harness, which supplies automatic compiler checks instead. Launcher tests load **temporary fixture modules only** and cannot establish application boot success.
2. Review existing Fly cold-start/memory/health configuration against always-on sync requirements, with actual machine/scheduler telemetry; changes require separate permission. Verify Gmail scheduler and all secure runtime/provider values on the actual deployment without disclosing them.
3. Active `StaffChat.tsx` still resolves the wallpaper asset pointer through a hardcoded development-preview origin (`new URL(chatWallpaper.url, previewOrigin)`). The pointer is relative `/__l5e/assets-v1/...`; changing only the origin would make the image fail on Fly. Keep current appearance for now; safely remove this dependency only after materializing the exact original asset into a deployable bundled/static path and verifying it on the Node artifact. No Supabase storage/history needs changing. Other .asset.json pointers should be verified against the external build's asset handling rather than blindly deleted.
4. Legacy `scripts/verify-node-build.mjs` verifies entry existence/client patterns and has a dist fallback; it does not certify Node listening or HTTP health. `scripts/start.mjs`/both Docker runtime paths require `.output`; the owner must verify the actual artifact paths. fly-start generates an ephemeral hook secret only when one is absent; retain current behavior until the owner validates external scheduler secret compatibility, rather than rotating or fabricating a production credential here.
5. Previously documented retained capped lists, PIN/claim atomic gap, guest-order owner-proof design, compatible ICE/TURN rollout, authenticated staff/Agent/avatar/mail/chat checks and Bybit observation remain open. This hosting clarification does not remove those gates.

### Hosting-audit verification
- Final full suite: **46 files / 351 tests passed**, run started 20:49:17 UTC, 9.67s. Three added launcher/build-boundary regressions run alongside app tests; they verify fail-fast missing artifacts, Node import of a fixture under a path containing spaces, port forwarding and no runtime-secret COPY.
- `node --check scripts/fly-start.mjs`, `sh -n selfhost/sync-loop.sh`, `bash -n selfhost/bybit-sync.sh` passed. `git diff --check` passed. Latest automatic compiler observed build OK at 20:49:04 UTC; this is not a standalone Fly Node production build.
- Changed for this hosting pass: Docker build safety in `selfhost/Dockerfile`; `vite.config.ts`; `scripts/start.mjs`, `scripts/fly-start.mjs`, `scripts/start.test.mjs`, `scripts/AGENTS.md`; `src/integrations/supabase/client.server.ts`; `selfhost/sync-loop.sh`, `selfhost/bybit-sync.sh`; README/selfhost/Fly documentation; readiness report/roadmap. No fly.toml, deployment credentials, domain, OAuth, schema or production data changes.

Preview: https://id-preview--335637d3-bc9b-407f-9e44-b28bda5c78dc.lovable.app

## Follow-up from f1868253b6b4102f953c1c5bab944b2d3bee89e1

### Safe changes implemented
- `listCustomers` retains its staff authorization, email/phone grouping, newest contact data, confirmed/completed currency totals and order-count sorting. Its former `limit(5000)`/single-response truncation is replaced with sequential 200-row server reads and a compact customer accumulator. No order rows are sent to the browser.
- `shiftHistory`, called by `getEmployeeShiftList` → `WorkSheetPanel` and `getMySharedShift`, now reads every matching nonarchived/archived descriptor sequentially. It preserves the existing full-array shift numbering/colour contract. Assignment tallies read all pages in 100-shift ID groups; effective/legacy P2P link filters also chunk large ID sets. The legacy unused `limit` positional argument remains for source compatibility, but no longer truncates this full-history selector.
- `completedP2P` → `getWorkP2PCompleted` → `EmployeeWorkView` now scans stable `(occurred_at,id)` candidate cursors until the explicit recent-inbox size is filled or exhausted. Linked-order exclusion happens **before** limiting eligible results: two fully linked newest pages no longer conceal an older unlinked order. Existing admin linked-order visibility, employee link privacy, cutoff and ordering are preserved. The endpoint still deliberately returns at most the requested 200 eligible inbox rows (500 maximum); it is not a complete-history count API.
- PIN attempt logic is isolated in `pin-attempt.server.ts` and shares the existing salted SHA-256 hash implementation. Updates compare the observed user/hash/salt/failure count/lock state and require a returned updated row; conflicting concurrent updates re-read at most four times, then fail closed. This prevents lost wrong-attempt increments and stale successful verification after a concurrent PIN replacement. Protected server-function authorization is unchanged. Tests simulate atomic conditional updates, not production database concurrency.

### Capped/default-limited paths and actual callers

| Path | Cap / caller | Follow-up disposition |
|---|---|---|
| `work.server.ts/shiftHistory` | Former 100 default / 200 max; `getEmployeeShiftList` and `getMySharedShift` | Fixed complete selector, sequential pages and full counts; 201-shift/1201-assignment regression |
| `admin.functions.ts/listCustomers` | Former 5000 request limit plus a single Data API response; `CustomersTab` | Fixed full compact server aggregation; 5201-order regression |
| `work.server.ts/completedP2P` | 200 requested / 500 max; EmployeeWorkView open P2P inbox | Fixed candidate-limit-before-exclusion bug with cursor reads; explicit inbox contract retained. Full-history/load-more API remains a gate |
| `work.server.ts/listShifts`, `shiftOptions`, `pendingP2P`, `shiftsOfUser` | 60/200, 40, 100/300, 40/100; wrappers `getWorkShifts`, `getWorkP2PPending`, `getStaffShifts` | No current UI/hook import/call site found for those wrappers. Retained callable legacy endpoints; not removed or widened. `pendingP2P` still uses legacy assignment exclusion and must not be substituted for the active effective-link inbox |
| `work.server.ts/transfersLedger` | 200 default / 500 max | No current call site found. Active shift-transfer UI already uses exact-count `getWorkTransferPage`; retain legacy helper unchanged |
| `adminEmployeeWorkState` | Last 20 shift descriptors, then one assignment response; called by employee-preview endpoints/summary/manual/P2P wrappers | Retained: changing which open/latest historical shift is selected needs explicit contract tests and production profiling. Complete explicit-shift selector above is fixed |
| `admin.tsx/OverviewTab` | One response each for orders/products/profiles; revenue/counts derived client-side | Unchanged. Next safe design: caller-scoped authenticated server aggregation + exact head counts; preserve existing revenue semantics and local-day boundary. No new RPC or role expansion was improvised |
| `admin.tsx/OrdersTab`, `ReviewsTab`, `ProductsTab`, ReportsTab | Single-response order/review/product lists, with browser filters/CSV/detail workflows | Unchanged. Need server filter/cursor and full report aggregation, retaining search/CSV totals and RLS. Simply replacing with one smaller page would hide rows |
| Admin/reference selectors | categories, payment methods, currencies/rates, timers, settings, courses/lessons; single-response list queries in admin.tsx/ProductsTab | Unchanged; finite configuration/parent-scoped lists, but still subject to backend response maximum. No claim that they are complete at arbitrary scale |
| Employee/device/course lists | `listEmployees`, `adminListEmployees`, `adminListDevices`, course-access/lesson lists and `staffList`; callers employee/course/device management and WorkSheetPanel | Single-response roles/profile/device/access reads; listEmployees also signs avatars concurrently. Retained; paging requires coordinated full selector/profile mapping and bounded signing, not silently clipping users |
| `admin.tsx/admin_notifications` | Latest 20; OverviewTab | Retained intentional recent-preview cap; displayed unread badge counts only these displayed rows, not all notifications |
| `orders.functions.ts/listOrdersByDevice` | Latest 50 guest orders within 30 days; TrackPage | Unchanged due access-design risk below; adding paging without owner proof would extend exposure |
| `mail.functions.ts/listMailMessages` | 31 fetched / 30 displayed; GmailInbox uses useInfiniteQuery/nextBefore | Already has continuation. Cursor contains timestamp only, so same-timestamp page boundaries can skip rows; needs `(internal_date,id)` versioned cursor with existing caller compatibility |
| Mail drafts/activity | Latest 100 / 200; GmailInbox draft/activity views | Retained explicit preview lists; adding continuation needs coordinated UI and authorization-preserving changes |
| MCP list_orders/list_products | 25 default / 100 max, explicit limit parameter; authenticated external tools | Retained intentional response contract. Optional cursor/versioned response would require tool-consumer compatibility, not silently changing array results |
| Active central/shift transaction tables | getBybitLedger / getShiftTxns / getMyShiftTxns; page + exact count | Already paged; previous candidate fixed main sheet/manual/transfer paths. Provider history walks remain bounded/persisted and unchanged |

The query audit establishes source-level response ceilings, not observed production row losses in each retained list. The configured Data API response maximum was not fetched; a single-response `.select()` can still truncate at that server maximum (commonly 1000). No cap was increased merely to pretend all rows are available. Complete selector/customer reads are sequential but not transaction-snapshot reads; insertion during an offset scan can still affect the read, and large histories need measured aggregate/cursor rollout.

### Live PIN/handover evidence and exact remaining DB work
- Read live `work_claim_shift_for`, old `work_claim_shift`, `work_pins`/`work_shifts` indexes and triggers. Only a timestamp trigger exists for PIN updates; there is **no PIN verification/attempt RPC**. `work_pins_pkey(user_id)` enforces one PIN record, not atomic read-modify-write. The code CAS above mitigates attempt races without any migration.
- `work_claim_shift_for` is service-role-only and performs its existing-row `SELECT ... WHERE ended_at IS NULL FOR UPDATE`, old-shift close and new-shift insert within one function transaction. `work_shifts_single_open` enforces **at most one open shift**, but does not serialize an empty result or make a waiting statement reselect the newly opened row. Simultaneous first claims/handover can therefore hit a unique violation and roll back; no destructive workaround/retry was added.
- Required review-only RPC change: begin `work_claim_shift_for` with a **transaction-scoped advisory lock shared by every shift-claim path**, e.g. a stable application-specific `pg_advisory_xact_lock(hashtextextended('mgpro-work-shift',0))`, then reselect the current open shift, return it idempotently for the same user, otherwise close/insert. Preserve existing eligibility checks, row fields and service-role-only grants; do not revoke active Agent RPCs. Test no-open concurrent claims, two users handing over and duplicate same-user requests against a real PostgreSQL test database.
- For fully atomic PIN verification **and claim**, review a service-role-only `work_verify_pin_and_claim(p_user uuid,p_pin text)` RPC: lock that user's PIN row `FOR UPDATE`, check the existing six-digit/salted-hash/lock rules, persist failed-attempt result without throwing/rolling it back, and on success take the same shared claim lock and perform handover in that transaction. Return structured results; preserve successful reset semantics and all history. PIN creation/reset/change paths must follow compatible row-lock ordering. Do not change stored hash format or migrate/rewrite existing PINs. The code CAS does not close the remaining interval between verification and the separate claim RPC.

### Device-order access: traced, unchanged, concrete remediation
`checkout.tsx` writes a client-provided fingerprint in `createPublicOrder`; `TrackPage` computes it via `getCachedFingerprint` and calls unauthenticated `listOrdersByDevice`. That function uses service role and returns guest-order IDs/codes/status/totals for any submitted fingerprint (latest 50/30 days). `device.ts` hashes a browser-local UUID; it is an identifier, **not server-verified owner proof**. Returned order codes can be used with public `getOrderByCode`, which returns contact information and items. RLS cannot authenticate these service-role public reads.

Safe rollout requires server-issued owner proof rather than assuming a fingerprint is secret: a cryptographically random per-browser guest capability in a Secure/HttpOnly/SameSite cookie, server-side stored hash/session binding, and random per-order owner capability for detail/proof-upload access. New creation must bind the server cookie, not a submitted fingerprint; list/detail/upload handlers must verify that proof or a real signed-in order owner/admin. Existing guest history must be recovered only after verified ownership (e.g. email verification), **not grandfathered by fingerprint alone**. Additive storage/schema and a deliberate legacy recovery flow are needed; no code-only backward-compatible proof currently exists. No existing orders, tokens or secrets were altered.

### ICE/TURN: traced, unchanged, concrete rollout requirements
`screenshare.ts/warmIceServers` and installed `agent/renderer.js/warmIceServers` both perform unauthenticated GET `/api/public/ice-servers`; Agent warms at startup and every ten minutes. The route returns configured static TURN credentials or generates Cloudflare TURN credentials, with public fallback relay and CORS. Neither existing caller sends a bearer or device proof. Adding enforced authentication to that URL now would remove TURN for installed Agents and can break mobile/restricted-NAT connections.

Compatible future rollout: a versioned authenticated ICE endpoint; website callers attach the current staff bearer and server validates staff/approved-device access; Agent sends device ID plus its existing secret in a **request body/header, never URL**, validated read-only against approved registered device credentials. Issue short-lived TURN credentials after authorization, rate-limit issuance and avoid logs/cache of credentials. Keep STUN and `iceTransportPolicy:'all'`, and preserve existing TURN settings during rollout. The owner must explicitly authorize a compatible Agent release and verify installed-client adoption before restricting the legacy public endpoint. If using static coturn credentials, owner-side time-limited credential support is a separate secure provider task. No credentials, CORS paths, Agent version or provider settings were changed here.

### Follow-up verification
- Full suite: **45 test files / 348 tests passed**, final run 20:43:50 UTC start, 9.63 seconds. New tests cover 5201 customer orders, 201 selector shifts/1201 assignments, older unlinked P2P after 400 linked candidates, five concurrent wrong PINs, PIN replacement and bounded conflicts. The parallel-PIN test uses an isolated atomic conditional-write fixture; it is **not production PostgreSQL load testing**.
- Frozen install: 574 installs / 663 packages, no changes; `git diff --check` passed. Latest observed automatic compiler signal: **build OK, 20:43:31 UTC**. No standalone Fly production build or authenticated workflow was run.
- Live checks were SELECT-only. Production grants still preserve all four public Agent flows, and both claim RPCs remain non-executable by anon/authenticated. No SQL, migration, deployment, PR4 merge, secret/OAuth/infrastructure change or historical row/file deletion was performed.
- Follow-up source paths: `admin.functions.ts`, `work.server.ts`, `p2p-links.server.ts`, `pin-attempt.server.ts`, `customer-summary.server.ts`, their four new regression files (`customer-summary.server.test.ts`, `pin-concurrency.test.ts`, `shift-selector-completeness.test.ts`, `p2p-inbox-pagination.test.ts`), `shift-history.test.ts`, `src/lib/AGENTS.md`, this document and `roadmap.md`. Existing private-session/provider/Fly-artifact and retained-list gates remain open.

## Confirmed fixes
- EmployeeWorkView previously loaded up to six full transaction pages on every poll, then independently reloaded them for review badges. It now requests one server page, exposes all pages, and uses compact sequential server-side aggregation for full count/amount/EGP and entered-field badges. Closed-shift repeated polling is disabled; open-sheet fallback is 15 seconds with existing realtime and live sync preserved.
- Transaction kind and transfer direction are filtered before paging. Deterministic timestamp/id ordering, exact counts and out-of-range page recovery prevent blank or silently truncated lists. Manual sections have independent server pages; manual-card/history aggregations walk bounded pages sequentially without the former 500/4,000-row caps. Shift assignment counts no longer rely on one default-limited Data API response.
- Automatic monthly, count-threshold and empty-draft deletion paths are no-ops. Existing cycle/fresh-start eligibility, confirmation, provider-ID reconciliation and financial correction semantics are unchanged; no historical row was changed.
- Cairo day/week reports use IANA timezone rules instead of hardcoded UTC+3, including DST transition weeks. Bybit's UTC daily/monthly accounting windows remain unchanged.
- PIN lookup/attempt-save errors fail closed; first-time creation is insert-only to prevent concurrent replacement. PIN length, hashes, five-attempt lockout and server-only handover remain.
- Removed unused face/WebAuthn implementations and face RPC endpoints. No import/call sites remained outside those definitions. Kept historical generated schema, migrations and employee-faces storage; MediaPipe remains because HandControl still uses it. OKX/RedotPay remain removed, shared provider isolation retained.
- Email HTML measurement resets on each new message rather than reusing the previous message's ready/height state.
- Agent fallback request bodies are size-checked while streaming, retain the existing four-function allowlist and device secret contract. Card ingestion validates timestamps and bounds body bytes. No Agent package/version change.
- SSR diagnostics log structured name/code, not full provider errors; JSON responses are no-store, with nosniff and referrer headers. Existing CORS for external Agent/card callers is preserved.
- Security dependency patch pins are recorded in package.json/bun.lock; refreshed downloadable source excludes obsolete biometrics, repository metadata and generated outputs.

## Actual verification
- `bun install --frozen-lockfile`: succeeded, 574 installs / 663 packages, no changes in final run.
- `bunx vitest run --maxWorkers=4`: **41 files, 339 tests passed**, latest run 20:29 UTC, 9.33 seconds. Initial full run had a five-second lazy-import timeout; bounded workers and an explicit import-test timeout eliminated it without weakening assertions.
- Automatic compiler/typecheck: latest observed **build OK** at 20:28:50 UTC. Intermediate new type errors were corrected. `git diff --check` passed.
- A standalone Fly/Nitro `build:node` and standalone typecheck were **not run**: the editing environment requires its automatic compiler and prohibits manually running project builds/typechecks. Do not interpret automatic compilation as proof of the production Node artifact. Existing production verification scripts are unchanged.
- `security--dependency_scan`: **no known vulnerabilities in 62 production dependency packages** after final patches. This is a dependency result, not proof of absence of application vulnerabilities or intrusion.
- `node --check`: Agent main, preload, renderer and input passed; no Windows/Electron device execution performed.
- Playwright: homepage, shop, mail privacy and auth returned 200; desktop 1280×1800 and mobile 390×844 had no horizontal overflow or browser exceptions. Real catalog item added to cart and read back, then reached checkout customer-details step; **no order was submitted**. Signed-out /admin redirected to /auth. Agent config/version/build endpoints returned 200; unknown Agent RPC returned 404 and malformed heartbeat body returned 400.
- New regressions cover 1,401-row full totals/page 29, single-flight bounded aggregation, transfer filters, manual page offsets, preservation of history, PIN failure paths, body-byte limits, safe diagnostics/cache headers and Cairo winter/summer/DST query bounds. Existing Bybit/P2P/chat policy and correction regressions remain passing.

## Read-only production observations
- 70 public tables; RLS enabled on all 70. Read all public/storage policies; this does not by itself prove correct permissions on every path.
- Live exchange-key RPCs and work_claim_shift_for are service-role-only; old boolean work_claim_shift is not executable by anon/authenticated.
- Live enrollment codes require an existing admin, device management policies are admin-only, existing-device registration does not set approval, and enrollment requires an unused recent admin-created code. Agent register/pair_request/heartbeat/exchange_signals retain public execute **by design**, with device-secret validation inside the functions. No execute privileges were changed.
- Historical face/avatar/course/payment buckets are private. Bucket MIME/size limits were unset in this read; application upload restrictions do not substitute for all storage-policy validation.
- Ten deep-scan findings from 20 November remain in the scanner's prior report; several enrollment/key/PIN findings conflict with the current live definitions above. They were not blanket-marked fixed; re-scan and authenticate before closure. Order lookup using device ID remains an unresolved access-design finding. Leaked-password protection was previously reported disabled; no Auth settings were changed.

## Remaining release gates
1. Owner-side Fly Node production build/artifact boot and authenticated desktop/mobile checks. External/BYO Supabase sessions cannot be minted by this environment; no admin/employee login, PIN claim, handover, note save/read-back, chat send/upload/read acknowledgement or private mail read was verified here. Do not paste credentials into chat.
2. At least one hour of provider/scheduler observation for late reversal and confirmation latency, across all accounts, with production request timings. Unit tests do not prove production SLA or remove all performance risks. Compact totals still cost sequential reads on very long shifts; profile before adding an approved aggregate RPC/index.
3. Review remaining legacy capped list endpoints (shift selectors, pending/unlinked P2P and some admin/customer lists) and broad report aggregations under production scale. This pass fixed the main transaction/manual/transfer sheet paths; it did not certify every list as cursor-paged.
4. PIN attempt-counter and handover concurrency deserve an atomic SQL/RPC review. Current live singleton-open-shift index is present; concurrent claims and concurrent wrong-PIN updates were not transactionally load-tested. No database function was replaced in this turn.
5. Public ICE endpoint still exposes configured static TURN credentials and generates provider TURN credentials publicly. Keep existing screen sharing operational; resolving this needs a compatible admin/Agent caller-auth design and secure provider configuration, not blindly removing CORS/execute or rotating live secrets.
6. Confirm storage upload ownership/read policies for each active uploader and secure OAuth/TURN/scheduler environment configuration on Fly. Secret values were neither printed nor changed; presence in the sandbox does not establish production configuration. Google consent/provider approval and real mailbox sync require owner access.
7. Review manual SQL against live state, never run all historic scripts: 83 migration files and 31 manual SQL files include old resets/destructive commands and already-applied definitions. No automatic application is proposed. Historical roadmap migration/DNS/deletion actions are superseded by this request's preservation constraints.

## Remaining retired-feature references
No operational references remain in live src code/UI/config except generated Supabase archival table types. Historical schema migrations retain RedotPay functions and face/WebAuthn tables; archived plan and removal audit/memory/cleanup documents mention their history. Dependency hashes and binary bytes can contain coincidental substrings. Updated download contains current source plus archival SQL, not an instruction to execute historical migrations. No schema or storage cleanup is included.

## Changed files
See the committed `git show --stat` for exact line counts; paths changed in this candidate:

```text
package.json
bun.lock
roadmap.md
LAUNCH-READINESS-2026-11-21.md
selfhost/.env.example
selfhost/README.md
selfhost/VPS-CHECKLIST.md
public/dl/mag-pro1-src-9f3a2c.zip
src/components/admin/EmployeeWorkView.tsx
src/components/admin/MailMessageBody.tsx
src/lib/AGENTS.md
src/lib/bybit-presenter.test.ts
src/lib/cairo-calendar.ts
src/lib/cairo-calendar.test.ts
src/lib/history-preservation.test.ts
src/lib/http-safety.ts
src/lib/http-safety.test.ts
src/lib/limited-body.server.ts
src/lib/limited-body.server.test.ts
src/lib/monthly-cycle.server.ts
src/lib/read-pages.server.ts
src/lib/read-pages.server.test.ts
src/lib/retention.server.ts
src/lib/shift-section-notifications.ts
src/lib/shift-section-notifications.test.ts
src/lib/use-ledger-sync.ts
src/lib/use-work-realtime.ts
src/lib/work.functions.ts
src/lib/work.server.ts
src/lib/work-summary.ts
src/lib/work-launch-regression.test.ts
src/routes/[.]lovable.oauth.consent.tsx
src/routes/api/public/agent-rpc.$fn.ts
src/routes/api/public/card-transactions.ts
src/server.ts
src/start.ts
deleted: src/lib/face-mesh.ts
deleted: src/lib/work-client.ts
```