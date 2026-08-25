const { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage, shell, powerSaveBlocker } = require("electron");
const path = require("path");
const { execFile } = require("child_process");

// الحزمة الجديدة لها مجلد تثبيت وهوية مختلفان، لكننا نحتفظ بمجلد بيانات
// Mag Pro السابق حتى ينتقل تسجيل الجهاز تلقائياً ولا يحتاج الموظف كوداً جديداً.
if (process.platform === "win32") {
  app.setPath("userData", path.join(app.getPath("appData"), "Mag Pro"));
}

let win = null;
let tray = null;
let rendererRecoveryAttempts = 0;
let rendererRecoveryTimer = null;
let lastRendererPulse = Date.now();
let backgroundPowerBlocker = null;

// تشغيل ويندوز يحمل --hidden فيبقى بالخلفية، أما فتح الموظف للاختصار فيُظهر النافذة.
const startedHidden = process.argv.includes("--hidden");

// نسخة واحدة فقط تعمل في نفس الوقت
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // نستخدم أكثر من آلية لضمان التشغيل مع ويندوز. قد تبدأ نسختان في نفس اللحظة؛
    // النسخة التلقائية الإضافية يجب ألا تُظهر نافذة النسخة الأساسية.
    const hiddenLaunch = commandLine.includes("--hidden");
    if (win && !hiddenLaunch) {
      win.setSkipTaskbar(false);
      win.show();
      win.focus();
    }
  });
}

const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_NAME = "MagProConnect";
const LEGACY_RUN_NAME = "MagProAgent";
const LEGACY_RUN_NAMES = ["MagPro", "MagProAgent", "MAG PRO Agent", "mag-pro-agent"];

function startupCommand() {
  return `"${process.execPath}" --hidden`;
}

// خطط احتياطية على ويندوز: Registry + Startup folder + Scheduled Task.
// استخدام أكثر من آلية يعالج الأجهزة التي يعطّل فيها ويندوز إحدى طرق بدء التشغيل.
function registryAutoLaunch() {
  if (process.platform !== "win32") return;
  // إزالة تسجيل الحزمة القديمة حتى لا يعمل برنامجان مع بدء التشغيل
  for (const oldName of LEGACY_RUN_NAMES) {
    execFile("reg.exe", ["delete", RUN_KEY, "/v", oldName, "/f"], { windowsHide: true }, () => {});
  }
  execFile(
    "reg.exe",
    ["add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", startupCommand(), "/f"],
    () => {},
  );
}

// آلية بدء واحدة فقط = مفتاح Run في الريجستري. أي آلية إضافية (ملف Startup
// أو مهمة مجدولة) كانت تُشغّل نسخة ثانية في نفس اللحظة، فتتنافس على قفل
// النسخة الواحدة وقد تترك الواجهة/الالتقاط في حالة نصف مهيّأة.
function removeDuplicateStartup() {
  if (process.platform !== "win32") return;
  const fs = require("fs");
  try {
    const startupDir = path.join(
      process.env.APPDATA || path.join(require("os").homedir(), "AppData", "Roaming"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup",
    );
    for (const name of [RUN_NAME, ...LEGACY_RUN_NAMES]) {
      for (const ext of [".cmd", ".vbs"]) {
        try {
          fs.unlinkSync(path.join(startupDir, name + ext));
        } catch {
          /* لم يكن موجودًا */
        }
      }
    }
  } catch {
    // ignore
  }
  for (const name of [RUN_NAME, ...LEGACY_RUN_NAMES]) {
    execFile("schtasks.exe", ["/Delete", "/TN", name, "/F"], { windowsHide: true }, () => {});
  }
}

function enableAutoLaunch() {
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: ["--hidden"],
      path: process.execPath,
      name: RUN_NAME,
    });
  } catch {
    // ignore
  }
  // نتأكد دايماً: لو إعداد اتعطّل أو المسار اتغير بعد إعادة التشغيل.
  registryAutoLaunch();
  removeDuplicateStartup();
}



