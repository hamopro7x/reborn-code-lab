BEGIN;
REVOKE ALL ON TABLE public.screenshare_signals FROM anon;
REVOKE UPDATE ON TABLE public.screenshare_signals FROM authenticated;
COMMIT;
