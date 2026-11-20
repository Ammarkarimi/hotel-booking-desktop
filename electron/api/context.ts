// Who is signed in on this computer, permission checks and the activity history.
import { can, type Permission } from "../../shared/format";
import type { Staff } from "../../shared/types";
import { insert, now } from "../db";

/** An error whose message is shown to the person as it is. */
export class UserError extends Error {}

export function fail(message: string): never {
  throw new UserError(message);
}

export const session: { staff: Staff | null; shiftId: string | null } = { staff: null, shiftId: null };

export function requireStaff(): Staff {
  if (!session.staff) fail("Please sign in again");
  return session.staff;
}

export function requirePerm(perm: Permission): Staff {
  const staff = requireStaff();
  if (!can(staff.role, perm)) fail("You do not have permission to do this. Please ask the owner or manager.");
  return staff;
}

export function log(action: string, details?: string | null, bookingId?: string | null) {
  const s = session.staff;
  insert("activity", { staffId: s?.id ?? null, staffName: s?.name ?? "System", action, details: details ?? null, bookingId: bookingId ?? null, createdAt: now() });
}

export function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : v == null ? "" : String(v).trim().slice(0, max);
}

/** A trimmed string or null when empty. */
export function opt(v: unknown, max = 500): string | null {
  const s = str(v, max);
  return s ? s : null;
}

export function numberIn(v: unknown, field: string, min = 0, max = 1e9): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) fail(`Please enter a number for ${field}`);
  if (n < min) fail(`${field} cannot be less than ${min}`);
  if (n > max) fail(`${field} is too large`);
  return n;
}

export function bool(v: unknown) {
  return v === true || v === 1 || v === "1" || v === "true";
}
