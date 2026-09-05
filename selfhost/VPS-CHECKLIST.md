# خطوات النقل إلى الـVPS

كل الملفات جاهزة داخل مجلد `selfhost/`. اتبع الترتيب.

## 0) ما ستحتاجه بيدك (لا ترسله لأحد)
- رابط قاعدة البيانات الحالية (للتصدير) — إن لم يتوفر، ننقل الهيكل من `supabase/migrations` والبيانات لاحقًا.
- مشروع قاعدة/Auth جديد تملكه أنت + مفتاح الخدمة (service role).
- بيانات دخول الـVPS، والدومين على Cloudflare.

## 1) نسخ الكود على السيرفر
```bash
sudo mkdir -p /opt/mag-pro1 && cd /opt/mag-pro1
git clone <رابط المستودع> .
```

## 2) تجهيز القاعدة الجديدة
```bash
# تصدير من الحالية (قراءة فقط)
OLD_DB_URL="postgresql://..." ./selfhost/export-cloud.sh

# استيراد إلى الجديدة
NEW_DB_URL="postgresql://..." ./selfhost/import-new.sh
```
بدون تصدير: `NEW_DB_URL="..." ./selfhost/migrate-db.sh` لتطبيق الـ77 ملف هيكل فقط.

## 3) نقل الملفات (الصور/المرفقات)
```bash
node ./selfhost/migrate-storage.mjs
```

## 4) الإعدادات
```bash
cp selfhost/.env.example selfhost/.env
openssl rand -hex 32   # ضع الناتج في SYNC_HOOK_SECRET
nano selfhost/.env
```

## 5) التشغيل
```bash
./selfhost/setup-vps.sh
```

## 6) الدومين وHTTPS
```bash
sudo cp selfhost/nginx.conf /etc/nginx/sites-available/mag-pro1.conf
sudo ln -s /etc/nginx/sites-available/mag-pro1.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mag-pro1.com -d www.mag-pro1.com
```
في Cloudflare: سجل A للدومين على IP السيرفر، وSSL mode = Full (strict).

## 7) النسخ الاحتياطي
```bash
sudo crontab -e
# 0 3 * * * cd /opt/mag-pro1 && DB_URL="postgresql://..." ./selfhost/backup.sh >> /var/log/mag-backup.log 2>&1
```

## 8) بعد نجاح الاختبار فقط
- تأكد أن مزامنة Bybit تعمل من السيرفر (`docker compose logs -f bybit-cron`).
- عندها فقط أوقف أي مهام سحابية متبقية.

## ملاحظات مهمة
- كلمات مرور المستخدمين تُنقل كما هي إذا نجح تصدير `auth.users`؛ وإلا يحتاج المستخدمون إعادة تعيين كلمة المرور.
- تسجيل الدخول بجوجل يحتاج إعادة ضبط بيانات OAuth على المشروع الجديد.
- ميزة فحص الوجه تحتاج مزود AI خارجي عبر `VISION_API_KEY` وإلا تبقى معطّلة دون التأثير على باقي الموقع.
- إرسال بريد التأكيد/الاسترجاع يحتاج SMTP على المشروع الجديد.
