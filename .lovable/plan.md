# نقل reborn-code-lab إلى VPS (Ubuntu 26.04 + Docker) — الخطوات التالية فقط

الهدف: أخذ نسخة الكود الحالية من Lovable وتشغيلها على الـVPS، وLovable للتطوير فقط.

## 1) حالة ملفات selfhost (تم التحقق منها الآن)

موجودة وكافية، ولن يُعاد كتابتها:

- `selfhost/Dockerfile` — بناء بـbun ثم تشغيل `node .output/server/index.mjs` بـ`NITRO_PRESET=node-server`.
- `selfhost/docker-compose.yml` — خدمة التطبيق على `127.0.0.1:3000` + healthcheck + خدمة كرون Bybit.
- `selfhost/sync-loop.sh` و`selfhost/bybit-sync.sh` — مزامنة Bybit من سيرفرك بدل جوب السحابة.
- `selfhost/nginx.conf` — reverse proxy لـmag-pro1.com.
- `selfhost/.env.example` — كل المتغيرات المطلوبة (Supabase، Bybit، RedotPay، TURN، AI).
- `selfhost/migrate-storage.mjs` — نقل ملفات الـStorage عند الحاجة.
- `package.json` فيه `build:node`.

النقص الوحيد المكتشف: لا يوجد `.dockerignore` في جذر المشروع، فسياق البناء يشمل `node_modules`/`.output` لو كانت موجودة على السيرفر ويبطئ البناء أو يفسد التثبيت.

## 2) الطريقة الصحيحة لأخذ نسخة المشروع من Lovable

الأفضل والأقل استهلاكًا: **GitHub**.

1. من Lovable: GitHub → Connect / Push to GitHub (repo خاص). كل تعديل تعمله في Lovable يُدفع تلقائيًا.
2. على الـVPS: `git clone` ثم `git pull` + إعادة بناء عند كل تحديث. لا credits تُستهلك في العملية.

بديل بدون GitHub: تنزيل المشروع كـZIP من Lovable ورفعه بـ`scp`، لكن كل تحديث لاحق يحتاج إعادة تنزيل ورفع يدوي — لا أنصح به.

ملاحظة: ملف `.env` الحالي في Lovable يحتوي فقط مفاتيح Supabase العامة؛ على السيرفر لا تستخدمه، استخدم `selfhost/.env` وحده.

## 3) الخطوات الدقيقة على الـVPS

```bash
git clone <repo-url> /opt/mag-pro1
cd /opt/mag-pro1/selfhost
cp .env.example .env      # املأ القيم
docker compose up -d --build
curl -s localhost:3000/api/public/build-version
```

ثم الدومين:

```bash
cp /opt/mag-pro1/selfhost/nginx.conf /etc/nginx/sites-available/mag-pro1.conf
ln -s /etc/nginx/sites-available/mag-pro1.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d mag-pro1.com -d www.mag-pro1.com
```

الحد الأدنى لتشغيل الموقع من `selfhost/.env`: `VITE_SUPABASE_URL`، `VITE_SUPABASE_PUBLISHABLE_KEY`، `VITE_SUPABASE_PROJECT_ID`، و`SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SERVICE_ROLE_KEY`. الباقي (Bybit، TURN، AI، RedotPay) اختياري وكل ميزة تتعطل بأمان بدون مفتاحها.

## 4) قرار مطلوب منك قبل مرحلة قاعدة البيانات

هذه الخطوة تشغّل **التطبيق** على سيرفرك؛ قاعدة البيانات والـAuth تبقى على النسخة الحالية حتى تقرر:

- **أ) إبقاء الـDB كما هي مؤقتًا** — أسرع طريق، الموقع يعمل من سيرفرك فورًا، لكن استهلاك الـDB يستمر.
- **ب) مشروع Supabase سحابي خاص بك** — نقل 77 migration + البيانات + Storage + المستخدمين بنفس الـUUIDs.
- **ج) Supabase self-hosted على نفس الـVPS** — أقصى استقلال وأعلى صيانة.

## 5) التغيير الوحيد المطلوب في الكود بهذه الخطوة

إضافة `.dockerignore` في الجذر يستثني: `node_modules`، `.output`، `.git`، `.wrangler`، `.nitro`، `agent/node_modules`، `agent/release`، `*.log`، `.env`.
لا تعديل على أي واجهة أو منطق عمل أو بيانات.

## 6) لتقليل الـcredits بعد نجاح التشغيل من سيرفرك

1. تعطيل جوب `bybit-ledger-auto-sync` من Cloud → Jobs (وإلا تعمل المزامنة مرتين).
2. تحويل DNS للدومين إلى IP الـVPS وإزالته من إعدادات Lovable.
3. إلغاء نشر مشروع Lovable حتى لا يستقبل زيارات، واستخدام Lovable للتطوير فقط.
