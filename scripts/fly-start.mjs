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

const required = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `[fly-start] متغيرات ناقصة: ${missing.join(", ")}\n` +
      `اضبطها بأمر: fly secrets set -a mag-pro1 SUPABASE_PUBLISHABLE_KEY=...`,
  );
}

await import("../.output/server/index.mjs");
