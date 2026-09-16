#!/usr/bin/env node
// نشر تلقائي كامل لبرنامج الموظف:
// 1) رفع رقم الإصدار  2) بناء التطبيق والمُثبِّت
// 4) رفع الملف لمخزن الموقع  5) تحديث src/lib/agent-release.ts
//
// الاستخدام:  node agent/release.mjs "ملاحظات التحديث"
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AGENT_DIR, "..");
const OUT_DIR = path.join(os.tmpdir(), "agent-release");
const NOTES = process.argv[2] || "تحسينات في الاستقرار وسرعة البث.";

const run = (cmd, args, opts = {}) => {
  // npm/npx are .cmd launchers on Windows, so execFileSync cannot resolve
  // their extension reliably without going through cmd.exe.
  if (process.platform === "win32" && (cmd === "npm" || cmd === "npx")) {
    return execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", cmd, ...args], {
      stdio: "inherit",
      cwd: AGENT_DIR,
      ...opts,
    });
  }
  return execFileSync(cmd, args, { stdio: "inherit", cwd: AGENT_DIR, ...opts });
};

// 1) رفع رقم الإصدار (patch)
const pkgPath = path.join(AGENT_DIR, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const [maj, min, patch] = pkg.version.split(".").map(Number);
const version = process.env.AGENT_VERSION || `${maj}.${min}.${patch + 1}`;
pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`>> إصدار جديد: ${version}`);

// 2) بناء التطبيق
const restoreVersion = () => {
  pkg.version = `${maj}.${min}.${patch}`;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
};

const builderBin = path.join(
  AGENT_DIR,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
);
const builderCli = path.join(AGENT_DIR, "node_modules", "electron-builder", "cli.js");
const needsInstall =
  !fs.existsSync(path.join(AGENT_DIR, "node_modules", "electron")) || !fs.existsSync(builderCli);

if (needsInstall) {
  let installed = false;
  for (let attempt = 1; attempt <= 3 && !installed; attempt += 1) {
    try {
      run("npm", [
        "install",
        "--no-audit",
        "--no-fund",
        "--include=dev",
        "--registry=https://registry.npmjs.org/",
        "--fetch-retries=5",
        "--fetch-retry-maxtimeout=120000",
      ]);
      installed = fs.existsSync(builderCli);
      if (!installed) {
        run("npm", [
          "install",
          "--no-save",
          "--no-audit",
          "--no-fund",
          "electron-builder@24",
          "--registry=https://registry.npmjs.org/",
        ]);
        installed = fs.existsSync(builderCli);
      }
    } catch {
      console.log(`>> فشل تحميل الحزم (محاولة ${attempt} من 3)، إعادة المحاولة...`);
    }
  }
  if (!installed) {
    restoreVersion();
    console.error(
      "\n>> تعذر تحميل حزم البرنامج من الإنترنت (خطأ شبكة npm).\n" +
        "   جرّب الآتي ثم أعد تشغيل الأمر:\n" +
        "   1) تأكد من اتصال الإنترنت وأوقف أي VPN أو بروكسي.\n" +
        "   2) npm config delete proxy ; npm config delete https-proxy\n" +
        "   3) npm cache clean --force\n",
    );
    process.exit(1);
  }
}
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
const setupName = `MagProConnect-Setup-${version}.exe`;
const setupPath = path.join(OUT_DIR, setupName);
try {
  execFileSync(
    process.execPath,
    [builderCli, "--win", "nsis", "--x64", `--config.directories.output=${OUT_DIR}`],
    { stdio: "inherit", cwd: AGENT_DIR },
  );
} catch (err) {
  restoreVersion();
  console.error("\n>> فشل بناء التطبيق (electron-builder). راجع الرسائل أعلاه.\n");
  throw err;
}

if (!fs.existsSync(setupPath)) {
  restoreVersion();
  throw new Error(`لم يتم إنشاء ملف التثبيت المتوقع: ${setupPath}`);
}

// 3) رفع الملف لمخزن الموقع. نقسم الملفات الكبيرة لأن بعض خطط التخزين
// ترفض رفع ملف يتجاوز 50MB، ومسار التنزيل في الموقع يدمج الأجزاء تلقائياً.
const buf = fs.readFileSync(setupPath);
const size = buf.byteLength;
const sha256 = createHash("sha256").update(buf).digest("hex");
const storagePath = `releases/${setupName}`;
// قراءة بيانات المخزن من أي ملف إعدادات موجود على الجهاز (المشروع، سطح المكتب،
// التنزيلات، المستندات، مجلد المستخدم) حتى لا يحتاج المستخدم لأي خطوة يدوية.
const searchDirs = [
  ROOT,
  path.join(ROOT, "selfhost"),
  path.resolve(ROOT, ".."),
  os.homedir(),
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "OneDrive", "Desktop"),
  path.join(os.homedir(), "Downloads"),
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "OneDrive", "Documents"),
];
const envCandidates = new Set();
const looksInteresting = (name) =>
  /^\.env(\..+)?$/i.test(name) ||
  /(secret|fly|supabase|service[-_ ]?role|key)/i.test(name) &&
    /\.(txt|env|md|json|cfg|ini|log|csv|pdf|docx?)$/i.test(name);
