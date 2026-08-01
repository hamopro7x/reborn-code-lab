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

// ===== تحديث داخلي: تنزيل بشريط تقدّم ثم تثبيت =====
let downloadedFile = null;

function httpGet(url, onResponse, onError, redirects = 0, headers = {}) {
  const https = require("https");
  https
    .get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects > 5) return onError(new Error("عدد كبير من التحويلات"));
        res.resume();
        return httpGet(res.headers.location, onResponse, onError, redirects + 1, headers);
      }
      if (res.statusCode !== 200 && res.statusCode !== 206 && res.statusCode !== 416) {
        res.resume();
        return onError(new Error("HTTP " + res.statusCode));
      }
      onResponse(res);
    })
    .on("error", onError);
}

ipcMain.handle("download-update", async (_e, url, version) => {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) {
    throw new Error("رابط غير صالح");
  }
  const fs = require("fs");
  const os = require("os");
  const crypto = require("crypto");
  const isSetup = /\.exe(\?|$)/i.test(url);
  const safeVersion = typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version)
    ? version
    : "unknown";
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

  // تحديث الواجهة بمعدل ثابت (كل 250ms) لمنع التقطيع في شريط التقدم
  let lastSent = 0;
  const sendProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastSent < 250) return;
    lastSent = now;
    if (win && !win.isDestroyed()) {
      win.webContents.send("update-progress", {
        received,
        total,
        percent: total ? Math.min(100, Math.max(0, Math.round((received / total) * 100))) : null,
      });
    }
  };

  // محاولة واحدة: تكمل من مكان التوقف عبر Range + كشف التوقف (stall)
  const attempt = () =>
    new Promise((resolve, reject) => {
      const headers = received > 0 ? { Range: `bytes=${received}-` } : {};
      httpGet(
        url,
        (res) => {
          const requestedOffset = received;
          if (res.statusCode === 416) {
            const unsatisfiedRange = String(res.headers["content-range"] || "");
            const totalMatch = /^bytes\s+\*\/(\d+)$/i.exec(unsatisfiedRange);
            const expectedSize = totalMatch ? Number(totalMatch[1]) : 0;
            res.resume();
            if (expectedSize > 0 && received === expectedSize) {
              total = expectedSize;
              sendProgress(true);
              return resolve({ path: target });
            }
            try {
              fs.unlinkSync(target);
            } catch {}
            received = 0;
            total = expectedSize;
            return reject(new Error("تم تنظيف ملف تحميل قديم"));
          }
          if (res.statusCode === 200 && received > 0) {
            // السيرفر مش بيدعم الإكمال — نبدأ من الأول
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
          total = rangeMatch ? Number(rangeMatch[3]) : received + len;
          if (!Number.isFinite(total) || total < 0) total = 0;
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
              if (total && received !== total) {
                if (received > total) {
                  try {
                    fs.unlinkSync(target);
                  } catch {}
                  received = 0;
                }
                return reject(new Error("تحميل غير مكتمل"));
              }
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
      // نُحدّث الحجم الفعلي على القرص قبل الاستئناف
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
});


ipcMain.handle("install-update", async () => {
  if (!downloadedFile) throw new Error("لم يتم تنزيل التحديث");
  const fs = require("fs");
  const os = require("os");
  const dest = path.join(os.homedir(), "MagProAgent");
  if (process.platform !== "win32") {
    await shell.openPath(downloadedFile);
    return true;
  }
  // النسخة الجديدة عبارة عن ملف تثبيت (Setup.exe): نشغّله بصمت ثم نخرج
  if (/\.exe$/i.test(downloadedFile)) {
    const { spawn } = require("child_process");
    spawn(downloadedFile, ["/S"], { detached: true, stdio: "ignore" }).unref();
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
});


ipcMain.handle("enable-auto-launch", () => {
  enableAutoLaunch();
  return true;
});


app.whenReady().then(() => {
  createWindow();
  enableAutoLaunch();
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
    };
    powerMonitor.on("resume", reconnect);
    powerMonitor.on("unlock-screen", reconnect);
  } catch {
    // powerMonitor optional
  }
});


// لا نغلق التطبيق عند إخفاء النافذة — يستمر في الخلفية
app.on("window-all-closed", () => {});

