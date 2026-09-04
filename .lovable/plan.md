# تقرير + خطة الانتقال الكامل للسيرفر (Lovable للبناء فقط)

لم يُعدَّل أي كود أو إعداد. هذا فحص وخطة فقط.

## 1) ما تم تنفيذه فعليًا حتى الآن

ملفات تشغيل ذاتي فقط، بدون أي تغيير في منطق التطبيق:

- `selfhost/Dockerfile` — بناء بـBun ثم تشغيل Node 22 مع `NITRO_PRESET=node-server` (بدل Cloudflare Workers)، يشغّل `.output/server/index.mjs` على المنفذ 3000.
- `selfhost/docker-compose.yml` — خدمة `app` على `127.0.0.1:3000` + خدمة `bybit-cron` تنادي `/api/public/hooks/bybit-ledger-sync` كل `SYNC_INTERVAL_SECONDS` (افتراضي 300).
- `selfhost/nginx.conf` — reverse proxy لـ`mag-pro1.com` مع دعم WebSocket و`client_max_body_size 50m`.
- `selfhost/bybit-sync.sh` — بديل cron بدون Docker.
- `selfhost/.env.example` — قالب متغيرات.
- `selfhost/README.md` — دليل النقل.
- `package.json` — سكربت `build:node`.

لم يُنقل أي شيء فعليًا: لا قاعدة بيانات، لا Storage، لا DNS، ولا إيقاف لأي مهمة سحابية.

## 2) الاعتماديات المتبقية على Lovable وقت التشغيل

