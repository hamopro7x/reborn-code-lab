-- Make Gmail attachment imports idempotent so a replay can safely repair partial syncs.
BEGIN;

-- Remove historical duplicates before adding the natural-key constraint.
DELETE FROM public.mail_attachments a
USING public.mail_attachments b
WHERE a.message_id = b.message_id
  AND a.gmail_attachment_id = b.gmail_attachment_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS mail_attachments_message_gmail_id_uidx
  ON public.mail_attachments (message_id, gmail_attachment_id);

COMMIT;
