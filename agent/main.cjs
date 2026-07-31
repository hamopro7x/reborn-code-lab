const { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 420,
    resizable: false,
    title: "Mag Pro Agent",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer.html"));
  win.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

ipcMain.handle("get-screen-source", async () => {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources.length ? sources[0].id : null;
});

app.whenReady().then(() => {
  createWindow();
  try {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("Mag Pro Agent");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "إظهار النافذة", click: () => win && win.show() },
        {
          label: "إنهاء",
          click: () => {
            app.isQuiting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", () => win && win.show());
  } catch {
    // tray optional
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
