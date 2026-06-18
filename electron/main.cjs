const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const rootDir = path.resolve(__dirname, "..");
const apiBase = process.env.NEURONOTES_API_BASE || "http://127.0.0.1:8787";
const frontendEntry = path.join(rootDir, "frontend", "dist", "index.html");

// Shared-secret token so only this app (and clients the user authorizes) can
// write to the local memory API. Generated once per launch and handed to both
// the backend (env) and the renderer (preload).
const apiToken = process.env.NEURONOTES_API_TOKEN || crypto.randomBytes(24).toString("hex");
process.env.NEURONOTES_API_TOKEN = apiToken;

let backendProcess = null;

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

  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: "Neuronotes 2.0",
    backgroundColor: "#f6f7f9",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NEURONOTES_APP_URL) {
    await window.loadURL(process.env.NEURONOTES_APP_URL);
  } else {
    await window.loadFile(frontendEntry);
  }
}

app.whenReady().then(createWindow);

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
