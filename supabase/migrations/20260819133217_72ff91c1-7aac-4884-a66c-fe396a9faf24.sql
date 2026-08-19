CREATE TABLE public.bybit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid REFERENCES public.bybit_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  direction text NOT NULL DEFAULT 'out',
  ref_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  fee numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bybit_ledger_uniq ON public.bybit_ledger (account_id, kind, ref_id);
CREATE INDEX bybit_ledger_time_idx ON public.bybit_ledger (occurred_at DESC);
CREATE INDEX bybit_ledger_kind_idx ON public.bybit_ledger (kind);

GRANT SELECT ON public.bybit_ledger TO authenticated;
GRANT ALL ON public.bybit_ledger TO service_role;

ALTER TABLE public.bybit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bybit ledger staff read" ON public.bybit_ledger
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'employee'::app_role) OR private.is_admin(auth.uid()));