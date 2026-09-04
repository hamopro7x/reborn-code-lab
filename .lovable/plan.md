# تشخيص: ربط Supabase ومفاتيح Bybit قبل النقل إلى VPS

تشخيص فقط — لم يتم تعديل أي ملف أو إعداد.

## 1) كيف المشروع متصل بـ shrrrgvcrevujivuyvzv؟

الربط ثابت في ملفين فقط:

- `supabase/config.toml` → `project_id = "shrrrgvcrevujivuyvzv"`
- `.env` (مُدار تلقائيًا) → `SUPABASE_URL` / `VITE_SUPABASE_URL` = `https://shrrrgvcrevujivuyvzv.supabase.co`، مع `SUPABASE_PUBLISHABLE_KEY` و`VITE_SUPABASE_PUBLISHABLE_KEY` و`SUPABASE_PROJECT_ID`.

الكود يقرأ هذه المتغيرات فقط:
- المتصفح: `src/integrations/supabase/client.ts`
- السيرفر بصلاحيات مستخدم: `auth-middleware.ts`
- السيرفر بصلاحيات كاملة: `client.server.ts` (يحتاج `SUPABASE_SERVICE_ROLE_KEY`)

هذا مشروع **Lovable Cloud**: قاعدة البيانات مُستضافة داخل تنظيم Supabase الخاص بـLovable، ولذلك هو غير ظاهر في حساب Supabase الشخصي عندك — وهذا سلوك متوقع، ليس خطأ في الحساب.

## 2) هل يمكن معرفة حساب/Organization المرتبط من داخل Lovable؟

لا. مشاريع Lovable Cloud لا تُعطي وصولًا إلى لوحة Supabase ولا إلى تنظيمها، ولا توجد شاشة تُظهر الحساب المالك. المتاح فقط:

- زر **View Backend** داخل Lovable لإدارة الجداول/الأدوار/الأسرار.
- إذا أردت مشروع Supabase تملكه فعليًا وتظهر لوحته لك، فالطريق هو إنشاء مشروع Supabase في حسابك وربط المشروع به (Connect Supabase)، أو نقل البيانات إليه.

## 3) من أين نحصل على SUPABASE_SERVICE_ROLE_KEY للـVPS؟

على Lovable Cloud مفتاح service role وكلمة مرور قاعدة البيانات **غير متاحين** للمستخدم — لا يمكن استخراجهما من هنا ولا من لوحة Supabase (لا وصول). لذلك أمامك مسارين واقعيين:

- **المسار الموصى به:** إنشاء مشروع Supabase في حسابك الخاص → المفتاح موجود عندك في `Project Settings → API keys → service_role / secret key` → تضعه أنت مباشرة في `selfhost/.env` على الـVPS. بعدها تُنقل الـmigrations والبيانات وStorage والمستخدمون، ويصبح الـVPS مستقلًا.
- **مسار مؤقت بدون مفتاح:** الـVPS لا يقرأ القاعدة بنفسه، بل ينادي فقط الـhook `POST /api/public/hooks/bybit-ledger-sync` على التطبيق المنشور من Lovable باستخدام `SYNC_HOOK_SECRET`. هذا يوقف الـCloud Cron لكنه يستهلك Run Credits لكل نداء، فهو حل انتقالي فقط.

لا ترسل لي أي مفتاح، ولن أطلبه؛ يُضاف من جهتك في `selfhost/.env` على السيرفر (أو Project Settings → Secrets داخل Lovable) ولا يُكتب في Git.

## 4) هل مفاتيح Bybit محفوظة في القاعدة؟ وهل نحتاجها في .env؟

نعم محفوظة في القاعدة، والترتيب في `src/lib/bybit.server.ts` كالتالي:

- **مع accountId** (وهذا ما تستخدمه المزامنة الجماعية): المفاتيح تُقرأ فقط من `private.bybit_account_keys` عبر RPC `bybit_account_get_keys`. لا يوجد أي رجوع إلى `.env` في هذه الحالة — إذا غابت مفاتيح الحساب يرمي `BYBIT_ACCOUNT_KEYS_MISSING`.
- **بدون accountId** (المفتاح القديم الواحد): أولًا `private.integration_keys` عبر `integration_get_bybit`، ثم `BYBIT_API_KEY` / `BYBIT_API_SECRET` من env كخيار أخير.

`syncAllCardTxns()` و`syncAllLedger()` كلاهما يمرّان على `listAccounts()` ويستخدمان مفاتيح كل حساب. النتيجة: **لا حاجة لـ`BYBIT_API_KEY`/`BYBIT_API_SECRET` في `selfhost/.env`** طالما كل حساب له مفاتيح مخزنة.

المطلوب فعليًا للمزامنة على VPS: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (لقراءة المفاتيح عبر RPC والكتابة في السجل) + `SYNC_HOOK_SECRET`.

## الخطوة التالية التي تحتاج قرارك

هل نمضي في إنشاء مشروع Supabase في حسابك الخاص والنقل الكامل إليه، أم نكتفي مؤقتًا بتشغيل الكرون من الـVPS على التطبيق المنشور الحالي؟
