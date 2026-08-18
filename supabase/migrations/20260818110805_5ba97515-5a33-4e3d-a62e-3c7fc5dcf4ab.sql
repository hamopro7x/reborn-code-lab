GRANT SELECT ON public.bybit_account_info TO authenticated;
GRANT ALL ON public.bybit_account_info TO service_role;
GRANT SELECT ON public.bybit_card_txns TO authenticated;
GRANT ALL ON public.bybit_card_txns TO service_role;

DROP POLICY IF EXISTS "bybit account info employee read" ON public.bybit_account_info;
CREATE POLICY "bybit account info employee read"
ON public.bybit_account_info FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'employee'::app_role) OR private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "bybit card txns employee read" ON public.bybit_card_txns;
CREATE POLICY "bybit card txns employee read"
ON public.bybit_card_txns FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'employee'::app_role) OR private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "bybit docs staff read" ON storage.objects;
CREATE POLICY "bybit docs staff read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'bybit-docs' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "bybit docs admin insert" ON storage.objects;
CREATE POLICY "bybit docs admin insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bybit-docs' AND private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "bybit docs admin update" ON storage.objects;
CREATE POLICY "bybit docs admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'bybit-docs' AND private.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'bybit-docs' AND private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "bybit docs admin delete" ON storage.objects;
CREATE POLICY "bybit docs admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'bybit-docs' AND private.is_admin(auth.uid()));