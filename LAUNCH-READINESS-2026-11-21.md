# MG Pro — launch candidate, 21 November 2026

## Status
Code fixes implemented, not deployed. This is **not yet a certified production-ready release**: Fly production artifact execution, authenticated staff flows, provider observation and the items below remain release gates. No production SQL, data writes, secret rotation, Fly/DNS changes or Agent release occurred.

Preview: https://id-preview--335637d3-bc9b-407f-9e44-b28bda5c78dc.lovable.app

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