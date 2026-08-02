UPDATE public.site_settings
SET value = jsonb_build_object(
  'version','1.8.9',
  'url','https://mag-pro1.com/api/public/agent-download.exe',
  'notes','تحديث تلقائي صامت + استقرار البث عند تذبذب الشبكة'
), updated_at = now()
WHERE key = 'agent_update';