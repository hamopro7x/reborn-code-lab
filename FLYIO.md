# MG Pro — existing Fly.io production target

Production is the owner's self-hosted Fly.io/VPS Node deployment, not Lovable hosting. Lovable provides development editing/agent/preview only. The existing Fly app is `m-hamo`, with domain `mag-pro1.com` and current Supabase project/services. Do not create another Fly app, database or domain.

## Existing launch path
- Root `Dockerfile`: Bun lockfile build, explicit Nitro `node-server` preset/output, Node 22 runtime.
- Runtime CMD: `node scripts/fly-start.mjs`; bind port 3000 on 0.0.0.0, matching fly.toml internal_port.
- Build artifacts: `.output/server/index.mjs` plus `.output/public`; existing `verify-node-build.mjs` checks entry/client remnants, not a real HTTP boot.
- Website deployments, **only after separate release approval**, use the existing owner `deploy.ps1` workflow. Never release/bump the Desktop Agent without a separate explicit request.

## Environment
Only public VITE_SUPABASE_* variables belong in build arguments. Existing SUPABASE_* server secrets and scheduler/Google/mail/TURN credentials are runtime-only. Do not rotate, print or add production secrets as an audit action. Preserve the existing database identity checks and encrypted mailbox data.

## Owner-side verification gates
1. Build/boot the actual Node container outside the development sandbox; verify listening port, `/api/public/build-version`, build identity, private authenticated reads and error handling.
2. Assess fly.toml's current 512MB/shared CPU, automatic stop/start and zero minimum-running Machines against the always-on Bybit scheduler requirement. No machine sizing/autostop configuration was changed here.
3. fly.toml has no explicit HTTP healthcheck. Review an appropriate existing build-version/liveness check and startup grace interval before any separately authorized configuration change. HTTP liveness does not prove DB/provider readiness.
4. Fly launcher runs a secret-protected local Bybit loop; verify no duplicate external loop and confirm mail scheduling separately. The default `.fly.dev` hostname is intentionally rejected by application middleware; use the existing custom domain or local container for verification, not an old fly.dev cron example.
5. Confirm OAuth callback, TURN credentials, storage ownership and protected staff/PIN/Agent flows without changing any secrets or existing device registration.

No Fly deployment, Lovable publishing, DNS/domain change or production database write is part of release-readiness work. See `selfhost/README.md` and `LAUNCH-READINESS-2026-11-21.md` for exact blockers and results. Historical platform cost/free-tier estimates are not current billing evidence.
