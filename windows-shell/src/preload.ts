import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("clickySales", {
  getWorkerBaseUrl: () => "http://localhost:8787"
});

