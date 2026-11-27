BEGIN;

-- Keep only the direct writes that have matching authenticated RLS policies.
REVOKE INSERT ON TABLE public.admin_notifications FROM authenticated;
REVOKE INSERT ON TABLE public.agent_devices FROM authenticated;
REVOKE INSERT, UPDATE ON TABLE public.agent_enroll_codes FROM authenticated;

-- These tables have no authenticated write policies; writes are handled by
-- trusted server-side / SECURITY DEFINER paths where required.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.mail_labels, public.work_p2p_effective_links
  FROM authenticated;

COMMIT;
