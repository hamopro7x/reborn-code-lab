// مشغّل الإنتاج: يشغّل سيرفر Nitro (node-server) فقط.
// مهم: dist/server/index.mjs هو مخرج preset الخاص بـ Cloudflare ولا يفتح بورت،
// فلو شغّلناه يظل العمل "Running" بدون استماع => "no healthy upstream".
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const entry = resolve(process.cwd(), ".output/server/index.mjs");

if (!existsSync(entry)) {
  console.log("[start] Node server output is missing; building it now...");
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const build = spawnSync(npmCommand, ["run", "build:node"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      NITRO_PRESET: "node-server",
      NITRO_OUTPUT_DIR: ".output",
    },
    stdio: "inherit",
  });

  if (build.status !== 0 || !existsSync(entry)) {
    console.error(
      "[start] Failed to create .output/server/index.mjs. Ensure devDependencies are installed.",
    );
    process.exit(build.status || 1);
  }
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

