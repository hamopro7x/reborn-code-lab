-- Sensitive transfer details must only be fetched through the server function,
-- which enforces a durable per-client-IP rate limit before using service_role.
BEGIN;

REVOKE ALL ON FUNCTION public.payment_method_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_method_details(uuid) TO service_role;

COMMIT;
