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
const needsInstall =
  !fs.existsSync(path.join(AGENT_DIR, "node_modules", "electron")) || !fs.existsSync(builderBin);

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
      installed = fs.existsSync(builderBin);
      if (!installed) {
        run("npm", [
          "install",
          "--no-save",
          "--no-audit",
          "--no-fund",
          "electron-builder@24",
          "--registry=https://registry.npmjs.org/",
        ]);
        installed = fs.existsSync(builderBin);
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
try {
  if (process.platform === "win32") {
    execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", builderBin, "--win", "--x64"], {
      stdio: "inherit",
      cwd: AGENT_DIR,
    });
  } else {
    run(builderBin, ["--win", "--x64"]);
  }
} catch (err) {
  restoreVersion();
  console.error("\n>> فشل بناء التطبيق (electron-builder). راجع الرسائل أعلاه.\n");
  throw err;
}


// 3) بناء المُثبِّت الصامت (NSIS)
const setupName = `MagProConnect-Setup-${version}.exe`;
const nsiPath = path.join(AGENT_DIR, "installer.nsi");
const nsi = fs
  .readFileSync(nsiPath, "utf8")
  .replace(/OutFile "[^"]*"/, `OutFile "${OUT_DIR}/${setupName}"`);
fs.writeFileSync(nsiPath, nsi);

// ويندوز لا يحتوي makensis افتراضياً، ولا يوجد nix عليه. نبحث عن النسخة
// المثبتة، ثم في مخبأ electron-builder، وأخيراً ننزل NSIS المحمولة تلقائياً.
const findMakensis = () => {
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "NSIS", "makensis.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "NSIS", "makensis.exe"),
  ];
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local"),
    "electron-builder",
    "Cache",
    "nsis",
  );
  if (fs.existsSync(cacheRoot)) {
    for (const dir of fs.readdirSync(cacheRoot)) {
      candidates.push(path.join(cacheRoot, dir, "Bin", "makensis.exe"));
      candidates.push(path.join(cacheRoot, dir, "makensis.exe"));
    }
  }
  const portable = path.join(OUT_DIR, "nsis-portable");
  if (fs.existsSync(portable)) {
    for (const dir of fs.readdirSync(portable)) {
      candidates.push(path.join(portable, dir, "makensis.exe"));
      candidates.push(path.join(portable, dir, "Bin", "makensis.exe"));
    }
  }
  return candidates.find((p) => fs.existsSync(p)) || null;
};

const downloadNsis = async () => {
  const dest = path.join(OUT_DIR, "nsis-portable");
  fs.mkdirSync(dest, { recursive: true });
  const zip = path.join(dest, "nsis.zip");
  const urls = [
    "https://downloads.sourceforge.net/project/nsis/NSIS%203/3.10/nsis-3.10.zip",
    "https://cytranet.dl.sourceforge.net/project/nsis/NSIS%203/3.10/nsis-3.10.zip",
  ];
  for (const u of urls) {
    try {
      console.log(">> تحميل أداة بناء المُثبِّت (NSIS)...");
      const res = await fetch(u, { redirect: "follow" });
      if (!res.ok) continue;
      fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
      // tar المدمج في ويندوز 10/11 يفك ملفات zip.
      execFileSync("tar", ["-xf", zip, "-C", dest], { stdio: "inherit" });
      fs.rmSync(zip, { force: true });
      return findMakensis();
    } catch {
      /* نجرب الرابط التالي */
    }
  }
  return null;
};

let makensis = process.platform === "win32" ? findMakensis() : "makensis";
if (process.platform === "win32" && !makensis) makensis = await downloadNsis();

try {
  if (makensis) {
    execFileSync(makensis, [nsiPath], { stdio: "inherit", cwd: AGENT_DIR });
  } else {
    run("nix", ["run", "nixpkgs#nsis", "--", nsiPath]);
  }
} catch (err) {
  restoreVersion();
  console.error(
    "\n>> فشل بناء المُثبِّت. ثبّت NSIS يدوياً من https://nsis.sourceforge.io ثم أعد الأمر.\n",
  );
  throw err;
}

// 4) رفع الملف لمخزن الموقع. نقسم الملفات الكبيرة لأن بعض خطط التخزين
// ترفض رفع ملف يتجاوز 50MB، ومسار التنزيل في الموقع يدمج الأجزاء تلقائياً.
const setupPath = path.join(OUT_DIR, setupName);
const buf = fs.readFileSync(setupPath);
const size = buf.byteLength;
const sha256 = createHash("sha256").update(buf).digest("hex");
const storagePath = `releases/${setupName}`;
// قراءة بيانات المخزن من ملف .env المحلي إن لم تكن موجودة في البيئة.
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    "مفاتيح المخزن غير متاحة: ضع SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في ملف .env بجوار المشروع.",
  );

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

// 5) تحديث ملف الإصدار في الموقع
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
