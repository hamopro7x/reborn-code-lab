CREATE TABLE public.hero_banners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  show_title boolean NOT NULL DEFAULT true,
  subtitle text NOT NULL DEFAULT '',
  show_subtitle boolean NOT NULL DEFAULT true,
  media_type text NOT NULL DEFAULT 'image',
  media_url text,
  media_path text,
  poster_url text,
  poster_path text,
  background_color text,
  video_autoplay boolean NOT NULL DEFAULT true,
  video_muted boolean NOT NULL DEFAULT true,
  video_loop boolean NOT NULL DEFAULT true,
  overlay_enabled boolean NOT NULL DEFAULT true,
  overlay_color text NOT NULL DEFAULT '#05070f',
  overlay_opacity numeric NOT NULL DEFAULT 0.35,
  content_position_x text NOT NULL DEFAULT 'start',
  content_position_y text NOT NULL DEFAULT 'center',
  text_align text NOT NULL DEFAULT 'start',
  buttons_position text NOT NULL DEFAULT 'inline',
  gap_title_subtitle integer NOT NULL DEFAULT 16,
  gap_subtitle_buttons integer NOT NULL DEFAULT 16,
  title_size integer NOT NULL DEFAULT 36,
  title_size_mobile integer NOT NULL DEFAULT 24,
  subtitle_size integer NOT NULL DEFAULT 16,
  subtitle_size_mobile integer NOT NULL DEFAULT 14,
  button_size integer NOT NULL DEFAULT 44,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hero_banners_media_type_chk CHECK (media_type IN ('image','video','color','none'))
);

GRANT SELECT ON public.hero_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hero_banners TO authenticated;
GRANT ALL ON public.hero_banners TO service_role;

ALTER TABLE public.hero_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banners public read active"
  ON public.hero_banners FOR SELECT
  USING (active = true);

CREATE POLICY "banners admin manage"
  ON public.hero_banners FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER hero_banners_set_updated_at
  BEFORE UPDATE ON public.hero_banners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX hero_banners_active_sort_idx ON public.hero_banners (active, sort_order);

-- Migrate current hero setting into the new table (no data loss, no empty banner)
DO $$
DECLARE v jsonb;
BEGIN
  SELECT value INTO v FROM public.site_settings WHERE key = 'hero';
  INSERT INTO public.hero_banners (title, subtitle, media_type, media_url, buttons, badges, sort_order, active)
  VALUES (
    COALESCE(NULLIF(v->>'title',''), 'متجر الاشتراكات الرقمية'),
    COALESCE(NULLIF(v->>'subtitle',''), 'اشتراكات وأدوات وقوالب جاهزة للاستخدام مع ضمان حقيقي وتسليم فوري.'),
    CASE WHEN COALESCE(v->>'image','') <> '' THEN 'image' ELSE 'color' END,
    NULLIF(v->>'image',''),
    '[{"id":"btn1","enabled":true,"label":"تسوق الآن","url":"/shop","icon":"ArrowLeft","variant":"primary"},{"id":"btn2","enabled":true,"label":"تتبع طلبك","url":"/track","icon":"none","variant":"teal"}]'::jsonb,
    '[{"id":"bdg1","enabled":true,"title":"تسليم فوري","value":"بعد الدفع مباشرة","icon":"Zap","color":"#2f7ef7"}]'::jsonb,
    0,
    true
  );
END $$;