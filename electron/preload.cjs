const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("neuronotes", {
  apiBase: process.env.NEURONOTES_API_BASE || "http://127.0.0.1:8787",
  apiToken: process.env.NEURONOTES_API_TOKEN || "",
  desktop: true,
});
