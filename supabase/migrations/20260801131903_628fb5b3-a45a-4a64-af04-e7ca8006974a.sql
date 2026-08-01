UPDATE public.site_settings SET value = jsonb_build_object(
  'version','1.8.2',
  'url','https://reborn-code-lab.lovable.app/__l5e/assets-v1/a3738785-42dd-4b8e-9718-8b407653dce0/MagProAgent-Setup-1.8.2.exe',
  'notes','تثبيت تلقائي صامت للتحديثات بدون تدخل الموظف، وإعادة تشغيل البرنامج في الخلفية بعد التحديث.'
), updated_at = now() WHERE key = 'agent_update';