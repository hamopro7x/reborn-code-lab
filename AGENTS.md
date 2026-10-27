<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Production deploys run from deploy.ps1; when Windows blocks flyctl locally it pushes a `deploy-*` tag and `.github/workflows/deploy-fly.yml` deploys (needs the FLY_API_TOKEN repo secret) — so publishing never depends on the local Fly binary.

- Bybit ingestion has two paths: `syncAllRecent` (newest page per account, parallel, every tick) for real-time screens, and a background deep month walk (`runDeepSyncIfDue`, every few minutes). Why: walking full history per tick delayed new transactions by minutes.
- Every card-record outcome (ok/reversed/refund/failed) comes only from `cardRecordOutcome` in `bybit-spend.ts`, used by archive, ledger, shift sheet and spend totals; reversed rows are never a success status. Why: separate copies of the rule let reversed authorisations count as purchases.
- Hung checkout retries are detected only by `findHangReversals` in `bybit-spend.ts` (pending first attempt + same card/merchant/amount again within `HANG_RETRY_WINDOW_MS`), applied to spend, archive lists and the ledger. Why: Bybit's API keeps the voided first attempt as a plain pending purchase.
- Every storefront page and checkout state uses the shared site Header, with styling scoped to `.store-header` and the logo imported from a bundled asset; this keeps branding consistent without affecting staff areas or relying on external image availability.
- Storefront appearance is controlled by one root context and semantic CSS token overrides; read the device-local explicit choice after hydration, never infer it from OS settings, and keep staff palette overrides independent.
- Homepage banners and category rails switch to desktop composition at 1280px; smaller widths share the mobile composition to prevent tablet collisions, while forced banner-editor device previews remain unchanged.
- Employee previous-shift selection uses a controlled popover and only the existing admin-shared shift response; this preserves server access restrictions and keeps opening the menu separate from opening a shift.
- P2P assignment, selected-ended-shift consumption, and colour grouping use one service-role-only database transaction invoked after server authentication; partial saves must never report success and reused open shifts retain their existing group.
- Shift archiving is a soft-hide via `work_shifts.archived_at`: history excludes archived rows by default and offers an admin-only archived view through the same authenticated endpoint; missing-column fallback never labels unarchived records as archived. Only ended shifts can be archived — never delete records to tidy a list.

- TikTok coin auto-charge: website only queues jobs and shows QR/status (`tiktok_jobs`, `/api/public/tiktok-worker` with admin-generated token); the browser automation runs in `worker/tiktok-charger` on the VPS and card data lives only in its env. Why: workerd cannot run a browser and card data must never reach the site.
- Employee agent RPCs try the database directly, then fall back to `/api/public/agent-rpc/$fn` (allowlisted public agent functions only) on network failure; the agent unpairs only after repeated explicit heartbeat rejections. Why: one blocked route or one transient reply previously left every device offline.
- Mail uses direct Google OAuth per mailbox (`src/lib/mail/*`, `mail.functions.ts`), tokens AES-GCM encrypted in service-role-only `mail_account_secrets`; sync runs only from the secret-protected `/api/public/hooks/mail-sync` scheduler and imports only post-link history. Why: the Lovable connector secrets never reach Fly and site organization must never modify Gmail.
