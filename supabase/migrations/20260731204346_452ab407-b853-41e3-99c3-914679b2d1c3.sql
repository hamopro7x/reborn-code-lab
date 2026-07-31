UPDATE public.site_settings
SET value = jsonb_build_object('version','1.1.0','notes','تحسين جودة البث حتى 4K وسرعة أعلى','url','https://www.mag-pro1.com/__l5e/assets-v1/78b7e95e-0e22-48b0-ae4a-818623a74a41/mag-pro-agent-windows.zip'),
    updated_at = now()
WHERE key = 'agent_update';