| المجال | الملفات | الحالة |
|---|---|---|
| قاعدة البيانات + Data API | `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `.env` | كل القراءة/الكتابة على مشروع Cloud |
| Auth (جلسات) | نفس الملفات أعلاه | مستخدمو Cloud + JWT من Cloud |
| Auth (OAuth اجتماعي) | `src/integrations/lovable/index.ts` + حزمة `@lovable.dev/cloud-auth-js` | يمر عبر بروكر Lovable — لن يعمل على مشروعك الخاص كما هو |
| Storage | `admin.tsx`, `work.server.ts`, `courses.functions.ts`, `admin.functions.ts`, `HeroBannerManager.tsx` | buckets: `product-images`, `course-videos`, `employee-faces`, `payment-screenshots`, `site-assets`, `avatars` |
| Jobs | `cron.job` داخل قاعدة Cloud | `bybit-ledger-auto-sync` نشطة |
| Bybit | `src/lib/bybit.server.ts`, `src/routes/api/public/hooks/bybit-ledger-sync.ts` | الكود محايد، لكن المفاتيح والحالة (`bybit_sync_state`) في Cloud |
| AI | `src/lib/work.server.ts` (3 مواضع: `LOVABLE_API_KEY` → `ai.gateway.lovable.dev`) | فحص جودة الوجه، مقارنة الوجوه، `askVision` |
| MCP | `vite.config.ts` (`@lovable.dev/mcp-js`), `src/lib/mcp/*`, `src/routes/[.mcp]/*`, `src/routes/mcp.ts`, `src/routes/[.]lovable.oauth.consent.tsx` | يعمل على أي سيرفر لكن OAuth/consent مبني على Cloud Auth |
| TURN | `src/routes/api/public/ice-servers.ts` | يستخدم Cloudflare TURN (حسابك أو الافتراضي) مع fallback لـ`TURN_*` |
| الاستضافة/الدومين | Lovable Publish + `mag-pro1.com` | ما زال على Lovable |

**لا يوجد Edge Functions** — مجلد `supabase/functions` غير موجود، وكل المنطق داخل `createServerFn` وroutes، وهذه أخبار جيدة للنقل.

## 3) مزامنة Bybit — نقل بدون ازدواجية أو فقد بيانات

- المزامنة idempotent: الكتابة `upsert` على معرّف Bybit، ومقارنة الصفوف الموجودة على دفعات قبل الكتابة، فلا خطر تكرار صفوف.
- الحماية من التزامن موجودة: lease في `bybit_sync_state` (4 دقائق) — أي هوب متزامن يخرج مبكرًا. يعني حتى لو عمل الكرون القديم والجديد معًا، لا يحدث تلف، فقط استهلاك زائد.
- الترتيب الآمن: شغّل الكرون على سيرفرك أولًا وتأكد أن `last_run_at` يتحدث، ثم عطّل `bybit-ledger-auto-sync` في Cloud.
- تحفّظ واحد: الـhook يتحقق بالـpublishable key (مفتاح عام). على سيرفر مكشوف يجب استبداله بسر خاص قبل الإنتاج.

## 4) نقل Storage وبيانات Auth

**Storage:** إنشاء نفس الستة buckets بنفس حالة الخصوصية (كلها private حاليًا) ونفس سياسات `storage.objects` من الـmigrations، ثم نسخ الملفات (سكربت يقرأ بالـservice role من القديم ويكتب في الجديد). ملفات `employee-faces` و`payment-screenshots` حساسة — انسخها ثم تحقق من العدد قبل حذف أي شيء.

**Auth:** لا يمكن نسخ الجلسات، والـpassword hashes تحتاج نقلًا على مستوى `auth.users`. خيارك:
- (أ) نقل `auth.users` كما هي مع الـhashes (يحتاج صلاحية service role/DB على المشروعين) — كلمات المرور تظل تعمل، و`profiles.id` و`user_roles.user_id` تبقى متطابقة.
- (ب) إعادة إنشاء المستخدمين وإجبارهم على إعادة تعيين كلمة المرور، مع الحفاظ على نفس الـUUIDs يدويًا حتى لا تنكسر الأدوار والجداول المرتبطة.

الأهم: **الحفاظ على نفس UUIDs** لأن كل الجداول (`profiles`, `user_roles`, `agent_devices`, `work_shifts` …) تربط بها.

## 5) استبدال Lovable AI Gateway (فحص/مقارنة الوجه)

المواضع الثلاثة في `src/lib/work.server.ts` تستدعي vision عبر HTTP بشكل متوافق مع OpenAI (`/v1/chat/completions` + صور base64). الاستبدال بسيط نسبيًا: تغيير الـbase URL والمفتاح والموديل إلى مزود خارجي تضع مفتاحه في `.env` على سيرفرك (OpenAI أو Google AI Studio أو أي gateway متوافق). الكود اليوم يتعامل بأمان مع غياب المفتاح (يرجع "الخدمة غير متاحة")، فيمكن ترك الميزة معطلة مؤقتًا دون كسر الموقع.

**قرار مطلوب منك:** أي مزود؟ (OpenAI / Google AI Studio / آخر / تعطيل الميزة مؤقتًا).

## 6) المتغيرات والأسرار — الناقص بالضبط في `selfhost/.env.example`

موجود: `VITE_SUPABASE_*`, `SUPABASE_URL/PUBLISHABLE_KEY/SERVICE_ROLE_KEY`, `BYBIT_API_KEY/SECRET`, `SYNC_INTERVAL_SECONDS`.

ناقص فعليًا (مستخدم في الكود):
- `SUPABASE_ANON_KEY` — يقرأه فحص مفتاح الـhook.
- `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` — أو بدلًا منها `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.
- `REDOTPAY_API_BASE` — لوحة RedotPay.
- `BYBIT_SPEND_AUDIT` (اختياري تشخيصي).
- مفتاح AI الخارجي بعد قرار البند 5 (بديل `LOVABLE_API_KEY`).
- سر خاص لحماية `bybit-ledger-sync` (بدل الـpublishable key).

## 7) هل selfhost صالح للإنتاج؟

أساس صحيح، لكن يحتاج تصحيحات قبل الاعتماد:

1. **البناء غير مُتحقق منه** — `NITRO_PRESET=node-server` منطقي لكنه لم يُختبر هنا؛ يجب بناء تجريبي وتأكيد `.output/server/index.mjs`.
2. **`.env.example` ناقص** — كل ما في البند 6.
3. **حماية الـhook ضعيفة** — publishable key مفتاح عام.
4. **`bybit-cron` يعتمد على `VITE_SUPABASE_PUBLISHABLE_KEY`** — لو غاب الاسم تفشل المزامنة بصمت بدون تنبيه.
5. **لا healthcheck / لا logging محدد / لا نسخ احتياطي دوري**.
6. **لا سكربت لنقل Storage** — الدليل يذكرها خطوة يدوية.
7. **لا معالجة لبديل بروكر OAuth** إن أردت Google sign-in على مشروعك.

## 8) Dependency Map

**يعمل على سيرفرك بدون تغيير**
- كل واجهة الموقع والـrouting وSSR
- `createServerFn` كلها، منطق Bybit، RedotPay، Orders/Products/Cart/Checkout
- routes الـAPI العامة (agent-download, card-transactions, v1.products, sitemap …)
- الكرون (كرون النظام أو docker compose)

**ما زال يعتمد على Lovable**
- قاعدة البيانات + Auth + Storage (مشروع Cloud)
- مهمة `bybit-ledger-auto-sync` داخل Cloud
- AI Gateway في `work.server.ts`
- بروكر OAuth الاجتماعي (`@lovable.dev/cloud-auth-js`)
- الاستضافة والدومين

**يحتاج قرارًا منك**
1. Backend: Supabase سحابي خاص بك أم Supabase self-hosted بـDocker على نفس الـVPS؟
2. طريقة نقل Auth: نقل `auth.users` بالـhashes أم إعادة تعيين كلمات المرور؟
3. Google sign-in: هل تحتاجه؟ (لو نعم، إعداد provider على مشروعك + استبدال البروكر في الكود)
4. مزود AI لفحص الوجه، أو تعطيل الميزة مؤقتًا.
5. MCP: تبقيه شغالًا أم تعطّله؟ (مرتبط بـCloud Auth OAuth)
6. TURN: حسابك الخاص في Cloudflare أم TURN مستقل؟

## الخطوات المطلوبة منك بالترتيب

1. **قرارات البند 8** (الستة أعلاه) — بدونها لا يمكن كتابة `.env` الصحيح.
2. **تجهيز الـBackend الجديد** وإعطائي/وضع القيم: URL, publishable key, anon key, service role key, project ref.
3. **تجهيز VPS**: Docker + Docker Compose + دومين مؤقت للاختبار (لا تحول DNS الأساسي بعد).
4. أنا أنفذ في الكود (بعد موافقتك، بدون لمس البيانات): استكمال `.env.example`، سر خاص للـhook، سكربت نقل Storage، healthcheck ونسخ احتياطي في compose، وتبديل مزود AI حسب قرارك.
5. **نقل المخطط**: تطبيق 77 migration من `supabase/migrations` بالترتيب على القاعدة الجديدة.
6. **نقل البيانات**: تصدير من Cloud (Advanced → Export data) ثم استيراد data-only، والتحقق من عدّاد `bybit_card_txns` و`bybit_ledger` و`orders` قبل/بعد.
7. **نقل Storage** بالسكربت + التحقق من عدد الملفات.
8. **نقل Auth** حسب اختيارك، مع تثبيت نفس UUIDs.
9. **تشغيل تجريبي**: `docker compose up -d --build` على دومين اختباري، واختبار: تسجيل الدخول، لوحة الأدمن، الطلبات، Bybit ledger، رفع الصور.
10. **تشغيل كرون Bybit على سيرفرك** والتأكد من تحديث `bybit_sync_state.last_run_at`.
11. **تعطيل `bybit-ledger-auto-sync`** من Cloud → Jobs (بعد نجاح 10 فقط).
12. **تحويل DNS** لسيرفرك + certbot، ثم إزالة الدومين من Lovable وإلغاء النشر.
13. **Pause** للنسخة السحابية بعد فترة مراقبة (احتفظ بها كنسخة احتياطية أسبوعًا على الأقل).
14. **بعد النقل**: نسخ احتياطي دوري + مراقبة، ودورة العمل: تطوير في Lovable → git → إعادة بناء على السيرفر.

## توقف عند

- البند 1 (القرارات) والبند 2 (بيانات الـBackend الجديد) — لا أستطيع المتابعة بدونهما.
- قبل البند 11 و12 و13 — كل واحد منها إجراء لا رجعة سهلة فيه.
