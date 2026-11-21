-- Fix the staff-chat gate used by the work-data RLS policies.
--
-- The previous predicate was only:
--   NOT public.staff_chat_blocked(auth.uid())
-- Since non-staff users are not "blocked" by that function, the permissive
-- policies could evaluate TRUE for any authenticated user. PostgreSQL ORs
-- permissive SELECT policies, so the own/admin policies did not constrain it.
--
-- This keeps the intended behavior:
--   * admins can read work data;
--   * employees can read work data unless a mandatory chat notice blocks them;
--   * customers and other non-staff authenticated users cannot read work data.
--
-- MANUAL ONLY: review and run in the Supabase SQL Editor. This file is not
-- executed by the application build or deployment workflow.

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_chat_can_read_work()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT private.is_staff(auth.uid())
     AND NOT public.staff_chat_blocked(auth.uid())
$function$;

REVOKE ALL ON FUNCTION public.staff_chat_can_read_work() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_chat_can_read_work() TO authenticated;

COMMIT;

-- Verify the policy predicate after applying:
-- SELECT tablename, policyname, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND policyname = 'chat_mandatory_read_guard'
-- ORDER BY tablename;