// إزالة أي تثبيت قديم من الحزم السابقة (قبل Mag Pro).
// تُشغَّل مرة واحدة عند بدء التطبيق الجديد فتحذف مجلد التثبيت القديم،
// اختصاراته، مهامه المجدولة، ومفاتيح Run بأسماء قديمة.
function cleanupLegacyInstall() {
  if (process.platform !== "win32") return;
  const fs = require("fs");
  const localAppData = process.env.LOCALAPPDATA || path.join(require("os").homedir(), "AppData", "Local");
  const appData = process.env.APPDATA || path.join(require("os").homedir(), "AppData", "Roaming");
  const legacyProcNames = [
    "Mag Pro.exe",
    "MAG PRO Agent.exe",
    "mag-pro-agent.exe",
    "MagProAgent.exe",
    "magpro-agent.exe",
  ];
  for (const name of legacyProcNames) {
    execFile("taskkill.exe", ["/F", "/IM", name], { windowsHide: true }, () => {});
  }
  const currentDir = path.dirname(process.execPath).toLowerCase();
  const legacyDirs = [
    path.join(localAppData, "Programs", "mag-pro-agent"),
    path.join(localAppData, "Programs", "MAG PRO Agent"),
    path.join(localAppData, "Programs", "magpro-agent"),
    path.join(localAppData, "Programs", "MagProAgent"),
    path.join(localAppData, "Programs", "mag-pro"),
    path.join(localAppData, "Programs", "MagPro"),
  ];
  for (const dir of legacyDirs) {
    if (dir.toLowerCase() === currentDir) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  const legacyShortcuts = [
    path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Mag Pro", "Mag Pro.lnk"),
    path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "MAG PRO Agent.lnk"),
    path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "MagProAgent.lnk"),
    path.join(require("os").homedir(), "Desktop", "MAG PRO Agent.lnk"),
    path.join(require("os").homedir(), "Desktop", "MagProAgent.lnk"),
    path.join(require("os").homedir(), "Desktop", "mag-pro-agent.lnk"),
    path.join(require("os").homedir(), "Desktop", "Mag Pro.lnk"),
  ];
  for (const link of legacyShortcuts) {
    try { fs.rmSync(link, { force: true }); } catch { /* ignore */ }
  }
  try {
    fs.rmSync(
      path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "MAG PRO Agent"),
      { recursive: true, force: true },
    );
  } catch { /* ignore */ }
  try {
    fs.rmSync(
      path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Mag Pro"),
      { recursive: true, force: true },
    );
  } catch { /* ignore */ }
  for (const runName of LEGACY_RUN_NAMES) {
    execFile("reg.exe", ["delete", RUN_KEY, "/v", runName, "/f"], { windowsHide: true }, () => {});
  }
  for (const taskName of LEGACY_RUN_NAMES) {
    execFile("schtasks.exe", ["/Delete", "/TN", taskName, "/F"], { windowsHide: true }, () => {});
  }
  for (const key of [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\mag-pro-agent",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MAG PRO Agent",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MagProAgent",
  ]) {
    execFile("reg.exe", ["delete", key, "/f"], { windowsHide: true }, () => {});
  }
}




function createWindow() {
  lastRendererPulse = Date.now();
  win = new BrowserWindow({
    width: 460,
    height: 420,
    resizable: false,
    show: false,
    skipTaskbar: startedHidden,
    title: "Mag Pro Connect",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer.html"));
  const recoverRenderer = (reason) => {
    if (!win || win.isDestroyed() || app.isQuiting || installing) return;
    if (rendererRecoveryTimer) return;
    rendererRecoveryAttempts += 1;
    console.error(`[renderer] recovery ${rendererRecoveryAttempts}: ${reason}`);
    const delay = Math.min(1000 * rendererRecoveryAttempts, 10000);
    rendererRecoveryTimer = setTimeout(() => {
      rendererRecoveryTimer = null;
      if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache();
    }, delay);
  };
  win.webContents.on("did-finish-load", () => {
    rendererRecoveryAttempts = 0;
  });
  win.webContents.on("did-fail-load", (_event, code, description) => {
    recoverRenderer(`load failed ${code}: ${description}`);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    recoverRenderer(`process gone: ${details.reason}`);
  });
  win.on("unresponsive", () => recoverRenderer("window unresponsive"));
  win.once("ready-to-show", () => {
    if (startedHidden) {
      win.hide();
      win.setSkipTaskbar(true);
      return;
    }
    win.setSkipTaskbar(false);
    win.show();
    win.focus();
  });
  win.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
      win.setSkipTaskbar(true);
    }
  });
}

