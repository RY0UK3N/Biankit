const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("papel", {
  appInfo: () => ipcRenderer.invoke("app:info"),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("app:alwaysOnTop", Boolean(enabled)),
  onPinState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("app:pinState", listener);
    return () => ipcRenderer.removeListener("app:pinState", listener);
  },
  choosePdfs: (multiple) => ipcRenderer.invoke("dialog:pdfs", Boolean(multiple)),
  chooseOutput: (inputPath, suffix) => ipcRenderer.invoke("dialog:save", { inputPath, suffix }),
  chooseFolder: () => ipcRenderer.invoke("dialog:folder"),
  pathForFile: (file) => webUtils.getPathForFile(file),
  readPdf: (filePath) => ipcRenderer.invoke("pdf:bytes", filePath),
  merge: (paths, outputPath) => ipcRenderer.invoke("pdf:merge", { paths, outputPath }),
  organize: (inputPath, pages, outputPath) =>
    ipcRenderer.invoke("pdf:organize", { inputPath, pages, outputPath }),
  split: (inputPath, groups, outputDirectory) =>
    ipcRenderer.invoke("pdf:split", { inputPath, groups, outputDirectory }),
  reveal: (filePath) => ipcRenderer.invoke("shell:reveal", filePath),
  openFolder: (directory) => ipcRenderer.invoke("shell:openFolder", directory),
});
