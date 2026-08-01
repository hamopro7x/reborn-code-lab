update public.site_settings set value = jsonb_build_object(
  'version','1.8.3',
  'url','https://reborn-code-lab.lovable.app/__l5e/assets-v1/559b5a9e-25a0-42e4-acc3-f11885c4f9d5/MagProAgent-Setup-1.8.3.exe',
  'notes','تحسين قوي لسرعة البث: تحكّم تلقائي سريع في الجودة حسب سرعة النت (كل 0.7 ثانية)، مسار مُرحّل بديل للشبكات الضعيفة، وتصغير الدقة تلقائياً بدل تجمّد الشاشة.'
) where key = 'agent_update';