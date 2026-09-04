# نقل reborn-code-lab بالكامل إلى VPS (Ubuntu 26.04 + Docker, 2 vCPU / 8GB / 100GB)

الهدف: الـVPS بيئة التشغيل الأساسية، وLovable للتطوير فقط. لا حذف ولا تعطيل لأي شيء سحابي في هذه المرحلة، ولا migration خطيرة قبل موافقتك.

## 1) نتيجة الفحص الفعلي للاعتماديات (تم التحقق الآن)

| المكوّن | الحالة الحقيقية في الكود | قابلية النقل |
| --- | --- | --- |
| التطبيق (TanStack Start SSR) | `selfhost/Dockerfile` يبني بـ`NITRO_PRESET=node-server` | 100% |
| Postgres + 77 migration | `supabase/migrations` (77 ملف) + `selfhost/migrate-db.sh` جاهز | 100% |
| Auth | `src/routes/auth.tsx` يستخدم **email/password فقط** عبر `supabase.auth` | 100% |
| Cloud Auth broker | `src/integrations/lovable/index.ts` موجود لكن **غير مستخدم في أي صفحة** | يُترك كما هو (ملف مولّد) |
| Storage | 6 buckets، `selfhost/migrate-storage.mjs` جاهز | 100% |
| Realtime | `src/lib/realtime/global-realtime.tsx` يستخدم `postgres_changes` | 100% (Supabase self-hosted فيه realtime) |
| Cron (Bybit) | جوب سحابي كل دقيقة + بديل جاهز: خدمة `bybit-cron` في compose | 100% |
| AI (فحص الوجه) | `src/lib/work.server.ts` صار يدعم أي مزود OpenAI-compatible عبر `VISION_API_KEY/URL/MODEL` مع fallback لـ`LOVABLE_API_KEY` | 100% بمزود خارجي |
| TURN/ICE | `src/routes/api/public/ice-servers.ts` يدعم Cloudflare TURN **أو** `TURN_URLS/USERNAME/CREDENTIAL` | 100% (coturn أو Cloudflare) |
| MCP (`@lovable.dev/mcp-js`) | routes `/mcp` و`.well-known` مولّدة | تعمل على السيرفر، لكنها ميزة Lovable-specific |

**لا يمكن نقله 100% (والبديل):**
- **Lovable AI Gateway** — لا يعمل خارج Lovable. البديل: مفتاح OpenAI/Gemini في `VISION_API_KEY` (مدعوم بالكود فعلًا).
- **إشعارات بريد Auth (تأكيد/استرجاع كلمة السر)** — Supabase self-hosted يحتاج SMTP خارجي (Resend/Brevo/SES). بدونه تسجيل الدخول بكلمة سر يعمل، لكن استرجاع كلمة السر لا.
- **كلمات مرور المستخدمين**: تُنقل كما هي *فقط* إذا استخرجنا `auth.users` بالـ`encrypted_password` من نسخة الـexport. لو لم يسمح الـexport بذلك، البديل: إنشاء المستخدمين بنفس الـUUID + إجبار reset (يحتاج SMTP)، أو تعيين كلمات مرور مؤقتة إداريًا.
- **بناء Docker على 8GB**: بناء Vite قد يستهلك ذاكرة كبيرة. البديل الآمن: بناء الصورة على جهازك/CI ودفعها، أو `NODE_OPTIONS=--max-old-space-size=6144` + swap 4GB.

## 2) قرار البنية الموصى به لمواردك

**2 vCPU / 8GB لا يكفي بأمان لـSupabase self-hosted كامل** (Postgres + Auth + Storage + Realtime + Kong + التطبيق) مع حجم `bybit_card_txns` الحالي.

مسارين، اختر واحدًا:

- **أ) موصى به:** التطبيق + كرون + nginx على الـVPS، وقاعدة البيانات على **مشروع Supabase سحابي خاص بك** (خارج Lovable). استقلال كامل عن Lovable، صفر credits، وصيانة منخفضة.
- **ب) استقلال كامل:** Supabase self-hosted بالكامل على نفس الـVPS. ممكن لكن يحتاج ضبط ذاكرة صارم (Postgres shared_buffers 2GB، تعطيل خدمات غير مستخدمة مثل Vector/Analytics/Functions) وswap، والأداء أضعف.

