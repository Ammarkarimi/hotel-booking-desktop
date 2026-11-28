// Pathik automation. The app opens Pathik (pathik.guru, the Gujarat police guest register) in its
// own window with a saved session, so the hotel signs in once and stays signed in. When the
// "Add Guest" form opens, the booking's details are filled in by pathik-page.js; staff check
// them, add the ID number and photo, and press Submit in Pathik themselves.
import { app, BrowserWindow, shell, session } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PathikRecord } from "../shared/pathik";

let win: BrowserWindow | null = null;
let pending: { record: PathikRecord; addGuestUrl: string; dateFormat: string; timeFormat: string; force: boolean } | null = null;
let pageScript = "";
type Notify = (status: { bookingId: string; state: "opened" | "waiting" | "filled" | "closed" | "error"; message?: string }) => void;
let notify: Notify = () => undefined;

export function setPathikNotifier(fn: Notify) {
  notify = fn;
}

function script() {
  if (!pageScript) pageScript = readFileSync(join(__dirname, "pathik-page.js"), "utf8");
  return pageScript;
}

function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

async function tryFill() {
  if (!win || win.isDestroyed() || !pending) return;
  const p = pending;
  const wc = win.webContents;
  // Only fill on Pathik's own site, never on another page the window may have been sent to.
  if (originOf(wc.getURL()) !== originOf(p.addGuestUrl)) return;
  try {
    const payload = { record: p.record, addGuestUrl: p.addGuestUrl, dateFormat: p.dateFormat, timeFormat: p.timeFormat, force: p.force };
    const result = await wc.executeJavaScript(`${script()}(${JSON.stringify(payload)})`, true);
    if (result === "filled") {
      p.force = false;
      notify({ bookingId: p.record.bookingId, state: "filled" });
    } else if (result === "waiting") {
      notify({ bookingId: p.record.bookingId, state: "waiting" });
    }
  } catch (e) {
    notify({ bookingId: p.record.bookingId, state: "error", message: (e as Error).message });
  }
}

export function openPathik(opts: { record: PathikRecord; addGuestUrl: string; dateFormat: string; timeFormat: string; icon?: string }) {
  pending = { record: opts.record, addGuestUrl: opts.addGuestUrl, dateFormat: opts.dateFormat, timeFormat: opts.timeFormat, force: true };
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({
      width: 1280,
      height: 900,
      title: "Pathik",
      icon: opts.icon,
      autoHideMenuBar: true,
      webPreferences: {
        // A session of its own that is kept on disk: the Pathik sign-in survives restarts and
        // never mixes with the hotel software's own pages.
        session: session.fromPartition("persist:pathik"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        devTools: !app.isPackaged,
      },
    });
    win.setMenuBarVisibility(false);
    const wc = win.webContents;
    // Links Pathik opens in a new tab stay in this window when they are on Pathik, else go to the browser.
    wc.setWindowOpenHandler(({ url }) => {
      if (originOf(url) === originOf(pending?.addGuestUrl ?? opts.addGuestUrl)) void wc.loadURL(url);
      else if (/^https:\/\//i.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    wc.on("will-navigate", (e, url) => {
      if (!/^https?:\/\//i.test(url)) e.preventDefault();
    });
    wc.on("did-finish-load", () => void tryFill());
    // Pathik may change pages without reloading (after signing in, or opening Add Guest).
    wc.on("did-navigate-in-page", () => void tryFill());
    wc.on("page-title-updated", (e) => {
      e.preventDefault();
      win?.setTitle(`Pathik — ${pending?.record.title ?? ""}`);
    });
    win.on("closed", () => {
      if (pending) notify({ bookingId: pending.record.bookingId, state: "closed" });
      win = null;
    });
    void wc.loadURL(opts.addGuestUrl);
  } else {
    if (win.isMinimized()) win.restore();
    win.focus();
    // Already open: go to Add Guest (a fresh form) and fill it with this booking.
    void win.webContents.loadURL(opts.addGuestUrl);
  }
  win.setTitle(`Pathik — ${opts.record.title}`);
  notify({ bookingId: opts.record.bookingId, state: "opened" });
}

/** Fill the form on the page that is open now again (after changing details or formats). */
export function refillPathik() {
  if (!pending || !win || win.isDestroyed()) return false;
  pending.force = true;
  win.focus();
  void tryFill();
  return true;
}

/** Signs out of Pathik on this computer (clears its saved session). */
export async function forgetPathikLogin() {
  await session.fromPartition("persist:pathik").clearStorageData();
  if (win && !win.isDestroyed()) win.close();
}
