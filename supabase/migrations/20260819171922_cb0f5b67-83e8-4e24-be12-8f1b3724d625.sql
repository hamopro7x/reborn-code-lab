REVOKE ALL ON FUNCTION public.work_claim_shift(boolean, boolean) FROM anon, public;
REVOKE ALL ON FUNCTION public.work_assign_txn(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.work_claim_shift(boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_assign_txn(uuid, uuid) TO authenticated;