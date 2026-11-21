-- Disable the retired staff-driven pairing flow.
-- The current desktop agent uses one-time admin enrollment codes through
-- agent_register; no current client calls agent_claim_pairing. The live
-- agent_pairings table was confirmed empty during the read-only audit.
-- Keep the table/function definitions for rollback/history, but remove the
-- authenticated entrypoints so SECURITY DEFINER cannot bypass device RLS.
BEGIN;

DROP POLICY IF EXISTS "staff read pairings" ON public.agent_pairings;
DROP POLICY IF EXISTS "staff delete pairings" ON public.agent_pairings;

REVOKE ALL ON TABLE public.agent_pairings FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agent_claim_pairing(text)
  FROM PUBLIC, anon, authenticated;

COMMIT;
