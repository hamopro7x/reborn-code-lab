# النشر على Fly.io

## 1) التجهيز المحلي

تأكد أن ملفات `Dockerfile` و `fly.toml` موجودة في جذر المشروع.

## 2) تثبيت flyctl وتسجيل الدخول

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

## 3) إنشاء التطبيق (مرة واحدة)

```bash
fly launch
```

- إذا كان اسم `mag-pro1` مستخدمًا، اختر اسمًا آخر وعدّله في `fly.toml`.
- `fly launch` ستكتشف `Dockerfile` وتستخدمه تلقائيًا.

## 4) إضافة الأسرار (Runtime secrets)

استبدل القيم داخل الأقواس `< >` بالقيم الفعلية من ملف `selfhost/.env`.
هذه المتغيرات تُقرأ أثناء التشغيل على السيرفر فقط، ولا تُضمن في الصورة:

```bash
fly secrets set \
  SUPABASE_URL="<URL من selfhost/.env>" \
  SUPABASE_PUBLISHABLE_KEY="<المفتاح العام من selfhost/.env>" \
  SUPABASE_ANON_KEY="<نفس المفتاح العام>" \
  SUPABASE_SERVICE_ROLE_KEY="<service role key من selfhost/.env>" \
  SUPABASE_PROJECT_ID="<PROJECT_ID من selfhost/.env>" \
  BYBIT_API_KEY="<BYBIT_API_KEY من selfhost/.env أو اتركه فارغًا>" \
  BYBIT_API_SECRET="<BYBIT_API_SECRET من selfhost/.env أو اتركه فارغًا>" \
  SYNC_HOOK_SECRET="$(openssl rand -hex 32)"
```

## 5) النشر

مرّر متغيرات البناء العامة (`VITE_*`) عبر سطر الأوامر:

```bash
fly deploy \
  --build-arg VITE_SUPABASE_URL="<URL من selfhost/.env>" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="<المفتاح العام من selfhost/.env>" \
  --build-arg VITE_SUPABASE_PROJECT_ID="<PROJECT_ID من selfhost/.env>"
```

## 6) فحص التشغيل

```bash
fly status
fly logs
```

افتح الرابط العام:

```bash
fly open
```

## 7) مزامنة Bybit (Cron)

Fly.io نفسه لا يقدّم cron بسيط. الخيارات:

1. استخدم خدمة cron خارجية (مجانية مثل cron-job.org) تستدعي:
   ```
   https://<اسم-التطبيق>.fly.dev/api/public/hooks/bybit-ledger-sync
   ```
   مع الهيدر:
   ```
   x-sync-secret: <القيمة اللي عملتها فوق>
   ```
2. أو أنشئ Machine ثانية في Fly.io لتشغيل `selfhost/sync-loop.sh`.

## ملاحظات التكلفة

- الخطة المجانية تشمل 3 أجهزة `shared-cpu-1x` بـ 256MB RAM.
- إعدادنا هنا يستخدم 512MB RAM، لذا قد تُحاسب على الفائض إن تجاوزت الحد المجاني.
- تقدير تقريبي: 512MB آلة تعمل 24/7 ≈ $3.7/شهر (بالإضافة إلى بيانات الخروج).
