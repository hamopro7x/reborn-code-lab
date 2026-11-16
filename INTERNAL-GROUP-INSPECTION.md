# MG Pro internal group — pre-implementation inspection

Date: 2026-11-16 UTC. Status: blocked on owner identification; no application changes, production writes, bucket changes, SQL execution, or deployment.

## Verified existing systems

- Authentication: the managed `_authenticated` layout gates signed-in routes. `requireSupabaseAuth` validates bearer claims and supplies the caller-scoped Supabase client. `src/start.ts` already registers `attachSupabaseAuth`.
- Roles: live `public.user_roles` contains one admin and three employees. All permissions objects are empty. There is no main-admin/owner column or permission. Existing server administration checks the `admin` role, not a separate owner identity.
- Role policies: authenticated users read their own roles; admins read/manage roles through `private.is_admin`. `private.has_role`, `private.is_admin`, and `private.is_staff` are security-definer functions backed by `public.user_roles`.
- Staff navigation: `src/routes/_authenticated/admin.tsx` uses panel navigation and the existing Arabic RTL sidebar. Employee base panels include orders, courses, worksheet, and mail; other panels are controlled by shared settings.
- Realtime: `GlobalRealtime` uses the shared query-key map, batches refreshes, preserves in-flight reads, and cleans up subscriptions. Live publication currently includes mail accounts/messages/notifications and P2P shift links.
- Notifications: `admin_notifications` is shared staff-readable and staff-updatable, with one `read_at` per notification. It cannot by itself represent independent per-employee mention delivery or mandatory-read acknowledgments.
- Storage: seven existing private buckets were observed. No `storage.objects` policies were returned by the live policy query. Existing server upload/signed URL patterns can be reused; no bucket was created or changed.
- No internal group/message tables were found in the inspected public schema. Existing `mail_messages` belongs to Gmail and must remain separate.

## Decision required before implementation

The requested owner-only group-state and deletion powers cannot safely be mapped to the generic `admin` role: doing so would also give those powers to future admins. Having a single admin today does not establish a persistent owner rule.

Confirm whether the current admin account should be the group's fixed owner, validated against the existing admin role on the server. This would be group ownership, not a new parallel role system. Do not infer ownership from account creation time, email, client storage, or the first user opening the group.

Implementation is paused at this decision, as requested. No feature SQL has been authored yet. After confirmation, the review-only design must also make the mandatory-read gate server-backed across employee site access while keeping background processing, shift state, incoming assignments, P2P history, and Gmail behavior unchanged.

## Files and verification

- Added this inspection report and the task/blocker to `roadmap.md`.
- Source inspection and read-only live schema/policy queries completed.
- Feature tests, authenticated end-to-end checks, and feature build verification have not run: implementation has not started.
- No migration, production data, Supabase configuration, Gmail/OAuth, or deployment was changed.