باقي الخطة يعمل مع المسارين؛ الفرق فقط في مصدر `SUPABASE_URL`/المفاتيح.

## 3) الملفات المطلوب إنشاؤها/تعديلها (بعد موافقتك)

جديد:
1. `selfhost/supabase/docker-compose.yml` + `selfhost/supabase/.env.example` — فقط لو اخترت المسار (ب): Postgres + auth (gotrue) + storage + realtime + rest + kong، مضبوطة على 8GB.
2. `selfhost/export-db.sh` — تصدير schema+data من القاعدة الحالية بـ`pg_dump` (بما فيه `auth.users` عند توفر رابط اتصال مباشر)، مع `--no-owner`.
3. `selfhost/import-db.sh` — استيراد آمن للقاعدة الجديدة، يشغّل الـmigrations أولًا ثم البيانات `--data-only`، ويتحقق من عدد الصفوف لكل جدول قبل/بعد.
4. `selfhost/verify-migration.sh` — فحص ما بعد النقل: عدد الجداول، RLS مفعّلة، عدد policies/functions/triggers/indexes/extensions، عدد المستخدمين، عدد ملفات كل bucket.
5. `selfhost/backup.sh` + `selfhost/restore.sh` — نسخ احتياطي يومي (`pg_dump` مضغوط + مزامنة Storage) مع الاحتفاظ 7/30 يومًا، يعمل عبر خدمة `backup` في compose أو cron.
6. `selfhost/coturn/turnserver.conf` + خدمة coturn اختيارية في compose — لمشاركة الشاشة بدون Cloudflare.
7. `selfhost/CHECKLIST.md` — قائمة تنفيذ مرقّمة من الصفر للتشغيل، مع أوامر التحقق.

تعديل طفيف (بدون UI ولا business logic):
8. `selfhost/docker-compose.yml` — إضافة حدود `mem_limit`/`cpus` مناسبة لـ8GB، وخدمة backup، وربط coturn اختياريًا.
9. `selfhost/.env.example` — إضافة متغيرات SMTP وbackup وcoturn.
10. `selfhost/README.md` — تحديث مسار (أ)/(ب) وSMTP والنسخ الاحتياطي.
11. `roadmap.md` — تحديث حالة المهام.

**بلا تعديل:** أي مكوّن UI، أي `*.functions.ts` أو business logic، أي جدول أو بيانات إنتاجية. لا يوجد أي migration في هذه الخطة على القاعدة الحالية.

## 4) ترتيب التنفيذ (مع نقاط توقّف)

1. أُنشئ الملفات أعلاه (لا تأثير على الإنتاج).
2. أنت: تصدير نسخة من Cloud → Advanced → Export data.
3. أنت على الـVPS: تجهيز القاعدة الجديدة ثم `migrate-db.sh` ثم `import-db.sh` (على قاعدة **جديدة فارغة** فقط).
4. `migrate-storage.mjs` بـ`DRY_RUN=1` ثم فعليًا، وإعادة تطبيق policies الـbuckets (تأتي مع الـmigrations).
5. `docker compose up -d --build` + `verify-migration.sh`.
6. اختبار كامل: دخول موظف/أدمن، منتجات، سلة، طلب، Bybit sync، مشاركة شاشة، فحص وجه.
7. nginx + certbot + تحويل DNS.
8. **فقط بعد نجاح كل ما سبق**: تعطيل جوب Bybit السحابي وإلغاء النشر من Lovable.

## 5) أسرار تُضاف في `selfhost/.env` على السيرفر فقط (لا في Git)

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_*`, `BYBIT_API_KEY/SECRET`, `SYNC_HOOK_SECRET`, `VISION_API_KEY`, `TURN_*` أو `CLOUDFLARE_TURN_*`, `SMTP_*`, `BACKUP_*`.

## 6) قرار مطلوب منك قبل التنفيذ

1. المسار (أ) Supabase سحابي خاص بك أم (ب) self-hosted على نفس الـVPS؟
2. مزود AI لفحص الوجه: OpenAI أم Google Gemini؟
3. TURN: coturn على نفس الـVPS أم Cloudflare TURN؟
4. SMTP: تستخدم مزودًا (Resend مثلًا) أم نكتفي بالدخول بكلمة السر بدون استرجاع؟
