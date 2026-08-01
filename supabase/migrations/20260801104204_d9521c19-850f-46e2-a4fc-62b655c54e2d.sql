update public.site_settings
set value = jsonb_build_object(
  'version','1.7.8',
  'url','https://mag-pro1.com/__l5e/assets-v1/e4a95c54-e987-4353-9580-b0759fdbd0ce/MagProAgent-Setup-1.7.8.exe',
  'notes','إصلاح مفتاح الربط + استقرار الاتصال'
), updated_at = now()
where key = 'agent_update';