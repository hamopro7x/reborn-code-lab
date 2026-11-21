-- Restrict profile writes and release-asset mutations to trusted server/admin paths.
-- The signup trigger and admin server functions use SECURITY DEFINER/service_role.
-- Idempotent: these policy names may already exist if the hardening was applied
-- manually before its migration was recorded.
BEGIN;

DROP POLICY IF EXISTS "profiles user self manage" ON public.profiles;
DROP POLICY IF EXISTS "profiles user read own" ON public.profiles;

CREATE POLICY "profiles user read own"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Keep admins able to read all profiles through the existing admin-read policy.
-- No current client UI needs direct profile INSERT/UPDATE; signup and admin edits
-- are performed by trusted database/server-side paths.
REVOKE ALL PRIVILEGES ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- Site assets are public-read release artifacts. Release uploads use the
-- service-role key in agent/release.mjs; application release downloads use
-- supabaseAdmin signed URLs. No employee direct-write path is required.
DROP POLICY IF EXISTS "staff manage site assets" ON storage.objects;
DROP POLICY IF EXISTS "admins insert site assets" ON storage.objects;
DROP POLICY IF EXISTS "admins update site assets" ON storage.objects;
DROP POLICY IF EXISTS "admins delete site assets" ON storage.objects;

CREATE POLICY "admins insert site assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-assets' AND private.is_admin(auth.uid()));

CREATE POLICY "admins update site assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'site-assets' AND private.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'site-assets' AND private.is_admin(auth.uid()));

CREATE POLICY "admins delete site assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'site-assets' AND private.is_admin(auth.uid()));

COMMIT;