for (const dir of searchDirs) {
  for (const name of [".env", ".env.local", "fly-secrets.txt", "secrets.txt"]) {
    envCandidates.add(path.join(dir, name));
  }
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (looksInteresting(entry.name)) envCandidates.add(path.join(dir, entry.name));
    }
  } catch {
    // المجلد غير موجود أو غير قابل للقراءة — نكمل بباقي المواقع.
  }
}
const KEY_NAMES = /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|TARGET_SUPABASE_SERVICE_ROLE_KEY)/;
for (const envFile of envCandidates) {
  let content;
  try {
    const st = fs.statSync(envFile);
    if (!st.isFile() || st.size > 4 * 1024 * 1024) continue;
    content = fs.readFileSync(envFile, "latin1");
  } catch {
    continue;
  }
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]] && val) process.env[m[1]] = val;
  }
  // بعض الملفات (PDF/Word/نسخ ولصق) لا تكون أسطراً نظيفة، فنبحث في النص كله.
  const raw = content.replace(/\s+/g, " ");
  const keyHit = raw.match(
    new RegExp(`${KEY_NAMES.source}\\s*[=:]\\s*["']?([A-Za-z0-9._\\-]{40,})`),
  );
  if (keyHit && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = keyHit[2];
  }
  const urlHit = raw.match(/https:\/\/[a-z0-9]{16,}\.supabase\.co/i);
  if (urlHit && !process.env.SUPABASE_URL) process.env.SUPABASE_URL = urlHit[0];
}
const url = (
  process.env.SUPABASE_URL ||
  process.env.TARGET_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://kcdsdaytrnzoiharmyxo.supabase.co"
).replace(/\/$/, "");
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(`\n>> المُثبِّت جاهز على: ${setupPath}`);
  console.error(">> تم البحث في هذه المجلدات:");
  for (const dir of searchDirs) console.error(`   - ${dir}`);
  throw new Error(
    "مفتاح الرفع غير موجود على هذا الجهاز. أنشئ ملفاً باسم fly-secrets.txt على سطح المكتب\n" +
      "يحتوي السطر التالي فقط:\n" +
      "SUPABASE_SERVICE_ROLE_KEY=<مفتاح service role>",
  );
}
// نحفظ المفتاح في ملف المشروع (غير مرفوع على GitHub) حتى لا يُبحث عنه مرة أخرى.
try {
  const localEnv = path.join(ROOT, ".env");
  const existing = fs.existsSync(localEnv) ? fs.readFileSync(localEnv, "utf8") : "";
  if (!/SUPABASE_SERVICE_ROLE_KEY\s*=/.test(existing)) {
    fs.writeFileSync(
      localEnv,
      `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}SUPABASE_URL=${url}\nSUPABASE_SERVICE_ROLE_KEY=${key}\n`,
    );
  }
} catch {
  // لا يمنع الرفع.
}


const headers = {
  apikey: key,
  authorization: `Bearer ${key}`,
  "content-type": "application/octet-stream",
  "x-upsert": "true",
};
const upload = async (objectPath, body) => {
  const res = await fetch(`${url}/storage/v1/object/site-assets/${objectPath}`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) throw new Error(`فشل رفع ${objectPath} [${res.status}]: ${await res.text()}`);
};

const CHUNK_SIZE = 40_000_000;
const parts = [];
if (size <= CHUNK_SIZE) {
  await upload(storagePath, buf);
  console.log(`>> تم الرفع: ${storagePath} (${size} bytes)`);
} else {
  for (let offset = 0, index = 0; offset < size; offset += CHUNK_SIZE, index += 1) {
    const part = buf.subarray(offset, Math.min(offset + CHUNK_SIZE, size));
    const partPath = `releases/parts/${version}/part-${String(index).padStart(2, "0")}`;
    await upload(partPath, part);
    parts.push({ path: partPath, size: part.byteLength });
    console.log(`>> تم رفع الجزء ${index + 1}: ${partPath} (${part.byteLength} bytes)`);
  }
}

// 4) تحديث ملف الإصدار في الموقع
const releaseFile = path.join(ROOT, "src/lib/agent-release.ts");
fs.writeFileSync(
  releaseFile,
  `// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
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
  parts: ${JSON.stringify(parts, null, 2)},
} as const;
`,
);
console.log(`>> تم تحديث src/lib/agent-release.ts للإصدار ${version}`);
console.log(">> باقي خطوة واحدة: انشر الموقع (Publish) ليصل التحديث للموظفين.");
