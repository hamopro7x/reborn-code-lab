# خطة النقل الكامل إلى VPS

- [x] ملفات selfhost (Dockerfile, compose, nginx, sync scripts, migrate-storage)
- [x] `.dockerignore` لتسريع البناء ومنع تسريب ملفات محلية
- [x] سكربت تصدير الـschema/migrations للقاعدة الجديدة (`selfhost/migrate-db.sh`)
- [x] إنشاء مشروع Supabase الجديد + تشغيل migrations
- [x] نقل البيانات + Storage + المستخدمين (تم التحقق: 44 جدول، 80 سياسة، 7 buckets، 102 ملف، 4 حسابات، جدول رمز الاستلام شغال)

- [ ] المستخدم: git clone على الـVPS + `docker compose up -d --build`
- [ ] المستخدم: DNS + SSL + تعطيل جوب Bybit في Lovable + إلغاء النشر
- [ ] استبدال أسرار اتصال Fly بالقيم الجديدة وتجهيز أوامر النشر
- عدم إعادة تشغيل السحابة القديمة (Lovable Cloud) نهائيًا، والاكتفاء بالقاعدة الجديدة.
