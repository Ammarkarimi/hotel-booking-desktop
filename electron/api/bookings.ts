// Bookings: availability, the bill (folio), check-in, check-out with the GST invoice, payments,
// extras and ID checks. Every change that touches money or rooms runs in one transaction.
import { addDays, financialYear, isDateKey, nightsBetween, rangesOverlap, todayKey } from "../../shared/dates";
import { computeFolio, priceNights, round2, type Folio } from "../../shared/pricing";
import { CHARGE_CATEGORIES, ID_TYPES, PAYMENT_METHODS, SOURCES, can, label, money } from "../../shared/format";
import type { Bill, BookingRow, BookingStatus, Charge, Companion, FullBooking, Guest, IdCheck, MessageLog, Payment, Room } from "../../shared/types";
import { all, get, getMeta, insert, nextSeq, now, run, scalar, setMeta, tx, update } from "../db";
import { bool, fail, log, numberIn, opt, requirePerm, requireStaff, session, str } from "./context";
import { getSettings, pricingRules, taxRules } from "./settings";
import { guestFromRow, upsertGuest, type GuestInput } from "./guests";
import { roomFromRow } from "./rooms";
import { VEHICLE_TYPES, pathikRecord } from "../../shared/pathik";

/** With Pathik on (always on in Gujarat) every detail Pathik asks for is needed before check-in. */
export function pathikMissing(b: FullBooking) {
  const s = getSettings();
  return s.pathik ? pathikRecord(b, s).missing : [];
}

export const ACTIVE = ["reserved", "checked_in"];

type BookingDb = Record<string, unknown> & {
  id: string;
  number: number;
  guestId: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  status: BookingStatus;
  ratePerNight: number;
  fixedRate: number;
  gstRate: number | null;
  pricesIncludeTax: number;
  discount: number;
  companions: string;
};

function bookingFromRow(r: BookingDb) {
  let companions: Companion[] = [];
  try {
    companions = JSON.parse(r.companions || "[]");
  } catch {
    companions = [];
  }
  return { ...r, fixedRate: !!r.fixedRate, pricesIncludeTax: !!r.pricesIncludeTax, companions } as unknown as FullBooking;
}

/** The bill of a booking. After check-out the invoice saved at check-out is the bill. */
export function folioOf(
  b: { checkInDate: string; checkOutDate: string; ratePerNight: number; fixedRate: boolean | number; discount: number; gstRate: number | null; pricesIncludeTax: boolean | number },
  roomType: string,
  charges: Array<{ amount: number }>,
  payments: Array<{ amount: number; type: string }>,
  bill?: Bill | null
): Folio {
  const s = getSettings();
  const nights = priceNights({ baseRate: b.ratePerNight, checkIn: b.checkInDate, checkOut: b.checkOutDate, roomType, fixedRate: !!b.fixedRate, rules: pricingRules(s) });
  const tax = taxRules(s);
  const folio = computeFolio({
    nights,
    discount: b.discount,
    charges,
    payments,
    tax: bill ? { ...tax, extrasTaxRate: bill.extrasTaxRate } : tax,
    gstRate: bill ? bill.roomTaxRate : b.gstRate,
    pricesIncludeTax: !!b.pricesIncludeTax,
  });
  if (!bill) return folio;
  // The invoice is final: show exactly what was billed.
  return {
    ...folio,
    nightCount: bill.nights,
    roomTotal: bill.roomCharges,
    discount: bill.discount,
    roomAfterDiscount: bill.roomTaxable,
    roomTaxRate: bill.roomTaxRate,
    roomTax: bill.roomTax,
    extrasTotal: bill.extras,
    extrasTaxRate: bill.extrasTaxRate,
    extrasTax: bill.extrasTax,
    taxTotal: round2(bill.roomTax + bill.extrasTax),
    grandTotal: bill.totalAmount,
    balance: round2(bill.totalAmount - folio.netPaid),
  };
}

/** A guest still staying after their leaving date keeps the room until they check out. */
function effectiveCheckOut(b: { status: string; checkOutDate: string }, today: string) {
  if (b.status === "checked_in" && b.checkOutDate <= today) return addDays(today, 1);
  return b.checkOutDate;
}

export function findConflicts(opts: { roomIds?: string[]; checkIn: string; checkOut: string; excludeBookingId?: string }) {
  const today = todayKey();
  const rows = all<BookingDb & { guestName: string }>(
    `SELECT b.*, trim(g.firstName || ' ' || g.lastName) AS guestName FROM bookings b JOIN guests g ON g.id = b.guestId
     WHERE b.status IN ('reserved', 'checked_in') AND b.checkInDate < ? AND (? IS NULL OR b.id != ?)`,
    opts.checkOut,
    opts.excludeBookingId ?? null,
    opts.excludeBookingId ?? null
  );
  return rows.filter((b) => (!opts.roomIds || opts.roomIds.includes(b.roomId)) && rangesOverlap(b.checkInDate, effectiveCheckOut(b, today), opts.checkIn, opts.checkOut));
}

