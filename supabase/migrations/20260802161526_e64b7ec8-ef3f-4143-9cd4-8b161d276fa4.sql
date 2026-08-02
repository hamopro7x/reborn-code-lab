CREATE TABLE IF NOT EXISTS private.signup_allowlist (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.signup_allowlist FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_allow_signup(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO private.signup_allowlist(email)
  VALUES (lower(trim(p_email)))
  ON CONFLICT (email) DO UPDATE SET created_at = now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_allow_signup(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_allow_signup(text) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_exists BOOLEAN;
  pre_approved BOOLEAN := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;

  DELETE FROM private.signup_allowlist
   WHERE email = lower(NEW.email)
  RETURNING true INTO pre_approved;
  pre_approved := coalesce(pre_approved, false);

  IF admin_exists AND NOT pre_approved THEN
    RAISE EXCEPTION 'Signups are disabled on this site.';
  END IF;

  INSERT INTO public.profiles(id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  IF NOT admin_exists AND NOT pre_approved THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;