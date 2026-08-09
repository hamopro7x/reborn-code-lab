UPDATE public.site_settings
   SET value = (value - 'notes') || jsonb_build_object('notes', 'تحديث جديد متاح.'),
       updated_at = now()
 WHERE key = 'agent_update';