UPDATE public.site_settings
SET value = jsonb_build_object(
  'version', '1.5.0',
  'url', 'https://mag-pro1.com/__l5e/assets-v1/33162fc9-d804-4fc1-9dc1-59712a421cfd/MagProAgent-Setup.exe',
  'notes', 'نسخة تثبيت رسمية: البرنامج بيتثبت ويتشال زي أي برنامج ويندوز + تشغيل تلقائي أقوى'
)
WHERE key = 'agent_update';