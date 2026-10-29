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
- Spend never sums an authorisation and its settlement: a side 3/7 settlement consumes one same-card same-amount authorisation within `SETTLEMENT_WINDOW_MS` (canonicalize). Why: Bybit gives them different orderNo/txnId.
- Hung checkout retries are detected only by `findHangReversals` in `bybit-spend.ts` (pending first attempt + same card/merchant/amount again within `HANG_RETRY_WINDOW_MS`), applied to spend, archive lists and the ledger. Why: Bybit's API keeps the voided first attempt as a plain pending purchase.
- Separate Bybit reversal records (side 2 / tradeStatus 3) void an authorisation only via `findLinkedReversals` (same account + same orderNo/txnId; when Bybit gives the side-2 record its own ids, the closest earlier authorisation on the same card for the same amount within `REVERSAL_LINK_WINDOW_MS`); the archive write marks the purchase `detail.linkedReversal` and a stored explicit reversal is never downgraded by a later sync. Why: reversals can arrive as their own record or as an update, and resyncs must not resurrect success.
- Every storefront page and checkout state uses the shared site Header, with styling scoped to `.store-header` and the logo imported from a bundled asset; this keeps branding consistent without affecting staff areas or relying on external image availability.
- Storefront appearance is controlled by one root context and semantic CSS token overrides; read the device-local explicit choice after hydration, never infer it from OS settings, and keep staff palette overrides independent.
- Homepage banners and category rails switch to desktop composition at 1280px; smaller widths share the mobile composition to prevent tablet collisions, while forced banner-editor device previews remain unchanged.
- Employee previous-shift selection uses a controlled popover and only the existing admin-shared shift response; this preserves server access restrictions and keeps opening the menu separate from opening a shift.
- P2P assignment, selected-ended-shift consumption, and colour grouping use one service-role-only database transaction invoked after server authentication; partial saves must never report success and reused open shifts retain their existing group.
- Shift archiving is a soft-hide via `work_shifts.archived_at`: history excludes archived rows by default and offers an admin-only archived view through the same authenticated endpoint; missing-column fallback never labels unarchived records as archived. Only ended shifts can be archived — never delete records to tidy a list.

- TikTok coin auto-charge: website only queues jobs and shows QR/status (`tiktok_jobs`, `/api/public/tiktok-worker` with admin-generated token); the browser automation runs in `worker/tiktok-charger` on the VPS and card data lives only in its env. Why: workerd cannot run a browser and card data must never reach the site.
- Employee agent RPCs try the database directly, then fall back to `/api/public/agent-rpc/$fn` (allowlisted public agent functions only) on network failure; the agent unpairs only after repeated explicit heartbeat rejections. Why: one blocked route or one transient reply previously left every device offline.
- Mail uses direct Google OAuth per mailbox (`src/lib/mail/*`, `mail.functions.ts`), tokens AES-GCM encrypted in service-role-only `mail_account_secrets`; sync runs only from the secret-protected `/api/public/hooks/mail-sync` scheduler and imports only post-link history. Why: the Lovable connector secrets never reach Fly and site organization must never modify Gmail.
- Mail lists share a presentation-only RTL row with fixed avatar, text and metadata tracks; isolate text direction inside each track so bilingual content cannot move controls.
- Every Bybit card-purchase label, colour and tab filter comes only from `cardPurchasePresenter`/`cardPurchaseGroup` in `bybit-spend.ts` (success+pending → «ناجحة», failed/declined/reversed → «فاشلة», refund → «مسترد»); the archive page classifies the whole cycle before paging so counts match rows. Why: per-screen label copies drifted apart. P2P/deposit labels stay separate.
- All Bybit transaction reads, writes, cached responses and spend windows use the effective cycle from monthly-cycle.server.ts; filter provider results before returning them. Why: persistence-only cutoff checks let deleted history reappear in individual accounts.
- Every card ingestion path mirrors persisted account-scoped rows into the central ledger and assigns the open shift immediately per account; recent asset sync has a separate in-flight key and starts after the card pass, never blocking card polling or visible reads. Why: waiting for asset APIs and all accounts delayed shift visibility and locked subsequent card ticks. Visible ledger reads never await purge.
