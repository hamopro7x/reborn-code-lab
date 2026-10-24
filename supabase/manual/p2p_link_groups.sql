-- عمود تجميع الشفتات المرتبطة بطلب P2P واحد — يُستخدم لتلوين المجموعة بنفس اللون
ALTER TABLE public.work_shifts ADD COLUMN IF NOT EXISTS link_group text;
CREATE INDEX IF NOT EXISTS work_shifts_link_group_idx ON public.work_shifts (link_group);
