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
fly apps create mag-pro1
```

إذا كان الاسم مستخدمًا، اختر اسمًا آخر وعدّله في `fly.toml`.

## 4) إضافة الأسرار (Runtime secrets)

هذه المتغيرات تُقرأ أثناء التشغيل على السيرفر فقط، ولا تُضمن في الصورة:

```bash
fly secrets set \
  SUPABASE_URL="https://kcdsdaytrnzoiharmyxo.supabase.co" \
  SUPABASE_PUBLISHABLE_KEY="sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo" \
  SUPABASE_ANON_KEY="sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo" \
  SUPABASE_SERVICE_ROLE_KEY="sb_secret_8P2H87-nB-BJRu87kjAkJw_sV10kGUy" \
  SUPABASE_PROJECT_ID="kcdsdaytrnzoiharmyxo" \
  BYBIT_API_KEY="" \
  BYBIT_API_SECRET="" \
  SYNC_HOOK_SECRET="$(openssl rand -hex 32)"
```

املأ `BYBIT_API_KEY` و `BYBIT_API_SECRET` إذا كنت تستخدم Bybit.

## 5) النشر

مرّر متغيرات البناء العامة (`VITE_*`) عبر سطر الأوامر:

```bash
fly deploy \
  --build-arg VITE_SUPABASE_URL="https://kcdsdaytrnzoiharmyxo.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_SnDM9gGnsqswJtD08pq1HA_ffezyBvo" \
  --build-arg VITE_SUPABASE_PROJECT_ID="kcdsdaytrnzoiharmyxo"
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
   https://mag-pro1.fly.dev/api/public/hooks/bybit-ledger-sync
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
