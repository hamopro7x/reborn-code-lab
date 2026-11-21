-- Row-level security does not apply to TRUNCATE, and API clients never
-- need to create triggers or foreign keys on application tables. Apply this
-- consistently to the existing public schema, not only the currently audited
-- sensitive tables. Ordinary row-level CRUD grants and RLS policies are intact.
BEGIN;

REVOKE TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

-- Keep the same boundary for future tables created by the normal postgres
-- migration owner. This does not change privileges for service_role/postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES
FROM anon, authenticated;

COMMIT;
