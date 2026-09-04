# تشغيل الموقع على سيرفرك الخاص (Lovable للبناء فقط)

الهدف: التطبيق + قاعدة البيانات + مهمة مزامنة Bybit كلها على سيرفرك، وLovable تُستخدم للتطوير والبناء فقط، بدون استهلاك رصيد تشغيل سحابي.

## 1) نقل قاعدة البيانات إلى حسابك

الأسهل: مشروع Supabase خاص بك (نفس الكود يعمل بدون تعديل)، أو Supabase self-hosted بـDocker على سيرفرك.

1. أنشئ مشروع Supabase جديد باسمك (أو شغّل supabase self-hosted).
2. طبّق كل الـmigrations الموجودة في مجلد `supabase/migrations` بالترتيب على القاعدة الجديدة:
   ```bash
   psql "$NEW_DB_URL" -f supabase/migrations/<file>.sql   # كل ملف بالترتيب
   ```
3. انقل البيانات الحالية (بيانات فقط، من نسخة احتياطية أخذتها من Cloud → Advanced → Export data):
   ```bash
   pg_restore --data-only --no-owner -d "$NEW_DB_URL" backup.dump
   # أو: psql "$NEW_DB_URL" -f data.sql
   ```
4. انقل ملفات التخزين بالسكربت الجاهز (لا يحذف شيئًا من القديم):
   ```bash
   # جرّب أولًا بدون كتابة
   DRY_RUN=1 OLD_SUPABASE_URL=... OLD_SERVICE_ROLE_KEY=... \
   NEW_SUPABASE_URL=... NEW_SERVICE_ROLE_KEY=... \
   node selfhost/migrate-storage.mjs

   # ثم النقل الفعلي
   OLD_SUPABASE_URL=... OLD_SERVICE_ROLE_KEY=... \
   NEW_SUPABASE_URL=... NEW_SERVICE_ROLE_KEY=... \
   node selfhost/migrate-storage.mjs
   ```
   يشمل: `product-images`, `course-videos`, `employee-faces`, `payment-screenshots`, `site-assets`, `avatars`.
   تحقق من تساوي عدد الملفات قبل حذف أي شيء من القديم.
5. **نقل المستخدمين:** حافظ على نفس الـUUIDs لأن `profiles` و`user_roles` و`agent_devices` و`work_shifts` مرتبطة بها.
   إما نقل `auth.users` مع الـpassword hashes كما هي، أو إعادة إنشاء المستخدمين بنفس الـid وإجبارهم على إعادة تعيين كلمة المرور.
6. أضف نفس الأسرار (مفاتيح Bybit … إلخ) في `selfhost/.env`.


## 2) بناء وتشغيل التطبيق على السيرفر

```bash
git clone <repo> /opt/mag-pro1 && cd /opt/mag-pro1/selfhost
cp .env.example .env      # املأ القيم
docker compose up -d --build
```

التطبيق يعمل على `127.0.0.1:3000`. بدون Docker:

```bash
bun install
NITRO_PRESET=node-server bun run build
node .output/server/index.mjs      # مع pm2: pm2 start .output/server/index.mjs --name mag-pro1
```

## 3) الدومين و SSL

```bash
cp selfhost/nginx.conf /etc/nginx/sites-available/mag-pro1.conf
ln -s /etc/nginx/sites-available/mag-pro1.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d mag-pro1.com -d www.mag-pro1.com
```
ثم غيّر DNS للدومين ليشير إلى IP سيرفرك، واحذف الدومين من إعدادات Lovable.

## 4) مزامنة Bybit على سيرفرك

- مع docker compose: خدمة `bybit-cron` تعمل تلقائيًا كل `SYNC_INTERVAL_SECONDS` (افتراضي 5 دقائق).
- بدون Docker: استخدم `selfhost/bybit-sync.sh` في crontab:
  ```
  */5 * * * * APP_URL=http://127.0.0.1:3000 /opt/mag-pro1/selfhost/bybit-sync.sh >> /var/log/bybit-sync.log 2>&1
  ```

**مهم:** بعد تشغيل الكرون على سيرفرك، أوقف المهمة القديمة داخل Lovable من
More → Cloud → Jobs → `bybit-ledger-auto-sync` → Disable، وإلا ستعمل المزامنة مرتين وتستهلك رصيد تشغيل.

## 5) إيقاف استهلاك السحابة نهائيًا

بعد التأكد أن الموقع يعمل من سيرفرك:
1. أوقف كل المهام المجدولة في Cloud → Jobs.
2. ألغِ نشر المشروع من Lovable (Publish → إخفاء/إلغاء النشر) حتى لا يستقبل زيارات.
3. أوقف/أصغّر النسخة السحابية من Cloud → Advanced settings (Pause).
4. استمر في استخدام Lovable للتطوير فقط، ثم انسخ التغييرات إلى سيرفرك عبر git + إعادة البناء.

## ملاحظات

- `VITE_*` تُحقن وقت البناء، لذلك أي تغيير فيها يحتاج إعادة بناء (وليس إعادة تشغيل فقط).
- الأسرار السيرفرية (`SUPABASE_SERVICE_ROLE_KEY`, `BYBIT_*`) تُقرأ وقت التشغيل من `.env` فقط ولا تُرسل للمتصفح.
- لو استخدمت Postgres عاري بدون Supabase ستحتاج بديلًا لـAuth/Storage/Data API، لذلك Supabase (سحابي خاص أو self-hosted) هو المسار الأقل مخاطرة.
