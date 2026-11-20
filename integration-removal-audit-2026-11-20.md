# MG Pro — OKX removal audit (20 November 2026)
## Result

Removed the admin navigation entry, accepted panel key/search validation and saved-panel eligibility, rendering/imports, both components, server functions, provider HTTP/signing/key-storage/balance/history/sync helpers, four provider-only test files, installation SQL, old implementation plan, and obsolete roadmap tasks. Removed the background import from Bybit recent sync and the ledger-writer export used only by the deleted integration; Bybit's internal ledger persistence and assignment code are unchanged.

No SQL was run. Supabase production schema/data, Fly settings, deployment, Bybit accounts/keys/rows, ledger rows, shifts and employee workflows were not changed. Generic payment-method management and other integrations were not changed. The downloadable source ZIP has no integration implementation to remove; its remaining matches below are unrelated hash/image bytes, so the ZIP was left unchanged.

## Shared provider column retained

`listAccounts()` in `src/lib/bybit.server.ts` still filters shared accounts to Bybit/null-provider rows. `src/lib/account-labels.server.ts` still selects the discriminator to avoid labelling independently pending retired accounts as Bybit. The condition for dropping `bybit_accounts.provider` is therefore not met: leave it, `bybit_accounts_provider_check` and `bybit_accounts_provider_idx` unchanged. No deployed schema objects were altered. The existing production check may retain its retired-provider literal; that is schema history, not a live integration path.

The review-only owner cleanup checklist is `supabase/manual/retired_account_cleanup_plan.md`. It records the user-provided 1 account / 22 ledger rows / 12 assignments / 1 credential inventory (not independently verified), exact-UUID scoping, backup/dependency/cascade checks, transaction boundaries and preservation checks; it supplies no executable production deletion or schema-drop migration because row cleanup is separately managed by the owner.

## Checks

- `bunx vitest run src/lib/bybit*.test.ts src/lib/account-labels.server.test.ts src/lib/work-assign-settlement.test.ts src/lib/p2p*.test.ts`: **209 tests passed, 16 files**.
- Tests use local/mocked database requests and isolated SQL test engines; none connect to or modify Supabase production. New regression tests preserve visa labels, null/missing-column compatibility, provider isolation and account-scoped recent-sync credential requests.
- Automatic preview compilation: **build OK** (latest available entries reproduced below).
- `git diff --check`: passed before report generation; repeated before commit.
- Standalone full-production build/typecheck was **not run**: this environment manages compilation automatically and forbids manually invoking project builds/typechecks. Do not interpret build OK as a separate full-production build/typecheck.
- Authenticated production admin/employee UI was **not exercised**; no production session was used and no deployment occurred. Source and tests verify the removal, not a post-deploy production session.
- Content-route metadata inspected across the existing content routes; the admin leaf already has its own MG Pro title/description/social metadata and was preserved. No unrelated SEO changes.

## Exact files changed

Tracked updates/deletions (`M` modified, `D` deleted):

```text
D	.lovable/plan/استكمال-معاملات-okx-2026-11-11.md
M	AGENTS.md
M	mem/index.md
M	roadmap.md
D	src/components/admin/OkxHistoryTable.tsx
D	src/components/admin/OkxTab.tsx
M	src/lib/account-labels.server.ts
M	src/lib/bybit.server.ts
D	src/lib/okx-balances.server.test.ts
D	src/lib/okx-core.test.ts
D	src/lib/okx-core.ts
D	src/lib/okx-history.server.test.ts
D	src/lib/okx-history.test.ts
D	src/lib/okx-history.ts
D	src/lib/okx.functions.ts
D	src/lib/okx.server.ts
M	src/routes/_authenticated/admin.tsx
D	supabase/manual/okx_accounts.sql
```

Added files:

```text
mem/features/retired-account-integration.md
src/lib/account-labels.server.test.ts
src/lib/bybit-account-isolation.test.ts
supabase/manual/retired_account_cleanup_plan.md
integration-removal-audit-2026-11-20.md
```
## Exhaustive remaining-match inventory

Search: case-insensitive substring `okx` (covers `OKX`, `Okx`, and provider comparisons), across all repository files including hidden/ignored local files; ZIP contents inspected separately. Git object/history metadata and installed `node_modules` are excluded because they are not application repository source. No live source/UI/config matches remain. OAuth provider parameters, generic provider evidence, and the Bybit integration-key discriminator are unrelated and preserved.

This report itself contains audit-only provider names and deleted paths, deliberately excluded from the self-inventory to avoid recursive counting. The removal memory and review-only cleanup plan below are also intentional, non-executable references. No historical migration contains an OKX match. Cache references are ignored local generated history, not committed source; the **current** server-function resolver no longer references the removed functions, and the current client-entry no longer includes its panel key. No cache directory or unrelated hash/icon/image was modified just to force a literal zero search count.

Every remaining matching file is listed with its total substring occurrences and all matching text line numbers; line numbers/cache files may change as the local toolchain regenerates them.

