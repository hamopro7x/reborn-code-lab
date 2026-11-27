-- Mail access is governed by the dedicated mail staff/ownership policies.
-- The chat mandatory-read guard is scoped to chat/work resources and must not
-- accidentally block the independent Gmail inbox and notification surfaces.
BEGIN;
DROP POLICY IF EXISTS chat_mandatory_read_guard ON public.mail_accounts;
DROP POLICY IF EXISTS chat_mandatory_read_guard ON public.mail_messages;
DROP POLICY IF EXISTS chat_mandatory_read_guard ON public.mail_attachments;
DROP POLICY IF EXISTS chat_mandatory_read_guard ON public.mail_notifications;
COMMIT;
