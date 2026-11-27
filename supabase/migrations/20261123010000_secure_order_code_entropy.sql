-- Increase public order-code entropy. Existing codes remain valid for tracking;
-- newly created codes use 128 bits from the cryptographic random generator.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.gen_order_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  code TEXT;
BEGIN
  LOOP
    code := 'ORD-' || upper(encode(gen_random_bytes(16), 'hex'));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.orders WHERE order_code = code
    );
  END LOOP;
  RETURN code;
END;
$$;

REVOKE ALL ON FUNCTION public.gen_order_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gen_order_code() TO service_role;

-- Payment proofs are private, admin-readable only, and limited to common raster formats.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'payment-screenshots';

-- The admin UI creates short-lived signed URLs from an authenticated session.
-- Do not grant staff-wide access: only admins may read proof objects.
DROP POLICY IF EXISTS "admins read payment screenshots" ON storage.objects;
CREATE POLICY "admins read payment screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-screenshots'
  AND (SELECT private.is_admin((SELECT auth.uid() AS uid)))
);

COMMIT;
