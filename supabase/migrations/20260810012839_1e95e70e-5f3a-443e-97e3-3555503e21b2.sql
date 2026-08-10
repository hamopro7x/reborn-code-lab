DROP POLICY IF EXISTS "card tx admin manage" ON public.card_transactions;

CREATE POLICY "card tx admin insert" ON public.card_transactions
  FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "card tx admin update" ON public.card_transactions
  FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

REVOKE DELETE ON public.card_transactions FROM authenticated, anon;