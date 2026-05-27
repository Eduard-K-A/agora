import { contextBridge, ipcRenderer } from "electron";
import type { SaveCallSummaryRequest } from "./types";

const bridge = {
  getWorkerBaseUrl: () => "http://localhost:8787",
  minimizeOverlay: () => ipcRenderer.invoke("overlay:minimize"),
  hideOverlay: () => ipcRenderer.invoke("overlay:minimize"),
  resizeOverlay: (width: number, height: number) => ipcRenderer.invoke("overlay:resize-content", width, height),
  getInventoryContext: (text: string) => ipcRenderer.invoke("business:get-inventory-context", text),
  saveCallSummary: (payload: SaveCallSummaryRequest) => ipcRenderer.invoke("business:save-call-summary", payload)
};

contextBridge.exposeInMainWorld("elySales", bridge);