function assertRoomFree(roomId: string, checkIn: string, checkOut: string, excludeBookingId?: string): Room {
  const room = getRoom(roomId);
  if (room.status === "maintenance") fail(`Room ${room.roomNumber} is under maintenance and cannot be booked`);
  const c = findConflicts({ roomIds: [roomId], checkIn, checkOut, excludeBookingId })[0];
  if (c) fail(`Room ${room.roomNumber} is already booked by ${c.guestName} (booking #${c.number}) for some of these dates. Please choose another room or other dates.`);
  return room;
}

export function getRoom(id: string): Room {
  const r = get("SELECT * FROM rooms WHERE id = ?", id);
  if (!r) fail("Room not found");
  return roomFromRow(r);
}

function validateStay(checkIn: unknown, checkOut: unknown) {
  if (!isDateKey(checkIn)) fail("Please choose the arrival date");
  if (!isDateKey(checkOut)) fail("Please choose the leaving date");
  if (checkOut <= checkIn) fail("The leaving date must be after the arrival date");
  if (nightsBetween(checkIn, checkOut) > 365) fail("A booking cannot be longer than 365 nights");
  return { checkIn, checkOut };
}

export function loadBooking(id: string): FullBooking {
  const row = get<BookingDb>("SELECT * FROM bookings WHERE id = ?", id);
  if (!row) fail("Booking not found");
  const b = bookingFromRow(row);
  const guest = guestFromRow(get("SELECT * FROM guests WHERE id = ?", b.guestId)!);
  const room = roomFromRow(get("SELECT * FROM rooms WHERE id = ?", b.roomId)!);
  const charges = all<Charge>("SELECT * FROM charges WHERE bookingId = ? ORDER BY date, rowid", id);
  const payments = all<Payment>("SELECT * FROM payments WHERE bookingId = ? ORDER BY paidAt", id);
  const bill = get<Bill>("SELECT * FROM bills WHERE bookingId = ?", id) ?? null;
  const idChecks = all<IdCheck>("SELECT * FROM id_checks WHERE bookingId = ? ORDER BY createdAt", id);
  const messages = all<MessageLog>("SELECT * FROM messages WHERE bookingId = ? ORDER BY createdAt DESC", id);
  const folio = folioOf(b, room.type, charges, payments, bill);
  return { ...b, guest, room, charges, payments, bill, idChecks, messages, folio, guestName: `${guest.firstName} ${guest.lastName}`.trim() };
}

const ROW_SQL = `
  SELECT b.*, trim(g.firstName || ' ' || g.lastName) AS guestName, g.phone AS guestPhone, g.vip AS vip,
    r.roomNumber AS roomNumber, r.type AS roomType,
    (SELECT COALESCE(SUM(amount), 0) FROM charges c WHERE c.bookingId = b.id) AS chargesTotal,
    (SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN 0 ELSE amount END), 0) FROM payments p WHERE p.bookingId = b.id) AS paidIn,
    (SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END), 0) FROM payments p WHERE p.bookingId = b.id) AS refunded,
    (SELECT COUNT(*) FROM id_checks i WHERE i.bookingId = b.id) AS idsChecked,
    bl.invoiceNumber AS invoiceNumber, bl.id AS billId
  FROM bookings b JOIN guests g ON g.id = b.guestId JOIN rooms r ON r.id = b.roomId
  LEFT JOIN bills bl ON bl.bookingId = b.id`;

export function toRow(r: Record<string, unknown>): BookingRow {
  const b = bookingFromRow(r as BookingDb);
  const bill = r.billId ? (get<Bill>("SELECT * FROM bills WHERE id = ?", r.billId as string) ?? null) : null;
  const f = folioOf(b, r.roomType as string, [{ amount: r.chargesTotal as number }], [
    { amount: r.paidIn as number, type: "payment" },
    { amount: r.refunded as number, type: "refund" },
  ], bill);
  return {
    ...(b as unknown as BookingRow),
    guestName: r.guestName as string,
    guestPhone: r.guestPhone as string,
    vip: !!r.vip,
    roomNumber: r.roomNumber as string,
    roomType: r.roomType as string,
    total: f.grandTotal,
    paid: f.netPaid,
    balance: f.balance,
    invoiceNumber: (r.invoiceNumber as string) ?? null,
    idsChecked: r.idsChecked as number,
  };
}

