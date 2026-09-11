-- كل التعديلات المعلّقة على القاعدة الجديدة (kcdsdaytrnzoiharmyxo)
-- آمن التشغيل أكثر من مرة. الصقه كله في SQL Editor واضغط Run.

-- 1) رمز استلام الشغل (PIN سداسي للموظف)
CREATE TABLE IF NOT EXISTS public.work_pins (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  set_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.work_pins TO service_role;

ALTER TABLE public.work_pins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.work_pins_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_work_pins_updated_at ON public.work_pins;
CREATE TRIGGER update_work_pins_updated_at
BEFORE UPDATE ON public.work_pins
FOR EACH ROW EXECUTE FUNCTION public.work_pins_touch_updated_at();

-- 2) بانرات الموبايل منفصلة عن الديسكتوب
ALTER TABLE public.hero_banners
  ADD COLUMN IF NOT EXISTS device TEXT NOT NULL DEFAULT 'desktop';

ALTER TABLE public.hero_banners
  DROP CONSTRAINT IF EXISTS hero_banners_device_check;

ALTER TABLE public.hero_banners
  ADD CONSTRAINT hero_banners_device_check CHECK (device IN ('desktop', 'mobile'));

CREATE INDEX IF NOT EXISTS hero_banners_device_idx ON public.hero_banners (device, sort_order);

NOTIFY pgrst, 'reload schema';

-- تحقّق سريع بعد التشغيل:
--   select count(*) from public.work_pins;
--   select device, count(*) from public.hero_banners group by device;
