-- The mail RLS helper is executable by authenticated users because RLS
-- policies call it. Bind its input to the current session so it cannot be
-- used as a SECURITY DEFINER staff-membership oracle for arbitrary UUIDs.
BEGIN;

CREATE OR REPLACE FUNCTION public.mail_is_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT _uid IS NOT NULL
     AND _uid = auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.user_roles
       WHERE user_id = auth.uid()
         AND role::text IN ('admin', 'employee')
     )
$function$;

REVOKE ALL ON FUNCTION public.mail_is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_is_staff(uuid) TO authenticated, service_role;

COMMIT;
