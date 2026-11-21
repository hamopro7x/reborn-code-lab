-- Read-only audit for the mandatory staff-chat read guard.
--
-- IMPORTANT:
-- Do NOT add private.is_staff(auth.uid()) to staff_chat_can_read_work()
-- globally. The RESTRICTIVE guard is also attached to customer-facing tables
-- such as orders, course_access, and course_progress. Requiring staff membership
-- there would deny customers access to their own rows even when the separate
-- permissive ownership policies correctly allow them.
--
-- Current intended behavior:
--   * employees with unread mandatory staff-chat messages are blocked;
--   * admins are not blocked;
--   * customers/non-staff pass this RESTRICTIVE gate and remain limited by
--     each table's own PERMISSIVE row-ownership policy.
--
-- This file is intentionally read-only. It does not alter functions or policies.

-- 1) Inspect the helper definitions and execution grants.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  p.proacl AS acl,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname, p.proname) IN (
  ('public', 'staff_chat_can_read_work'),
  ('public', 'staff_chat_blocked'),
  ('private', 'is_staff')
)
ORDER BY n.nspname, p.proname;

-- 2) Confirm the mandatory guard remains RESTRICTIVE and inspect the
--    independent row-access policies on affected tables.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname = 'chat_mandatory_read_guard'
ORDER BY tablename;

-- 3) Inspect all policies on the customer-owned tables where a global
--    staff-only guard would break legitimate owner reads.
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'course_access', 'course_progress')
ORDER BY tablename, cmd, permissive DESC, policyname;
