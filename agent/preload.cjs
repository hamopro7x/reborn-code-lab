const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agent", {
  getVersion: () => ipcRenderer.invoke("get-app-version"),
  getScreenSource: () => ipcRenderer.invoke("get-screen-source"),
  enableAutoLaunch: () => ipcRenderer.invoke("enable-auto-launch"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  rendererPulse: () => ipcRenderer.send("renderer-pulse"),
  reloadRenderer: () => ipcRenderer.send("reload-renderer"),
  setViewerCount: (count) => ipcRenderer.send("viewer-count", count),
  remoteInput: (cmd) => ipcRenderer.send("remote-input", cmd),
  reportStage: (patch) => ipcRenderer.send("stage", patch),
  getStage: () => ipcRenderer.invoke("get-stage"),

  onUpdateProgress: (cb) => {
    ipcRenderer.on("update-progress", (_e, data) => cb(data));
  },
  onPowerResume: (cb) => {
    ipcRenderer.on("power-resume", () => cb());
  },
});
