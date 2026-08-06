DROP POLICY IF EXISTS "settings public read" ON public.site_settings;
CREATE POLICY "settings public read" ON public.site_settings
FOR SELECT TO anon, authenticated
USING (key = ANY (ARRAY['hero','social','site','checkout_banner','agent_update']));

DROP POLICY IF EXISTS "settings staff read internal" ON public.site_settings;
CREATE POLICY "settings staff read internal" ON public.site_settings
FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));