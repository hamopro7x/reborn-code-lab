# MG Pro — application-only Fly.io/VPS release checklist

## Architecture and preservation (required)
- Production stays on the existing Supabase project **kcdsdaytrnzoiharmyxo**, URL `https://kcdsdaytrnzoiharmyxo.supabase.co`.
- Deploy only the application/runtime to the owner's existing Fly app `m-hamo` or VPS. Lovable is editor/agent/development preview only, not production hosting or Lovable Cloud.
- Keep existing Auth, users/UUIDs, Storage/buckets, avatars, archived employee-faces, Bybit accounts/credentials/ledger, shifts, PIN, Desktop Agent and all historical records unchanged.
- Do not create a Supabase project, export/import/migrate the database, copy auth.users, move buckets, replay migrations, rotate credentials or reconfigure OAuth. The legacy export/import/storage/migration utilities are **not part of this release**.
- No deployment, infrastructure changes or production writes are authorized by this checklist. Existing domain/DNS/proxy/Fly settings remain untouched.

## 1) Review the application candidate
Review the committed source and `LAUNCH-READINESS-2026-11-21.md`. Keep existing deployment paths: root Dockerfile for Fly; `selfhost/Dockerfile` for VPS. Both target Nitro `node-server`, Node 22 and `.output/server/index.mjs`. Do not use a Lovable Publish action.

## 2) Verify existing configuration securely — do not recreate it
Use the existing Fly runtime secrets or the existing VPS `selfhost/.env` in place. Do not overwrite it by copying `.env.example`, generate replacement secrets or paste values into chat/logs. The example lists names, not a new-project setup procedure.

| Phase | Names | Existing source / requirement |
|---|---|---|
| Public build-time values only | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Same existing project's URL/ID and public key. Both Dockerfiles accept these as build arguments; browser configuration is built into the bundle. Never put a private key in VITE_* |
| App runtime Supabase | `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Existing project and server-side service credential. `SUPABASE_ANON_KEY` is the legacy public-key alias; preserve it where already configured |
| App runtime Node | `NODE_ENV=production`, `PORT=3000`, `HOST=0.0.0.0` | Docker defaults; Fly also sets `NITRO_PORT`/`NITRO_HOST` in its launcher. Build uses `NITRO_PRESET=node-server`, `NITRO_OUTPUT_DIR=.output` |
| Existing Bybit sync | `SYNC_HOOK_SECRET`; optional existing `BYBIT_API_KEY`, `BYBIT_API_SECRET` fallback | Do not extract/re-enter stored account keys or change the shared scheduler secret |
| Existing Gmail | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `MAIL_TOKEN_ENCRYPTION_KEY`; `MAIL_SYNC_SECRET` or existing `SYNC_HOOK_SECRET` fallback | Preserve existing OAuth configuration, redirect and token encryption key; do not relink mailboxes |
| Existing TURN (configured option only) | `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` **or** `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Preserve the currently configured relay path; no provider change or credential rotation |

Fly's launcher preserves legacy VITE_* public-key aliases at runtime; this does **not** rebuild/change the browser bundle. VPS launches Nitro directly and needs server runtime names. Runtime private secrets are supplied only at runtime, never Docker build arguments, image layers or client code. Missing existing values need secure owner-side provisioning, not a new Supabase project.

## 3) Owner-side artifact verification before a separately authorized release
- Build the Node artifact on the owner-controlled build target without injecting runtime secrets into the build. Verify `.output/server/index.mjs` exists and the container binds port 3000.
- Check `/api/public/build-version` over the local/container interface; this measures HTTP liveness only, not database/provider readiness.
- The default `*.fly.dev` site remains blocked (410), except read-only GET/HEAD of the exact `/api/public/build-version` path for probes. Pages, RPCs and writes remain blocked there. Custom-domain requests and internal `127.0.0.1`, `localhost`, `app` requests are unaffected. Forwarded-host hints cannot bypass the restriction.
- VPS Compose already probes `http://127.0.0.1:3000/api/public/build-version`; its schedulers call `http://app:3000`. Fly's sync loop calls `127.0.0.1`. No host exception is needed for these scheduler calls.
- fly.toml currently declares no HTTP healthcheck; this change does not add one or alter Fly settings. Owner-side review of health/autostop/512MB memory and real Node boot remains required. Middleware tests/development HTTP checks are not production-container verification.

## 4) Preserve existing schedulers and service configuration
Fly has an existing in-process Bybit loop (`SYNC_INTERVAL_MS`); VPS Compose defines Bybit/mail scheduler containers (`SYNC_INTERVAL_SECONDS`, `SYNC_TIMEOUT_SECONDS`, `MAIL_SYNC_INTERVAL_SECONDS`). Preserve the active topology; do not start duplicate schedulers as part of a review.

Any references to Cloud Jobs or older cloud schedulers refer to legacy/existing configuration, **not a requirement to use Lovable hosting**. Do not stop, recreate, move or modify any running job, including Supabase jobs. Verify the existing Fly external Gmail scheduler owner-side without changing it. Do not execute setup-vps.sh, nginx replacement, certbot, DNS changes, backup/export/import or migration utilities during this audit.

## 5) Remaining release gates
See the readiness report for retained list caps, atomic PIN/handover RPC design, guest-order ownership, compatible TURN auth, assets, authenticated staff/Agent/mail/chat flows and Bybit observation. All require their documented checks/permissions; none authorizes deleting history, moving Supabase or rotating secrets.
