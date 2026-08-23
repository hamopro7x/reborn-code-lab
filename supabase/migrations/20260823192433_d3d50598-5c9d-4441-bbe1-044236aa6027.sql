ALTER TABLE public.work_manual_txns ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.work_shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_manual_txns_shift_idx ON public.work_manual_txns(shift_id);

-- Backfill historical rows: attach each manual row to the shift of the same
-- employee whose time range contains its creation time (best effort, no data loss).
UPDATE public.work_manual_txns m
   SET shift_id = s.id
  FROM public.work_shifts s
 WHERE m.shift_id IS NULL
   AND s.user_id = m.user_id
   AND m.created_at >= s.started_at
   AND (s.ended_at IS NULL OR m.created_at <= s.ended_at);