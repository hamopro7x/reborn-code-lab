CREATE TABLE public.card_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id text,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  amount numeric NOT NULL,
  currency_code text NOT NULL DEFAULT 'USD',
  merchant text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  source text NOT NULL DEFAULT 'manual',
  card_last4 text,
  notes text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX card_transactions_external_uniq ON public.card_transactions (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX card_transactions_occurred_at_idx ON public.card_transactions (occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_transactions TO authenticated;
GRANT ALL ON public.card_transactions TO service_role;

ALTER TABLE public.card_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card tx admin manage" ON public.card_transactions FOR ALL TO authenticated
USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER card_transactions_updated_at BEFORE UPDATE ON public.card_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();