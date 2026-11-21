-- Face enrollment and WebAuthn application flows were removed from the client.
-- Retain historical enrollment rows for audit/retention; do not delete records.
-- Employee profile photos are stored separately in the avatars bucket and are untouched.
-- The retired face enrollment table is now server/service-role only.
REVOKE ALL PRIVILEGES ON TABLE public.employee_face_enroll FROM anon, authenticated;
