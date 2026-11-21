-- Sensitive tables are accessed only by trusted server-side code or
-- SECURITY DEFINER routines. RLS is enabled with no client policies, but
-- stale table grants still advertise broad access to anon/authenticated.
-- Remove those direct privileges; service_role and postgres retain access.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.bybit_ingest_fences,
  public.work_auth_challenges,
  public.work_pins
FROM anon, authenticated;

COMMIT;