ipcMain.handle("get-screen-source", async () => {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources.length ? sources[0].id : null;
});

ipcMain.handle("get-app-version", () => app.getVersion());

// حارس مستقل داخل العملية الرئيسية. إذا علقت واجهة البرنامج الخلفية فلن يصل
// نبضها، فنُعيد تحميلها تلقائياً بدل أن يبقى البرنامج ظاهرياً مفتوحاً بينما
// يتوقف نبض الجهاز والبث في لوحة الإدارة.
ipcMain.on("renderer-pulse", () => {
  lastRendererPulse = Date.now();
});
ipcMain.on("reload-renderer", () => {
  if (!win || win.isDestroyed() || app.isQuiting || installing) return;
  lastRendererPulse = Date.now();
  win.webContents.reloadIgnoringCache();
});
setInterval(() => {
  if (!win || win.isDestroyed() || app.isQuiting || installing) return;
  if (Date.now() - lastRendererPulse < 90_000) return;
  lastRendererPulse = Date.now();
  console.error("[renderer] pulse stopped — reloading background service");
  win.webContents.reloadIgnoringCache();
}, 15_000);

// ===== التحكم عن بعد: أوامر الماوس/الكيبورد الواردة من لوحة الإدارة =====
const { handleRemoteInput } = require("./input.cjs");
ipcMain.on("remote-input", (_e, cmd) => {
  try {
    handleRemoteInput(cmd);
  } catch {
    /* تجاهل أمر تالف */
  }
});


let activeViewerCount = 0;
ipcMain.on("viewer-count", (_event, count) => {
  const value = Number(count);
  activeViewerCount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
});

ipcMain.handle("open-external", (_e, url) => {
  if (typeof url === "string" && /^https:\/\//.test(url)) void shell.openExternal(url);
  return true;
});

// ===== تحديث داخلي: تنزيل بشريط تقدّم ثم تثبيت صامت =====
let downloadedFile = null;
let activeDownload = null;
let updatePipeline = null;

// المسار الوسيط الدائم: يتحقق من الملف على السيرفر قبل تسليمه، ويدعم الاستكمال.
const PERMANENT_DOWNLOAD_URL = "https://mag-pro1.com/api/public/agent-download.exe";
const VERSION_ENDPOINT = "https://mag-pro1.com/api/public/agent-version";

function httpGet(url, onResponse, onError, redirects = 0, headers = {}, method = "GET") {
  const https = require("https");
  let settled = false;
  const fail = (err) => {
    if (settled) return;
    settled = true;
    onError(err);
  };
  const req = https
    .request(url, {
      headers: {
        "user-agent": `MagProConnect/${app.getVersion()}`,
        "cache-control": "no-cache",
        ...headers,
      },
      method,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects > 5) return onError(new Error("عدد كبير من التحويلات"));
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        settled = true;
        return httpGet(nextUrl, onResponse, onError, redirects + 1, headers, method);
      }
      if (res.statusCode !== 200 && res.statusCode !== 206 && res.statusCode !== 416) {
        res.resume();
        return fail(new Error("HTTP " + res.statusCode));
      }
      settled = true;
      onResponse(res);
    })
    .on("error", fail);
  req.setTimeout(30000, () => req.destroy(new Error("انتهت مهلة الاتصال")));
  req.end();
}

function headSize(url) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    setTimeout(() => finish(0), 20000);
    httpGet(
      url,
      (res) => {
        res.resume();
        const len = Number(res.headers["content-length"] || 0);
        finish(Number.isFinite(len) && len > 0 ? len : 0);
      },
      () => finish(0),
      0,
      {},
      "HEAD",
    );
  });
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    httpGet(
      url,
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", reject);
      },
      reject,
    );
  });
}

