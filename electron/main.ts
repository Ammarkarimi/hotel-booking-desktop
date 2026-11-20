// Innvela Hotel Desk: the Electron main process. Opens the database on this computer, shows the
// window, and answers the screens' requests. Nothing is sent over the internet.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, nativeImage } from "electron";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "./db";
import { handle, startupTasks } from "./api/index";
import { setTrialFile } from "./license";
import { backupNow, setDefaultBackupFolder } from "./backup";
import { getSettings } from "./api/settings";

process.removeAllListeners("warning"); // node:sqlite prints an "experimental" warning

const isDev = !!process.env.VITE_DEV_SERVER_URL;
if (process.env.INNVELA_DATA_DIR) app.setPath("userData", process.env.INNVELA_DATA_DIR);

let mainWindow: BrowserWindow | null = null;

function iconPath() {
  const p = join(__dirname, "..", "build", "icon.png");
  return existsSync(p) ? p : undefined;
}

function loadRoute(win: BrowserWindow, route = "") {
  if (isDev) return win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${route}`);
  return win.loadFile(join(__dirname, "..", "dist", "index.html"), { hash: route });
}

const EXTERNAL_OK = /^(https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|www\.google\.com|maps\.google\.com|g\.page)\/|whatsapp:\/\/|mailto:|tel:)/i;

function secure(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_OK.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://") && !(isDev && url.startsWith(process.env.VITE_DEV_SERVER_URL!))) e.preventDefault();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: "Innvela Hotel Desk",
    backgroundColor: "#f1f5f9",
    icon: iconPath(),
    webPreferences: { preload: join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  secure(mainWindow);
  mainWindow.once("ready-to-show", () => {
    if (!process.env.INNVELA_NO_MAXIMIZE) mainWindow?.maximize();
    mainWindow?.show();
  });
  void loadRoute(mainWindow, "/");
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Back up now",
          click: () => {
            try {
              const f = backupNow("manual");
              void dialog.showMessageBox({ type: "info", message: "Backup made", detail: f });
            } catch (e) {
              dialog.showErrorBox("Backup failed", (e as Error).message);
            }
          },
        },
        { label: "Open data folder", click: () => void shell.openPath(app.getPath("userData")) },
        { type: "separator" },
        { role: "quit", label: "Exit" },
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, ...(isDev ? [{ role: "toggleDevTools" } as const] : [])],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Innvela Hotel Desk",
          click: () =>
            void dialog.showMessageBox({
              type: "info",
              title: "About",
              message: `Innvela Hotel Desk ${app.getVersion()}`,
              detail: `All your data is stored on this computer:\n${app.getPath("userData")}`,
              icon: iconPath() ? nativeImage.createFromPath(iconPath()!) : undefined,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle("api", (_e, method: string, args: unknown) => handle(method, args));

  ipcMain.handle("print:open", (_e, route: string) => {
    const win = new BrowserWindow({
      width: 900,
      height: 1000,
      parent: mainWindow ?? undefined,
      title: "Print",
      icon: iconPath(),
      backgroundColor: "#e2e8f0",
      autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
    });
    secure(win);
    win.setMenuBarVisibility(false);
    void loadRoute(win, route);
    return true;
  });
  ipcMain.handle("print:print", (e) => new Promise((resolve) => e.sender.print({ printBackground: true }, (ok, reason) => resolve({ ok, reason }))));
  ipcMain.handle("print:pdf", async (e, name: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath("documents"), `${name.replace(/[\\/:*?"<>|]/g, "-")}.pdf`), filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (res.canceled || !res.filePath) return null;
    const data = await e.sender.printToPDF({ pageSize: "A4", printBackground: true, margins: { marginType: "default" } });
    writeFileSync(res.filePath, data);
    void shell.openPath(res.filePath);
    return res.filePath;
  });

  ipcMain.handle("shell:open", (_e, url: string) => {
    if (!EXTERNAL_OK.test(url)) return false;
    return shell.openExternal(url).then(
      () => true,
      () => false
    );
  });

  ipcMain.handle("file:save", async (e, name: string, content: string, kind?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const ext = kind === "lic" ? "lic" : kind === "txt" ? "txt" : "csv";
    const res = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath("documents"), name), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (res.canceled || !res.filePath) return null;
    // A byte-order mark so Excel opens the CSV with ₹ and Indian names intact.
    writeFileSync(res.filePath, ext === "csv" ? `﻿${content}` : content, "utf8");
    return res.filePath;
  });

  ipcMain.handle("file:pick", async (e, kind: "backup" | "lic") => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(win!, {
      properties: ["openFile"],
      filters: kind === "lic" ? [{ name: "Licence", extensions: ["lic", "txt"] }] : [{ name: "Innvela backup", extensions: ["db"] }],
    });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle("file:readText", (_e, path: string) => {
    if (!/\.(lic|txt)$/i.test(path)) return null;
    return readFileSync(path, "utf8").slice(0, 10000);
  });
  ipcMain.handle("folder:pick", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(win!, { properties: ["openDirectory", "createDirectory"] });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle("folder:show", (_e, path: string) => {
    if (existsSync(path)) shell.showItemInFolder(path);
    return true;
  });
  ipcMain.handle("backup:saveAs", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const d = new Date();
    const res = await dialog.showSaveDialog(win!, { defaultPath: join(app.getPath("documents"), `innvela-backup-${d.toISOString().slice(0, 10)}.db`), filters: [{ name: "Innvela backup", extensions: ["db"] }] });
    if (res.canceled || !res.filePath) return null;
    const r = handle("backup.saveAs", { file: res.filePath });
    if (!r.ok) throw new Error(r.error);
    return res.filePath;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const dataDir = join(app.getPath("userData"), "data");
    mkdirSync(dataDir, { recursive: true });
    setTrialFile(app.getPath("userData"));
    setDefaultBackupFolder(join(app.getPath("documents"), "Innvela Backups"));
    try {
      openDatabase(join(dataDir, "hotel.db"));
    } catch (e) {
      dialog.showErrorBox("Could not open the hotel data", `${(e as Error).message}\n\nFolder: ${dataDir}`);
      app.quit();
      return;
    }
    startupTasks();
    registerIpc();
    buildMenu();
    createWindow();
  });

  let backedUpOnQuit = false;
  app.on("before-quit", () => {
    if (backedUpOnQuit) return;
    backedUpOnQuit = true;
    try {
      if (getSettings().autoBackup) backupNow("on-close");
    } catch {
      /* the database may already be closed */
    }
    closeDatabase();
  });

  app.on("window-all-closed", () => app.quit());
}
