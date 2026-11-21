// مشغّل الإنتاج: يشغّل سيرفر Nitro (node-server) فقط.
// مهم: dist/server/index.mjs هو مخرج preset الخاص بـ Cloudflare ولا يفتح بورت،
// فلو شغّلناه يظل العمل "Running" بدون استماع => "no healthy upstream".
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const entry = resolve(process.cwd(), ".output/server/index.mjs");

if (!existsSync(entry)) {
  if (process.env["NODE_ENV"] === "production") {
    console.error("[start] Missing .output/server/index.mjs; build the Node production artifact before starting.");
    process.exit(1);
  }
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


// Fly/VPS: honor the configured port and bind to every interface.
const port = process.env["PORT"] || "3000";
const host = process.env["HOST"] || "0.0.0.0";
process.env["PORT"] = port;
process.env["HOST"] = host;
process.env["NITRO_PORT"] = port;
process.env["NITRO_HOST"] = host;
console.log(`[start] server entry: ${found}`);
console.log(`[start] listening on ${host}:${port}`);
await import(pathToFileURL(found).href);

