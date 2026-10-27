# إعداد البريد (Gmail متعدد الحسابات) — MG Pro

البريد يعمل بربط Google OAuth مباشر لكل حساب (بدون كلمة سر Gmail وبدون Lovable connector).
الرسائل تُستورد **فقط بعد لحظة الربط**. أي تنظيم في الموقع (قراءة/نجمة/أرشيف/تصنيف/حذف) لا يغيّر Gmail.
الإرسال والرد فقط هما ما يصل إلى Gmail.

## خطوات لازم يعملها إنسان قبل التشغيل
1. **قاعدة البيانات:** شغّل `supabase/manual/mail_system.sql` مرة واحدة في Supabase SQL Editor (مشروع kcdsdaytrnzoiharmyxo). إضافة فقط، لا تمسح شيئًا.
2. **Google Cloud Console** (https://console.cloud.google.com):
   - APIs & Services → Library → فعّل **Gmail API**.
   - Google Auth Platform → Branding/Audience: نوع External، أضف دومين `mag-pro1.com` (ويتطلب توثيقه في Search Console).
   - Data Access (Scopes): `openid`, `userinfo.email`, `gmail.readonly`, `gmail.send`.
     ملاحظة: `gmail.readonly` scope «مقيّد» — للاستخدام العام لازم مراجعة Google (وقد تطلب تقييم أمني). لحسابات قليلة خاصة بك:
     اترك التطبيق في Testing وأضف الإيميلات كـ Test users (لكن Google يفصل الربط كل 7 أيام في Testing)، أو اعمل Publish واقبل شاشة "unverified app" لنفسك (حد 100 مستخدم).
   - Clients → Create OAuth client → Web application → Authorized redirect URI:
     `https://mag-pro1.com/api/public/mail-oauth/callback`
3. **أسرار Fly** (مرة واحدة، لا تُكتب في الكود):
   ```powershell
   fly secrets set -a m-hamo GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... `
     GOOGLE_OAUTH_REDIRECT_URI=https://mag-pro1.com/api/public/mail-oauth/callback `
     MAIL_TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32> MAIL_SYNC_SECRET=<openssl rand -hex 32>
   ```
   لا تغيّر `MAIL_TOKEN_ENCRYPTION_KEY` بعد الربط (وإلا أعد ربط كل الحسابات).
4. **المزامنة المجدولة** (تعمل حتى لو لا أحد يفتح الموقع) — اختر واحدة:
   - VPS: خدمة `mail-cron` في `selfhost/docker-compose.yml` (كل 30 ثانية).
   - Fly بدون VPS: من Supabase SQL Editor (pg_cron + pg_net):
     ```sql
     select cron.schedule('mgpro-mail-sync', '* * * * *', $$
       select net.http_post('https://mag-pro1.com/api/public/hooks/mail-sync',
         '{}'::jsonb, '{}'::jsonb, '{"Content-Type":"application/json","x-sync-secret":"<MAIL_SYNC_SECRET>"}'::jsonb)
     $$);
     ```
5. انشر: `cd $HOME\hamo; git pull origin main; .\deploy.ps1` ثم من لوحة الإدارة → البريد → الحسابات → «إضافة جيميل».

## الصلاحيات (تُفحص على السيرفر في كل طلب)
- الموظف: يشاهد كل الرسائل والمرفقات + تبديل مقروء/غير مقروء فقط.
- الأدمن: كل شيء (ربط/إيقاف/حذف حساب، إرسال/رد/مسودات، أرشيف/نجمة/تصنيف/حذف محلي، السجل).

## سلوك المزامنة
- عند الربط يُحفظ `historyId` الحالي و`linked_at`؛ لا يُستورد أي شيء أقدم.
- كل دورة تقرأ Gmail history بعد المؤشر فقط (رسائل جديدة + حذف). لو المؤشر انتهت صلاحيته يُستكمل الفائت منذ آخر مزامنة (ولا يتجاوز `linked_at`).
- حذف الرسالة أو نقلها لسلة Gmail → تُحذف من الموقع. الحذف النهائي من الموقع يترك Gmail سليمًا ويُسجَّل tombstone حتى لا تعود.
- حذف حساب: يلغي التوكن عند Google ويمسح كل رسائله ومرفقاته ومسوداته وإشعاراته من قاعدة الموقع. يبقى سطر «حذف حساب» في السجل للمراجعة (فيه الإيميل فقط). النسخ الاحتياطية (`selfhost/backup.sh`) قد تحتوي بيانات قديمة حتى تنتهي دورتها.

## الإشعارات
- داخل الموقع (صوت + تنبيه) وإشعار نظام عند السماح، طالما لوحة الإدارة مفتوحة في تبويب (حتى لو في الخلفية).
- Web Push للمتصفح المغلق **غير مُفعّل بعد** (يحتاج مفاتيح VAPID وservice worker) — مرحلة لاحقة.