export function bookingRows(where: string, params: Array<string | number | null>, order = "b.checkInDate, r.sortOrder, r.roomNumber", limit = 1000): BookingRow[] {
  return all(`${ROW_SQL} WHERE ${where} ORDER BY ${order} LIMIT ${limit}`, ...params).map(toRow);
}

export function nextInvoiceNumber(date: string) {
  const s = getSettings();
  const fy = financialYear(date);
  const seq = nextSeq(`invoice_seq_${fy}`, 0);
  return `${(s.invoicePrefix || "INV").replace(/\s+/g, "")}/${fy}/${String(seq).padStart(4, "0")}`;
}

function guestBlockedCheck(guest: Guest, allow: boolean) {
  if (guest.blacklisted && !allow) fail(`${guest.firstName} ${guest.lastName} is marked "do not allow". Ask the owner before booking.`);
}

interface CreateInput {
  guest: GuestInput & { id?: string };
  roomId: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  source?: string;
  otaReference?: string;
  ratePerNight?: number;
  fixedRate?: boolean;
  discount?: number;
  gstRate?: number | null;
  notes?: string;
  comingFrom?: string;
  goingTo?: string;
  purpose?: string;
  vehicleNumber?: string;
  vehicleType?: string;
  companions?: Companion[];
  advance?: { amount: number; method: string; reference?: string };
  walkIn?: boolean;
  allowBlacklisted?: boolean;
}

function cleanCompanions(list: unknown): Companion[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({ name: str((c as Companion)?.name, 80), phone: str((c as Companion)?.phone, 20) || undefined }))
    .filter((c) => c.name)
    .slice(0, 20);
}

function paymentFields(p: { amount: unknown; method: unknown; reference?: unknown; notes?: unknown }) {
  const amount = round2(numberIn(p.amount, "Amount", 0.01, 1e8));
  const method = str(p.method);
  if (!PAYMENT_METHODS.includes(method)) fail("Please choose how the money was paid");
  return { amount, method, reference: opt(p.reference, 100), notes: opt(p.notes, 300) };
}

function addPaymentRow(bookingId: string, p: { amount: number; method: string; reference: string | null; notes: string | null }, type: "advance" | "payment" | "refund") {
  const staff = requireStaff();
  insert("payments", { bookingId, ...p, type, receivedBy: staff.name, shiftId: session.shiftId, paidAt: now() });
}

export function createBooking(input: CreateInput) {
  const staff = requirePerm("frontdesk");
  const s = getSettings();
  const { checkIn, checkOut } = validateStay(input.checkIn, input.checkOut);
  const today = todayKey();
  if (input.walkIn && checkIn !== today) fail("A walk-in guest arrives today. Please set the arrival date to today.");
  if (!input.walkIn && checkIn < addDays(today, -1)) fail("The arrival date is in the past");
  const source = SOURCES.includes(str(input.source)) ? str(input.source) : "walk_in";
  const adults = Math.round(numberIn(input.adults ?? 1, "Adults", 1, 50));
  const children = Math.round(numberIn(input.children ?? 0, "Children", 0, 50));
  return tx(() => {
    const room = assertRoomFree(input.roomId, checkIn, checkOut);
    const guest = upsertGuest(input.guest);
    guestBlockedCheck(guest, !!input.allowBlacklisted);
    const rate = input.ratePerNight === undefined || (input.ratePerNight as unknown) === "" ? room.pricePerNight : numberIn(input.ratePerNight, "Price per night", 0, 1e7);
    const number = nextSeq("booking_seq", 1000);
    const at = now();
    const id = insert("bookings", {
      number,
      guestId: guest.id,
      roomId: room.id,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      status: input.walkIn ? "checked_in" : "reserved",
      actualCheckIn: input.walkIn ? at : null,
      source,
      otaReference: opt(input.otaReference, 60),
      ratePerNight: round2(rate),
      fixedRate: bool(input.fixedRate),
      gstRate: input.gstRate === null || input.gstRate === undefined || (input.gstRate as unknown) === "" ? null : numberIn(input.gstRate, "GST %", 0, 28),
      pricesIncludeTax: s.roomPricesIncludeTax,
      discount: round2(numberIn(input.discount ?? 0, "Discount", 0, 1e8)),
      adults,
      children,
      notes: opt(input.notes, 2000),
      comingFrom: opt(input.comingFrom, 100),
      goingTo: opt(input.goingTo, 100),
      purpose: opt(input.purpose, 100),
      vehicleNumber: opt(input.vehicleNumber, 30),
      vehicleType: VEHICLE_TYPES.includes(str(input.vehicleType)) ? str(input.vehicleType) : null,
      companions: JSON.stringify(cleanCompanions(input.companions)),
      createdBy: staff.name,
      createdAt: at,
      updatedAt: at,
    });
    if (input.advance && Number(input.advance.amount) > 0) addPaymentRow(id, paymentFields(input.advance), "advance");
    log("New booking", `#${number} ${guest.firstName} ${guest.lastName}, room ${room.roomNumber}, ${checkIn} to ${checkOut}`, id);
    if (input.walkIn) {
      // Without the details Pathik needs, the walk-in stays booked and check-in asks for them.
      if (pathikMissing(loadBooking(id)).length) update("bookings", id, { status: "reserved", actualCheckIn: null });
      else log("Checked in", `#${number} room ${room.roomNumber} (walk-in)`, id);
    }
    return loadBooking(id);
  });
}

