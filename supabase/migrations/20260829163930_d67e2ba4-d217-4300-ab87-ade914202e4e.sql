ALTER TABLE public.hero_banners
  ADD COLUMN IF NOT EXISTS media_fit text NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS positions jsonb NOT NULL DEFAULT '{}'::jsonb;