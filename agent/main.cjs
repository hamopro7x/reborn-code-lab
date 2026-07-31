const { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");
const { execFile } = require("child_process");

let win = null;
let tray = null;

const startedHidden = process.argv.includes("--hidden") || app.getLoginItemSettings().wasOpenedAtLogin;

// نسخة واحدة فقط تعمل في نفس الوقت
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
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
  execFile(
    "schtasks.exe",
    [
      "/Create",
      "/TN",
      RUN_NAME,
      "/SC",
      "ONLOGON",
      "/TR",
      startupCommand(),
      "/RL",
      "LIMITED",
      "/F",
    ],
    () => {},
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
    if (!startedHidden) win.show();
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

function httpGet(url, onResponse, onError, redirects = 0) {
  const https = require("https");
  https
    .get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects > 5) return onError(new Error("عدد كبير من التحويلات"));
        res.resume();
        return httpGet(res.headers.location, onResponse, onError, redirects + 1);
      }
      if (res.statusCode !== 200) return onError(new Error("HTTP " + res.statusCode));
      onResponse(res);
    })
    .on("error", onError);
}

ipcMain.handle("download-update", (_e, url) => {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) {
    return Promise.reject(new Error("رابط غير صالح"));
  }
  const fs = require("fs");
  const os = require("os");
  const target = path.join(os.tmpdir(), "mag-pro-agent-update.zip");
  return new Promise((resolve, reject) => {
    httpGet(
      url,
      (res) => {
        const total = Number(res.headers["content-length"] || 0);
        let received = 0;
        const file = fs.createWriteStream(target);
        res.on("data", (chunk) => {
          received += chunk.length;
          if (win && !win.isDestroyed()) {
            win.webContents.send("update-progress", {
              received,
              total,
              percent: total ? Math.round((received / total) * 100) : null,
            });
          }
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            downloadedFile = target;
            resolve({ path: target });
          });
        });
        file.on("error", reject);
      },
      reject,
    );
  });
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

