-- Drop unused legacy overloads
DROP FUNCTION IF EXISTS public.agent_register(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.agent_register(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.agent_heartbeat(text, text);

-- Default deny on all SECURITY DEFINER functions in public
REVOKE ALL ON FUNCTION public.agent_register(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_heartbeat(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_pair_request(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_create_enroll_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_claim_pairing(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.detect_repeat_customer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gen_order_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Device-agent endpoints: unauthenticated app, protected by device secret / enrollment code
GRANT EXECUTE ON FUNCTION public.agent_register(text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_heartbeat(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_pair_request(text, text, text, text, text) TO anon, authenticated;

-- Staff-only admin RPCs: signed-in only, staff enforced inside the function
GRANT EXECUTE ON FUNCTION public.agent_create_enroll_code(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_claim_pairing(text) TO authenticated;

-- Server-side only
GRANT EXECUTE ON FUNCTION public.gen_order_code() TO service_role;