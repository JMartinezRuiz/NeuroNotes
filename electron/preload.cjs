const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("neuronotes", {
  apiBase: process.env.NEURONOTES_API_BASE || "http://127.0.0.1:8787",
  apiToken: process.env.NEURONOTES_API_TOKEN || "",
  desktop: true,
  // Quick-capture window controls (no-ops outside the capture window).
  hideCapture: () => ipcRenderer.send("capture:hide"),
  openMain: () => ipcRenderer.send("capture:open-main"),
});
