DROP POLICY IF EXISTS "pm public read" ON public.payment_methods;
REVOKE SELECT ON public.payment_methods FROM anon;
CREATE POLICY "pm staff read" ON public.payment_methods FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));