# نشر المشروع على Northflank

هذا الدليل لرفع الموقع على [Northflank](https://www.northflank.com) باستخدام Buildpack (Node.js).

## 1) ملفات المشروع الجاهزة

تم إعداد الملفات التالية مسبقًا:

- `package.json`: الـ build والـ start مناسبين لـ Northflank.
  - `build`: `npm run build:node`
  - `start`: `node .output/server/index.mjs`
- `.nvmrc`: يحدد Node.js 22.
- `.npmrc`: يخبر npm بتحميل حزم `@lovable.dev` من سجل Lovable العام، ويتفادى مشكلة peer deps في npm 10.

## 2) خطوات النشر

1. في Northflank أنشئ **Service** جديد من نوع **Build from repository**.
2. اربط مستودع Git الخاص بالمشروع.
3. اختر **Buildpack** (Node.js).
4. تأكد من إعدادات البناء:
   - **Build context**: `/` (الجذر)
   - **Build command**: `npm run build`
   - **Run command**: `npm start`
5. أضف متغيرات البيئة (Environment variables) في تبويب **Environment** للـ Service.
   - انسخ القيم من ملف `selfhost/.env` (لا ترفعه لـ Git؛ هو في `.gitignore`).
   - المتغيرات المطلوبة كحد أدنى:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_PUBLISHABLE_KEY`
     - `VITE_SUPABASE_PROJECT_ID`
     - `SUPABASE_URL`
     - `SUPABASE_PUBLISHABLE_KEY`
     - `SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `SUPABASE_PROJECT_ID`
   - إذا كنت تستخدم Bybit، أضف أيضًا:
     - `BYBIT_API_KEY`
     - `BYBIT_API_SECRET`
     - `SYNC_HOOK_SECRET` (ولّده مرة واحدة: `openssl rand -hex 32`)
     - `SYNC_INTERVAL_SECONDS` (مثلاً `300`)
     - `SYNC_TIMEOUT_SECONDS` (مثلاً `120`)
6. اضغط **Deploy**.

## 3) المزامنة (Bybit) على Northflank

يمكنك تشغيل مهمة مزامنة دورية بإحدى طريقتين:

### أ) استخدام Northflank Job (cron)

- أنشئ **Job** من نوع **Cron**.
- اجعلها تستدعي endpoint المشروع كل 5 دقائق:
  ```bash
  curl -fsS -H "x-sync-secret: $SYNC_HOOK_SECRET" \
    https://your-service-name.northflank.app/api/public/hooks/bybit-ledger-sync
  ```
- تأكد أن الـ Job يستطيع الوصول للـ Service عبر الإنترنت (أو داخليًا إن وفر Northflank internal DNS).

### ب) cron داخلي في نفس الـ Service

لو لم يكن الـ Job متاحًا في خطتك، يمكنك تشغيل سكربت cron داخل الـ Service نفسه عن طريق تعديل `CMD` في Dockerfile مستقبلي.

## 4) ملاحظات مهمة

- Northflank يستخدم `PORT` المتغير الافتراضي `3000`؛ التطبيق يستمع على المنفذ من `process.env['PORT']` إذا كان موجودًا، وإلا `3000`.
- لا ترفع ملف `.env` إلى Git؛ استخدم متغيرات البيئة في لوحة Northflank.
- إذا تغيرت بيانات قاعدة البيانات مستقبلًا، عدّل المتغيرات في Northflank فقط.

## 5) التحقق بعد النشر

افتح الرابط الذي يعطيك Northflank وتحقق من:

- الصفحة الرئيسية تفتح.
- تسجيل الدخول يعمل.
- لوحة الإدارة تظهر البيانات.
- `/api/public/build-version` يعيد رقم نسخة.
