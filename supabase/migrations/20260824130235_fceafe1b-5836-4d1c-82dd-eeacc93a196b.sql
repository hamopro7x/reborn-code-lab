CREATE TABLE public.work_manual_card_txns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.work_shifts(id) ON DELETE CASCADE,
  merchant text NOT NULL DEFAULT '',
  amount numeric,
  quantity numeric,
  pan4 text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.work_manual_card_txns TO authenticated;
GRANT ALL ON public.work_manual_card_txns TO service_role;

ALTER TABLE public.work_manual_card_txns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own manual card txns readable"
ON public.work_manual_card_txns FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

CREATE INDEX work_manual_card_txns_shift_idx ON public.work_manual_card_txns (shift_id, created_at);

CREATE TRIGGER work_manual_card_txns_updated_at
BEFORE UPDATE ON public.work_manual_card_txns
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();