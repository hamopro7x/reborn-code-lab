# MG Pro internal group — pre-implementation inspection

Date: 2026-11-16 UTC. Status: implementation prepared after owner confirmation; no production writes, bucket changes, SQL execution on Supabase, or deployment.

## Verified existing systems

- Authentication: the managed `_authenticated` layout gates signed-in routes. `requireSupabaseAuth` validates bearer claims and supplies the caller-scoped Supabase client. `src/start.ts` already registers `attachSupabaseAuth`.
- Roles: live `public.user_roles` contains one admin and three employees. All permissions objects are empty. There is no main-admin/owner column or permission. Existing server administration checks the `admin` role, not a separate owner identity.
- Role policies: authenticated users read their own roles; admins read/manage roles through `private.is_admin`. `private.has_role`, `private.is_admin`, and `private.is_staff` are security-definer functions backed by `public.user_roles`.
- Staff navigation: `src/routes/_authenticated/admin.tsx` uses panel navigation and the existing Arabic RTL sidebar. Employee base panels include orders, courses, worksheet, and mail; other panels are controlled by shared settings.
- Realtime: `GlobalRealtime` uses the shared query-key map, batches refreshes, preserves in-flight reads, and cleans up subscriptions. Live publication currently includes mail accounts/messages/notifications and P2P shift links.
- Notifications: `admin_notifications` is shared staff-readable and staff-updatable, with one `read_at` per notification. It cannot by itself represent independent per-employee mention delivery or mandatory-read acknowledgments.
- Storage: seven existing private buckets were observed. No `storage.objects` policies were returned by the live policy query. Existing server upload/signed URL patterns can be reused; no bucket was created or changed.
- No internal group/message tables were found in the inspected public schema. Existing `mail_messages` belongs to Gmail and must remain separate.

## Confirmed owner decision

The requested owner-only group-state and deletion powers cannot safely be mapped to the generic `admin` role: doing so would also give those powers to future admins. Having a single admin today does not establish a persistent owner rule.

The user confirmed the current sole admin as the principal owner. Review-only SQL checks that exactly one distinct admin exists at application time, otherwise aborts before choosing anyone. It stores a fixed group owner and does not grant future admins ownership. Every state/delete/hide action requires both this identity and the existing admin role.

## Implemented behavior

- One Arabic RTL group panel inside existing staff navigation. Open/closed state is owner-controlled; all admins can send while closed, employees retain read access.
- Text and HTTP(S) links, copy action, inline images/video/audio, private downloadable documents, device audio upload and live microphone recording. Upload errors preserve the draft. No pinning.
- Employee mention selection and admin-only @everyone; recipient membership is validated atomically in SQL. Recipient notifications link to the original message, including older messages outside the latest page.
- Mandatory employee receipts are created in the send transaction, survive offline sessions, and record idempotent acknowledgment timestamps. Admin receipt display shows each recipient and their timestamp.
- A root-mounted full-screen read dialog uses server status, traps focus, makes underlying content inert without unmounting it, and cannot be dismissed. Failed status reads remain blocked. Realtime refreshes the existing shared query map; 15-second backed-off polling is a fallback.
- Global server-function access checks reject new employee access while blocked. The four existing work transaction-save functions remain exempt to finish ongoing saves. Public scheduler/agent routes and service-role processing are not intercepted. SQL adds restrictive SELECT guards to existing staff work/mail tables where RLS is already enabled; it does not replace existing policies or mutate records. Review this carefully before applying, because these guards intentionally suppress direct employee reads while unread.
- Own-message text editing is enforced within one hour; no editing of others' messages. Edited label and previous full record stored in internal audit.
- Only the fixed owner can hide a message personally or soft-delete for everyone. Raw message SELECT is revoked from authenticated users: the read RPC returns deletion tombstones without old body/attachments. Audit versions are owner-only.
- Single/multiple-option polls validate options and store one unique ballot per user with time, counts, percentages and admin-visible voter names. Repeat voting is rejected. Poll creation obeys group send state.
- History uses timestamp + ID cursor so messages sharing a timestamp are not lost.

## Review-only SQL and attachment defaults

`supabase/manual/internal_group.sql` is a single additive transaction with explicit table grants, RLS, authenticated mutation/read/status RPCs, private audit, and the existing Realtime publication change signal. It is NOT applied. It fails if owner bootstrap is ambiguous. It is a one-time migration, not a rerunnable script.

Reuses private `site-assets` with opaque `staff-chat/<user>/<uuid>` keys. No bucket or bucket setting was changed. Server checks actual bytes, MIME/extension agreement, signatures for supported media/document containers, executable headers, and HTML/SVG/script prefixes. Accepted formats: JPEG/PNG/GIF/WebP, MP4/WebM/MOV, MP3/WAV/OGG/M4A, PDF/TXT/CSV, DOCX/XLSX/PPTX, ZIP. Default limits: 25 MiB per attachment, 10 per message, 10,000 text characters, 2–20 poll options. Signed reads expire after five minutes; documents/archives are download-only, never embedded HTML or executed. This is not an antivirus scanner; downloaded archive contents must not be trusted. Unsent or failed attachment reservations are retained rather than introducing destructive cleanup.

Before later application: owner takes backup, reviews singleton owner check and restrictive guards, verifies the existing private bucket's project size limit accepts 25 MiB, then applies the reviewed SQL. No manual data rewriting, Gmail/OAuth changes, or deployment is required or performed in this task. Install SQL before serving the new feature to real users.

## Files and verification

- UI: `StaffChat.tsx`, `StaffChatMessage.tsx`, `StaffChatGate.tsx` under `src/components/admin`.
- Server/rules: `chat.functions.ts`, `chat.server.ts`, `chat-access.ts`, `chat-access.server.ts`, `chat-access-rules.ts`, `chat-rules.ts` under `src/lib`; directory architecture rules in `src/lib/AGENTS.md`.
- Integration: `src/start.ts`, `src/lib/realtime/tables.ts`, `src/routes/__root.tsx`, `src/routes/_authenticated/admin.tsx`.
- Tests: `chat-policy.test.ts`, `chat-rules.test.ts`, `chat-access-rules.test.ts`; local PGlite database only, with real SQL roles/RLS.
- 55 tests passed in eight files, including 25 group-specific cases and existing P2P, Bybit shift counts, EGP sum and refresh regression tests. Latest automatic build log: build OK.
- Public browser checks: home renders without mandatory dialog/errors; signed-out group link redirects to `/auth?next=%2Fadmin%3Fpanel%3Dchat`; mobile has no horizontal overflow. Message + image + poll presentation was separately checked with an isolated local fixture, not a real account.
- Authenticated end-to-end send/record/upload/mention/read barrier checks remain UNVERIFIED: external unmanaged Supabase supplies no test session, and the SQL is deliberately not installed. Local policy tests and isolated presentation checks are not a substitute for that flow. Pending owner review/application followed by real owner + employee checks.
- No production data, Supabase configuration, Gmail/OAuth, or deployment was changed.