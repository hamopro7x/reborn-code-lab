# MG Pro — existing self-hosted production

MG Pro runs only on the owner's Fly.io/VPS Node deployment with the **existing Supabase project `kcdsdaytrnzoiharmyxo` and its Auth/Storage/services**. Lovable is the code editor/agent/development preview only, never production hosting or Lovable Cloud. Keep development integration; do not publish to Lovable.

## Current targets
- Fly app: `m-hamo`, existing domain `mag-pro1.com`, root Dockerfile, port 3000.
- VPS: `selfhost/Dockerfile` and `selfhost/docker-compose.yml`, Node 22 runtime, app bound through `127.0.0.1:3000` behind the existing proxy.
- Both build the Nitro `node-server` artifact under `.output`; no Worker runtime is a production target.
- Preserve Supabase account/project/user UUIDs, credentials, storage and all historical records. Do not create another Supabase project, export/import/migrate the database, copy auth.users, move storage buckets, replay migrations, rotate/re-enter provider credentials or change DNS as launch preparation. Legacy migration utilities are excluded from this release. See `VPS-CHECKLIST.md` for the application-only checklist.

## Build and runtime separation
Public build arguments: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. The current browser client is pinned to the existing Supabase project.

Server runtime credentials: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (legacy `SUPABASE_ANON_KEY` alias), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`. Private keys must never use VITE_* names. Compose supplies runtime variables through its existing `.env` file; Fly supplies its existing runtime secrets. The Docker build must not COPY .env or runtime secrets into any image stage. `.dockerignore` excludes them.

Do not overwrite the existing VPS .env from the example, generate new secrets or reconfigure/relink OAuth. Verify the existing securely supplied values in place; missing values require secure owner-side configuration, never a new project. Runtime-only service variables include existing `SYNC_HOOK_SECRET`, `BYBIT_API_KEY`/`BYBIT_API_SECRET` fallback; `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`/`GOOGLE_OAUTH_REDIRECT_URI`; `MAIL_TOKEN_ENCRYPTION_KEY`; `MAIL_SYNC_SECRET` (falls back to `SYNC_HOOK_SECRET`); and either `CLOUDFLARE_TURN_KEY_ID`/`CLOUDFLARE_TURN_API_TOKEN` or `TURN_URLS`/`TURN_USERNAME`/`TURN_CREDENTIAL`. Review `selfhost/.env.example` and `MAIL_SETUP.md` without rotating or printing any existing secret. Do not change mailbox token encryption keys.

## Node artifact verification — owner-side release gate
The production build must execute outside the development sandbox with `NITRO_PRESET=node-server` and `NITRO_OUTPUT_DIR=.output` (already set by both Dockerfiles/build:node). Review and run the existing production build verification on the owner-controlled target before any deployment. Startup must find `.output/server/index.mjs` and bind `0.0.0.0:3000`; `scripts/start.mjs` refuses to rebuild a missing artifact in production.

The editing environment's automatic compiler and launcher fixture tests do **not** certify this artifact. No real Fly/VPS production container build/boot was run during the audit.

## Schedulers and health
- Root Fly image launches `scripts/fly-start.mjs`, which validates runtime DB configuration, imports Nitro and runs a bounded local Bybit loop. The script preserves its existing transient-database fallback and secret behavior.
- VPS image launches Nitro directly. Compose runs separate Bybit and Gmail scheduler containers; do not also enable a duplicate in-process scheduler there.
- Compose healthcheck GETs `/api/public/build-version` with a ten-second timeout and forty-second startup allowance. It proves HTTP availability only, not database/provider readiness or version agreement.
- fly.toml currently has no explicit HTTP healthcheck, uses 512MB/shared CPU and may stop all Machines (`min_machines_running=0`). Owner must assess continuous scheduler availability, warm-start latency and memory under real load; this audit did not change Fly settings.
- The Fly launcher has no in-process Gmail loop; verify the existing external mail scheduler on the actual target. Missing secure scheduler configuration remains an owner-side gate.
- Sync logs record status only, not DB/provider response bodies. HTTP 200 with `{ok:false}` still needs investigation; current shell loops judge HTTP status, unlike the Fly loop which also checks `ok`.

### Custom-domain restriction and jobs
The default `*.fly.dev` hostname stays closed with 410 for pages, RPCs and writes. Only GET/HEAD of the exact already-public `/api/public/build-version` path is permitted for liveness probes. Custom-domain and internal `127.0.0.1`, `localhost`, `app` requests stay unrestricted by this hostname rule; existing endpoint authorization still applies. Tests cover these cases and reject forwarded-host bypass. No Fly healthcheck/settings change is made; real container/target probes remain an owner-side gate.

Existing Cloud Jobs/Supabase jobs are not Lovable-hosting requirements. Do not stop, replace or reconfigure them during release preparation. Fly uses `SYNC_INTERVAL_MS`; VPS uses `SYNC_INTERVAL_SECONDS`/`SYNC_TIMEOUT_SECONDS` and `MAIL_SYNC_INTERVAL_SECONDS`. Preserve active jobs and prevent duplicate scheduler activation. Existing Gmail external scheduling must be verified, not recreated.

## Existing proxy and storage
Keep existing DNS/domain/SSL and proxy settings. nginx.conf is a reference, not an instruction to replace production configuration. Its upload limit and timeout must be verified against real attachment/course workflows.

Keep `avatars`, `employee-faces` and all other storage/history intact. Face records remain archival and PIN remains operational.

## Remaining launch risks
See `LAUNCH-READINESS-2026-11-21.md`: retained capped lists, PIN/claim transaction gap, guest-order owner proof, compatible TURN authorization, authenticated staff/Agent/mail/chat checks and one-hour Bybit observation remain in scope. No deployment, SQL, OAuth or secret change is authorized by this document.
