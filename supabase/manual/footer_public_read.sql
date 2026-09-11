-- السماح للزوار بقراءة إعدادات الفوتر (كانت غير مسموحة فيظهر الفوتر الافتراضي)
DROP POLICY IF EXISTS "settings public read" ON public.site_settings;
CREATE POLICY "settings public read" ON public.site_settings
FOR SELECT TO anon, authenticated
USING (key = ANY (ARRAY['hero','social','site','checkout_banner','agent_update','footer']));

NOTIFY pgrst, 'reload schema';
