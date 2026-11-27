-- The public payment-method view contains display metadata only.
-- Public clients need SELECT, never INSERT/UPDATE/DELETE on this automatically-updatable view.
BEGIN;

REVOKE ALL ON TABLE public.payment_methods_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payment_methods_public TO anon, authenticated;
GRANT ALL ON TABLE public.payment_methods_public TO service_role;

COMMIT;
