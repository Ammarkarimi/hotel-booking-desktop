// Every request from the screens arrives here by name ("bookings.create"), is checked against the
// licence and the signed-in person's role, and runs against the database.
import { app } from "electron";
import { existsSync } from "node:fs";
import type { AppInfo, Settings } from "../../shared/types";
import { databaseFile, scalar, tx } from "../db";
import { activateLicense, licenseInfo, maxRooms } from "../license";
import { autoBackupIfDue, backupFolder, backupNow, backupTo, checkBackupFile, listBackups, restoreFrom } from "../backup";
import { UserError, fail, log, requirePerm, requireStaff, session, str } from "./context";
import { bookingsApi } from "./bookings";
import { guestsApi } from "./guests";
import { roomsApi, addRoom } from "./rooms";
import { reportsApi } from "./reports";
import { settingsApi, writeSettings, getSettings } from "./settings";
import { createStaff, staffApi } from "./staff";
import { loadSampleData } from "./sample-data";
import { pathikApi } from "./pathik";

type Handler = (args: never) => unknown;

function needsSetup() {
  return scalar<number>("SELECT COUNT(*) FROM staff") === 0;
}

const systemApi = {
  "app.info": (): AppInfo => ({ version: app.getVersion(), dataFolder: app.getPath("userData"), databaseFile: databaseFile(), firstRun: needsSetup(), license: licenseInfo() }),

  "license.info": () => licenseInfo(),
  "license.activate": ({ key }: { key: string }) => {
    // Anyone may enter a key: only a key signed by the provider for this computer is accepted.
    try {
      const info = activateLicense(str(key, 4000));
      log("Activated licence", `${info.plan} until ${info.expiresOn}`);
      return info;
    } catch (e) {
      fail((e as Error).message);
    }
  },

  "setup.complete": (input: { hotel: Partial<Settings>; owner: { name: string; username: string; password: string }; rooms?: Array<{ from: number; to: number; type: string; pricePerNight: number; capacity: number }>; sample?: boolean }) => {
    if (!needsSetup()) fail("The software is already set up");
    tx(() => {
      const hotel = input.hotel ?? {};
      // Hotels in Gujarat enter every guest in Pathik.
      const gujarat = hotel.state === "Gujarat" || (hotel.gstin ?? "").startsWith("24");
      writeSettings({ ...hotel, ...(gujarat ? { pathik: true } : {}) });
      createStaff({ ...input.owner, role: "owner" });
      for (const r of input.rooms ?? []) {
        for (let n = Number(r.from); n <= Number(r.to) && n - Number(r.from) < 300; n++) addRoom({ roomNumber: String(n), type: r.type, pricePerNight: r.pricePerNight, capacity: r.capacity });
      }
    });
    if (input.sample) loadSampleData(str(input.owner.name, 80));
    return true;
  },
  "setup.sampleData": () => {
    const staff = requirePerm("settings");
    loadSampleData(staff.name);
    log("Added sample data");
    return true;
  },

  "backup.status": () => {
    requirePerm("settings");
    return { folder: backupFolder(), backups: listBackups().slice(0, 50), lastBackupAt: scalar<string>("SELECT value FROM meta WHERE key = 'last_backup_at'") };
  },
  "backup.now": () => {
    requirePerm("settings");
    const file = backupNow("manual");
    log("Made a backup", file);
    return file;
  },
  "backup.saveAs": ({ file }: { file: string }) => {
    requirePerm("settings");
    backupTo(file);
    log("Saved a backup copy", file);
    return file;
  },
  "backup.check": ({ file }: { file: string }) => {
    requirePerm("restore");
    return checkBackupFile(file);
  },
  "backup.restore": ({ file }: { file: string }) => {
    const staff = requirePerm("restore");
    const result = restoreFrom(file);
    session.staff = null;
    session.shiftId = null;
    log("Restored a backup", `${file} (by ${staff.name})`);
    return result;
  },
};

const handlers: Record<string, Handler> = {
  ...(systemApi as Record<string, Handler>),
  ...(settingsApi as Record<string, Handler>),
  ...(staffApi as Record<string, Handler>),
  ...(roomsApi as Record<string, Handler>),
  ...(guestsApi as Record<string, Handler>),
  ...(bookingsApi as Record<string, Handler>),
  ...(reportsApi as Record<string, Handler>),
  ...(pathikApi as Record<string, Handler>),
};

// What still works when the licence has run out: signing in, the licence screen and backups.
const ALWAYS = new Set(["app.info", "license.info", "license.activate", "auth.users", "auth.login", "auth.logout", "auth.session", "settings.get", "backup.status", "backup.now", "backup.saveAs", "setup.complete"]);

export async function handle(method: string, args: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const fn = handlers[method];
  try {
    if (!fn) throw new UserError(`Unknown request: ${method}`);
    if (!ALWAYS.has(method)) {
      const lic = licenseInfo();
      if (!lic.canUse) throw new UserError(`LICENSE:${lic.message}`);
      if (method === "rooms.save" || method === "rooms.addMany") {
        const max = maxRooms();
        const a = (args ?? {}) as { id?: string; from?: number; to?: number };
        const adding = method === "rooms.addMany" ? Number(a.to) - Number(a.from) + 1 : a.id ? 0 : 1;
        if (max && adding && scalar<number>("SELECT COUNT(*) FROM rooms WHERE deleted = 0") + adding > max) throw new UserError(`Your licence is for up to ${max} rooms. Please ask us to upgrade it.`);
      }
    }
    if (method !== "auth.login" && method.startsWith("bookings.")) requireStaff();
    return { ok: true, data: await (fn as (a: unknown) => unknown)(args ?? {}) };
  } catch (err) {
    if (err instanceof UserError) return { ok: false, error: err.message };
    console.error(method, err);
    return { ok: false, error: `Something went wrong: ${(err as Error).message}` };
  }
}

export function startupTasks() {
  try {
    autoBackupIfDue();
  } catch (e) {
    console.error("Backup failed", e);
  }
  void existsSync;
  void getSettings;
}
