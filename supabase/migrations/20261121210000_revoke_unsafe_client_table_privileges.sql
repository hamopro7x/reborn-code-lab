-- Row-level security does not apply to TRUNCATE, and API clients never
-- need to create triggers or foreign keys on application tables. Apply this
-- consistently to existing ordinary and partitioned tables in public, not
-- only the currently audited sensitive tables. CRUD grants and RLS policies
-- remain unchanged.
BEGIN;

DO $revoke_unsafe_table_privileges$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM anon, authenticated',
      target.nspname,
      target.relname
    );
  END LOOP;
END;
$revoke_unsafe_table_privileges$;

-- Keep the same boundary for future tables created by the normal postgres
-- migration owner. This does not change privileges for service_role/postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES
FROM anon, authenticated;

COMMIT;
