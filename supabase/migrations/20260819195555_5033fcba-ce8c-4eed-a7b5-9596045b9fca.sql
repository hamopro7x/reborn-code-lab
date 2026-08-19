CREATE TABLE public.work_txn_entries (
  ledger_id uuid PRIMARY KEY REFERENCES public.bybit_ledger(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  egp numeric,
  quantity numeric,
  egp_at timestamptz,
  quantity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.work_txn_entries TO service_role;
ALTER TABLE public.work_txn_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read own work entries" ON public.work_txn_entries
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

GRANT SELECT ON public.work_txn_entries TO authenticated;

CREATE TRIGGER work_txn_entries_updated_at BEFORE UPDATE ON public.work_txn_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();