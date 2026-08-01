UPDATE public.site_settings
SET value = jsonb_build_object(
  'version', '1.7.2',
  'url', 'https://mag-pro1.com/__l5e/assets-v1/55ce2cf7-1152-492c-b364-e7e42165cfcf/MagProAgent-Setup.exe',
  'notes', '',
  'autoInstall', true
)
WHERE key = 'agent_update';