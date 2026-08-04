#!/usr/bin/env node
// نشر تلقائي كامل لبرنامج الموظف:
// 1) رفع رقم الإصدار  2) بناء التطبيق  3) بناء المُثبِّت الصامت
// 4) رفع الملف لمخزن الموقع  5) تحديث src/lib/agent-release.ts
//
// الاستخدام:  node agent/release.mjs "ملاحظات التحديث"
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AGENT_DIR, "..");
const OUT_DIR = "/tmp/agent-release";
const NOTES = process.argv[2] || "تحسينات في الاستقرار وسرعة البث.";

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", cwd: AGENT_DIR, ...opts });

// 1) رفع رقم الإصدار (patch)
const pkgPath = path.join(AGENT_DIR, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const [maj, min, patch] = pkg.version.split(".").map(Number);
const version = process.env.AGENT_VERSION || `${maj}.${min}.${patch + 1}`;
pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`>> إصدار جديد: ${version}`);

// 2) بناء التطبيق
if (!fs.existsSync(path.join(AGENT_DIR, "node_modules", "electron"))) {
  run("npm", ["install", "--no-audit", "--no-fund"]);
}
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
run("npx", ["--yes", "electron-builder", "--win", "--x64"]);

// 3) بناء المُثبِّت الصامت (NSIS)
const setupName = `MagPro-Setup-${version}.exe`;
const nsiPath = path.join(AGENT_DIR, "installer.nsi");
const nsi = fs
  .readFileSync(nsiPath, "utf8")
  .replace(/OutFile "[^"]*"/, `OutFile "${OUT_DIR}/${setupName}"`);
fs.writeFileSync(nsiPath, nsi);
try {
  run("makensis", [nsiPath]);
} catch {
  run("nix", ["run", "nixpkgs#nsis", "--", nsiPath]);
}

// 4) رفع الملف لمخزن الموقع
const setupPath = path.join(OUT_DIR, setupName);
const buf = fs.readFileSync(setupPath);
const size = buf.byteLength;
const sha256 = createHash("sha256").update(buf).digest("hex");
const storagePath = `releases/${setupName}`;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("مفاتيح المخزن غير متاحة");
const headers = {
  apikey: key,
  "content-type": "application/octet-stream",
  "x-upsert": "true",
};
// المفاتيح الجديدة (sb_secret_...) ليست JWT فلا تُرسل في Authorization
if (key.split(".").length === 3) headers.authorization = `Bearer ${key}`;
const res = await fetch(`${url}/storage/v1/object/site-assets/${storagePath}`, {
  method: "POST",
  headers,
  body: buf,
});
if (!res.ok) throw new Error(`فشل الرفع [${res.status}]: ${await res.text()}`);
console.log(`>> تم الرفع: ${storagePath} (${size} bytes)`);

// 5) تحديث ملف الإصدار في الموقع
const releaseFile = path.join(ROOT, "src/lib/agent-release.ts");
fs.writeFileSync(
  releaseFile,
  `// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "${version}",
  notes: ${JSON.stringify(NOTES)},
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "${storagePath}",
  size: ${size},
  sha256: "${sha256}",
} as const;
`,
);
console.log(`>> تم تحديث src/lib/agent-release.ts للإصدار ${version}`);
console.log(">> باقي خطوة واحدة: انشر الموقع (Publish) ليصل التحديث للموظفين.");
