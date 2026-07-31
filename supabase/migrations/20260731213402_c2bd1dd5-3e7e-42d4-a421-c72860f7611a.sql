UPDATE public.site_settings
SET value = jsonb_build_object(
  'version', '1.3.0',
  'notes', 'التحديث الآن يتم داخل البرنامج: شريط تحميل ثم زر تثبيت بدون فتح المتصفح',
  'url', 'https://www.mag-pro1.com/__l5e/assets-v1/357ad0bd-3e54-4450-a733-fc68b701b305/mag-pro-agent-windows.zip'
), updated_at = now()
WHERE key = 'agent_update';