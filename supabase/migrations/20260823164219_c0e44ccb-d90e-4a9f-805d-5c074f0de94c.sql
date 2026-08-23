CREATE TABLE public.work_transfer_notes (
  ledger_id uuid NOT NULL PRIMARY KEY REFERENCES public.bybit_ledger(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  note text NOT NULL,
  saved_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.work_transfer_notes TO authenticated;
GRANT ALL ON public.work_transfer_notes TO service_role;
ALTER TABLE public.work_transfer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read transfer notes" ON public.work_transfer_notes FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));