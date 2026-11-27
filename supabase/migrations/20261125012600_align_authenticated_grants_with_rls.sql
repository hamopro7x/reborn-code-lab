BEGIN;

-- Match table grants to the actual authenticated RLS policies.
REVOKE DELETE ON TABLE public.admin_notifications FROM authenticated;
REVOKE DELETE ON TABLE public.card_transactions FROM authenticated;

-- These P2P helper tables expose authenticated SELECT policies only.
-- Mutations must go through the trusted server-side workflow.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.work_p2p_hidden_shifts, public.work_p2p_shift_links
  FROM authenticated;

COMMIT;
