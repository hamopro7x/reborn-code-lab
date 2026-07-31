CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  via_admin BOOLEAN := COALESCE((NEW.raw_user_meta_data->>'via_admin')::boolean, false);
  admin_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;

  IF NOT via_admin AND admin_exists THEN
    RAISE EXCEPTION 'Signups are disabled on this site.';
  END IF;

  INSERT INTO public.profiles(id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@','1'::int)))
  ON CONFLICT (id) DO NOTHING;

  IF NOT via_admin AND NOT admin_exists THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;