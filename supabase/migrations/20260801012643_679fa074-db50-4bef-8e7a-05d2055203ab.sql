UPDATE public.site_settings
SET value = jsonb_build_object(
  'version', '1.7.1',
  'url', 'https://mag-pro1.com/__l5e/assets-v1/1b04072d-14a7-46b3-a2dd-4f934da77123/MagProAgent-Setup.exe',
  'notes', 'تشغيل خفي تمامًا مع ويندوز، جودة بث عالية من البداية، وتحديث تلقائي داخل البرنامج بدون فتح المتصفح.',
  'autoInstall', true
)
WHERE key = 'agent_update';