ALTER TABLE public.hero_banners
  ADD COLUMN IF NOT EXISTS subtitle2 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS show_subtitle2 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subtitle2_size integer NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS subtitle2_size_mobile integer NOT NULL DEFAULT 14;