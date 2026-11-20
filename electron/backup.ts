// Backups of the hotel's database. A copy is made automatically every day and when the app closes,
// into a folder the owner can change (for example a USB drive or a Google Drive / OneDrive folder).
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { closeDatabase, conn, databaseFile, getMeta, openDatabase, setMeta } from "./db";
import { getSettings, clearSettingsCache } from "./api/settings";

let defaultFolder = "";
export function setDefaultBackupFolder(dir: string) {
  defaultFolder = dir;
}

export function backupFolder() {
  const custom = getSettings().backupFolder;
  return custom && existsSync(custom) ? custom : defaultFolder;
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Writes a complete, consistent copy of the database. */
export function backupTo(file: string) {
  if (existsSync(file)) rmSync(file);
  conn().prepare("VACUUM INTO ?").run(file);
  return file;
}

export function backupNow(reason: "auto" | "manual" | "before-restore" | "on-close" = "manual") {
  const folder = backupFolder();
  mkdirSync(folder, { recursive: true });
  // The copy made on closing is one file, replaced each time, so closing often does not push out the daily copies.
  const file = join(folder, reason === "on-close" ? "innvela-backup-latest.db" : `innvela-backup-${stamp()}${reason === "manual" ? "" : `-${reason}`}.db`);
  backupTo(file);
  setMeta("last_backup_at", new Date().toISOString());
  setMeta("last_backup_file", file);
  prune(folder);
  return file;
}

function prune(folder: string) {
  const keep = Math.max(5, getSettings().keepBackups || 30);
  const files = listBackups(folder);
  for (const f of files.slice(keep)) {
    try {
      rmSync(f.path);
    } catch {
      /* ignore */
    }
  }
}

export function listBackups(folder = backupFolder()) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => /^innvela-backup-.*\.db$/.test(f))
    .map((f) => {
      const path = join(folder, f);
      const st = statSync(path);
      return { name: f, path, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A daily backup, made when the app starts if the last one is older than 20 hours. */
export function autoBackupIfDue() {
  if (!getSettings().autoBackup) return null;
  const last = getMeta("last_backup_at");
  if (last && Date.now() - Date.parse(last) < 20 * 3600 * 1000) return null;
  return backupNow("auto");
}

/** Checks a file is a backup of this software before restoring it. */
export function checkBackupFile(file: string) {
  if (!existsSync(file)) throw new Error("The backup file was not found");
  let test: DatabaseSync | null = null;
  try {
    test = new DatabaseSync(file, { readOnly: true });
    const v = test.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined;
    const bookings = test.prepare("SELECT COUNT(*) AS n FROM bookings").get() as { n: number };
    const name = test.prepare("SELECT value FROM settings WHERE key = 'hotelName'").get() as { value: string } | undefined;
    if (!v) throw new Error();
    return { bookings: bookings.n, hotelName: name ? (JSON.parse(name.value) as string) : "", file: basename(file) };
  } catch {
    throw new Error("This file is not a backup of Innvela Hotel Desk");
  } finally {
    test?.close();
  }
}

/** Replaces the database with a backup. A copy of the current data is made first. */
export function restoreFrom(file: string) {
  checkBackupFile(file);
  const safety = backupNow("before-restore");
  const target = databaseFile();
  closeDatabase();
  for (const ext of ["-wal", "-shm"]) {
    try {
      if (existsSync(target + ext)) rmSync(target + ext);
    } catch {
      /* ignore */
    }
  }
  copyFileSync(file, target);
  openDatabase(target);
  clearSettingsCache();
  return { safetyCopy: safety };
}
