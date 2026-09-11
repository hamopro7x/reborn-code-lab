-- إصلاح صلاحيات حفظ المنتجات ورفع صورها للأدمن/الموظف فقط.
-- RLS يظل مفعّلًا، ولا يحصل الزائر على أي صلاحية كتابة.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products staff read all" ON public.products;
CREATE POLICY "products staff read all"
ON public.products FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "products staff manage" ON public.products;
CREATE POLICY "products staff manage"
ON public.products FOR ALL TO authenticated
USING (private.is_staff(auth.uid()))
WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff upload product images" ON storage.objects;
CREATE POLICY "staff upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND private.is_staff(auth.uid())
);

DROP POLICY IF EXISTS "staff update product images" ON storage.objects;
CREATE POLICY "staff update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND private.is_staff(auth.uid())
)
WITH CHECK (
  bucket_id = 'product-images'
  AND private.is_staff(auth.uid())
);

DROP POLICY IF EXISTS "staff delete product images" ON storage.objects;
CREATE POLICY "staff delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND private.is_staff(auth.uid())
);

NOTIFY pgrst, 'reload schema';