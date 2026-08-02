DROP POLICY IF EXISTS "pm staff read" ON public.payment_methods;
CREATE POLICY "pm admin read" ON public.payment_methods
  FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));