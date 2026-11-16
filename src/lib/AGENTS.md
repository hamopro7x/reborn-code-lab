# Internal group boundaries

- Keep group ownership in the singleton group record and validate the owner's existing admin role for every privileged operation; generic admin status must not confer ownership.
- Group mutations use authenticated SQL RPCs with caller identity from auth.uid(), while private attachment upload/signing uses the existing server storage client only after membership checks; no new role or storage system is needed.
- Mandatory-read checks apply before new employee server-function access and use restrictive read policies for direct Data API reads; ongoing transaction saves and service-role/background assignments remain independent so messages never change shift state.
- Keep group SQL review-only under supabase/manual until the owner approves application; missing RPCs mean the feature is not installed, but operational errors never imply an empty unread list.