const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

// 16x16 teal dot — the Synapse accent as tray icon (generated, no asset file).
const TRAY_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAATElEQVR4nGNgGJ5A79k1ASCeCMTXoBjEFiBWsz8Q/8eB/YmxGZdmGMbtEqhTCRkwEZ8B14gw4BpNDaDYC5QFItQQ8qMRzSXkJaShBwCnW/EpwSdNNgAAAABJRU5ErkJggg==";

const rootDir = path.resolve(__dirname, "..");
const apiBase = process.env.NEURONOTES_API_BASE || "http://127.0.0.1:8787";
const frontendEntry = path.join(rootDir, "frontend", "dist", "index.html");

// Shared-secret token so only this app (and clients the user authorizes) can
// write to the local memory API. Generated once per launch and handed to both
// the backend (env) and the renderer (preload).
const apiToken = process.env.NEURONOTES_API_TOKEN || crypto.randomBytes(24).toString("hex");
process.env.NEURONOTES_API_TOKEN = apiToken;

let backendProcess = null;
let mainWindow = null;
let captureWindow = null;
let tray = null;

function pythonExecutable() {
  const localPython = path.join(rootDir, ".venv", "Scripts", "python.exe");
  return localPython;
}

function startBackend() {
  if (process.env.NEURONOTES_EXTERNAL_BACKEND === "1") {
    return;
  }

  let logTarget = "ignore";
  try {
    const logFd = fs.openSync(path.join(rootDir, "backend-electron.log"), "a");
    logTarget = ["ignore", logFd, logFd];
  } catch (error) {
    console.error("No se pudo abrir backend-electron.log; el backend correra sin log.", error);
  }

  backendProcess = spawn(
    pythonExecutable(),
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8787"],
    {
      cwd: path.join(rootDir, "backend"),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        NEURONOTES_API_TOKEN: apiToken,
      },
      windowsHide: true,
      stdio: logTarget,
    },
  );

  backendProcess.on("exit", (code, signal) => {
    console.error(`Backend FastAPI termino (code=${code}, signal=${signal}).`);
    backendProcess = null;
  });
  backendProcess.on("error", (error) => {
    console.error("No se pudo iniciar el backend FastAPI:", error);
  });
}

function waitForBackend(timeoutMs = 12000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(`${apiBase}/api/health`, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });

      request.on("error", retry);
      request.setTimeout(1200, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error("FastAPI backend did not become ready."));
        return;
      }
      setTimeout(check, 350);
    };

    check();
  });
}

async function createWindow() {
  startBackend();
  await waitForBackend().catch((error) => {
    console.error("El backend no respondio a tiempo; la ventana cargara igualmente.", error);
  });

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: "NeuroNotes",
    backgroundColor: "#121311",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.env.NEURONOTES_APP_URL) {
    await mainWindow.loadURL(process.env.NEURONOTES_APP_URL);
  } else {
    await mainWindow.loadFile(frontendEntry);
  }
}

// --- Quick capture: Ctrl+Alt+N anywhere -> a small always-on-top note pad. ---

function ensureCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) return captureWindow;
  captureWindow = new BrowserWindow({
    width: 520,
    height: 250,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  captureWindow.loadFile(path.join(__dirname, "capture.html"));
  captureWindow.on("blur", () => {
    if (captureWindow && captureWindow.isVisible()) captureWindow.hide();
  });
  captureWindow.on("closed", () => {
    captureWindow = null;
  });
  return captureWindow;
}

function toggleCapture() {
  const window = ensureCaptureWindow();
  if (window.isVisible()) {
    window.hide();
    return;
  }
  // Center horizontally, upper third of the active display — reachable, not modal.
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  window.setPosition(Math.round(x + (width - 520) / 2), Math.round(y + height * 0.18));
  window.show();
  window.focus();
}

function openMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    void createWindow();
  }
}

ipcMain.on("capture:hide", () => {
  if (captureWindow && captureWindow.isVisible()) captureWindow.hide();
});
ipcMain.on("capture:open-main", openMainWindow);

function setupTrayAndShortcuts() {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  tray = new Tray(icon);
  tray.setToolTip("NeuroNotes — captura rápida: Ctrl+Alt+N");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Nueva nota rápida\tCtrl+Alt+N", click: toggleCapture },
      { label: "Abrir NeuroNotes", click: openMainWindow },
      { type: "separator" },
      { label: "Salir", click: () => app.quit() },
    ]),
  );
  tray.on("click", toggleCapture);

  const registered = globalShortcut.register("Control+Alt+N", toggleCapture);
  if (!registered) {
    console.error("No se pudo registrar el atajo global Ctrl+Alt+N (¿en uso por otra app?).");
  }
}

app.whenReady().then(async () => {
  await createWindow();
  setupTrayAndShortcuts();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) {
    const pendingProcess = backendProcess;
    pendingProcess.kill("SIGTERM");
    setTimeout(() => {
      if (pendingProcess && !pendingProcess.killed) {
        pendingProcess.kill("SIGKILL");
      }
    }, 2500);
  }
});
