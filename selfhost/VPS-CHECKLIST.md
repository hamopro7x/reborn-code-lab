# MG Pro — application-only Fly.io/VPS release checklist

**Release scope: replace only the MG Pro application container on the existing target after separate deployment approval. This is not a Supabase or infrastructure setup guide.**

## Architecture and preservation (required)
- Production stays on the existing Supabase project **kcdsdaytrnzoiharmyxo**, URL `https://kcdsdaytrnzoiharmyxo.supabase.co`.
- Deploy only the application/runtime to the owner's existing Fly app `m-hamo` or VPS. Lovable is editor/agent/development preview only, not production hosting or Lovable Cloud.
- Keep existing Auth, users/UUIDs, Storage/buckets, avatars, archived employee-faces, Bybit accounts/credentials/ledger, shifts, PIN, Desktop Agent and all historical records unchanged.
- Supabase is already provisioned. Keep its Auth configuration, existing users, Storage buckets, database and provider credentials in place; no data transfer, user recreation or setup work belongs in this release.
- Keep the existing domain `mag-pro1.com`, DNS, SSL, proxy and Fly settings unchanged. Keep Google OAuth client, redirect URI and linked mailbox encryption configuration unchanged.
- No deployment, infrastructure changes or production writes are authorized by this checklist.

## 1) Review the application candidate
Review the committed source and `LAUNCH-READINESS-2026-11-21.md`. Keep existing deployment paths: root Dockerfile for Fly; `selfhost/Dockerfile` for VPS. Both target Nitro `node-server`, Node 22 and `.output/server/index.mjs`. Do not use a Lovable Publish action.

## 2) Secure app configuration — use already-existing credentials
Use the existing Fly runtime secrets or the existing VPS `selfhost/.env` in place. Verify configuration privately on the owner-controlled target, without displaying values. Do not overwrite the existing .env, rotate keys, relink providers or paste credentials into chat/logs. `.env.example` is a names-only reference, not a file to copy over production configuration.

The table separates public build inputs from server runtime configuration. Private service credentials are runtime-only; none belongs in VITE_* or Docker build arguments. If an existing required value is unavailable, leave release blocked until the owner supplies that same credential through the existing secure runtime configuration channel.

| Phase | Names | Existing source / requirement |
|---|---|---|
| Public build-time values only | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Same existing project's URL/ID and public key. Both Dockerfiles accept these as build arguments; browser configuration is built into the bundle. Never put a private key in VITE_* |
| App runtime Supabase | `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Existing project and server-side service credential. `SUPABASE_ANON_KEY` is the legacy public-key alias; preserve it where already configured |
| App runtime Node | `NODE_ENV=production`, `PORT=3000`, `HOST=0.0.0.0` | Docker defaults; Fly also sets `NITRO_PORT`/`NITRO_HOST` in its launcher. Build uses `NITRO_PRESET=node-server`, `NITRO_OUTPUT_DIR=.output` |
| Existing Bybit sync | `SYNC_HOOK_SECRET`; optional existing `BYBIT_API_KEY`, `BYBIT_API_SECRET` fallback | Do not extract/re-enter stored account keys or change the shared scheduler secret |
| Existing Gmail | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `MAIL_TOKEN_ENCRYPTION_KEY`; `MAIL_SYNC_SECRET` or existing `SYNC_HOOK_SECRET` fallback | Preserve existing OAuth configuration, redirect and token encryption key; do not relink mailboxes |
| Existing TURN (configured option only) | `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` **or** `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Preserve the currently configured relay path; no provider change or credential rotation |

Fly's launcher preserves legacy VITE_* public-key aliases at runtime; this does **not** rebuild/change the browser bundle. VPS launches Nitro directly and needs server runtime names. Runtime private secrets are supplied only at runtime, never image layers or client code. Both runtime and browser configuration must continue to identify the same existing Supabase project `kcdsdaytrnzoiharmyxo`.

## 3) Owner-side artifact verification before a separately authorized release
- Build the Node artifact on the owner-controlled build target without injecting runtime secrets into the build. Verify `.output/server/index.mjs` exists and the container binds port 3000.
- Check `/api/public/build-version` over the local/container interface; this measures HTTP liveness only, not database/provider readiness.
- The default `*.fly.dev` site remains blocked (410), except read-only GET/HEAD of the exact `/api/public/build-version` path for probes. Pages, RPCs and writes remain blocked there. Custom-domain requests and internal `127.0.0.1`, `localhost`, `app` requests are unaffected. Forwarded-host hints cannot bypass the restriction.
- VPS Compose already probes `http://127.0.0.1:3000/api/public/build-version`; its schedulers call `http://app:3000`. Fly's sync loop calls `127.0.0.1`. No host exception is needed for these scheduler calls.
- fly.toml currently declares no HTTP healthcheck; this change does not add one or alter Fly settings. Owner-side review of health/autostop/512MB memory and real Node boot remains required. Middleware tests/development HTTP checks are not production-container verification.

## 4) Preserve existing schedulers and service configuration
Fly has an existing in-process Bybit loop (`SYNC_INTERVAL_MS`); VPS Compose defines Bybit/mail scheduler containers (`SYNC_INTERVAL_SECONDS`, `SYNC_TIMEOUT_SECONDS`, `MAIL_SYNC_INTERVAL_SECONDS`). Preserve the active topology; do not start duplicate schedulers as part of a review.

Existing Cloud Jobs/Supabase jobs are existing service configuration, **not a requirement to use Lovable hosting**. Preserve every running job and the current Fly external Gmail scheduler. Review scheduler health without starting, stopping or reconfiguring any service. This checklist includes no infrastructure setup commands.

## 5) Remaining release gates
See the readiness report for retained list caps, atomic PIN/handover RPC design, guest-order ownership, compatible TURN auth, assets, authenticated staff/Agent/mail/chat flows and Bybit observation. All require their documented checks/permissions; none authorizes deleting history, moving Supabase or rotating secrets.
