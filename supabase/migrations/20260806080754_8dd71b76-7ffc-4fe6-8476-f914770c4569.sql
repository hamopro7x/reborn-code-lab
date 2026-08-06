DROP POLICY IF EXISTS "settings public read" ON public.site_settings;
CREATE POLICY "settings public read" ON public.site_settings FOR SELECT TO anon, authenticated
  USING (key IN ('hero', 'social', 'site', 'checkout_banner', 'agent_update', 'employee_panels'));