const { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");
const { execFile } = require("child_process");

let win = null;
let tray = null;

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
const RUN_NAME = "MagProAgent";

function startupCommand() {
  return `"${process.execPath}" --hidden`;
}

// خطط احتياطية على ويندوز: Registry + Startup folder + Scheduled Task.
// استخدام أكثر من آلية يعالج الأجهزة التي يعطّل فيها ويندوز إحدى طرق بدء التشغيل.
function registryAutoLaunch() {
  if (process.platform !== "win32") return;
  execFile(
    "reg.exe",
    ["add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", startupCommand(), "/f"],
    () => {},
  );
}

function startupFolderAutoLaunch() {
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
    fs.mkdirSync(startupDir, { recursive: true });
    const commandFile = path.join(startupDir, `${RUN_NAME}.cmd`);
    fs.writeFileSync(commandFile, `@echo off\r\nstart "" ${startupCommand()}\r\n`, "utf8");
  } catch {
    // ignore
  }
}

function scheduledTaskAutoLaunch() {
  if (process.platform !== "win32") return;
  // Node يقوم بتهريب الاقتباسات الداخلية تلقائيًا، وهو ما يحتاجه schtasks
  // لمسارات بها مسافات (Program Files / AppData\Local\Programs).
  execFile(
    "schtasks.exe",
    ["/Create", "/TN", RUN_NAME, "/SC", "ONLOGON", "/TR", startupCommand(), "/RL", "LIMITED", "/F"],
    (err) => {
      if (err) console.error("[autolaunch] schtasks failed:", err.message);
    },
  );
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
  startupFolderAutoLaunch();
  scheduledTaskAutoLaunch();
}


function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 420,
    resizable: false,
    show: false,
    skipTaskbar: startedHidden,
    title: "Mag Pro Agent",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer.html"));
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
        "user-agent": `MagProAgent/${app.getVersion()}`,
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

async function performDownload(url, version, notify) {
  const fs = require("fs");
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
  const target = path.join(
    os.tmpdir(),
    isSetup ? `mag-pro-agent-setup-${downloadId}.exe` : `mag-pro-agent-update-${downloadId}.zip`,
  );

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
function downloadUpdate(url, version, notify = true) {
  if (activeDownload) return activeDownload;
  activeDownload = performDownload(url, version, notify).finally(() => {
    activeDownload = null;
  });
  return activeDownload;
}

ipcMain.handle("download-update", async (_e, url, version) => {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) {
    throw new Error("رابط غير صالح");
  }
  return downloadUpdate(url, version, true);
});



function cleanupOldDownloads() {
  // تنظيف ملفات التحديث المؤقتة القديمة (كانت تتراكم بعد كل تحديث)
  try {
    const fs = require("fs");
    const os = require("os");
    const dir = os.tmpdir();
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      if (!/^mag-pro-agent-(setup|update)-/.test(name)) continue;
      const full = path.join(dir, name);
      if (full === downloadedFile) continue;
      try {
        if (now - fs.statSync(full).mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

let installing = false;

async function installUpdate() {
  if (installing) return true;
  if (!downloadedFile) throw new Error("لم يتم تنزيل التحديث");
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
        "WScript.Sleep 2000",
        `sh.Run """${vbsQuote(downloadedFile)}"" /S", 0, True`,
        "WScript.Sleep 3000",
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
    const delay = attempt < 6 ? 30000 : 15 * 60 * 1000;
    setTimeout(() => void runBootUpdate(attempt + 1), delay);
  };
  try {
    const info = await httpJson(VERSION_ENDPOINT);
    const latest = info?.version;
    if (!latest || cmpVersion(latest, app.getVersion()) <= 0) {
      // لا يوجد تحديث الآن — نفحص كل ربع ساعة تحسباً لصدور نسخة أثناء العمل.
      setTimeout(() => void runBootUpdate(attempt + 1), 15 * 60 * 1000);
      return;
    }
    const publishedUrl =
      typeof info?.url === "string" && /^https:\/\//.test(info.url)
        ? info.url
        : PERMANENT_DOWNLOAD_URL;
    await downloadUpdate(publishedUrl, latest, true);
    bootUpdateDone = true;
    await installUpdate();
  } catch {
    retry();
  }
}

app.whenReady().then(() => {
  createWindow();
  enableAutoLaunch();
  // مهلة قصيرة حتى تجهز الشبكة بعد تشغيل ويندوز
  setTimeout(() => void runBootUpdate(), 8000);
  try {

    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("Mag Pro Agent");
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
      if (win && !win.isDestroyed()) win.webContents.reload();
      // بعد الاستئناف نفحص التحديث فوراً بدل انتظار الدورة القادمة
      setTimeout(() => void runBootUpdate(), 5000);
    };

    powerMonitor.on("resume", reconnect);
    powerMonitor.on("unlock-screen", reconnect);
  } catch {
    // powerMonitor optional
  }
});


// لا نغلق التطبيق عند إخفاء النافذة — يستمر في الخلفية
app.on("window-all-closed", () => {});

