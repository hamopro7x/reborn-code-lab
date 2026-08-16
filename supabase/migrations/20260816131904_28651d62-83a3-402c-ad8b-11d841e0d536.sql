CREATE TABLE IF NOT EXISTS private.integration_keys (
  provider text PRIMARY KEY,
  api_key text NOT NULL,
  api_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
REVOKE ALL ON private.integration_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.integration_keys TO service_role;
ALTER TABLE private.integration_keys ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.integration_get_bybit()
RETURNS TABLE(api_key text, api_secret text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT k.api_key, k.api_secret FROM private.integration_keys k WHERE k.provider = 'bybit';
$$;

CREATE OR REPLACE FUNCTION public.integration_set_bybit(p_key text, p_secret text, p_by uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO private.integration_keys(provider, api_key, api_secret, updated_at, updated_by)
  VALUES ('bybit', p_key, p_secret, now(), p_by)
  ON CONFLICT (provider) DO UPDATE SET api_key = excluded.api_key, api_secret = excluded.api_secret, updated_at = now(), updated_by = excluded.updated_by;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.integration_clear_bybit()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM private.integration_keys WHERE provider = 'bybit';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.integration_set_redotpay(p_key text, p_secret text, p_by uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO private.integration_keys(provider, api_key, api_secret, updated_at, updated_by)
  VALUES ('redotpay', p_key, p_secret, now(), p_by)
  ON CONFLICT (provider) DO UPDATE SET api_key = excluded.api_key, api_secret = excluded.api_secret, updated_at = now(), updated_by = excluded.updated_by;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.integration_get_redotpay()
RETURNS TABLE(api_key text, api_secret text) LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT k.api_key, k.api_secret FROM private.integration_keys k WHERE k.provider = 'redotpay';
$$;

CREATE OR REPLACE FUNCTION public.integration_clear_redotpay()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM private.integration_keys WHERE provider = 'redotpay';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.integration_get_bybit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_set_bybit(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_clear_bybit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_get_redotpay() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_set_redotpay(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.integration_clear_redotpay() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integration_get_bybit() TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_set_bybit(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_clear_bybit() TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_get_redotpay() TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_set_redotpay(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_clear_redotpay() TO service_role;

CREATE TABLE IF NOT EXISTS public.bybit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Bybit',
  uid text,
  email text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bybit_accounts TO authenticated;
GRANT ALL ON public.bybit_accounts TO service_role;
ALTER TABLE public.bybit_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bybit accounts admin manage" ON public.bybit_accounts;
CREATE POLICY "bybit accounts admin manage" ON public.bybit_accounts
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "bybit accounts employee read" ON public.bybit_accounts;
CREATE POLICY "bybit accounts employee read" ON public.bybit_accounts
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'employee'::public.app_role) OR private.is_admin(auth.uid()));
DROP TRIGGER IF EXISTS bybit_accounts_updated_at ON public.bybit_accounts;
CREATE TRIGGER bybit_accounts_updated_at
  BEFORE UPDATE ON public.bybit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS private.bybit_account_keys (
  account_id uuid PRIMARY KEY REFERENCES public.bybit_accounts(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  api_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
REVOKE ALL ON private.bybit_account_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.bybit_account_keys TO service_role;
ALTER TABLE private.bybit_account_keys ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bybit_account_set_keys(p_account_id uuid, p_key text, p_secret text, p_by uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO private.bybit_account_keys(account_id, api_key, api_secret, updated_at, updated_by)
  VALUES (p_account_id, p_key, p_secret, now(), p_by)
  ON CONFLICT (account_id) DO UPDATE
    SET api_key = excluded.api_key, api_secret = excluded.api_secret,
        updated_at = now(), updated_by = excluded.updated_by;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.bybit_account_get_keys(p_account_id uuid)
RETURNS TABLE(api_key text, api_secret text) LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT k.api_key, k.api_secret FROM private.bybit_account_keys k WHERE k.account_id = p_account_id;
$$;

REVOKE ALL ON FUNCTION public.bybit_account_set_keys(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bybit_account_get_keys(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bybit_account_set_keys(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bybit_account_get_keys(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.bybit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pan4 text NOT NULL,
  brand text NOT NULL DEFAULT 'Visa',
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'active',
  name text,
  full_number text,
  cvv text,
  expiry text,
  account_id uuid REFERENCES public.bybit_accounts(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bybit_cards_account ON public.bybit_cards(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bybit_cards TO authenticated;
GRANT ALL ON public.bybit_cards TO service_role;
ALTER TABLE public.bybit_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage bybit cards" ON public.bybit_cards;
CREATE POLICY "Admins can manage bybit cards"
ON public.bybit_cards FOR ALL TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Employees can view bybit cards" ON public.bybit_cards;
CREATE POLICY "Employees can view bybit cards"
ON public.bybit_cards FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'employee'::public.app_role) OR private.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.bybit_account_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  password text,
  bonus text,
  mfa_code text,
  account_id uuid REFERENCES public.bybit_accounts(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bybit_account_info_account ON public.bybit_account_info(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bybit_account_info TO authenticated;
GRANT ALL ON public.bybit_account_info TO service_role;
ALTER TABLE public.bybit_account_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage bybit account info" ON public.bybit_account_info;
CREATE POLICY "admins manage bybit account info" ON public.bybit_account_info
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.bybit_card_txns (
  txn_id text PRIMARY KEY,
  merchant text,
  amount numeric,
  currency text,
  status text,
  txn_time bigint NOT NULL DEFAULT 0,
  pan4 text,
  txn_type text,
  account_id uuid REFERENCES public.bybit_accounts(id) ON DELETE CASCADE,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bybit_card_txns_time_idx ON public.bybit_card_txns (txn_time DESC);
CREATE INDEX IF NOT EXISTS idx_bybit_card_txns_account ON public.bybit_card_txns(account_id);
GRANT SELECT ON public.bybit_card_txns TO authenticated;
GRANT ALL ON public.bybit_card_txns TO service_role;
ALTER TABLE public.bybit_card_txns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view bybit card transactions" ON public.bybit_card_txns;
CREATE POLICY "Admins can view bybit card transactions"
ON public.bybit_card_txns FOR SELECT TO authenticated
USING (private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.prune_bybit_card_txns(p_max bigint DEFAULT 10000000, p_delete bigint DEFAULT 5000000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total bigint;
  removed bigint := 0;
BEGIN
  SELECT count(*) INTO total FROM public.bybit_card_txns;
  IF total >= p_max THEN
    WITH oldest AS (
      SELECT txn_id FROM public.bybit_card_txns ORDER BY txn_time ASC LIMIT p_delete
    )
    DELETE FROM public.bybit_card_txns t USING oldest o WHERE t.txn_id = o.txn_id;
    GET DIAGNOSTICS removed = ROW_COUNT;
  END IF;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_bybit_card_txns(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_bybit_card_txns(bigint, bigint) TO service_role;

INSERT INTO public.site_settings(key, value)
VALUES ('bybit_visibility', '{"enabled": false, "balance": true, "spend": true, "txns": true, "onchain": true, "internal": true, "cards": true, "account": true, "docs": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;