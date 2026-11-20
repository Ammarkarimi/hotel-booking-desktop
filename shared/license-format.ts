// The licence key format, shared by the app (which checks keys) and the provider's tools (which make them).
// A key is "INNV1.<payload>.<signature>", both base64url; the payload is JSON signed with Ed25519.

export interface LicensePayload {
  v: 1;
  id: string; // licence number, for the provider's records
  to: string; // the hotel it is for
  plan: "monthly" | "quarterly" | "yearly" | "lifetime" | "custom";
  issued: string; // YYYY-MM-DD
  expires: string; // YYYY-MM-DD, the last day it works
  machine: string; // the computer's code (XXXX-XXXX-XXXX-XXXX) or "*" for any computer
  rooms?: number; // most rooms allowed; 0 or missing = no limit
}

export const LICENSE_PREFIX = "INNV1";

export function b64url(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** Splits a pasted key (spaces and line breaks are ignored) into its parts. */
export function parseLicenseKey(key: string): { payload: LicensePayload; signed: Uint8Array; signature: Uint8Array } | null {
  const clean = (key || "").replace(/\s+/g, "");
  const parts = clean.split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return null;
  try {
    const json = new TextDecoder().decode(fromB64url(parts[1]));
    const payload = JSON.parse(json) as LicensePayload;
    if (payload.v !== 1 || !payload.expires || !payload.machine) return null;
    return { payload, signed: new TextEncoder().encode(`${parts[0]}.${parts[1]}`), signature: fromB64url(parts[2]) };
  } catch {
    return null;
  }
}
