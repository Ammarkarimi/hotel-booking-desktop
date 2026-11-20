// The dashboard and the owner's reports: occupancy, earnings, GST, payments, sources and room types.
import { addDays, diffDays, eachNight, isDateKey, todayKey } from "../../shared/dates";
import { round2 } from "../../shared/pricing";
import type { Bill, BookingRow } from "../../shared/types";
import { all, scalar } from "../db";
import { fail, requirePerm, requireStaff } from "./context";
import { bookingRows, folioOf } from "./bookings";
import { listRooms } from "./rooms";

function range(from: string, to: string) {
  if (!isDateKey(from) || !isDateKey(to)) fail("Please choose the dates");
  if (to < from) fail("The end date must be on or after the start date");
  if (diffDays(from, to) > 3700) fail("Please choose at most 10 years");
  return { from, to };
}

interface Day {
  date: string;
  roomsSold: number;
  occupancy: number;
  roomRevenue: number;
  extras: number;
  tax: number;
  total: number;
  arrivals: number;
  departures: number;
}

export const reportsApi = {
  "dashboard.get": () => {
    requireStaff();
    const today = todayKey();
    const rooms = listRooms();
    const staying = bookingRows("b.status = 'checked_in'", [], "r.sortOrder, r.roomNumber");
    const arrivals = bookingRows("b.status = 'reserved' AND b.checkInDate <= ?", [today]);
    const departures = staying.filter((b) => b.checkOutDate <= today);
    const reservedTonight = bookingRows("b.status = 'reserved' AND b.checkInDate <= ? AND b.checkOutDate > ?", [today, today]);
    const payments = all<{ amount: number; method: string; type: string }>("SELECT amount, method, type FROM payments WHERE substr(paidAt, 1, 10) = ?", today);
    const byMethod: Record<string, number> = {};
    let received = 0;
    let refunded = 0;
    for (const p of payments) {
      if (p.type === "refund") {
        refunded += p.amount;
        byMethod[p.method] = (byMethod[p.method] ?? 0) - p.amount;
      } else {
        received += p.amount;
        byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
      }
    }
    const dueInHouse = staying.reduce((s, b) => s + Math.max(0, b.balance), 0);
    const dueCheckedOut = bookingRows("b.status = 'checked_out' AND b.actualCheckOut >= ?", [addDays(today, -365)], "b.actualCheckOut DESC").filter((b) => b.balance >= 1);
    const occupiedIds = new Set(staying.map((b) => b.roomId));
    const tonightIds = new Set([...staying.filter((b) => b.checkOutDate > today).map((b) => b.roomId), ...reservedTonight.map((b) => b.roomId)]);
    const board = rooms.map((r) => {
      const stay = staying.find((b) => b.roomId === r.id);
      const arrival = arrivals.find((b) => b.roomId === r.id);
      return {
        room: r,
        state: r.status === "maintenance" ? "maintenance" : stay ? (stay.checkOutDate <= today ? "leaving" : "occupied") : arrival ? "arriving" : "free",
        booking: stay ?? arrival ?? null,
      };
    });
    // The next 7 nights: how many rooms are booked.
    const ahead = bookingRows("b.status IN ('reserved','checked_in') AND b.checkInDate < ? AND b.checkOutDate > ?", [addDays(today, 7), today]);
    const forecast = Array.from({ length: 7 }, (_, i) => {
      const night = addDays(today, i);
      const sold = ahead.filter((b) => b.checkInDate <= night && (b.status === "checked_in" && b.checkOutDate <= today ? i === 0 : b.checkOutDate > night)).length;
      return { date: night, sold, total: rooms.length };
    });
    const activity = all("SELECT id, staffName, action, details, createdAt, bookingId FROM activity ORDER BY createdAt DESC LIMIT 12");
    return {
      today,
      counts: {
        rooms: rooms.length,
        occupied: occupiedIds.size,
        freeTonight: rooms.filter((r) => r.status !== "maintenance" && !tonightIds.has(r.id)).length,
        dirty: rooms.filter((r) => r.housekeeping !== "clean").length,
        maintenance: rooms.filter((r) => r.status === "maintenance").length,
        arrivals: arrivals.length,
        departures: departures.length,
        staying: staying.length,
        guestsInHouse: staying.reduce((s, b) => s + b.adults + b.children, 0),
      },
      money: { received: round2(received), refunded: round2(refunded), byMethod, dueInHouse: round2(dueInHouse), dueCheckedOut: round2(dueCheckedOut.reduce((s, b) => s + b.balance, 0)) },
      arrivals,
      departures,
      staying,
      unpaidCheckedOut: dueCheckedOut.slice(0, 20),
      board,
      forecast,
      activity,
    };
  },

  "reports.summary": ({ from, to }: { from: string; to: string }) => {
    requirePerm("reports");
    range(from, to);
    const end = addDays(to, 1); // the night of "to" is included
    const today = todayKey();
    const rooms = listRooms();
    const roomCount = rooms.length;
    const days: Day[] = eachNight(from, end).map((date) => ({ date, roomsSold: 0, occupancy: 0, roomRevenue: 0, extras: 0, tax: 0, total: 0, arrivals: 0, departures: 0 }));
    const dayIndex = new Map(days.map((d, i) => [d.date, i]));

    const stays = bookingRows("b.status IN ('reserved','checked_in','checked_out') AND b.checkInDate < ? AND b.checkOutDate > ?", [end, from]);
    const byType = new Map<string, { type: string; nights: number; revenue: number }>();
    const bySource = new Map<string, { source: string; bookings: number; nights: number; revenue: number }>();
    let roomNights = 0;
    let roomRevenue = 0;
    let roomTax = 0;
    for (const b of stays) {
      // Bookings that were never checked in and whose arrival is over are not counted.
      if (b.status === "reserved" && b.checkInDate < today) continue;
      const bill = all<Bill>("SELECT * FROM bills WHERE bookingId = ?", b.id)[0] ?? null;
      const f = folioOf(b, b.roomType, [], [], bill);
      const nights = f.nights.length ? f.nights : [];
      const gross = nights.reduce((s, n) => s + n.rate, 0) || 1;
      const share = f.roomAfterDiscount / gross;
      const taxShare = f.roomTax / gross;
      let counted = 0;
      for (const n of nights) {
        const i = dayIndex.get(n.date);
        if (i === undefined) continue;
        const d = days[i];
        d.roomsSold++;
        d.roomRevenue += n.rate * share;
        d.tax += n.rate * taxShare;
        roomNights++;
        roomRevenue += n.rate * share;
        roomTax += n.rate * taxShare;
        counted += n.rate * share;
        const t = byType.get(b.roomType) ?? { type: b.roomType, nights: 0, revenue: 0 };
        t.nights++;
        t.revenue += n.rate * share;
        byType.set(b.roomType, t);
      }
      const src = bySource.get(b.source) ?? { source: b.source, bookings: 0, nights: 0, revenue: 0 };
      src.bookings++;
      src.nights += nights.filter((n) => dayIndex.has(n.date)).length;
      src.revenue += counted;
      bySource.set(b.source, src);
      const ai = dayIndex.get(b.checkInDate);
      if (ai !== undefined) days[ai].arrivals++;
      const di = dayIndex.get(b.checkOutDate);
      if (di !== undefined) days[di].departures++;
    }

    // Extras by the day they were added, with their tax.
    const charges = all<{ amount: number; date: string; category: string; extrasTaxRate: number | null }>(
      `SELECT c.amount, c.date, c.category, bl.extrasTaxRate FROM charges c JOIN bookings b ON b.id = c.bookingId LEFT JOIN bills bl ON bl.bookingId = b.id
       WHERE c.date >= ? AND c.date <= ? AND b.status NOT IN ('cancelled','no_show')`,
      from,
      to
    );
    const settingsExtrasRate = scalar<string>("SELECT value FROM settings WHERE key = 'extrasTaxRate'");
    const defaultExtrasRate = settingsExtrasRate ? Number(JSON.parse(settingsExtrasRate)) : 5;
    const byCategory = new Map<string, number>();
    let extras = 0;
    let extrasTax = 0;
    for (const c of charges) {
      const i = dayIndex.get(c.date);
      const tax = (c.amount * (c.extrasTaxRate ?? defaultExtrasRate)) / 100;
      extras += c.amount;
      extrasTax += tax;
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.amount);
      if (i !== undefined) {
        days[i].extras += c.amount;
        days[i].tax += tax;
      }
    }
    for (const d of days) {
      d.occupancy = roomCount ? (d.roomsSold / roomCount) * 100 : 0;
      d.roomRevenue = round2(d.roomRevenue);
      d.extras = round2(d.extras);
      d.tax = round2(d.tax);
      d.total = round2(d.roomRevenue + d.extras + d.tax);
    }

    // Money received in the period.
    const pays = all<{ amount: number; method: string; type: string }>("SELECT amount, method, type FROM payments WHERE substr(paidAt,1,10) >= ? AND substr(paidAt,1,10) <= ?", from, to);
    const payByMethod: Record<string, number> = {};
    let received = 0;
    let refunded = 0;
    for (const p of pays) {
      if (p.type === "refund") refunded += p.amount;
      else {
        received += p.amount;
        payByMethod[p.method] = (payByMethod[p.method] ?? 0) + p.amount;
      }
    }

    const made = scalar<number>("SELECT COUNT(*) FROM bookings WHERE substr(createdAt,1,10) >= ? AND substr(createdAt,1,10) <= ?", from, to);
    const cancelled = scalar<number>("SELECT COUNT(*) FROM bookings WHERE status = 'cancelled' AND checkInDate >= ? AND checkInDate <= ?", from, to);
    const noShows = scalar<number>("SELECT COUNT(*) FROM bookings WHERE status = 'no_show' AND checkInDate >= ? AND checkInDate <= ?", from, to);
    const guests = scalar<number>("SELECT COUNT(DISTINCT guestId) FROM bookings WHERE status IN ('checked_in','checked_out') AND checkInDate >= ? AND checkInDate <= ?", from, to);
    const newGuests = scalar<number>("SELECT COUNT(*) FROM guests WHERE substr(createdAt,1,10) >= ? AND substr(createdAt,1,10) <= ?", from, to);
    const available = roomCount * days.length;
    const outstanding = bookingRows("b.status IN ('checked_in','checked_out')", [], "b.checkOutDate DESC", 100000).filter((b) => b.balance >= 1);

    return {
      from,
      to,
      roomCount,
      days,
      totals: {
        roomNights,
        available,
        occupancy: available ? (roomNights / available) * 100 : 0,
        roomRevenue: round2(roomRevenue),
        extras: round2(extras),
        roomTax: round2(roomTax),
        extrasTax: round2(extrasTax),
        tax: round2(roomTax + extrasTax),
        revenue: round2(roomRevenue + extras),
        revenueWithTax: round2(roomRevenue + extras + roomTax + extrasTax),
        adr: roomNights ? round2(roomRevenue / roomNights) : 0,
        revpar: available ? round2(roomRevenue / available) : 0,
        received: round2(received),
        refunded: round2(refunded),
        netReceived: round2(received - refunded),
        bookingsMade: made,
        cancelled,
        noShows,
        guests,
        newGuests,
        outstanding: round2(outstanding.reduce((s, b) => s + b.balance, 0)),
      },
      payByMethod,
      byType: [...byType.values()].map((t) => ({ ...t, revenue: round2(t.revenue), adr: t.nights ? round2(t.revenue / t.nights) : 0 })).sort((a, b) => b.revenue - a.revenue),
      bySource: [...bySource.values()].map((s) => ({ ...s, revenue: round2(s.revenue) })).sort((a, b) => b.revenue - a.revenue),
      byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
      outstanding: outstanding.slice(0, 200),
    };
  },

  /** The GST invoice register for the period (for the accountant / GSTR-1). */
  "reports.gst": ({ from, to }: { from: string; to: string }) => {
    requirePerm("reports");
    range(from, to);
    const rows = all<Bill & { number: number; guestName: string; company: string | null; gstin: string | null; state: string | null; roomNumber: string; bookingId: string; checkInDate: string; checkOutDate: string }>(
      `SELECT bl.*, b.number, b.checkInDate, b.checkOutDate, trim(g.firstName || ' ' || g.lastName) AS guestName, g.company, g.gstin, g.state, r.roomNumber
       FROM bills bl JOIN bookings b ON b.id = bl.bookingId JOIN guests g ON g.id = b.guestId JOIN rooms r ON r.id = b.roomId
       WHERE bl.invoiceDate >= ? AND bl.invoiceDate <= ? ORDER BY bl.invoiceDate, bl.invoiceNumber`,
      from,
      to
    );
    const byRate = new Map<string, { kind: string; rate: number; taxable: number; tax: number; invoices: number }>();
    const add = (kind: string, rate: number, taxable: number, tax: number) => {
      if (!taxable && !tax) return;
      const key = `${kind}|${rate}`;
      const r = byRate.get(key) ?? { kind, rate, taxable: 0, tax: 0, invoices: 0 };
      r.taxable += taxable;
      r.tax += tax;
      r.invoices++;
      byRate.set(key, r);
    };
    for (const r of rows) {
      add("Room", r.roomTaxRate, r.roomTaxable, r.roomTax);
      add("Food & extras", r.extrasTaxRate, r.extras, r.extrasTax);
    }
    const sum = (f: (r: (typeof rows)[number]) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
    return {
      rows: rows.map((r) => ({ ...r, b2b: !!r.gstin })),
      byRate: [...byRate.values()].map((r) => ({ ...r, taxable: round2(r.taxable), tax: round2(r.tax), cgst: round2(r.tax / 2), sgst: round2(r.tax - round2(r.tax / 2)) })).sort((a, b) => a.kind.localeCompare(b.kind) || a.rate - b.rate),
      totals: {
        invoices: rows.length,
        b2b: rows.filter((r) => r.gstin).length,
        taxable: sum((r) => r.roomTaxable + r.extras),
        tax: sum((r) => r.roomTax + r.extrasTax),
        total: sum((r) => r.totalAmount),
      },
    };
  },

  "reports.occupancyCalendar": ({ month }: { month: string }) => {
    requirePerm("reports");
    const from = `${month}-01`;
    if (!isDateKey(from)) fail("Bad month");
    const end = addDays(from, 31).slice(0, 7) + "-01";
    const rows: BookingRow[] = bookingRows("b.status IN ('reserved','checked_in','checked_out') AND b.checkInDate < ? AND b.checkOutDate > ?", [end, from]);
    const rooms = listRooms().length;
    return eachNight(from, end)
      .filter((d) => d.startsWith(month))
      .map((date) => ({ date, sold: rows.filter((b) => b.checkInDate <= date && b.checkOutDate > date).length, rooms }));
  },
};
