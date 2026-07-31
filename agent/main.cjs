const { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

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

function enableAutoLaunch() {
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: ["--hidden"],
      path: process.execPath,
    });
  } catch {
    // ignore
  }
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
});

// لا نغلق التطبيق عند إخفاء النافذة — يستمر في الخلفية
app.on("window-all-closed", () => {});

