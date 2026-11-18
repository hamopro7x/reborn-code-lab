-- REVIEW ONLY: owner applies after review. No messages, roles or files are changed.
-- Preserve the installed mutation function, including targeted mandatory recipients.
BEGIN;
DO $$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.staff_chat_mutate(text,jsonb)'::regprocedure);
  IF position('''application/octet-stream''' IN definition) = 0 THEN
    IF position('''image/jpeg''' IN definition) = 0 THEN
      RAISE EXCEPTION 'Unknown attachment validation: review installed function before upgrading';
    END IF;
    definition := replace(definition, '''image/jpeg''', '''application/octet-stream'',''image/jpeg''');
    EXECUTE definition;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.staff_chat_mutate(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_chat_mutate(text,jsonb) TO authenticated;
COMMIT;