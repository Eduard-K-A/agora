import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clickySales", {
  getWorkerBaseUrl: () => "http://localhost:8787",
  minimizeOverlay: () => ipcRenderer.invoke("overlay:minimize"),
  hideOverlay: () => ipcRenderer.invoke("overlay:minimize"),
  resizeOverlay: (width: number, height: number) => ipcRenderer.invoke("overlay:resize-content", width, height)
});