function editable(b: FullBooking) {
  if (b.status === "checked_out") fail("This guest has checked out and the invoice is made. The booking cannot be changed.");
  if (b.status === "cancelled" || b.status === "no_show") fail("This booking is cancelled. Bring it back first to change it.");
}

export const bookingsApi = {
  "bookings.get": ({ id }: { id: string }) => {
    requireStaff();
    return loadBooking(id);
  },

  "bookings.list": (q: { view?: string; search?: string; from?: string; to?: string; source?: string; limit?: number }) => {
    requirePerm("frontdesk");
    const today = todayKey();
    const where: string[] = [];
    const params: Array<string | number | null> = [];
    let order = "b.checkInDate, r.sortOrder, r.roomNumber";
    switch (q.view) {
      case "arrivals":
        where.push("b.status = 'reserved' AND b.checkInDate <= ?");
        params.push(today);
        break;
      case "upcoming":
        where.push("b.status = 'reserved'");
        break;
      case "staying":
        where.push("b.status = 'checked_in'");
        order = "r.sortOrder, r.roomNumber";
        break;
      case "departures":
        where.push("b.status = 'checked_in' AND b.checkOutDate <= ?");
        params.push(today);
        break;
      case "past":
        where.push("b.status = 'checked_out'");
        order = "b.actualCheckOut DESC";
        break;
      case "cancelled":
        where.push("b.status IN ('cancelled', 'no_show')");
        order = "b.updatedAt DESC";
        break;
      case "unpaid":
        where.push("b.status IN ('checked_in', 'checked_out', 'reserved')");
        order = "b.checkOutDate DESC";
        break;
      default:
        order = "b.checkInDate DESC";
    }
    if (q.from) {
      where.push("b.checkOutDate >= ?");
      params.push(q.from);
    }
    if (q.to) {
      where.push("b.checkInDate <= ?");
      params.push(q.to);
    }
    if (q.source) {
      where.push("b.source = ?");
      params.push(q.source);
    }
    const search = str(q.search, 80);
    if (search) {
      const like = `%${search}%`;
      where.push("(g.firstName || ' ' || g.lastName LIKE ? OR g.phone LIKE ? OR CAST(b.number AS TEXT) = ? OR r.roomNumber = ? OR b.otaReference LIKE ? OR bl.invoiceNumber LIKE ? OR g.company LIKE ?)");
      params.push(like, like, search.replace(/^#/, ""), search, like, like, like);
    }
    let rows = bookingRows(where.length ? where.join(" AND ") : "1 = 1", params, order, Math.min(q.limit ?? 500, 5000));
    if (q.view === "unpaid") rows = rows.filter((r) => r.balance >= 1 && (r.status !== "reserved" || r.checkInDate <= today));
    return rows;
  },

  "bookings.availability": ({ checkIn, checkOut, excludeBookingId }: { checkIn: string; checkOut: string; excludeBookingId?: string }) => {
    requireStaff();
    validateStay(checkIn, checkOut);
    const s = getSettings();
    const rooms = all("SELECT * FROM rooms WHERE deleted = 0 ORDER BY sortOrder, roomNumber").map(roomFromRow);
    const conflicts = findConflicts({ checkIn, checkOut, excludeBookingId });
    return rooms.map((room) => {
      const c = conflicts.find((x) => x.roomId === room.id);
      const quote = folioOf({ checkInDate: checkIn, checkOutDate: checkOut, ratePerNight: room.pricePerNight, fixedRate: false, discount: 0, gstRate: null, pricesIncludeTax: s.roomPricesIncludeTax }, room.type, [], []);
      return { room, free: !c && room.status !== "maintenance", busyWith: c ? `${c.guestName} (#${c.number})` : room.status === "maintenance" ? "Under maintenance" : null, quote };
    });
  },

  "bookings.quote": (q: { roomId: string; checkIn: string; checkOut: string; ratePerNight?: number; discount?: number; fixedRate?: boolean; gstRate?: number | null; advance?: number }) => {
    requireStaff();
    const { checkIn, checkOut } = validateStay(q.checkIn, q.checkOut);
    const room = getRoom(q.roomId);
    const s = getSettings();
    return folioOf(
      {
        checkInDate: checkIn,
        checkOutDate: checkOut,
        ratePerNight: q.ratePerNight === undefined || (q.ratePerNight as unknown) === "" ? room.pricePerNight : Number(q.ratePerNight) || 0,
        fixedRate: !!q.fixedRate,
        discount: Number(q.discount) || 0,
        gstRate: q.gstRate === undefined || q.gstRate === null || (q.gstRate as unknown) === "" ? null : Number(q.gstRate),
        pricesIncludeTax: s.roomPricesIncludeTax,
      },
      room.type,
      [],
      q.advance ? [{ amount: Number(q.advance), type: "advance" }] : []
    );
  },

  "bookings.create": (input: CreateInput) => createBooking(input),

  "bookings.update": (input: Record<string, unknown> & { id: string }) => {
    const staff = requirePerm("frontdesk");
    return tx(() => {
      const b = loadBooking(input.id);
      // Notes and travel details can always be changed.
      const always: Record<string, unknown> = {};
      for (const k of ["notes", "comingFrom", "goingTo", "purpose", "vehicleNumber", "otaReference"]) if (k in input) always[k] = opt(input[k], k === "notes" ? 2000 : 100);
      if ("vehicleType" in input) always.vehicleType = VEHICLE_TYPES.includes(str(input.vehicleType)) ? str(input.vehicleType) : null;
      if ("companions" in input) always.companions = JSON.stringify(cleanCompanions(input.companions));
      const changes: Record<string, unknown> = { ...always };
      const touchesStay = ["checkIn", "checkOut", "roomId", "ratePerNight", "discount", "fixedRate", "gstRate", "adults", "children", "source"].some((k) => k in input);
      const desc: string[] = [];
      if (touchesStay) {
        editable(b);
        if ("adults" in input) changes.adults = Math.round(numberIn(input.adults, "Adults", 1, 50));
        if ("children" in input) changes.children = Math.round(numberIn(input.children, "Children", 0, 50));
        if ("source" in input && SOURCES.includes(str(input.source))) changes.source = str(input.source);
        const checkIn = (input.checkIn as string) ?? b.checkInDate;
        const checkOut = (input.checkOut as string) ?? b.checkOutDate;
        const roomId = (input.roomId as string) ?? b.roomId;
        if (checkIn !== b.checkInDate || checkOut !== b.checkOutDate || roomId !== b.roomId) {
          validateStay(checkIn, checkOut);
          if (b.status === "checked_in" && checkIn !== b.checkInDate) fail("The guest is already staying, so the arrival date cannot change");
          if (b.status === "checked_in" && checkOut <= todayKey() && checkOut !== b.checkOutDate) fail("The leaving date must be after today for a guest who is staying");
          const room = assertRoomFree(roomId, checkIn, checkOut, b.id);
          if (roomId !== b.roomId) {
            desc.push(`room ${b.room.roomNumber} → ${room.roomNumber}`);
            if (b.status === "checked_in") run("UPDATE rooms SET housekeeping = 'dirty', hkUpdatedAt = ? WHERE id = ?", now(), b.roomId);
          }
          if (checkIn !== b.checkInDate || checkOut !== b.checkOutDate) desc.push(`dates ${checkIn} to ${checkOut}`);
          Object.assign(changes, { checkInDate: checkIn, checkOutDate: checkOut, roomId });
        }
        const priceKeys = ["ratePerNight", "discount", "fixedRate", "gstRate"].filter((k) => k in input);
        if (priceKeys.length) {
          if (!can(staff.role, "editPrices")) fail("Only the owner or manager can change the price of a booking");
          if ("ratePerNight" in input) changes.ratePerNight = round2(numberIn(input.ratePerNight, "Price per night", 0, 1e7));
          if ("discount" in input) changes.discount = round2(numberIn(input.discount || 0, "Discount", 0, 1e8));
          if ("fixedRate" in input) changes.fixedRate = bool(input.fixedRate) ? 1 : 0;
          if ("gstRate" in input) changes.gstRate = input.gstRate === null || input.gstRate === "" ? null : numberIn(input.gstRate, "GST %", 0, 28);
          desc.push("price");
        }
      }
      changes.updatedAt = now();
      update("bookings", b.id, changes as Record<string, string | number | null>);
      log("Changed booking", `#${b.number}${desc.length ? `: ${desc.join(", ")}` : ""}`, b.id);
      return loadBooking(b.id);
    });
  },

  "bookings.checkIn": ({ id, confirmIdsMissing, roomId }: { id: string; confirmIdsMissing?: boolean; roomId?: string }) => {
    requirePerm("frontdesk");
    return tx(() => {
      const b = loadBooking(id);
      if (b.status !== "reserved") fail(`This booking is ${label(b.status).toLowerCase()}, so it cannot be checked in`);
      const today = todayKey();
      let checkIn = b.checkInDate;
      let checkOut = b.checkOutDate;
      if (checkIn > today) {
        // Early arrival: the stay starts today.
        checkIn = today;
      }
      if (checkOut <= today) checkOut = addDays(today, 1);
      const targetRoom = roomId ?? b.roomId;
      const room = assertRoomFree(targetRoom, checkIn, checkOut, b.id);
      const s = getSettings();
      const adults = b.adults;
      if (s.idCheckRequired && b.idChecks.length < adults && !confirmIdsMissing) {
        fail(`ID_MISSING:${adults - b.idChecks.length}`);
      }
      const miss = pathikMissing(b);
      if (miss.length) fail(`Pathik needs these details before check-in: ${miss.join(", ")}.`);
      update("bookings", id, { status: "checked_in", actualCheckIn: now(), checkInDate: checkIn, checkOutDate: checkOut, roomId: room.id, updatedAt: now() });
      log("Checked in", `#${b.number} ${b.guestName}, room ${room.roomNumber}${b.idChecks.length < adults ? ` (IDs checked: ${b.idChecks.length} of ${adults})` : ""}`, id);
      return loadBooking(id);
    });
  },

  "bookings.undoCheckIn": ({ id }: { id: string }) => {
    requirePerm("frontdesk");
    return tx(() => {
      const b = loadBooking(id);
      if (b.status !== "checked_in") fail("Only a guest who is staying can be moved back to booked");
      update("bookings", id, { status: "reserved", actualCheckIn: null, updatedAt: now() });
      log("Undid check-in", `#${b.number}`, id);
      return loadBooking(id);
    });
  },

  /** What the bill will be if the guest leaves today, both ways (for early or late check-out). */
  "bookings.checkOutPreview": ({ id }: { id: string }) => {
    requireStaff();
    const b = loadBooking(id);
    const today = todayKey();
    const todayOut = today <= b.checkInDate ? addDays(b.checkInDate, 1) : today;
    const asStayed = folioOf({ ...b, checkOutDate: todayOut }, b.room.type, b.charges, b.payments);
    return { booked: b.folio, stayed: asStayed, stayedCheckOut: todayOut, differs: todayOut !== b.checkOutDate };
  },

  "bookings.checkOut": ({ id, billUpTo }: { id: string; billUpTo?: "booked" | "today" }) => {
    requirePerm("frontdesk");
    return tx(() => {
      const b = loadBooking(id);
      if (b.status !== "checked_in") fail("Only a guest who is staying can check out");
      const today = todayKey();
      let checkOut = b.checkOutDate;
      if (billUpTo === "today") checkOut = today <= b.checkInDate ? addDays(b.checkInDate, 1) : today;
      if (checkOut !== b.checkOutDate) update("bookings", id, { checkOutDate: checkOut });
      const fresh = loadBooking(id);
      const f = fresh.folio;
      const invoiceDate = today;
      const invoiceNumber = nextInvoiceNumber(invoiceDate);
      insert("bills", {
        bookingId: id,
        invoiceNumber,
        invoiceDate,
        nights: f.nightCount,
        roomCharges: f.roomTotal,
        discount: f.discount,
        roomTaxable: f.roomAfterDiscount,
        roomTaxRate: f.roomTaxRate,
        roomTax: f.roomTax,
        extras: f.extrasTotal,
        extrasTaxRate: f.extrasTaxRate,
        extrasTax: f.extrasTax,
        totalAmount: f.grandTotal,
        generatedAt: now(),
      });
      update("bookings", id, { status: "checked_out", actualCheckOut: now(), updatedAt: now() });
      run("UPDATE rooms SET housekeeping = 'dirty', hkUpdatedAt = ?, hkNotes = ? WHERE id = ?", now(), `Guest left (#${b.number})`, b.roomId);
      insert("hk_log", { roomId: b.roomId, status: "dirty", staffName: requireStaff().name, notes: `Check-out #${b.number}`, createdAt: now() });
      log("Checked out", `#${b.number} ${b.guestName}, invoice ${invoiceNumber}, ${money(f.grandTotal)}${f.balance >= 1 ? `, ${money(f.balance)} still due` : ""}`, id);
      return loadBooking(id);
    });
  },

  "bookings.cancel": ({ id, reason, noShow }: { id: string; reason?: string; noShow?: boolean }) => {
    requirePerm("frontdesk");
    return tx(() => {
      const b = loadBooking(id);
      if (b.status !== "reserved") fail("Only a booking that has not checked in can be cancelled");
      update("bookings", id, { status: noShow ? "no_show" : "cancelled", cancelReason: opt(reason, 300), updatedAt: now() });
      log(noShow ? "Marked no-show" : "Cancelled booking", `#${b.number} ${b.guestName}${reason ? `: ${reason}` : ""}`, id);
      return loadBooking(id);
    });
  },

  "bookings.reinstate": ({ id }: { id: string }) => {
    requirePerm("frontdesk");
    return tx(() => {
      const b = loadBooking(id);
      if (b.status !== "cancelled" && b.status !== "no_show") fail("This booking is not cancelled");
      if (b.checkOutDate <= todayKey()) fail("The dates of this booking are over. Make a new booking instead.");
      assertRoomFree(b.roomId, b.checkInDate, b.checkOutDate, b.id);
      update("bookings", id, { status: "reserved", cancelReason: null, updatedAt: now() });
      log("Brought back booking", `#${b.number}`, id);
      return loadBooking(id);
    });
  },

  "bookings.delete": ({ id }: { id: string }) => {
    requirePerm("delete");
    return tx(() => {
      const b = loadBooking(id);
      if (b.bill) fail("A booking with an invoice cannot be deleted. Invoices must stay in the records for GST.");
      run("DELETE FROM bookings WHERE id = ?", id);
      log("Deleted booking", `#${b.number} ${b.guestName}`);
      return true;
    });
  },

  // Extras on the bill -------------------------------------------------------------------------
  "charges.add": (input: { bookingId: string; category: string; description: string; quantity: number; unitPrice: number; date?: string }) => {
    const staff = requirePerm("frontdesk");
    return tx(() => {
      const b = loadBooking(input.bookingId);
      if (b.bill) fail("The invoice for this stay is already made. Extras cannot be added after check-out.");
      if (b.status === "cancelled" || b.status === "no_show") fail("This booking is cancelled");
      const category = CHARGE_CATEGORIES.includes(input.category) ? input.category : "other";
      const description = str(input.description, 120) || label(category);
      const quantity = numberIn(input.quantity ?? 1, "Quantity", 0.01, 10000);
      const unitPrice = numberIn(input.unitPrice, "Price", 0, 1e7);
      insert("charges", { bookingId: b.id, category, description, quantity, unitPrice, amount: round2(quantity * unitPrice), date: isDateKey(input.date) ? input.date : todayKey(), addedBy: staff.name });
      log("Added extra", `#${b.number} ${description} ${money(quantity * unitPrice)}`, b.id);
      return loadBooking(b.id);
    });
  },
  "charges.delete": ({ id }: { id: string }) => {
    requirePerm("frontdesk");
    return tx(() => {
      const c = get<Charge>("SELECT * FROM charges WHERE id = ?", id);
      if (!c) fail("Extra not found");
      const b = loadBooking(c.bookingId);
      if (b.bill) fail("The invoice is already made. Extras cannot be removed after check-out.");
      run("DELETE FROM charges WHERE id = ?", id);
      log("Removed extra", `#${b.number} ${c.description}`, b.id);
      return loadBooking(b.id);
    });
  },

  // Payments ------------------------------------------------------------------------------------
  "payments.add": (input: { bookingId: string; amount: number; method: string; reference?: string; notes?: string; refund?: boolean }) => {
    requirePerm("frontdesk");
    return tx(() => {
      const b = loadBooking(input.bookingId);
      const p = paymentFields(input);
      if (input.refund && p.amount > b.folio.netPaid + 0.5) fail(`You can refund at most ${money(b.folio.netPaid)}, what the guest has paid`);
      const type = input.refund ? "refund" : b.status === "reserved" ? "advance" : "payment";
      addPaymentRow(b.id, p, type);
      log(input.refund ? "Refund" : "Payment received", `#${b.number} ${money(p.amount)} by ${label(p.method)}`, b.id);
      return loadBooking(b.id);
    });
  },
  "payments.delete": ({ id }: { id: string }) => {
    requirePerm("delete");
    return tx(() => {
      const p = get<Payment>("SELECT * FROM payments WHERE id = ?", id);
      if (!p) fail("Payment not found");
      const b = loadBooking(p.bookingId);
      run("DELETE FROM payments WHERE id = ?", id);
      log("Deleted payment", `#${b.number} ${money(p.amount)} ${label(p.method)}`, b.id);
      return loadBooking(b.id);
    });
  },
  "payments.list": ({ from, to, method }: { from: string; to: string; method?: string }) => {
    requirePerm("frontdesk");
    return all(
      `SELECT p.*, b.number, b.id AS bookingId, trim(g.firstName || ' ' || g.lastName) AS guestName, r.roomNumber
       FROM payments p JOIN bookings b ON b.id = p.bookingId JOIN guests g ON g.id = b.guestId JOIN rooms r ON r.id = b.roomId
       WHERE substr(p.paidAt, 1, 10) >= ? AND substr(p.paidAt, 1, 10) <= ? AND (? IS NULL OR p.method = ?)
       ORDER BY p.paidAt DESC`,
      from,
      to,
      method ?? null,
      method ?? null
    );
  },

  // ID checks -----------------------------------------------------------------------------------
  "ids.add": (input: { bookingId: string; person: string; idType: string; idLast4?: string; updateGuest?: boolean }) => {
    const staff = requirePerm("frontdesk");
    return tx(() => {
      const b = loadBooking(input.bookingId);
      const person = str(input.person, 80) || b.guestName;
      if (!ID_TYPES.includes(input.idType)) fail("Please choose which ID was shown");
      const last4 = str(input.idLast4, 4);
      if (last4 && !/^[0-9A-Za-z]{4}$/.test(last4)) fail("Only the last 4 characters of the ID number are saved");
      if (b.idChecks.some((c) => c.person.toLowerCase() === person.toLowerCase())) fail(`${person}'s ID is already ticked`);
      insert("id_checks", { bookingId: b.id, person, idType: input.idType, idLast4: last4 || null, checkedBy: staff.name, createdAt: now() });
      if (person === b.guestName) run("UPDATE guests SET idType = ?, idLast4 = COALESCE(?, idLast4), updatedAt = ? WHERE id = ?", input.idType, last4 || null, now(), b.guestId);
      log("ID checked", `#${b.number} ${person}: ${label(input.idType)}`, b.id);
      return loadBooking(b.id);
    });
  },
  "ids.remove": ({ id }: { id: string }) => {
    requirePerm("frontdesk");
    return tx(() => {
      const c = get<IdCheck>("SELECT * FROM id_checks WHERE id = ?", id);
      if (!c) fail("Not found");
      run("DELETE FROM id_checks WHERE id = ?", id);
      log("ID tick removed", c.person, c.bookingId);
      return loadBooking(c.bookingId);
    });
  },

  // WhatsApp messages sent from a booking --------------------------------------------------------
  "messages.log": (input: { bookingId?: string; guestId?: string; kind: string; phone: string; text: string }) => {
    const staff = requireStaff();
    insert("messages", { bookingId: input.bookingId ?? null, guestId: input.guestId ?? null, kind: str(input.kind, 30), phone: str(input.phone, 30), text: str(input.text, 5000), sentBy: staff.name, createdAt: now() });
    if (input.bookingId) log("WhatsApp message", `${label(input.kind)} to ${input.phone}`, input.bookingId);
    return true;
  },
  "messages.list": ({ limit }: { limit?: number }) => {
    requirePerm("frontdesk");
    return all(
      `SELECT m.*, b.number, trim(g.firstName || ' ' || g.lastName) AS guestName FROM messages m
       LEFT JOIN bookings b ON b.id = m.bookingId LEFT JOIN guests g ON g.id = COALESCE(m.guestId, b.guestId)
       ORDER BY m.createdAt DESC LIMIT ?`,
      Math.min(Number(limit) || 300, 2000)
    );
  },

  // Calendar ------------------------------------------------------------------------------------
  "calendar.get": ({ from, days }: { from: string; days: number }) => {
    requireStaff();
    if (!isDateKey(from)) fail("Bad date");
    const n = Math.min(Math.max(1, Number(days) || 14), 62);
    const to = addDays(from, n);
    const rooms = all("SELECT * FROM rooms WHERE deleted = 0 ORDER BY sortOrder, roomNumber").map(roomFromRow);
    const today = todayKey();
    const bookings = bookingRows("b.status IN ('reserved','checked_in','checked_out') AND b.checkInDate < ? AND b.checkOutDate >= ?", [to, addDays(from, -1)]).map((b) => ({
      ...b,
      // A guest still staying past their leaving date keeps the room till today.
      displayOut: b.status === "checked_in" && b.checkOutDate <= today ? addDays(today, 1) : b.checkOutDate,
    }));
    return { from, days: n, rooms, bookings: bookings.filter((b) => b.displayOut > from) };
  },
};

export function bookingCountForGuest(guestId: string) {
  return scalar<number>("SELECT COUNT(*) FROM bookings WHERE guestId = ?", guestId);
}

export { getMeta, setMeta };
