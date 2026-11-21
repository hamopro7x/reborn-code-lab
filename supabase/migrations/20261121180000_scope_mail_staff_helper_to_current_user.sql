-- The mail RLS policies call this helper with auth.uid(). Bind the
-- SECURITY DEFINER helper to the current session so authenticated callers
-- cannot probe staff membership for arbitrary user IDs.
BEGIN;

CREATE OR REPLACE FUNCTION public.mail_is_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _uid IS NOT NULL
     AND _uid = auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.user_roles
       WHERE user_id = auth.uid()
         AND role::text IN ('admin','employee')
     )
$function$;

REVOKE ALL ON FUNCTION public.mail_is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_is_staff(uuid) TO authenticated, service_role;

COMMIT;
