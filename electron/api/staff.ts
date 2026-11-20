// Staff accounts, signing in and out, and front-desk shifts (who was on duty, handover notes, cash).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ROLES } from "../../shared/format";
import type { Role, Session, Shift, ShiftSummary, Staff } from "../../shared/types";
import { all, get, insert, now, run, scalar, tx, update } from "../db";
import { bool, fail, log, numberIn, opt, requirePerm, requireStaff, session, str } from "./context";
import { getSettings } from "./settings";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}

function checkPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const a = scryptSync(password, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

type StaffRow = Omit<Staff, "active"> & { active: number; passwordHash: string };

function toStaff(r: StaffRow): Staff {
  return { id: r.id, name: r.name, username: r.username, role: r.role, phone: r.phone, active: !!r.active, createdAt: r.createdAt, lastLoginAt: r.lastLoginAt };
}

export function listStaff(): Staff[] {
  return all<StaffRow>("SELECT * FROM staff ORDER BY active DESC, CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 WHEN 'front_desk' THEN 2 ELSE 3 END, name").map(toStaff);
}

function validPassword(p: unknown) {
  const s = typeof p === "string" ? p : "";
  if (s.length < 4) fail("The password must have at least 4 characters");
  if (s.length > 100) fail("The password is too long");
  return s;
}

function validUsername(u: unknown) {
  const s = str(u, 40).toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(s)) fail("The sign-in name can use letters, numbers, dot, dash and underscore (at least 2)");
  return s;
}

export function createStaff(input: { name: string; username: string; password: string; role: Role; phone?: string }) {
  const name = str(input.name, 80);
  if (!name) fail("Please enter the person's name");
  const username = validUsername(input.username);
  if (!ROLES.includes(input.role)) fail("Please choose a role");
  if (get("SELECT id FROM staff WHERE username = ?", username)) fail(`The sign-in name "${username}" is already used`);
  return insert("staff", { name, username, passwordHash: hashPassword(validPassword(input.password)), role: input.role, phone: opt(input.phone, 20), active: 1, createdAt: now() });
}

function shiftRow(r: Record<string, unknown> | undefined): Shift | null {
  if (!r) return null;
  return { ...(r as unknown as Shift), summary: r.summary ? (JSON.parse(r.summary as string) as ShiftSummary) : null };
}

function openShiftFor(staffId: string) {
  return shiftRow(get("SELECT * FROM shifts WHERE staffId = ? AND endedAt IS NULL ORDER BY startedAt DESC LIMIT 1", staffId));
}

export function currentSession(): Session | null {
  if (!session.staff) return null;
  const shift = openShiftFor(session.staff.id);
  session.shiftId = shift?.id ?? null;
  return { staff: session.staff, shift };
}

/** What happened at the desk between two moments, by this person. */
export function shiftSummary(staffName: string, from: string, to: string): ShiftSummary {
  const byMethod: Record<string, number> = {};
  let received = 0;
  let refunded = 0;
  for (const p of all<{ amount: number; method: string; type: string }>(
    "SELECT amount, method, type FROM payments WHERE receivedBy = ? AND paidAt >= ? AND paidAt <= ?",
    staffName,
    from,
    to
  )) {
    const sign = p.type === "refund" ? -1 : 1;
    byMethod[p.method] = (byMethod[p.method] ?? 0) + sign * p.amount;
    if (sign > 0) received += p.amount;
    else refunded += p.amount;
  }
  const count = (action: string) => scalar<number>("SELECT COUNT(*) FROM activity WHERE staffName = ? AND action = ? AND createdAt >= ? AND createdAt <= ?", staffName, action, from, to);
  return {
    checkIns: count("Checked in"),
    checkOuts: count("Checked out"),
    bookings: count("New booking"),
    received,
    refunded,
    cash: byMethod.cash ?? 0,
    byMethod,
  };
}

function lastHandover(excludeStaffId: string) {
  return shiftRow(get("SELECT * FROM shifts WHERE endedAt IS NOT NULL AND handoverNote IS NOT NULL AND handoverNote != '' AND (staffId IS NULL OR staffId != ?) ORDER BY endedAt DESC LIMIT 1", excludeStaffId));
}

export function needsShift(staff: Staff) {
  return getSettings().staffShifts && (staff.role === "front_desk" || staff.role === "manager");
}

