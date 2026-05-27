import { app, BrowserWindow } from "electron";
import path from "node:path";

let overlayWindow: BrowserWindow | null = null;

function createOverlayWindow() {
  const preloadPath = path.join(__dirname, "../preload/index.js");
  const overlayPath = path.join(__dirname, "../renderer/overlay.html");

  overlayWindow = new BrowserWindow({
    width: 360,
    height: 240,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: preloadPath
    }
  });

  overlayWindow.setMenuBarVisibility(false);
  if (!app.isPackaged) {
    overlayWindow.loadURL("http://localhost:5173/overlay.html");
    return;
  }

  overlayWindow.loadFile(overlayPath);
}

app.whenReady().then(() => {
  createOverlayWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
