-- علامة مراجعة الشفت تُحفظ في قاعدة البيانات (وليس المتصفح) حتى لا تُمسح أبدًا.
-- آمن التشغيل أكثر من مرة. الصقه في SQL Editor واضغط Run.

ALTER TABLE public.work_shifts
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.work_shifts
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;

CREATE INDEX IF NOT EXISTS work_shifts_reviewed_idx
  ON public.work_shifts (reviewed_at)
  WHERE reviewed_at IS NOT NULL;

GRANT ALL ON public.work_shifts TO service_role;

-- تحقّق سريع بعد التشغيل:
--   select column_name from information_schema.columns
--   where table_name = 'work_shifts' and column_name like 'reviewed%';
