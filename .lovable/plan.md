# تقرير الوضع الحالي: الانتقال للتشغيل الذاتي (Lovable للبناء فقط)

## 1) ما تم تنفيذه فعليًا

كل ما نُفذ حتى الآن هو ملفات تشغيل ذاتي جديدة، بدون أي تغيير في منطق التطبيق:

- `selfhost/Dockerfile` — بناء بـBun ثم تشغيل على Node 22، مع `NITRO_PRESET=node-server` بدل Cloudflare Workers، ويشغّل `.output/server/index.mjs` على المنفذ 3000.
- `selfhost/docker-compose.yml` — خدمة `app` على `127.0.0.1:3000` + خدمة `bybit-cron` (Alpine + curl) تنادي `/api/public/hooks/bybit-ledger-sync` كل `SYNC_INTERVAL_SECONDS` (افتراضي 300 ثانية).
- `selfhost/nginx.conf` — reverse proxy للدومين `mag-pro1.com` / `www` مع دعم WebSocket و`client_max_body_size 50m`.
- `selfhost/bybit-sync.sh` — بديل cron بدون Docker.
- `selfhost/.env.example` — قالب متغيرات (Supabase URL/keys، `SUPABASE_SERVICE_ROLE_KEY`، مفاتيح Bybit، فاصل المزامنة).
- `selfhost/README.md` — دليل النقل خطوة بخطوة.
- `package.json` — أُضيف سكربت `build:node`.

لم يُنقل أي شيء فعليًا بعد: لا قاعدة بيانات، لا تخزين، لا DNS، ولا إيقاف للمهام السحابية.

## 2) ما زال معتمدًا على Lovable Cloud الآن

- **قاعدة البيانات + Data API**: كل شيء. `src/integrations/supabase/client.ts` و`client.server.ts` و`auth-middleware.ts` تشير إلى مشروع Cloud عبر `.env` (`VITE_SUPABASE_URL` / `SUPABASE_URL`).
- **Auth**: نفس مشروع Cloud. بالإضافة إلى وسيط Lovable للـOAuth في `src/integrations/lovable/index.ts` عبر حزمة `@lovable.dev/cloud-auth-js` (Google/Apple/Microsoft تمر من بروكر Lovable — لن يعمل على Supabase خاص بك دون إعداد providers مباشرة).
- **Storage**: buckets السحابية (`product-images`, `course-videos`, `employee-faces`, `payment-screenshots`, `site-assets`, `avatars`) مستخدمة في `src/routes/_authenticated/admin.tsx`, `src/lib/work.server.ts`, `src/lib/courses.functions.ts`, `src/lib/admin.functions.ts`, `src/components/admin/HeroBannerManager.tsx`.
- **Jobs (pg_cron)**: مهمة `bybit-ledger-auto-sync` نشطة داخل القاعدة السحابية.
- **Bybit sync**: الكود نفسه (`src/lib/bybit.server.ts`, `src/routes/api/public/hooks/bybit-ledger-sync.ts`) محايد ويعمل على أي سيرفر، لكن المفاتيح والحالة (`bybit_sync_state`) في القاعدة السحابية.
- **AI**: نعم موجود — `src/lib/work.server.ts` ينادي `https://ai.gateway.lovable.dev` بمفتاح `LOVABLE_API_KEY` في ثلاث دوال (فحص جودة الوجه، مقارنة الوجوه، `askVision`). هذا اعتماد تشغيلي مباشر على Lovable ويستهلك رصيد.
- **الاستضافة/النشر**: الموقع الحالي منشور على Lovable، والدومين `mag-pro1.com` مربوط بها.
- **MCP**: `@lovable.dev/mcp-js` مفعّل في `vite.config.ts` و`src/lib/mcp/*`.

## 3) هل ملفات selfhost كافية للـProduction؟

قاعدة صحيحة لكن ناقصة في نقاط مهمة:

