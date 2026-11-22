-- Increase public order-code entropy. Existing codes remain valid for tracking;
-- newly created codes use 128 bits from the cryptographic random generator.
BEGIN;

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

COMMIT;