function cmpVersion(a, b) {
  const pa = String(a || "0").split(".").map(Number);
  const pb = String(b || "0").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function looksLikeInstaller(file) {
  // كل ملف تثبيت ويندوز يبدأ بالتوقيع MZ — لو الملف ناقص/صفحة خطأ لن يبدأ به.
  try {
    const fs = require("fs");
    const fd = fs.openSync(file, "r");
    const head = Buffer.alloc(2);
    fs.readSync(fd, head, 0, 2, 0);
    fs.closeSync(fd);
    return head.toString("latin1") === "MZ";
  } catch {
    return false;
  }
}

function targetPathFor(url, version) {
  const os = require("os");
  const crypto = require("crypto");
  const isSetup = /\.exe(\?|$)/i.test(url) || url === PERMANENT_DOWNLOAD_URL;
  const safeVersion =
    typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) ? version : "unknown";
  const downloadId = crypto
    .createHash("sha256")
    .update(`${url}|${safeVersion}`)
    .digest("hex")
    .slice(0, 12);
  return {
    isSetup,
    path: path.join(
      os.tmpdir(),
      isSetup ? `mag-pro-agent-setup-${downloadId}.exe` : `mag-pro-agent-update-${downloadId}.zip`,
    ),
  };
}

async function performDownload(url, version, notify) {
  const fs = require("fs");
  const { isSetup, path: target } = targetPathFor(url, version);


  let received = 0;
  let total = 0;
  try {
    if (fs.existsSync(target)) received = fs.statSync(target).size;
  } catch {
    received = 0;
  }

  let lastSent = 0;
  const sendProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastSent < 250) return;
    lastSent = now;
    if (notify && win && !win.isDestroyed()) {
      win.webContents.send("update-progress", {
        received,
        total,
        percent: total ? Math.min(100, Math.max(0, Math.round((received / total) * 100))) : null,
      });
    }
  };

  let activeUrl = url;
  // الحجم المتوقع يُقرأ مسبقاً حتى لو الاستجابة رجعت بدون content-length،
  // فبدون حجم معروف كان الملف الناقص يُعتبر مكتملاً ثم يفشل التثبيت بصمت.
  let expected = await headSize(activeUrl);
  if (!expected && activeUrl !== PERMANENT_DOWNLOAD_URL) {
    activeUrl = PERMANENT_DOWNLOAD_URL;
    expected = await headSize(activeUrl);
  }
  if (expected && received > expected) {
    try {
      fs.unlinkSync(target);
    } catch {}
    received = 0;
  }

  // إذا كان ملف نفس الإصدار قد اكتمل في محاولة سابقة، استخدمه مباشرة.
  // هذا يمنع إعادة تنزيل 77MB بعد اكتمال التحميل أو بعد إعادة فتح الواجهة.
  if (expected && received === expected && (!isSetup || looksLikeInstaller(target))) {
    downloadedFile = target;
    if (notify && win && !win.isDestroyed()) {
      win.webContents.send("update-progress", {
        received,
        total: expected,
        percent: 100,
      });
    }
    return { path: target };
  }

  const attempt = () =>
    new Promise((resolve, reject) => {
      const headers = received > 0 ? { Range: `bytes=${received}-` } : {};
      httpGet(
        activeUrl,
        (res) => {
          const requestedOffset = received;
          if (res.statusCode === 416) {
            const unsatisfiedRange = String(res.headers["content-range"] || "");
            const totalMatch = /^bytes\s+\*\/(\d+)$/i.exec(unsatisfiedRange);
            const expectedSize = totalMatch ? Number(totalMatch[1]) : expected;
            res.resume();
            if (expectedSize > 0 && received === expectedSize && looksLikeInstaller(target)) {
              total = expectedSize;
              sendProgress(true);
              return resolve({ path: target });
            }
            try {
              fs.unlinkSync(target);
            } catch {}
            received = 0;
            total = 0;
            return reject(new Error("تم تنظيف ملف تحميل قديم"));
          }
          if (res.statusCode === 200 && received > 0) {
            received = 0;
            try {
              fs.unlinkSync(target);
            } catch {}
          }
          const len = Number(res.headers["content-length"] || 0);
          const contentRange = String(res.headers["content-range"] || "");
          const rangeMatch = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(contentRange);
          if (res.statusCode === 206 && (!rangeMatch || Number(rangeMatch[1]) !== requestedOffset)) {
            res.destroy();
            return reject(new Error("استجابة استكمال غير صالحة"));
          }
          total = rangeMatch ? Number(rangeMatch[3]) : len ? received + len : expected;
          if (!Number.isFinite(total) || total < 0) total = expected;
          const file = fs.createWriteStream(target, { flags: received > 0 ? "a" : "w" });
          let done = false;
          let stallTimer = null;
          const clearStall = () => {
            if (stallTimer) clearTimeout(stallTimer);
            stallTimer = null;
          };
          const armStall = () => {
            clearStall();
            stallTimer = setTimeout(() => {
              try {
                res.destroy();
              } catch {}
              fail(new Error("توقف التحميل — إعادة المحاولة"));
            }, 25000);
          };
          const fail = (err) => {
            if (done) return;
            done = true;
            clearStall();
            try {
              file.destroy();
            } catch {}
            reject(err);
          };
          armStall();
          res.on("data", (chunk) => {
            received += chunk.length;
            armStall();
            sendProgress();
          });
          res.on("error", fail);
          res.on("aborted", () => fail(new Error("انقطع الاتصال")));
          file.on("error", fail);
          res.pipe(file);
          file.on("finish", () => {
            if (done) return;
            done = true;
            clearStall();
            file.close(() => {
              let size = 0;
              try {
                size = fs.statSync(target).size;
              } catch {}
              received = size || received;
              const goal = total || expected;
              if (!goal) return reject(new Error("حجم التحديث غير معروف"));
              if (received !== goal) {
                if (received > goal) {
                  try {
                    fs.unlinkSync(target);
                  } catch {}
                  received = 0;
                }
                return reject(new Error("تحميل غير مكتمل"));
              }
              if (isSetup && !looksLikeInstaller(target)) {
                try {
                  fs.unlinkSync(target);
                } catch {}
                received = 0;
                return reject(new Error("ملف التحديث تالف"));
              }
              total = goal;
              sendProgress(true);
              resolve({ path: target });
            });
          });
        },
        reject,
        0,
        headers,
      );
    });

  let lastErr = null;
  for (let i = 0; i < 30; i++) {
    try {
      const out = await attempt();
      downloadedFile = target;
      return out;
    } catch (err) {
      lastErr = err;
      const message = String(err?.message || err);
      if (
        activeUrl !== PERMANENT_DOWNLOAD_URL &&
        (/HTTP\s+(400|403|404|410|500|502|503|504)/.test(message) || i >= 2)
      ) {
        activeUrl = PERMANENT_DOWNLOAD_URL;
        expected = await headSize(activeUrl);
        try {
          if (fs.existsSync(target)) fs.unlinkSync(target);
        } catch {}
        received = 0;
        total = 0;
      }
      if (!expected) expected = await headSize(activeUrl);
      try {
        received = fs.existsSync(target) ? fs.statSync(target).size : 0;
      } catch {
        received = 0;
      }
      sendProgress(true);
      await new Promise((r) => setTimeout(r, Math.min(1000 + i * 500, 5000)));
    }
  }
  throw new Error("فشل التحميل بعد عدة محاولات: " + (lastErr?.message || lastErr));
}

