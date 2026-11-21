// Guest records: returning guests are found by phone or name, and their history follows them.
import type { Guest, GuestSummary } from "../../shared/types";
import { all, get, insert, now, run, tx, update } from "../db";
import { bool, fail, log, opt, requirePerm, requireStaff, str } from "./context";
import { bookingRows } from "./bookings";

export type GuestInput = Partial<Omit<Guest, "id" | "createdAt">> & { id?: string };

export function guestFromRow(r: Record<string, unknown>): Guest {
  return { ...(r as unknown as Guest), vip: !!r.vip, blacklisted: !!r.blacklisted };
}

function fields(input: GuestInput) {
  const out: Record<string, string | number | null> = {};
  const text: Array<[keyof GuestInput, number]> = [
    ["lastName", 60],
    ["email", 120],
    ["gender", 20],
    ["dateOfBirth", 10],
    ["nationality", 40],
    ["address", 300],
    ["locality", 80],
    ["city", 60],
    ["district", 60],
    ["state", 60],
    ["pinCode", 10],
    ["company", 120],
    ["gstin", 15],
    ["idType", 30],
    ["idLast4", 4],
    ["passportNo", 30],
    ["visaNo", 30],
    ["notes", 2000],
  ];
  if (input.firstName !== undefined) out.firstName = str(input.firstName, 60);
  if (input.phone !== undefined) out.phone = str(input.phone, 20);
  for (const [k, max] of text) if (input[k] !== undefined) out[k] = k === "lastName" ? str(input[k], max) : opt(input[k], max);
  if (typeof out.gstin === "string") out.gstin = out.gstin.toUpperCase();
  if (out.nationality === null) out.nationality = "Indian";
  if (input.vip !== undefined) out.vip = bool(input.vip) ? 1 : 0;
  if (input.blacklisted !== undefined) out.blacklisted = bool(input.blacklisted) ? 1 : 0;
  return out;
}

/** Saves a new guest, or updates the guest with this id, and returns the record. */
export function upsertGuest(input: GuestInput): Guest {
  const f = fields(input);
  if (input.id) {
    const existing = get("SELECT * FROM guests WHERE id = ?", input.id);
    if (!existing) fail("Guest not found");
    if (f.firstName === "") fail("Please enter the guest's name");
    if (Object.keys(f).length) update("guests", input.id, { ...f, updatedAt: now() });
    return guestFromRow(get("SELECT * FROM guests WHERE id = ?", input.id)!);
  }
  if (!f.firstName) fail("Please enter the guest's name");
  if (!f.phone || String(f.phone).replace(/\D/g, "").length < 6) fail("Please enter the guest's phone number");
  const at = now();
  const id = insert("guests", { lastName: "", nationality: "Indian", ...f, createdAt: at, updatedAt: at });
  return guestFromRow(get("SELECT * FROM guests WHERE id = ?", id)!);
}

const SUMMARY_SQL = `
  SELECT g.*,
    (SELECT COUNT(*) FROM bookings b WHERE b.guestId = g.id AND b.status IN ('checked_in','checked_out')) AS stays,
    (SELECT COALESCE(SUM(julianday(b.checkOutDate) - julianday(b.checkInDate)), 0) FROM bookings b WHERE b.guestId = g.id AND b.status IN ('checked_in','checked_out')) AS nights,
    (SELECT COALESCE(SUM(CASE WHEN p.type = 'refund' THEN -p.amount ELSE p.amount END), 0) FROM payments p JOIN bookings b ON b.id = p.bookingId WHERE b.guestId = g.id) AS spent,
    (SELECT MAX(b.checkInDate) FROM bookings b WHERE b.guestId = g.id AND b.status != 'cancelled') AS lastStay
  FROM guests g`;

export const guestsApi = {
  "guests.search": ({ q }: { q: string }) => {
    requireStaff();
    const s = str(q, 60);
    if (s.length < 2) return [];
    const like = `%${s}%`;
    const digits = s.replace(/\D/g, "");
    return all(`${SUMMARY_SQL} WHERE (g.firstName || ' ' || g.lastName LIKE ? OR g.company LIKE ? ${digits.length >= 3 ? "OR replace(replace(g.phone,' ',''),'-','') LIKE ?" : ""}) ORDER BY lastStay DESC LIMIT 12`, like, like, ...(digits.length >= 3 ? [`%${digits}%`] : [])).map(
      (r) => ({ ...guestFromRow(r), stays: r.stays, nights: r.nights, spent: r.spent, lastStay: r.lastStay }) as GuestSummary
    );
  },
  "guests.list": ({ q, filter }: { q?: string; filter?: string }) => {
    requirePerm("frontdesk");
    const where: string[] = [];
    const params: string[] = [];
    const s = str(q, 60);
    if (s) {
      where.push("(g.firstName || ' ' || g.lastName LIKE ? OR g.phone LIKE ? OR g.company LIKE ? OR g.city LIKE ? OR g.gstin LIKE ?)");
      params.push(...Array(5).fill(`%${s}%`));
    }
    if (filter === "vip") where.push("g.vip = 1");
    if (filter === "blocked") where.push("g.blacklisted = 1");
    if (filter === "company") where.push("g.company IS NOT NULL AND g.company != ''");
    if (filter === "foreign") where.push("g.nationality != 'Indian'");
    return all(`${SUMMARY_SQL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY COALESCE(lastStay, g.createdAt) DESC LIMIT 2000`, ...params).map(
      (r) => ({ ...guestFromRow(r), stays: r.stays, nights: r.nights, spent: r.spent, lastStay: r.lastStay }) as GuestSummary
    );
  },
  "guests.get": ({ id }: { id: string }) => {
    requireStaff();
    const row = get(`${SUMMARY_SQL} WHERE g.id = ?`, id);
    if (!row) fail("Guest not found");
    return {
      guest: { ...guestFromRow(row), stays: row.stays, nights: row.nights, spent: row.spent, lastStay: row.lastStay } as GuestSummary,
      bookings: bookingRows("b.guestId = ?", [id], "b.checkInDate DESC"),
    };
  },
  "guests.save": (input: GuestInput) => {
    requirePerm("frontdesk");
    return tx(() => {
      const g = upsertGuest(input);
      log(input.id ? "Changed guest" : "New guest", `${g.firstName} ${g.lastName}`.trim());
      return g;
    });
  },
  "guests.delete": ({ id }: { id: string }) => {
    requirePerm("delete");
    const count = (get<{ n: number }>("SELECT COUNT(*) AS n FROM bookings WHERE guestId = ?", id)?.n ?? 0) as number;
    if (count > 0) fail("This guest has bookings, so the record must stay. You can mark them \"do not allow\" instead.");
    run("DELETE FROM guests WHERE id = ?", id);
    log("Deleted guest");
    return true;
  },
};
