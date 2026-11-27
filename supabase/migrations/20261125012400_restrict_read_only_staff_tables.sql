BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.mail_accounts,
  public.mail_attachments,
  public.mail_messages,
  public.mail_notifications,
  public.staff_chat_attachments,
  public.staff_chat_audit,
  public.staff_chat_events,
  public.staff_chat_group,
  public.staff_chat_hidden,
  public.staff_chat_messages,
  public.staff_chat_notifications,
  public.staff_chat_receipts,
  public.staff_chat_votes,
  public.webauthn_credentials,
  public.work_p2p_audit,
  public.work_transfer_notes
FROM authenticated;
COMMIT;