// تنزيل واحد فقط في نفس الوقت — لو الواجهة والخلفية طلبتا التحديث معاً
// يشتركان في نفس العملية بدل إتلاف نفس الملف المؤقت.
// المشاركة مقيّدة بنفس الإصدار حتى لا يُسلَّم ملف إصدار أقدم لطلب أحدث.
let activeDownloadKey = null;
function downloadUpdate(url, version, notify = true) {
  const key = `${url}|${version}`;
  if (activeDownload && activeDownloadKey === key) return activeDownload;
  activeDownloadKey = key;
  activeDownload = performDownload(url, version, notify).finally(() => {
    activeDownload = null;
    activeDownloadKey = null;
  });
  return activeDownload;
}


ipcMain.handle("download-update", async (_e, url, version) => {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) {
    throw new Error("رابط غير صالح");
  }
  return downloadUpdate(url, version, true);
});



function cleanupOldDownloads(keepPath = null) {
  // تنظيف ملفات التحديث المؤقتة القديمة (كانت تتراكم بعد كل تحديث)
  try {
    const fs = require("fs");
    const os = require("os");
    const dir = os.tmpdir();
    for (const name of fs.readdirSync(dir)) {
      if (!/^mag-pro-agent-(setup|update)-/.test(name)) continue;
      const full = path.join(dir, name);
      if (downloadedFile && full.startsWith(downloadedFile)) continue;
      // نُبقي ملف الإصدار الأحدث المطلوب حتى يستكمل التنزيل من مكان توقفه
      // بدل إعادة تنزيل الحزمة كاملة في كل تشغيل.
      if (keepPath && full.startsWith(keepPath)) continue;
      try {
        // أي ملف تحديث لا يخص الإصدار الحالي يُحذف فوراً حتى لا يُثبَّت
        // إصدار قديم متبقٍ من محاولة سابقة.
        fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}


let installing = false;

async function waitForNoActiveViewers() {
  // لا نغلق التطبيق أثناء مشاهدة المدير. يبقى التحديث جاهزاً في الخلفية
  // ويبدأ التثبيت فور انتهاء آخر مشاهدة، وبذلك لا ينقطع البث أثناء العمل.
  while (activeViewerCount > 0) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function installUpdate() {
  if (installing) return true;
  if (!downloadedFile) throw new Error("لم يتم تنزيل التحديث");
  await waitForNoActiveViewers();
  cleanupOldDownloads();
  const fs = require("fs");
  const os = require("os");
  const dest = path.join(os.homedir(), "MagProAgent");
  if (process.platform !== "win32") {
    await shell.openPath(downloadedFile);
    return true;
  }
  // بعض الروابط لا تنتهي بـ .exe (مسار وسيط) — نتعرف على ملف التثبيت من التوقيع MZ
  let isExeFile = /\.exe$/i.test(downloadedFile);
  if (!isExeFile && looksLikeInstaller(downloadedFile)) {
    try {
      const renamed = downloadedFile.replace(/\.zip$/i, "") + ".exe";
      fs.renameSync(downloadedFile, renamed);
      downloadedFile = renamed;
      isExeFile = true;
    } catch {
      /* ignore */
    }
  }
  if (isExeFile) {
    if (!looksLikeInstaller(downloadedFile)) {
      try {
        fs.unlinkSync(downloadedFile);
      } catch {}
      downloadedFile = null;
      throw new Error("ملف التثبيت تالف — سيُعاد تنزيله");
    }
    // سكربت VBScript بدل الملف الدفعي: wscript.exe لا يفتح أي نافذة أوامر،
    // وكل الأوامر تُشغّل بنمط مخفي (0) حتى لا يرى الموظف شاشة الترمينال.
    const relaunchTarget = process.execPath;
    const script = path.join(os.tmpdir(), `mag-pro-agent-install-${Date.now()}.vbs`);
    const vbsQuote = (value) => String(value).replace(/"/g, '""');
    fs.writeFileSync(
      script,
      [
        'Set sh = CreateObject("WScript.Shell")',
        'Set fso = CreateObject("Scripting.FileSystemObject")',
        "WScript.Sleep 400",
        `sh.Run """${vbsQuote(downloadedFile)}"" /S", 0, True`,
        "WScript.Sleep 1200",
        `If fso.FileExists("${vbsQuote(relaunchTarget)}") Then sh.Run """${vbsQuote(relaunchTarget)}"" --hidden", 0, False`,
        "WScript.Sleep 500",
        "fso.DeleteFile WScript.ScriptFullName, True",
      ].join("\r\n"),
      "utf8",
    );
    installing = true;
    const { spawn } = require("child_process");
    spawn("wscript.exe", ["//B", "//Nologo", script], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();

    setTimeout(() => {
      app.isQuiting = true;
      app.quit();
    }, 1200);
    return true;
  }


  await new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${downloadedFile}' -DestinationPath '${dest}' -Force`,
      ],
      (err) => (err ? reject(err) : resolve()),
    );
  });
  // نبحث عن الملف التنفيذي الجديد ونشغّله ثم نخرج
  const findExe = (dir, depth = 0) => {
    if (depth > 3) return null;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const en of entries) {
      const p = path.join(dir, en.name);
      if (en.isFile() && /\.exe$/i.test(en.name) && /mag/i.test(en.name)) return p;
    }
    for (const en of entries) {
      if (en.isDirectory()) {
        const found = findExe(path.join(dir, en.name), depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const exe = findExe(dest);
  if (!exe) throw new Error("لم يتم العثور على ملف التثبيت");
  const { spawn } = require("child_process");
  spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
  setTimeout(() => {
    app.isQuiting = true;
    app.quit();
  }, 1200);
  return true;
}

ipcMain.handle("install-update", () => installUpdate());
ipcMain.handle("check-update", () => runBootUpdate());


ipcMain.handle("enable-auto-launch", () => {
  enableAutoLaunch();
  return true;
});

// ===== تحديث تلقائي عند بدء التشغيل =====
// لو الجهاز كان مقفولاً وصدر تحديث، أول ما يفتح ينزل التحديث ويثبته بصمت.
// لا يعتمد على الواجهة: يشتغل حتى لو البرنامج بدأ مخفياً، وينتظر الشبكة.
let bootUpdateDone = false;

async function runBootUpdate(attempt = 0) {
  if (bootUpdateDone) return;
  // التشغيل، استعادة الجهاز، والواجهة قد تطلب الفحص في نفس اللحظة.
  // جميعها تشترك في دورة تحديث واحدة حتى انتهاء التثبيت.
  if (updatePipeline) return updatePipeline;
  updatePipeline = runBootUpdateOnce(attempt).finally(() => {
    updatePipeline = null;
  });
  return updatePipeline;
}

async function runBootUpdateOnce(attempt = 0) {
  const retry = () => {
    const delay = attempt < 6 ? 15000 : 60 * 1000;
    setTimeout(() => void runBootUpdate(attempt + 1), delay);
  };
  try {
    const info = await httpJson(VERSION_ENDPOINT);
    const latest = info?.version;
    if (!latest || cmpVersion(latest, app.getVersion()) <= 0) {
      // لا يوجد تحديث الآن — نعيد الفحص سريعاً ليصل الإصدار المنشور فوراً.
      setTimeout(() => void runBootUpdate(0), 15 * 1000);
      return;
    }
    const publishedUrl =
      typeof info?.url === "string" && /^https:\/\//.test(info.url)
        ? info.url
        : PERMANENT_DOWNLOAD_URL;
    // ننزل الإصدار الأحدث فقط (قفزة مباشرة، بدون أي إصدار وسيط).
    // نحذف ملفات الإصدارات القديمة فقط ونُبقي ملف الإصدار الأحدث حتى يستكمل
    // التنزيل من مكان توقفه بدل البدء من الصفر في كل تشغيل.
    const wanted = targetPathFor(publishedUrl, latest);
    downloadedFile = null;
    cleanupOldDownloads(wanted.path);
    const stampPath = `${wanted.path}.ok`;
    const fsMod = require("fs");
    const expectedHash =
      typeof info?.sha256 === "string" && /^[0-9a-f]{64}$/i.test(info.sha256)
        ? info.sha256.toLowerCase()
        : null;

    // لو نفس الملف تم تنزيله والتحقق منه في تشغيل سابق، نثبّته فوراً بدون
    // إعادة تنزيل ولا إعادة حساب البصمة (كان هذا سبب التأخير الطويل).
    let ready = false;
    try {
      if (
        expectedHash &&
        fsMod.existsSync(wanted.path) &&
        fsMod.readFileSync(stampPath, "utf8").trim() === expectedHash &&
        looksLikeInstaller(wanted.path)
      ) {
        downloadedFile = wanted.path;
        ready = true;
      }
    } catch {
      ready = false;
    }

    if (!ready) {
      const out = await downloadUpdate(publishedUrl, latest, true);
      const file = out?.path || downloadedFile;
      // تحقق من بصمة الملف قبل التثبيت: أي ملف ناقص أو تالف يُحذف ويُعاد تنزيله
      // بدل تثبيت فاشل صامت يُبقي الموظف على إصدار قديم.
      if (expectedHash) {
        const ok = await verifySha256(file, expectedHash);
        if (!ok) {
          try {
            fsMod.unlinkSync(file);
          } catch {}
          try {
            fsMod.unlinkSync(stampPath);
          } catch {}
          downloadedFile = null;
          throw new Error("بصمة ملف التحديث غير مطابقة");
        }
        try {
          fsMod.writeFileSync(stampPath, expectedHash, "utf8");
        } catch {}
      }
    }

    await installUpdate();
    // لا نوقف دورة الفحص إلا بعد نجاح التثبيت فعلاً، وإلا يبقى الجهاز
    // على إصدار قديم للأبد بعد أي فشل مؤقت.
    bootUpdateDone = true;
  } catch {
    bootUpdateDone = false;
    retry();
  }
}

function verifySha256(file, expected) {
  return new Promise((resolve) => {
    try {
      const fs = require("fs");
      const crypto = require("crypto");
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(file);
      stream.on("data", (c) => hash.update(c));
      stream.on("error", () => resolve(false));
      stream.on("end", () =>
        resolve(hash.digest("hex").toLowerCase() === String(expected).toLowerCase()),
      );
    } catch {
      resolve(false);
    }
  });
}


app.whenReady().then(() => {
  // Windows may suspend timers, screen capture, and WebRTC for a hidden app.
  // Keep the background service active without preventing the display from sleeping.
  try {
    backgroundPowerBlocker = powerSaveBlocker.start("prevent-app-suspension");
  } catch {
    backgroundPowerBlocker = null;
  }
  createWindow();
  enableAutoLaunch();
  // إزالة أي حزمة قديمة (قبل Mag Pro) لضمان عدم بقاء نسختين على الجهاز.
  cleanupLegacyInstall();
  // مهلة قصيرة حتى تجهز الشبكة بعد تشغيل ويندوز
  setTimeout(() => void runBootUpdate(), 1500);
  try {

    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("Mag Pro Connect");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "إظهار النافذة",
          click: () => {
            if (win) {
              win.setSkipTaskbar(false);
              win.show();
            }
          },
        },
        {
          label: "إنهاء",
          click: () => {
            app.isQuiting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", () => {
      if (win) {
        win.setSkipTaskbar(false);
        win.show();
      }
    });
  } catch {
    // tray optional
  }

  // بعد قفل/فتح اللابتوب أو النوم: نعيد تحميل الواجهة لإعادة الاتصال فوراً
  try {
    const { powerMonitor } = require("electron");
    const reconnect = () => {
      enableAutoLaunch();
      // لا نعيد تحميل صفحة البرنامج عند الاستيقاظ؛ الشبكة تكون غالباً لم
      // تستعد بعد، وإعادة التحميل كانت تهدم البث وتترك الواجهة معلقة.
      if (win && !win.isDestroyed()) win.webContents.send("power-resume");
      // بعد الاستئناف نفحص التحديث فوراً بدل انتظار الدورة القادمة
      // أعطِ البث والشبكة وقتاً للاستقرار بعد الاستيقاظ قبل فحص تحديث كبير.
      setTimeout(() => void runBootUpdate(), 30000);
    };

    powerMonitor.on("resume", reconnect);
    powerMonitor.on("unlock-screen", reconnect);
  } catch {
    // powerMonitor optional
  }
});


// لا نغلق التطبيق عند إخفاء النافذة — يستمر في الخلفية
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  if (backgroundPowerBlocker != null && powerSaveBlocker.isStarted(backgroundPowerBlocker)) {
    powerSaveBlocker.stop(backgroundPowerBlocker);
  }
});