| File | Occurrences | Text lines | Classification |
| --- | ---: | --- | --- |
| `.oj-cache/v1/code-cache/v8-15.0.245.2-rusty/74926dd79da58edd-esm.bin` | 3 | binary / filename only | Opaque ignored generated binary-cache byte matches; not application source |
| `.oj-cache/v1/code-cache/v8-15.0.245.2-rusty/a0de9a69d61ffa46-esm.bin` | 1 | binary / filename only | Opaque ignored generated binary-cache byte matches; not application source |
| `.oj-cache/v1/code-cache/v8-15.0.245.2-rusty/afb2b41f353acaad-esm.bin` | 1 | binary / filename only | Opaque ignored generated binary-cache byte matches; not application source |
| `.oj-cache/v1/deps/lucide-react.mjs` | 8 | 5090, 42822, 44316 | False positive: generated Lucide BookX icon exports |
| `.oj-cache/v1/start/client-chunks/admin-BpCIXHQs.js` | 254 | 57, 59, 60, 17345, 17346, 17347, 17348, 17349, 17350, 17351, 17352, 17353, 17355, 17356, 17357, 17358, 17359, 17360, 17361, 17362, 17363, 17522, 17523, 17524, 17525, 17527, 17528, 17530, 17536, 17553, 17556, 17559, 17567, 17574, 17578, 17579, 17589, 17599, 17621, 17624, 17647, 17655, 17662, 17664, 17666, 17678, 17695, 17697, 17702, 17711, 17714, 17728, 17738, 17752, 17761, 17770, 17780, 17805, 17814, 17822, 17825, 17838, 17854, 17857, 17885, 17888, 17890, 17892, 17894, 17896, 17897, 17899, 17900, 17905, 17910, 17911, 17912, 17913, 17919, 17924, 17927, 17928, 17929, 17930, 17936, 17950, 17951, 17959, 17968, 17974, 17977, 17986, 17990, 17993, 17996, 17999, 18010, 18013, 18014, 18021, 18041, 18044, 18062, 18065, 18077, 18078, 18085, 18086, 18095, 18108, 18115, 18124, 18138, 18151, 18165, 18166, 18168, 18170, 18179, 18183, 18186, 18189, 18196, 18199, 18208, 18226, 18233, 18236, 18252, 18255, 18278, 18281, 18288, 18296, 18300, 18310, 18320, 18324, 18327, 18340, 18349, 18363, 18385, 18388, 18406, 18409, 18410, 18413, 18414, 18417, 18421, 18437, 18438, 18439, 18444, 18448, 18451, 18457, 18465, 18482, 18485, 18503, 18504, 18512, 18515, 18518, 18527, 18540, 18547, 18555, 18558, 18562, 18566, 18574, 18583, 18597, 18626, 18631, 18641, 18651, 18661, 18671, 18686, 18706, 18720, 18726, 18729, 18742, 18751, 18752, 18785, 18789, 18791, 18793, 18794, 18806, 18810, 18812, 18816, 18830, 18836, 18850, 18857, 18871, 18878, 18891, 18893, 18895, 18911, 18913, 18929, 18932, 18960, 18961, 18969, 18973, 18975, 18977, 18990, 18995, 19004, 19007, 19041, 19042, 19043, 19044, 19047, 19049, 19051, 19052, 19054, 19055, 19060, 33959, 33960, 34460 | Historical ignored generated cache; not current source |
| `.oj-cache/v1/start/client-chunks/button-Rf-ZWebL.js` | 10 | 13598, 13616, 63175, 65186, 65187, 67082 | False positive: generated Lucide BookX icon exports |
| `.oj-cache/v1/start-bundle/blobs/5ac458dc4fdcc5bf3a52b356cd9a76d03a0db2d310fac1088fcb9dfe6dd52a14` | 10 | 13598, 13616, 63175, 65186, 65187, 67082 | False positive: generated Lucide BookX icon exports |
| `.oj-cache/v1/start-bundle/blobs/7fb8dbe8f9b375b30bdace12fb3dcf5fc2b3777f7f5ba5500fcb2e5e6175e1da` | 1 | 35232 | Historical ignored generated cache; not current source |
| `.oj-cache/v1/start-bundle/blobs/97111563b3ad3c7b0ef7d54d6eadfc99b616b2fd42bdf95e6dc967fa8652a01c` | 254 | 57, 59, 60, 17345, 17346, 17347, 17348, 17349, 17350, 17351, 17352, 17353, 17355, 17356, 17357, 17358, 17359, 17360, 17361, 17362, 17363, 17522, 17523, 17524, 17525, 17527, 17528, 17530, 17536, 17553, 17556, 17559, 17567, 17574, 17578, 17579, 17589, 17599, 17621, 17624, 17647, 17655, 17662, 17664, 17666, 17678, 17695, 17697, 17702, 17711, 17714, 17728, 17738, 17752, 17761, 17770, 17780, 17805, 17814, 17822, 17825, 17838, 17854, 17857, 17885, 17888, 17890, 17892, 17894, 17896, 17897, 17899, 17900, 17905, 17910, 17911, 17912, 17913, 17919, 17924, 17927, 17928, 17929, 17930, 17936, 17950, 17951, 17959, 17968, 17974, 17977, 17986, 17990, 17993, 17996, 17999, 18010, 18013, 18014, 18021, 18041, 18044, 18062, 18065, 18077, 18078, 18085, 18086, 18095, 18108, 18115, 18124, 18138, 18151, 18165, 18166, 18168, 18170, 18179, 18183, 18186, 18189, 18196, 18199, 18208, 18226, 18233, 18236, 18252, 18255, 18278, 18281, 18288, 18296, 18300, 18310, 18320, 18324, 18327, 18340, 18349, 18363, 18385, 18388, 18406, 18409, 18410, 18413, 18414, 18417, 18421, 18437, 18438, 18439, 18444, 18448, 18451, 18457, 18465, 18482, 18485, 18503, 18504, 18512, 18515, 18518, 18527, 18540, 18547, 18555, 18558, 18562, 18566, 18574, 18583, 18597, 18626, 18631, 18641, 18651, 18661, 18671, 18686, 18706, 18720, 18726, 18729, 18742, 18751, 18752, 18785, 18789, 18791, 18793, 18794, 18806, 18810, 18812, 18816, 18830, 18836, 18850, 18857, 18871, 18878, 18891, 18893, 18895, 18911, 18913, 18929, 18932, 18960, 18961, 18969, 18973, 18975, 18977, 18990, 18995, 19004, 19007, 19041, 19042, 19043, 19044, 19047, 19049, 19051, 19052, 19054, 19055, 19060, 33959, 33960, 34460 | Historical ignored generated cache; not current source |
| `.oj-cache/v1/start-bundle/blobs/b89347423bddb9cf532abb64c3ddbe167a9bab656e0cc77b6563b5b363183a75` | 1 | 35232 | Historical ignored generated cache; not current source |
| `.oj-cache/v1/start-bundle/d48705a496169ed643ef8742badb7ebcbe168f4678179568139e8db9d914ccd1/closure.json` | 3 | 1 | Historical ignored generated cache; not current source |
| `.oj-cache/v1/start-bundle/d48705a496169ed643ef8742badb7ebcbe168f4678179568139e8db9d914ccd1/memo.json` | 3 | 1 | Historical ignored generated cache; not current source |
| `.oj-cache/v1/start-bundle/da279f747aafcd80bcde499cc1ed2c5de98ef854bc65438b779519e472e88e57/closure.json` | 3 | 1 | Historical ignored generated cache; not current source |
| `.oj-cache/v1/start-bundle/da279f747aafcd80bcde499cc1ed2c5de98ef854bc65438b779519e472e88e57/memo.json` | 3 | 1 | Historical ignored generated cache; not current source |
| `.oj-cache/v1/start-codegen/server-fn/04ff086ec85da16e8d1208b297ed2663c6e5becf4e41a63cece18ecf8fb25a2e/server-fn-resolver.mjs` | 15 | 19, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231 | Historical ignored generated cache; not current source |
| `agent/bun.lock` | 1 | 198 | False positive: dependency integrity hash |
| `agent/package-lock.json` | 1 | 1788 | False positive: dependency integrity hash |
| `bun.lock` | 3 | 161, 743, 975 | False positive: dependency integrity hash |
| `mem/features/retired-account-integration.md` | 3 | 3, 6 | Removal instruction / audit-only |
| `mem/index.md` | 1 | 13 | Removal instruction / audit-only |
| `src/assets/icon-employees.png` | 3 | binary / filename only | False positive: bytes inside unchanged image |
| `supabase/manual/retired_account_cleanup_plan.md` | 3 | 5, 7, 28 | Review-only cleanup plan; not applied |

### Source archive entries

| Archive entry | Occurrences | Text lines | Classification |
| --- | ---: | --- | --- |
| `public/dl/mag-pro1-src-9f3a2c.zip :: agent/bun.lock` | 1 | 198 | False positive: dependency integrity hash |
| `public/dl/mag-pro1-src-9f3a2c.zip :: agent/package-lock.json` | 1 | 1788 | False positive: dependency integrity hash |
| `public/dl/mag-pro1-src-9f3a2c.zip :: bun.lock` | 3 | 158, 740, 972 | False positive: dependency integrity hash |
| `public/dl/mag-pro1-src-9f3a2c.zip :: src/assets/icon-employees.png` | 3 | binary / filename only | False positive: unchanged image bytes |

## Latest automatic build log

```text

=== build 2026-11-20T22:46:44Z ===
build OK

=== build 2026-11-20T22:46:55Z ===
build OK

=== build 2026-11-20T22:47:18Z ===
build OK

=== build 2026-11-20T22:48:00Z ===
build OK
```
