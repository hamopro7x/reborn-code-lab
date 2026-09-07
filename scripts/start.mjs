// مشغّل الإنتاج: يجد مخرجات Nitro أينما وُضعت ويعطي رسالة واضحة لو البناء لم يتم.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const candidates = [".output/server/index.mjs", "dist/server/index.mjs"];
const found = candidates.map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p));

if (!found) {
  console.error(
    [
      "لم يتم العثور على مخرجات السيرفر (.output/server/index.mjs).",
      "معنى ذلك أن مرحلة البناء لم تنفّذ `npm run build`.",
      "على Northflank Buildpack تأكد من متغير البناء BP_NODE_RUN_SCRIPTS=build",
      "(موجود في project.toml بجذر المشروع) ثم أعد البناء.",
    ].join("\n"),
  );
  process.exit(1);
}

process.env["PORT"] ||= "3000";
process.env["HOST"] ||= "0.0.0.0";
await import(found);
