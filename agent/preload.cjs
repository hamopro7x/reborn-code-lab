const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agent", {
  getScreenSource: () => ipcRenderer.invoke("get-screen-source"),
  enableAutoLaunch: () => ipcRenderer.invoke("enable-auto-launch"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  downloadUpdate: (url, version) => ipcRenderer.invoke("download-update", url, version),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateProgress: (cb) => {
    ipcRenderer.on("update-progress", (_e, data) => cb(data));
  },
});
