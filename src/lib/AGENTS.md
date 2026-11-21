# Internal group boundaries

- Keep group ownership in the singleton group record and validate the owner's existing admin role for every privileged operation; generic admin status must not confer ownership.
- Group mutations use authenticated SQL RPCs with caller identity from auth.uid(), while private attachment upload/signing uses the existing server storage client only after membership checks; no new role or storage system is needed.
- Mandatory-read checks apply before new employee server-function access and use restrictive read policies for direct Data API reads; ongoing transaction saves and service-role/background assignments remain independent so messages never change shift state.
- Keep group SQL review-only under supabase/manual until the owner approves application; missing RPCs mean the feature is not installed, but operational errors never imply an empty unread list.
- Mandatory chat recipients are explicit and independent of ordinary mentions; preserve legacy receipts and refuse targeted sends until the reviewed RPC update is installed, preventing old broadcasts from targeting everyone.
- Sound uses the root gate's authenticated incoming-message cursor with an initial silent baseline and browser gesture unlock; generic Realtime changes must not chime because edits, votes and acknowledgments are not arrivals.
- Chat reads retain confirmed query data on background failure and retry with capped backoff; batch live refreshes without cancelling in-flight reads so outages do not erase the transcript.
- The ordinary unread divider uses an account-scoped device-local cursor and excludes self/deleted messages; it never changes server notifications or mandatory acknowledgments because it is presentation-only.
- Exempt only courses.functions.ts/checkDevice from the mandatory-read barrier while retaining its authentication and user-scoped device checks; otherwise pending chat reads can be cached as device rejection when the layout remounts.

# Launch boundaries
- Shift tables request one server page with deterministic ordering; full totals use compact sequential server reads, because client page fan-out repeats work and truncates history.
- Automatic cycle/retention/draft maintenance never deletes historical rows; cycle eligibility and archived storage remain independent.
- First-time PIN creation is insert-only; attempt updates compare hash/salt/counter/lock and retry bounded conflicts, preventing outages or concurrent writes from becoming false success.
- Shift selector history preserves its full-array numbering/colour contract through sequential pages and chunked ID filters; customer summaries aggregate all orders server-side without shipping order rows to the UI.
- P2P inbox candidate scans use timestamp/id cursors and filter linked orders before applying the explicit recent-inbox size, so linked newest pages cannot hide older unlinked orders.
- Public Agent RPC forwarding streams bounded request bytes and keeps its four-function allowlist and device-secret contract unchanged.
- SSR diagnostics use structured name/code only, because provider errors can contain secrets or customer data; JSON responses are never shared-cacheable.
- Default Fly-host rejection is centralized in production-host.ts with only the exact public GET/HEAD build-version exception; internal probes must remain usable without exposing pages or bypassing endpoint auth.