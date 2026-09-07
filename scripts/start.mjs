// مشغّل الإنتاج: يشغّل سيرفر Nitro (node-server) فقط.
// مهم: dist/server/index.mjs هو مخرج preset الخاص بـ Cloudflare ولا يفتح بورت،
// فلو شغّلناه يظل العمل "Running" بدون استماع => "no healthy upstream".
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const entry = resolve(process.cwd(), ".output/server/index.mjs");

if (!existsSync(entry)) {
  const hasCfBuild = existsSync(resolve(process.cwd(), "dist/server/index.mjs"));
  console.error(
    [
      "لم يتم العثور على مخرجات سيرفر Node (.output/server/index.mjs).",
      hasCfBuild
        ? "الموجود هو dist/server/index.mjs (مخرج Cloudflare) وهو لا يفتح بورت HTTP."
        : "معنى ذلك أن Buildpack لم يُكمل سكربت `postinstall`.",
      "أعد البناء مع التأكد من تنفيذ `npm run build:node` (NITRO_PRESET=node-server).",
    ].join("\n"),
  );
  process.exit(1);
}

const found = entry;


// Northflank يوجّه الترافيك إلى البورت المعلن في إعدادات الخدمة.
// نحترم PORT لو تم ضبطه، وإلا نستخدم 3000، ونربط على كل الواجهات.
const port = process.env["PORT"] || "3000";
const host = process.env["HOST"] || "0.0.0.0";
process.env["PORT"] = port;
process.env["HOST"] = host;
process.env["NITRO_PORT"] = port;
process.env["NITRO_HOST"] = host;
console.log(`[start] server entry: ${found}`);
console.log(`[start] listening on ${host}:${port}`);
await import(found);

