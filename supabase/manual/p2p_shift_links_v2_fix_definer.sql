-- Fix: link/hide RPCs failed with "permission denied for schema private".
-- Execute remains restricted to service_role only.
ALTER FUNCTION public.work_link_p2p_many(uuid,uuid,uuid[]) SECURITY DEFINER;
ALTER FUNCTION public.work_link_p2p_atomic(uuid,uuid,uuid,uuid[]) SECURITY DEFINER;
ALTER FUNCTION public.work_set_p2p_shift_hidden(uuid,uuid,boolean) SECURITY DEFINER;
