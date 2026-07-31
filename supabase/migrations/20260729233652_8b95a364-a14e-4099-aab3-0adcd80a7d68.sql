
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'employee', 'customer');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  country_code TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- private helpers
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, anon;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','employee')) $$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;

CREATE POLICY "profiles user self manage" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles admin read all" ON public.profiles FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "user_roles admin read all" ON public.user_roles FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));
CREATE POLICY "user_roles admin manage" ON public.user_roles FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

-- new user handler
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_email TEXT := 'hamovip7x@gmail.com';
  via_admin BOOLEAN := COALESCE((NEW.raw_user_meta_data->>'via_admin')::boolean, false);
BEGIN
  IF NOT via_admin AND lower(NEW.email) <> allowed_email THEN
    RAISE EXCEPTION 'Signups are disabled on this site.';
  END IF;

  INSERT INTO public.profiles(id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  IF NOT via_admin AND lower(NEW.email) = allowed_email THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CURRENCIES & COUNTRIES
CREATE TABLE public.currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.currencies TO anon, authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currencies public read" ON public.currencies FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "currencies admin manage" ON public.currencies FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE public.countries (
  code TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  currency_code TEXT NOT NULL REFERENCES public.currencies(code),
  dial_code TEXT NOT NULL,
  flag TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "countries public read" ON public.countries FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "countries staff manage" ON public.countries FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

INSERT INTO public.currencies(code, name, symbol, sort_order) VALUES
 ('EGP','جنيه مصري','ج.م',1),
 ('USD','دولار أمريكي','$',2),
 ('SAR','ريال سعودي','ر.س',3),
 ('AED','درهم إماراتي','د.إ',4),
 ('IQD','دينار عراقي','د.ع',5);

INSERT INTO public.countries(code, name_ar, name_en, currency_code, dial_code, flag, sort_order) VALUES
 ('EG','مصر','Egypt','EGP','+20','🇪🇬',1),
 ('SA','السعودية','Saudi Arabia','SAR','+966','🇸🇦',2),
 ('AE','الإمارات','UAE','AED','+971','🇦🇪',3),
 ('IQ','العراق','Iraq','IQD','+964','🇮🇶',4),
 ('US','الولايات المتحدة','USA','USD','+1','🇺🇸',5),
 ('KW','الكويت','Kuwait','USD','+965','🇰🇼',6),
 ('QA','قطر','Qatar','USD','+974','🇶🇦',7),
 ('JO','الأردن','Jordan','USD','+962','🇯🇴',8),
 ('MA','المغرب','Morocco','USD','+212','🇲🇦',9),
 ('DZ','الجزائر','Algeria','USD','+213','🇩🇿',10);

-- CATEGORIES
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  banner_image TEXT,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories public read" ON public.categories FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "categories admin manage" ON public.categories FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

INSERT INTO public.categories(name, slug, icon, sort_order) VALUES
 ('الألعاب','games','🎮',1),
 ('أدوات الذكاء الاصطناعي','ai-tools','🤖',2),
 ('منتجات تصميم','design','🎨',3),
 ('قوالب كانفا','canva-templates','🖼️',4);

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  short_description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  main_image TEXT,
  gallery TEXT[] NOT NULL DEFAULT '{}',
  warranty_days INT NOT NULL DEFAULT 0,
  base_price_egp NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_ends_at TIMESTAMPTZ,
  featured BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  upsell_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products public read" ON public.products FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "products staff read all" ON public.products FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "products staff manage" ON public.products FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TABLE public.product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL REFERENCES public.currencies(code),
  price NUMERIC(12,2) NOT NULL,
  UNIQUE(product_id, currency_code)
);
GRANT SELECT ON public.product_prices TO anon, authenticated;
GRANT ALL ON public.product_prices TO service_role;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prices public read" ON public.product_prices FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_prices.product_id AND p.active = true));
CREATE POLICY "prices staff manage" ON public.product_prices FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TABLE public.exchange_rates (
  currency_code TEXT PRIMARY KEY REFERENCES public.currencies(code),
  rate_from_egp NUMERIC(14,6) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exchange_rates TO anon, authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx public read" ON public.exchange_rates FOR SELECT TO anon, authenticated USING (rate_from_egp IS NOT NULL AND rate_from_egp > 0);
CREATE POLICY "fx admin manage" ON public.exchange_rates FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

INSERT INTO public.exchange_rates(currency_code, rate_from_egp) VALUES
 ('EGP', 1),
 ('USD', 0.021),
 ('SAR', 0.078),
 ('AED', 0.076),
 ('IQD', 27.3);

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reviews TO anon, authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews public read" ON public.reviews FOR SELECT TO anon, authenticated USING (approved = true);
CREATE POLICY "reviews public insert" ON public.reviews FOR INSERT TO anon, authenticated WITH CHECK (approved = false);
CREATE POLICY "reviews staff read all" ON public.reviews FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "reviews staff manage" ON public.reviews FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- PAYMENT METHODS
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  country_code TEXT REFERENCES public.countries(code),
  account_number TEXT NOT NULL,
  account_name TEXT,
  instructions TEXT,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_methods TO anon, authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm public read" ON public.payment_methods FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "pm admin manage" ON public.payment_methods FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

INSERT INTO public.payment_methods(name, type, country_code, account_number, account_name, sort_order) VALUES
 ('فودافون كاش','vodafone_cash','EG','01017873279','متجر الاشتراكات',1),
 ('إنستا باي','instapay','EG','010178732779','متجر الاشتراكات',2),
 ('Binance','binance',NULL,'2585588','متجر الاشتراكات',3),
 ('Bybit','bybit',NULL,'561418853','متجر الاشتراكات',4);

-- ORDERS
CREATE TYPE public.order_status AS ENUM ('pending_payment','awaiting_confirmation','confirmed','rejected','completed','cancelled');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_country TEXT NOT NULL,
  dial_code TEXT NOT NULL,
  currency_code TEXT NOT NULL REFERENCES public.currencies(code),
  subtotal NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_screenshot TEXT,
  status order_status NOT NULL DEFAULT 'pending_payment',
  admin_notes TEXT,
  device_id TEXT,
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_email_idx ON public.orders(customer_email);
CREATE INDEX orders_phone_idx ON public.orders(customer_phone);
CREATE INDEX orders_status_idx ON public.orders(status);
CREATE INDEX orders_created_idx ON public.orders(created_at DESC);
CREATE INDEX orders_device_id_idx ON public.orders(device_id);
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders staff read all" ON public.orders FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "orders own read" ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "orders staff update" ON public.orders FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  warranty_days INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT ON public.order_items TO anon, authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items own read" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "items staff manage" ON public.order_items FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- SETTINGS + TIMERS
CREATE TABLE public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.site_settings FOR SELECT TO anon, authenticated
  USING (key IN ('hero', 'social', 'site', 'checkout_banner'));
CREATE POLICY "settings admin manage" ON public.site_settings FOR ALL TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

INSERT INTO public.site_settings(key, value) VALUES
 ('site', '{"name":"متجر الاشتراكات الرقمية","tagline":"اشتراكات وقوالب رقمية احترافية","logo":"","whatsapp":"+201120373986","email":"support@store.com","footer_text":"جميع الحقوق محفوظة"}'::jsonb),
 ('hero', '{"title":"متجر الاشتراكات الرقمية","subtitle":"اشتراكات، أدوات AI، تصاميم، قوالب — كل ما تحتاجه في مكان واحد","cta_shop":"تسوق الآن","cta_track":"تتبع طلبك"}'::jsonb),
 ('social', '{"facebook":"","instagram":"","tiktok":"","youtube":""}'::jsonb),
 ('device_limit', '2'::jsonb),
 ('checkout_banner', jsonb_build_object('enabled', true, 'title', '🎉 اطلب الآن واستلم خلال دقائق', 'subtitle', 'ضمان استرداد كامل • دعم مباشر على واتساب • تفعيل فوري بعد التأكيد'));

CREATE TABLE public.countdown_timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  ends_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.countdown_timers TO anon, authenticated;
GRANT ALL ON public.countdown_timers TO service_role;
ALTER TABLE public.countdown_timers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timer public read" ON public.countdown_timers FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "timer staff manage" ON public.countdown_timers FOR ALL TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- HELPERS
CREATE OR REPLACE FUNCTION public.gen_order_code()
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  code TEXT;
BEGIN
  LOOP
    code := 'ORD-' || upper(substring(md5(random()::text||clock_timestamp()::text) from 1 for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_code = code);
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER products_updated BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ADMIN NOTIFICATIONS
CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif staff read" ON public.admin_notifications FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "notif staff update" ON public.admin_notifications FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE INDEX admin_notifications_unread_idx ON public.admin_notifications(created_at DESC) WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION public.detect_repeat_customer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  prior_count INT;
BEGIN
  IF NEW.status IN ('confirmed','completed','awaiting_confirmation') THEN
    SELECT COUNT(*) INTO prior_count FROM public.orders
    WHERE id <> NEW.id
      AND (lower(customer_email) = lower(NEW.customer_email) OR customer_phone = NEW.customer_phone)
      AND status IN ('confirmed','completed','awaiting_confirmation');
    IF prior_count >= 1 THEN
      INSERT INTO public.admin_notifications(kind, title, body, meta)
      VALUES (
        'repeat_customer',
        'عميل متكرر: ' || NEW.customer_name,
        'العميل ' || NEW.customer_name || ' (' || NEW.customer_email || ') قدّم طلبه رقم ' || (prior_count + 1) || ' — فرصة لمتابعته وعرض منتجات إضافية.',
        jsonb_build_object('order_id', NEW.id, 'order_code', NEW.order_code, 'email', NEW.customer_email, 'phone', NEW.customer_phone, 'prior_orders', prior_count)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_repeat_customer_insert AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.detect_repeat_customer();

-- COURSES
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  cover_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view all courses" ON public.courses FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'employee'::app_role));
CREATE POLICY "Admin manage courses" ON public.courses FOR ALL TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  video_path text NOT NULL,
  duration_sec int,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_lessons TO authenticated;
GRANT ALL ON public.course_lessons TO service_role;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view all lessons" ON public.course_lessons FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'employee'::app_role));
CREATE POLICY "Admin manage lessons" ON public.course_lessons FOR ALL TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_lessons_updated BEFORE UPDATE ON public.course_lessons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_lessons_course ON public.course_lessons(course_id, sort_order);

CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  device_label text,
  user_agent text,
  ip text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_fingerprint)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own devices view" ON public.user_devices FOR SELECT TO authenticated
USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admin manage devices" ON public.user_devices FOR ALL TO authenticated
USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX idx_user_devices_user ON public.user_devices(user_id);

CREATE TABLE public.course_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  watched_seconds int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_progress TO authenticated;
GRANT ALL ON public.course_progress TO service_role;
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own progress" ON public.course_progress FOR ALL TO authenticated
USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'::app_role))
WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_progress_updated BEFORE UPDATE ON public.course_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.course_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_access TO authenticated;
GRANT ALL ON public.course_access TO service_role;
ALTER TABLE public.course_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage course access" ON public.course_access FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "User can view own course access" ON public.course_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- FUNCTION LOCKDOWN
REVOKE ALL ON FUNCTION public.gen_order_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.detect_repeat_customer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- STORAGE POLICIES
CREATE POLICY "public read product images" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');
CREATE POLICY "staff upload product images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND private.is_staff(auth.uid()));
CREATE POLICY "staff update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND private.is_staff(auth.uid()));
CREATE POLICY "staff delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND private.is_staff(auth.uid()));
CREATE POLICY "public read site assets" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'site-assets');
CREATE POLICY "staff manage site assets" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'site-assets' AND private.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'site-assets' AND private.is_staff(auth.uid()));
CREATE POLICY "staff read screenshots" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-screenshots' AND private.is_staff(auth.uid()));
CREATE POLICY "course-videos admin write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'course-videos' AND private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "course-videos admin update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'course-videos' AND private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "course-videos admin delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'course-videos' AND private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "course-videos admin read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'course-videos' AND private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "avatars admin read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "avatars admin insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "avatars admin update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'avatars' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "avatars admin delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND private.has_role(auth.uid(), 'admin'::app_role));
