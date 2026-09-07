// مشغّل الإنتاج: يجد مخرجات Nitro أينما وُضعت ويعطي رسالة واضحة لو البناء لم يتم.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const candidates = [".output/server/index.mjs", "dist/server/index.mjs"];
const found = candidates.map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p));

if (!found) {
  console.error(
    [
      "لم يتم العثور على مخرجات السيرفر (.output/server/index.mjs).",
      "معنى ذلك أن Buildpack لم يُكمل سكربت `postinstall` الذي يبني سيرفر Nitro.",
      "راجع سجل البناء بحثًا عن فشل `npm run build:node` ثم أعد البناء.",
    ].join("\n"),
  );
  process.exit(1);
}

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

