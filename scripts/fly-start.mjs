// نقطة تشغيل الإنتاج على Fly.io
// تُوحّد أسماء متغيرات Supabase قبل تشغيل السيرفر حتى لا يظهر خطأ
// "Missing Supabase environment variable(s)" لو الأسرار مضبوطة بأسماء VITE_* فقط.

const DATABASE_URL = "https://kcdsdaytrnzoiharmyxo.supabase.co";
const DATABASE_PROJECT_ID = "kcdsdaytrnzoiharmyxo";

// لا نقبل عنوان قاعدة موروث من نشر قديم.
process.env["SUPABASE_URL"] = DATABASE_URL;
process.env["VITE_SUPABASE_URL"] = DATABASE_URL;
process.env["SUPABASE_PROJECT_ID"] = DATABASE_PROJECT_ID;
process.env["VITE_SUPABASE_PROJECT_ID"] = DATABASE_PROJECT_ID;

const pairs = [
  ["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"],
  ["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"],
];

for (const [serverName, viteName] of pairs) {
  if (!process.env[serverName] && process.env[viteName]) {
    process.env[serverName] = process.env[viteName];
  }
  if (!process.env[viteName] && process.env[serverName]) {
    process.env[viteName] = process.env[serverName];
  }
}

// المفتاح القابل للنشر ومفتاح anon اسمان لنفس القيمة
if (!process.env["SUPABASE_PUBLISHABLE_KEY"] && process.env["SUPABASE_ANON_KEY"]) {
  process.env["SUPABASE_PUBLISHABLE_KEY"] = process.env["SUPABASE_ANON_KEY"];
}
if (!process.env["SUPABASE_ANON_KEY"] && process.env["SUPABASE_PUBLISHABLE_KEY"]) {
  process.env["SUPABASE_ANON_KEY"] = process.env["SUPABASE_PUBLISHABLE_KEY"];
}

process.env["PORT"] ||= "3000";
process.env["HOST"] ||= "0.0.0.0";
process.env["NITRO_PORT"] ||= process.env["PORT"];
process.env["NITRO_HOST"] ||= process.env["HOST"];

const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `[fly-start] متغيرات ناقصة: ${missing.join(", ")}\n` +
      `اضبط أسرار قاعدة البيانات على تطبيق mag-pro1 قبل التشغيل.`,
  );
  process.exit(1);
}

// لا نعتبر الإصدار سليمًا لمجرد أن المفتاح موجود. المفتاح القديم أو القابل
// للنشر يجعل كتابة المنتجات تصل بصلاحية زائر ثم تفشل برسالة RLS.
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!serviceRoleKey?.startsWith("sb_secret_") && serviceRoleKey?.split(".").length !== 3) {
  console.error("[fly-start] SUPABASE_SERVICE_ROLE_KEY is not a server secret key.");
  process.exit(1);
}

// Only a rejected key stops startup. A slow or temporarily unreachable
// database must not keep the whole site (store pages included) offline and
// stuck in a restart loop; the server reconnects on its own once it answers.
try {
  const response = await fetch(`${DATABASE_URL}/rest/v1/user_roles?select=id&limit=1`, {
    headers: { apikey: serviceRoleKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 || response.status === 403) {
    console.error(`[fly-start] Database server credential was rejected (${response.status}).`);
    process.exit(1);
  }
  if (!response.ok) {
    console.warn(`[fly-start] Database answered ${response.status} at startup; starting anyway.`);
  }
} catch (error) {
  console.warn("[fly-start] Database not reachable at startup; starting anyway.", error?.message ?? error);
}

// سر داخلي لمزامنة Bybit في الخلفية لو مش مضبوط كسر على Fly.
if (!process.env["SYNC_HOOK_SECRET"]) {
  const { randomBytes } = await import("node:crypto");
  process.env["SYNC_HOOK_SECRET"] = randomBytes(32).toString("hex");
}

await import("../.output/server/index.mjs");

// مزامنة دائمة على السيرفر: المعاملات تدخل المركز العام وشفت الموظف
// حتى لو مفيش حد فاتح صفحة المعاملات.
// عند فشل المزامنة (قاعدة بطيئة أو واقفة) نبطّئ تدريجيًا بدل ما نضغط عليها
// كل 5 ثواني، ونرجع للسرعة العادية أول ما تنجح دورة واحدة.
const SYNC_EVERY_MS = Number(process.env["SYNC_INTERVAL_MS"] || 5_000);
const SYNC_MAX_BACKOFF_MS = 120_000;
const syncUrl = `http://127.0.0.1:${process.env["PORT"]}/api/public/hooks/bybit-ledger-sync`;
let syncDelay = SYNC_EVERY_MS;
const tick = async () => {
  let healthy = false;
  try {
    const res = await fetch(syncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": process.env["SYNC_HOOK_SECRET"] },
      body: "{}",
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.json().catch(() => ({}));
    healthy = res.ok && body?.ok !== false;
    if (!healthy) console.warn(`[fly-start] bybit sync unhealthy (${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
  } catch (e) {
    console.error("[fly-start] background bybit sync failed:", e?.message ?? e);
  } finally {
    syncDelay = healthy ? SYNC_EVERY_MS : Math.min(syncDelay * 2, SYNC_MAX_BACKOFF_MS);
    setTimeout(tick, syncDelay);
  }
};
setTimeout(tick, 15_000);
