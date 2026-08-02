UPDATE public.site_settings
SET value = jsonb_build_object(
  'version', '1.8.7',
  'url', 'https://shrrrgvcrevujivuyvzv.supabase.co/storage/v1/object/public/site-assets/agent%2FMagProAgent-Setup-1.8.7.exe',
  'notes', 'تأمين بث شاشة الموظف بحيث لا يبدأ إلا من حساب أدمن مصرح'
), updated_at = now()
WHERE key = 'agent_update';