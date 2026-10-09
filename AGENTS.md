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
- Store header styling is scoped to `.store-header`, with uploaded logo media referenced through asset pointers; this preserves other page palettes and existing navigation actions.
- Employee previous-shift selection uses a controlled popover and only the existing admin-shared shift response; this preserves server access restrictions and keeps opening the menu separate from opening a shift.
