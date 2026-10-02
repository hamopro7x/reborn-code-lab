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
