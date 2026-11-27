BEGIN;
REVOKE ALL ON TABLE public.user_roles FROM anon;
REVOKE ALL ON TABLE public.agent_devices FROM anon;
REVOKE ALL ON TABLE public.agent_enroll_codes FROM anon;
REVOKE ALL ON TABLE public.site_settings FROM anon;
GRANT SELECT ON TABLE public.site_settings TO anon;
COMMIT;
