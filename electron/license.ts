// Licence check. The software runs fully offline, so the licence is a key signed by the provider
// (Ed25519) that says which hotel, which computer and until when. New keys are issued for each
// monthly or yearly renewal. A new installation gets a free trial.
import { createHash, createPublicKey, verify } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { addDays, diffDays, todayKey } from "../shared/dates";
import { parseLicenseKey, type LicensePayload } from "../shared/license-format";
import type { LicenseInfo } from "../shared/types";
import { getMeta, setMeta } from "./db";
import { LICENSE_PUBLIC_KEY } from "./license-public-key";

export const TRIAL_DAYS = 15;
export const GRACE_DAYS = 5;

let machineCodeCache = "";

/** A stable code for this computer, shown on the activation screen and put into its licence. */
export function machineCode(): string {
  if (machineCodeCache) return machineCodeCache;
  let raw = "";
  try {
    if (process.platform === "win32") {
      const out = execSync("reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid", { encoding: "utf8", windowsHide: true });
      raw = /MachineGuid\s+REG_SZ\s+([\w-]+)/i.exec(out)?.[1] ?? "";
    } else if (process.platform === "darwin") {
      const out = execSync("ioreg -rd1 -c IOPlatformExpertDevice", { encoding: "utf8" });
      raw = /"IOPlatformUUID" = "([^"]+)"/.exec(out)?.[1] ?? "";
    } else {
      for (const f of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) if (!raw && existsSync(f)) raw = readFileSync(f, "utf8").trim();
    }
  } catch {
    raw = "";
  }
  if (!raw) raw = `${os.hostname()}|${os.cpus()[0]?.model ?? ""}|${os.platform()}`;
  const hex = createHash("sha256").update(`innvela:${raw}`).digest("hex").slice(0, 16).toUpperCase();
  machineCodeCache = hex.match(/.{4}/g)!.join("-");
  return machineCodeCache;
}

export function verifyLicenseKey(key: string): { ok: true; payload: LicensePayload } | { ok: false; error: string } {
  const parsed = parseLicenseKey(key);
  if (!parsed) return { ok: false, error: "This is not a licence key. Please copy the whole key, starting with INNV1." };
  let valid = false;
  try {
    valid = verify(null, Buffer.from(parsed.signed), createPublicKey(LICENSE_PUBLIC_KEY), Buffer.from(parsed.signature));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: "This licence key is not valid. Please check it was copied completely." };
  const p = parsed.payload;
  if (p.machine !== "*" && p.machine.toUpperCase() !== machineCode()) {
    return { ok: false, error: `This licence is for another computer (${p.machine}). This computer's code is ${machineCode()}.` };
  }
  return { ok: true, payload: p };
}

let trialFile = "";
export function setTrialFile(dir: string) {
  trialFile = join(dir, ".install");
}

function trialStart(): string {
  let start = getMeta("trial_started");
  let fileStart: string | null = null;
  try {
    if (trialFile && existsSync(trialFile)) fileStart = readFileSync(trialFile, "utf8").trim().slice(0, 10) || null;
  } catch {
    fileStart = null;
  }
  // The earliest record wins, so a new database does not restart the trial.
  const candidates = [start, fileStart].filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  start = candidates.sort()[0] ?? todayKey();
  setMeta("trial_started", start);
  try {
    if (trialFile && fileStart !== start) writeFileSync(trialFile, start);
  } catch {
    /* ignore */
  }
  return start;
}

/** The computer's clock must not go back in time (that would stretch a licence). */
function clockOk(): boolean {
  const last = getMeta("last_seen_day");
  const today = todayKey();
  if (last && diffDays(last, today) < -2) return false;
  if (!last || today > last) setMeta("last_seen_day", today);
  return true;
}

export function licenseInfo(): LicenseInfo {
  const today = todayKey();
  const machine = machineCode();
  if (!clockOk()) {
    return { state: "invalid", plan: null, licensedTo: null, expiresOn: null, daysLeft: 0, machineCode: machine, canUse: false, message: `The computer's date (${today}) is earlier than the last time the software was used (${getMeta("last_seen_day")}). Please correct the date and time in Windows and open the software again.` };
  }
  const key = getMeta("license_key");
  if (key) {
    const result = verifyLicenseKey(key);
    if (result.ok) {
      const p = result.payload;
      const daysLeft = diffDays(today, p.expires) + 1;
      if (daysLeft > 0) {
        return { state: "active", plan: p.plan, licensedTo: p.to, expiresOn: p.expires, daysLeft, machineCode: machine, canUse: true, message: daysLeft <= 10 ? `Your ${p.plan} licence ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Please renew to keep using the software.` : "" };
      }
      const graceLeft = GRACE_DAYS + daysLeft;
      if (graceLeft > 0) {
        return { state: "grace", plan: p.plan, licensedTo: p.to, expiresOn: p.expires, daysLeft: graceLeft, machineCode: machine, canUse: true, message: `Your licence ended on ${p.expires}. The software will stop in ${graceLeft} day${graceLeft === 1 ? "" : "s"} unless you renew.` };
      }
      return { state: "expired", plan: p.plan, licensedTo: p.to, expiresOn: p.expires, daysLeft: 0, machineCode: machine, canUse: false, message: `Your licence ended on ${p.expires}. Please renew it to continue. Your data is safe on this computer.` };
    }
  }
  const start = trialStart();
  const end = addDays(start, TRIAL_DAYS - 1);
  const daysLeft = diffDays(today, end) + 1;
  if (daysLeft > 0) {
    return { state: "trial", plan: "trial", licensedTo: null, expiresOn: end, daysLeft, machineCode: machine, canUse: true, message: `Free trial: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Activate a licence to keep using the software.` };
  }
  return { state: "expired", plan: "trial", licensedTo: null, expiresOn: end, daysLeft: 0, machineCode: machine, canUse: false, message: "The free trial is over. Please activate a licence to continue. Your data is safe on this computer." };
}

export function activateLicense(key: string): LicenseInfo {
  const result = verifyLicenseKey(key);
  if (!result.ok) throw new Error(result.error);
  if (result.payload.expires < todayKey()) throw new Error(`This licence ended on ${result.payload.expires}. Please ask for a renewed key.`);
  setMeta("license_key", key.replace(/\s+/g, ""));
  return licenseInfo();
}

export function maxRooms(): number {
  const key = getMeta("license_key");
  if (!key) return 0;
  const r = verifyLicenseKey(key);
  return r.ok ? r.payload.rooms ?? 0 : 0;
}
