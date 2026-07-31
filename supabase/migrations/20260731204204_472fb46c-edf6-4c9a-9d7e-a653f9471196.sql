DROP POLICY IF EXISTS "settings public read" ON public.site_settings;
CREATE POLICY "settings public read" ON public.site_settings FOR SELECT TO anon, authenticated
  USING (key IN ('hero', 'social', 'site', 'checkout_banner', 'agent_update'));

INSERT INTO public.site_settings(key, value) VALUES
 ('agent_update', jsonb_build_object('version','1.1.0','notes','تحسين جودة البث حتى 4K وسرعة أعلى','url','https://www.mag-pro1.com/__l5e/assets-v1/40a65cb0-add4-4d63-8510-895069dc02a4/mag-pro-agent-windows.zip'))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();