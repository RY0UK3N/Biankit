const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const packageJson = require("../package.json");
const toolCatalog = require("./tool-catalog.json");
const { mergePdfs, organizePdf, splitPdf } = require("./pdf-operations");

const TOOL_META = Object.fromEntries(toolCatalog.map((tool) => [tool.id, tool]));
const pinPreferences = new WeakMap();

function selectedTool() {
  const argument = process.argv.find((item) => item.startsWith("--tool="));
  const requested = argument?.split("=")[1] || packageJson.toolId || "merge";
  return TOOL_META[requested]?.enabled ? requested : "merge";
}

const toolId = selectedTool();

function pinState(win) {
  const enabled = pinPreferences.get(win) ?? true;
  const suspended = enabled && win.isMaximized();
  return { enabled, active: enabled && !suspended, suspended };
}

function applyPinState(win, notify = true) {
  const state = pinState(win);
  win.setAlwaysOnTop(state.active, state.active ? "floating" : "normal");
  if (notify && !win.webContents.isDestroyed()) {
    win.webContents.send("app:pinState", state);
  }
  return state;
}

function pdfFilters() {
  return [{ name: "Documento PDF", extensions: ["pdf"] }];
}

function suggestedName(inputPath, suffix) {
  const base = inputPath ? path.basename(inputPath, path.extname(inputPath)) : "documento";
  return `${base}-${suffix}.pdf`;
}

async function showOwnedDialog(event, openDialog) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error("A janela do BianKit não está disponível.");
  const restoreAlwaysOnTop = win.isAlwaysOnTop();

  if (restoreAlwaysOnTop) win.setAlwaysOnTop(false);
  try {
    return await openDialog(win);
  } finally {
    if (restoreAlwaysOnTop && !win.isDestroyed()) {
      win.setAlwaysOnTop(true, "floating");
    }
  }
}

function registerHandlers() {
  ipcMain.handle("app:info", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return {
      id: toolId,
      ...TOOL_META[toolId],
      version: app.getVersion(),
      alwaysOnTop: win ? pinState(win) : { enabled: true, active: true, suspended: false },
    };
  });

  ipcMain.handle("app:alwaysOnTop", (event, enabled) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { enabled: false, active: false, suspended: false };
    pinPreferences.set(win, Boolean(enabled));
    return applyPinState(win);
  });

  ipcMain.handle("dialog:pdfs", async (event, multiple = false) => {
    const result = await showOwnedDialog(event, (win) => dialog.showOpenDialog(win, {
      properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
      filters: pdfFilters(),
    }));
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("dialog:save", async (event, { inputPath, suffix }) => {
    const result = await showOwnedDialog(event, (win) => dialog.showSaveDialog(win, {
      defaultPath: suggestedName(inputPath, suffix),
      filters: pdfFilters(),
    }));
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle("dialog:folder", async (event) => {
    const result = await showOwnedDialog(event, (win) => dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
    }));
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("pdf:bytes", async (_event, filePath) => {
    const data = await fs.readFile(filePath);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  });

  ipcMain.handle("pdf:merge", (_event, payload) => mergePdfs(payload.paths, payload.outputPath));
  ipcMain.handle("pdf:organize", (_event, payload) =>
    organizePdf(payload.inputPath, payload.pages, payload.outputPath),
  );
  ipcMain.handle("pdf:split", (_event, payload) =>
    splitPdf(payload.inputPath, payload.groups, payload.outputDirectory),
  );

  ipcMain.handle("shell:reveal", (_event, filePath) => {
    shell.showItemInFolder(filePath);
  });
  ipcMain.handle("shell:openFolder", (_event, directory) => shell.openPath(directory));
}

function createWindow() {
  const hasWorkspace = toolId === "organize";
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, "icons", `${toolId}.ico`)
    : path.join(__dirname, "..", "assets", "icons", `${toolId}.ico`);
  const win = new BrowserWindow({
    width: 440,
    height: 590,
    minWidth: 380,
    minHeight: 500,
    resizable: hasWorkspace,
    maximizable: hasWorkspace,
    title: TOOL_META[toolId].title,
    backgroundColor: "#f6f4ef",
    autoHideMenuBar: true,
    alwaysOnTop: true,
    icon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  pinPreferences.set(win, true);
  win.on("maximize", () => applyPinState(win));
  win.on("unmaximize", () => applyPinState(win));
  win.setAlwaysOnTop(true, "floating");
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  registerHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
