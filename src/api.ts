// Calls into the main process (the database). Errors carry a message to show the person.
import type { FullBooking } from "../shared/types";

export interface Bridge {
  call: (method: string, args?: unknown) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  openPrint: (route: string) => Promise<boolean>;
  print: () => Promise<{ ok: boolean }>;
  savePdf: (name: string) => Promise<string | null>;
  openExternal: (url: string) => Promise<boolean>;
  saveFile: (name: string, content: string, kind?: "csv" | "lic" | "txt") => Promise<string | null>;
  pickFile: (kind: "backup" | "lic") => Promise<string | null>;
  pickFolder: () => Promise<string | null>;
  saveBackupAs: () => Promise<string | null>;
  showFolder: (path: string) => Promise<boolean>;
  readTextFile: (path: string) => Promise<string | null>;
  platform: string;
}

declare global {
  interface Window {
    innvela: Bridge;
  }
}

export const bridge = (): Bridge => window.innvela;

type Listener = (message: string) => void;
const licenseListeners = new Set<Listener>();
export function onLicenseBlocked(fn: Listener) {
  licenseListeners.add(fn);
  return () => {
    licenseListeners.delete(fn);
  };
}

export class ApiError extends Error {}

export async function api<T = unknown>(method: string, args?: unknown): Promise<T> {
  const res = await window.innvela.call(method, args);
  if (res.ok) return res.data as T;
  if (res.error.startsWith("LICENSE:")) {
    const msg = res.error.slice(8);
    licenseListeners.forEach((fn) => fn(msg));
    throw new ApiError(msg);
  }
  throw new ApiError(res.error);
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export type { FullBooking };

/** Download rows as a CSV file Excel can open. */
export async function saveCsv(name: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return window.innvela.saveFile(name, text, "csv");
}