export const staffApi = {
  "auth.users": () =>
    all<{ name: string; username: string; role: Role }>("SELECT name, username, role FROM staff WHERE active = 1 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, name"),
  "auth.login": ({ username, password }: { username: string; password: string }) => {
    const row = get<StaffRow>("SELECT * FROM staff WHERE username = ?", str(username, 40).toLowerCase());
    if (!row || !checkPassword(String(password ?? ""), row.passwordHash)) fail("The sign-in name or password is not right");
    if (!row.active) fail("This account has been switched off. Please ask the owner.");
    const at = now();
    run("UPDATE staff SET lastLoginAt = ? WHERE id = ?", at, row.id);
    session.staff = toStaff({ ...row, lastLoginAt: at });
    log("Signed in");
    return currentSession();
  },
  "auth.session": () => currentSession(),
  "auth.logout": () => {
    if (session.staff) log("Signed out");
    session.staff = null;
    session.shiftId = null;
    return true;
  },
  "auth.changePassword": ({ current, next }: { current: string; next: string }) => {
    const staff = requireStaff();
    const row = get<StaffRow>("SELECT * FROM staff WHERE id = ?", staff.id)!;
    if (!checkPassword(String(current ?? ""), row.passwordHash)) fail("Your current password is not right");
    run("UPDATE staff SET passwordHash = ? WHERE id = ?", hashPassword(validPassword(next)), staff.id);
    log("Changed own password");
    return true;
  },

  "staff.list": () => {
    requirePerm("staff");
    return listStaff();
  },
  "staff.create": (input: { name: string; username: string; password: string; role: Role; phone?: string }) => {
    const me = requirePerm("staff");
    if (input.role === "owner" && me.role !== "owner") fail("Only the owner can add another owner");
    createStaff(input);
    log("Added staff", `${input.name} (${input.role})`);
    return listStaff();
  },
  "staff.update": (input: { id: string; name?: string; role?: Role; phone?: string; active?: boolean; password?: string }) => {
    const me = requirePerm("staff");
    const row = get<StaffRow>("SELECT * FROM staff WHERE id = ?", input.id);
    if (!row) fail("Staff member not found");
    if ((row.role === "owner" || input.role === "owner") && me.role !== "owner") fail("Only the owner can change an owner account");
    const role = input.role ?? row.role;
    if (!ROLES.includes(role)) fail("Please choose a role");
    const active = input.active === undefined ? !!row.active : bool(input.active);
    if (row.role === "owner" && (role !== "owner" || !active)) {
      const owners = scalar<number>("SELECT COUNT(*) FROM staff WHERE role = 'owner' AND active = 1 AND id != ?", row.id);
      if (owners === 0) fail("Keep at least one owner account switched on");
    }
    tx(() => {
      update("staff", row.id, {
        name: input.name !== undefined ? str(input.name, 80) || row.name : undefined,
        role,
        phone: input.phone !== undefined ? opt(input.phone, 20) : undefined,
        active: active ? 1 : 0,
        passwordHash: input.password ? hashPassword(validPassword(input.password)) : undefined,
      });
    });
    log(input.password ? "Reset a password" : "Changed staff", row.name);
    return listStaff();
  },

  "shift.status": () => {
    const staff = requireStaff();
    const shift = openShiftFor(staff.id);
    return {
      required: needsShift(staff),
      shift,
      lastHandover: lastHandover(staff.id),
      othersOnShift: all<{ staffName: string; startedAt: string }>("SELECT staffName, startedAt FROM shifts WHERE endedAt IS NULL AND (staffId IS NULL OR staffId != ?) ORDER BY startedAt", staff.id),
      liveSummary: shift ? shiftSummary(staff.name, shift.startedAt, now()) : null,
    };
  },
  "shift.start": ({ note }: { note?: string }) => {
    const staff = requireStaff();
    if (openShiftFor(staff.id)) fail("Your shift has already started");
    const id = insert("shifts", { staffId: staff.id, staffName: staff.name, startedAt: now(), startNote: opt(note, 1000) });
    session.shiftId = id;
    log("Started shift", note ? str(note, 200) : null);
    return currentSession();
  },
  "shift.end": ({ handoverNote, cashCounted }: { handoverNote: string; cashCounted?: number | null }) => {
    const staff = requireStaff();
    const shift = openShiftFor(staff.id);
    if (!shift) fail("You have no shift running");
    const note = str(handoverNote, 2000);
    if (!note) fail("Please write a short handover note for the next person");
    const endedAt = now();
    const summary = shiftSummary(staff.name, shift.startedAt, endedAt);
    update("shifts", shift.id, {
      endedAt,
      handoverNote: note,
      cashCounted: cashCounted === null || cashCounted === undefined || (cashCounted as unknown) === "" ? null : numberIn(cashCounted, "Cash counted"),
      summary: JSON.stringify(summary),
    });
    log("Ended shift", note.slice(0, 200));
    session.staff = null;
    session.shiftId = null;
    return { summary };
  },
  "shift.list": ({ from, to, staffId }: { from: string; to: string; staffId?: string }) => {
    requirePerm("staff");
    const rows = all("SELECT * FROM shifts WHERE substr(startedAt, 1, 10) >= ? AND substr(startedAt, 1, 10) <= ? AND (? IS NULL OR staffId = ?) ORDER BY startedAt DESC", from, to, staffId ?? null, staffId ?? null);
    return rows.map((r) => {
      const s = shiftRow(r)!;
      return { ...s, summary: s.summary ?? (s.endedAt ? null : shiftSummary(s.staffName, s.startedAt, now())) };
    });
  },
  "shift.close": ({ id, note }: { id: string; note?: string }) => {
    const me = requirePerm("staff");
    const s = shiftRow(get("SELECT * FROM shifts WHERE id = ?", id));
    if (!s || s.endedAt) fail("This shift has already ended");
    const endedAt = now();
    update("shifts", id, { endedAt, closedBy: me.name, handoverNote: opt(note, 1000) ?? `Closed by ${me.name}`, summary: JSON.stringify(shiftSummary(s.staffName, s.startedAt, endedAt)) });
    log("Closed a shift", s.staffName);
    return true;
  },
  "activity.list": ({ limit, bookingId, from, to }: { limit?: number; bookingId?: string; from?: string; to?: string }) => {
    if (!bookingId) requirePerm("staff");
    return all(
      "SELECT id, staffName, action, details, createdAt, bookingId FROM activity WHERE (? IS NULL OR bookingId = ?) AND (? IS NULL OR substr(createdAt,1,10) >= ?) AND (? IS NULL OR substr(createdAt,1,10) <= ?) ORDER BY createdAt DESC LIMIT ?",
      bookingId ?? null,
      bookingId ?? null,
      from ?? null,
      from ?? null,
      to ?? null,
      to ?? null,
      Math.min(Number(limit) || 200, 2000)
    );
  },
};