- **مسار البناء غير مُتحقق منه**: `@lovable.dev/vite-tanstack-config` يستخدم nitro بهدف Cloudflare افتراضيًا؛ `NITRO_PRESET=node-server` منطقي لكنه لم يُختبر فعليًا هنا. لازم بناء تجريبي قبل الاعتماد عليه.
- **الأسرار غير مكتملة في `.env.example`**: ناقص `SUPABASE_ANON_KEY` (يستخدمه فحص مفتاح الـhook)، `CLOUDFLARE_TURN_KEY_ID` و`CLOUDFLARE_TURN_API_TOKEN` (المشاركة/الاتصال في `src/routes/api/public/ice-servers.ts`)، و`LOVABLE_API_KEY` لو أردت إبقاء فحص الوجه.
- **مفتاح الـhook ضعيف منطقيًا**: `bybit-ledger-sync` يقارن بالـpublishable key، وهو مفتاح عام. على سيرفر مكشوف يُفضل سر خاص.
- **لا Healthcheck ولا logging/restart policy لقاعدة البيانات**، ولا نسخ احتياطي دوري، ولا `docker compose` لـSupabase self-hosted لو اخترت هذا المسار.
- **الوسيط `bybit-cron` يعتمد على `VITE_SUPABASE_PUBLISHABLE_KEY`** من `.env` — لازم يبقى موجود بنفس الاسم وإلا تفشل المزامنة بصمت.
- **لا خطة لنقل ملفات Storage** (سكربت نسخ buckets) — الدليل يذكرها كخطوة يدوية فقط.
- **OAuth**: لا شيء في الملفات يعالج استبدال بروكر Lovable بـproviders مباشرة على Supabase الخاص بك.

## 4) مهمة bybit-ledger-auto-sync

نعم، ما زالت **نشطة** الآن على Lovable Cloud:

- `jobname: bybit-ledger-auto-sync`, `schedule: * * * * *`, `active: true`
- تنادي عبر `net.http_post` الرابط `https://project--335637d3-....lovable.app/api/public/hooks/bybit-ledger-sync`

أي 1440 تشغيلًا يوميًا، كل واحد منها: طلب HTTP للتطبيق المنشور + نداءات Bybit API + قراءة/كتابة قاعدة البيانات. هذه أكبر مصدر مرشّح لاستهلاك Run credits، إلى جانب نداءات AI Gateway في فحص وجه الموظفين.

## 5) الخطوات المتبقية بالترتيب

1. **تحقّق من البناء**: تشغيل `bun run build:node` وتأكيد إنتاج `.output/server/index.mjs` يعمل على Node.
2. **اختيار الـBackend**: مشروع Supabase خاص بك (الأسهل) أو Supabase self-hosted بـDocker على الـVPS.
3. **نقل المخطط**: تطبيق 77 ملف migration من `supabase/migrations` بالترتيب، ثم التحقق من الدوال والـtriggers والـGRANTs.
4. **نقل البيانات**: تصدير من Cloud (Advanced → Export data) ثم استيراد data-only، مع التحقق من عدّاد الصفوف في الجداول الكبيرة (`bybit_card_txns`, `bybit_ledger`).
5. **نقل Storage**: إنشاء نفس الـbuckets بنفس سياسات الوصول ونسخ الملفات.
6. **Auth**: إنشاء المستخدمين/الأدوار، وإعداد Google OAuth مباشرة على مشروعك، واستبدال بروكر Lovable في `src/integrations/lovable/index.ts` بـ`supabase.auth.signInWithOAuth`.
7. **قرار AI**: إما ترك فحص الوجه معطلًا (الكود يتعامل مع غياب المفتاح)، أو نقله لمزوّد خاص بك.
8. **الأسرار**: استكمال `selfhost/.env.example` بكل المتغيرات الناقصة أعلاه، وإدخال سر خاص لحماية الـhook.
9. **التشغيل**: `docker compose up -d --build`، ثم nginx + certbot، ثم تحويل DNS بعد التأكد.
10. **الإيقاف السحابي**: تعطيل `bybit-ledger-auto-sync`، إلغاء النشر من Lovable، إزالة الدومين منها، ثم Pause للنسخة السحابية بعد التأكد أن كل شيء يعمل من سيرفرك.
11. **ما بعد النقل**: نسخ احتياطي دوري + مراقبة، ودورة تطوير: Lovable → git → إعادة بناء على السيرفر.

## ملاحظة

لم يُعدَّل أي كود أو إعداد في هذه الخطوة — تقرير فحص فقط. الخطوة التالية المقترحة هي البند 1 و8 (التحقق من البناء واستكمال الأسرار) لأنهما بدون أي مخاطرة على البيانات.
