# خطة النقل الكامل إلى VPS

- [x] ملفات selfhost (Dockerfile, compose, nginx, sync scripts, migrate-storage)
- [x] `.dockerignore` لتسريع البناء ومنع تسريب ملفات محلية
- [x] سكربت تصدير الـschema/migrations للقاعدة الجديدة (`selfhost/migrate-db.sh`)
- [ ] المستخدم: إنشاء مشروع Supabase خاص + تشغيل migrations
- [ ] المستخدم: نقل البيانات + Storage + المستخدمين
- [ ] المستخدم: git clone على الـVPS + `docker compose up -d --build`
- [ ] المستخدم: DNS + SSL + تعطيل جوب Bybit في Lovable + إلغاء النشر
