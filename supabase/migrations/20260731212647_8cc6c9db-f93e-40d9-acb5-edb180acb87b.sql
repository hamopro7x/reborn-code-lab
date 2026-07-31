UPDATE public.site_settings
SET value = jsonb_build_object(
  'version', '1.2.0',
  'notes', 'إصلاح التشغيل التلقائي بعد إعادة تشغيل اللابتوب وإعادة الاتصال تلقائياً بعد النوم',
  'url', 'https://www.mag-pro1.com/__l5e/assets-v1/8e4a95e2-03d1-42a2-809d-d3997e873765/mag-pro-agent-windows.zip'
)
WHERE key = 'agent_update';