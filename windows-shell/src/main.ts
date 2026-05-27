import { app, BrowserWindow, Menu, Tray, ipcMain, session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getInventoryContextForText, saveCallSummaryToSqlite } from "./sqliteBusinessData";
import type { SaveCallSummaryRequest } from "./types";

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function configureDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!request.audioRequested) {
      callback({});
      return;
    }

    callback({
      audio: "loopback"
    });
  });
}

function restoreOverlayWindow() {
  if (!overlayWindow) {
    createOverlayWindow();
    return;
  }

  overlayWindow.show();
  overlayWindow.focus();
}

function createTray() {
  if (tray) return;

  const icon = [
    path.join(app.getAppPath(), "src/assets/tray-icon.png"),
    path.join(__dirname, "../../src/assets/tray-icon.png"),
    path.join(process.resourcesPath, "assets/tray-icon.png")
  ].find((candidate) => fs.existsSync(candidate));

  if (!icon) {
    throw new Error("Tray icon not found at src/assets/tray-icon.png");
  }

  tray = new Tray(icon);
  tray.setToolTip("Ely Sales Agent");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Ely Sales Agent", click: restoreOverlayWindow },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on("click", restoreOverlayWindow);
  tray.on("double-click", restoreOverlayWindow);
}

function createOverlayWindow() {
  const preloadPath = path.join(__dirname, "../preload/index.js");
  const overlayPath = path.join(__dirname, "../renderer/overlay.html");

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 760,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: 360,
    minHeight: 560,
    webPreferences: {
      preload: preloadPath
    }
  });

  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.on("close", (event) => {
    if (isQuitting) return;

    event.preventDefault();
    overlayWindow?.hide();
  });

  if (!app.isPackaged) {
    overlayWindow.loadURL("http://localhost:5173/overlay.html");
    return;
  }

  overlayWindow.loadFile(overlayPath);
}

ipcMain.handle("overlay:minimize", () => {
  overlayWindow?.hide();
});

ipcMain.handle("overlay:resize-content", (_event, width: number, height: number) => {
  if (!overlayWindow) return;

  const nextWidth = Math.max(360, Math.ceil(width));
  const nextHeight = Math.max(240, Math.ceil(height));
  overlayWindow.setContentSize(nextWidth, nextHeight);
});

ipcMain.handle("business:get-inventory-context", (_event, text: string) => {
  return getInventoryContextForText(text);
});

ipcMain.handle("business:save-call-summary", (_event, payload: SaveCallSummaryRequest) => {
  return saveCallSummaryToSqlite(payload);
});

app.whenReady().then(() => {
  configureDisplayMediaHandler();
  createTray();
  createOverlayWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createOverlayWindow();
  }
});

app.on("window-all-closed", () => {
  if (isQuitting || process.platform !== "darwin") {
    app.quit();
  }
});
