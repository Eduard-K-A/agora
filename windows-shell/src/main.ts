import { app, BrowserWindow, desktopCapturer, session } from "electron";
import path from "node:path";

let overlayWindow: BrowserWindow | null = null;

function configureDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler((_, callback) => {
    void desktopCapturer
      .getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 }
      })
      .then((sources) => {
        const screenSource = sources[0];
        if (!screenSource) {
          callback({});
          return;
        }

        callback({
          video: screenSource,
          audio: "loopback"
        });
      })
      .catch(() => {
        callback({});
      });
  });
}

function createOverlayWindow() {
  const preloadPath = path.join(__dirname, "../preload/index.js");
  const overlayPath = path.join(__dirname, "../renderer/overlay.html");

  overlayWindow = new BrowserWindow({
    width: 360,
    height: 560,
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
  configureDisplayMediaHandler();
  createOverlayWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createOverlayWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
