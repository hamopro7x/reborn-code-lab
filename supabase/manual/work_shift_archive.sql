-- أرشفة الشفتات: الشفت المؤرشف يختفي من قوائم الاختيار بدون حذف أي سجل.
-- شغّله مرة واحدة في SQL Editor على قاعدة الموقع.
ALTER TABLE public.work_shifts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS work_shifts_archived_idx
  ON public.work_shifts (user_id) WHERE archived_at IS NULL;
