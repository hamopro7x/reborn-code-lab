-- يشيل كارت «30 عمله — شحن عملات تيك توك» من المتجر ومن لوحة الإدارة.
-- تشغيل مرة واحدة في SQL Editor على قاعدة الموقع.
-- يوقف الظهور بس (active = false) من غير ما يمسح سجل الطلبات القديمة.

-- 1) اطلع الأول على اللي هيتشال
SELECT id, name, slug, base_price_egp, active
FROM public.products
WHERE name = '30 عمله'
   OR name ~* 'tiktok|تيك ?توك'
   OR short_description ~* 'tiktok|تيك ?توك';

-- 2) شيله
UPDATE public.products
SET active = false, updated_at = now()
WHERE name = '30 عمله'
   OR name ~* 'tiktok|تيك ?توك'
   OR short_description ~* 'tiktok|تيك ?توك';

-- 3) لو القسم نفسه اسمه تيك توك ومفيش منه منتجات تانية، شيله هو كمان
UPDATE public.categories
SET active = false
WHERE name ~* 'tiktok|تيك ?توك'
  AND NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.category_id = public.categories.id AND p.active = true
  );
