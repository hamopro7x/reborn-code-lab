const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agent", {
  getScreenSource: () => ipcRenderer.invoke("get-screen-source"),
});
