// Pathik (pathik.guru) is the police guest register used by hotels in Gujarat: every stay is
// entered in its "Add Guest" form. This file turns a booking into the values of that form, so
// the app can fill it in. No database code here, so the screens and tests can use it too.
import { localDateKey } from "./dates";
import type { FullBooking, Settings } from "./types";

export const VEHICLE_TYPES = ["four_wheeler", "two_wheeler", "bus", "auto", "other", "none"];
export const VEHICLE_LABELS: Record<string, string> = {
  four_wheeler: "Car",
  two_wheeler: "Two-wheeler (bike / scooter)",
  bus: "Bus",
  auto: "Auto-rickshaw",
  other: "Other vehicle",
  none: "No vehicle (train, flight or on foot)",
};

/** One person as Pathik asks for them. ID numbers are never kept here: they are typed in Pathik. */
export interface PathikPerson {
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
  mobile: string;
  docType: string | null; // aadhaar, passport, driving_licence, voter_id, pan, other
  docNumber: string;
}

export interface PathikGuest extends PathikPerson {
  company: string;
  address: string;
  locality: string;
  city: string;
  district: string;
  zipCode: string;
  country: string;
  state: string;
  dateOfBirth: string; // yyyy-mm-dd
  phone: string;
  email: string;
}

export interface PathikStay {
  roomNumber: string;
  checkInDate: string; // yyyy-mm-dd
  checkInTime: string; // HH:MM, 24 hours
  checkOutDate: string;
  checkOutTime: string;
  adults: number;
  children: number;
  comingFrom: string;
  goingTo: string;
  vehicleType: string | null;
  vehicleNumber: string;
}

export interface PathikRecord {
  bookingId: string;
  /** "Booking #1023 · Room 204 · Ravi Shah", shown in Pathik's window. */
  title: string;
  guest: PathikGuest;
  stay: PathikStay;
  /** The other adults in the room, in order. */
  others: PathikPerson[];
  /** Details Pathik asks for that are not in the booking yet. */
  missing: string[];
  /** Always done in Pathik by hand: ID numbers and ID photos (no copies are kept here). */
  byHand: string[];
  pathikAt: string | null;
  pathikBy: string | null;
}

const COUNTRIES: Record<string, string> = {
  indian: "India", american: "United States", british: "United Kingdom", english: "United Kingdom", french: "France", german: "Germany", italian: "Italy", spanish: "Spain", dutch: "Netherlands", canadian: "Canada", australian: "Australia", "new zealander": "New Zealand", nepali: "Nepal", nepalese: "Nepal", bangladeshi: "Bangladesh", "sri lankan": "Sri Lanka", bhutanese: "Bhutan", chinese: "China", japanese: "Japan", korean: "South Korea", russian: "Russia", emirati: "United Arab Emirates", singaporean: "Singapore", malaysian: "Malaysia", thai: "Thailand", israeli: "Israel", irish: "Ireland", swiss: "Switzerland", swedish: "Sweden", "south african": "South Africa",
};

export function isIndian(nationality: string | null | undefined) {
  const n = (nationality ?? "").trim().toLowerCase();
  return !n || n === "indian" || n === "india";
}

/** "Indian" → "India", "French" → "France"; a country name stays as it is. */
export function countryOf(nationality: string | null | undefined) {
  if (isIndian(nationality)) return "India";
  const n = (nationality ?? "").trim();
  return COUNTRIES[n.toLowerCase()] ?? n;
}

/** Pathik wants first, middle and last names. "Ravi Kumar Shah" with no surname gives Ravi / Kumar / Shah. */
export function splitName(firstName: string, lastName = "") {
  const words = firstName.trim().split(/\s+/).filter(Boolean);
  const last = lastName.trim();
  if (last) return { firstName: words[0] ?? "", middleName: words.slice(1).join(" "), lastName: last };
  if (words.length <= 1) return { firstName: words[0] ?? "", middleName: "", lastName: "" };
  return { firstName: words[0], middleName: words.slice(1, -1).join(" "), lastName: words[words.length - 1] };
}

/** An Indian mobile as 10 digits ("+91 98450 11223" → "9845011223"); other numbers as digits with their +. */
export function mobileFor(phone: string | null | undefined, indian: boolean) {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  if (!indian) return digits;
  const d = digits.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d;
}

function hhmm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function person(first: string, last: string, mobile: string, docType: string | null): PathikPerson {
  const n = splitName(first, last);
  return { ...n, fullName: [n.firstName, n.middleName, n.lastName].filter(Boolean).join(" "), mobile, docType, docNumber: "" };
}

/** Everything Pathik's "Add Guest" form asks for, from the booking. */
export function pathikRecord(b: FullBooking, s: Pick<Settings, "checkInTime" | "checkOutTime">): PathikRecord {
  const g = b.guest;
  const indian = isIndian(g.nationality);
  const lower = (x: string) => x.trim().toLowerCase();
  const checkFor = (name: string) => b.idChecks.find((c) => lower(c.person) === lower(name))?.idType ?? null;
  const docType = checkFor(b.guestName) ?? g.idType ?? null;
  const mobile = mobileFor(g.phone, indian);
  const main = person(g.firstName, g.lastName, mobile, docType);
  const guest: PathikGuest = {
    ...main,
    company: g.company ?? "",
    address: g.address ?? "",
    // Pathik asks for a locality: the area if known, else the city.
    locality: g.locality || g.city || "",
    city: g.city ?? "",
    district: g.district || "",
    zipCode: (g.pinCode ?? "").replace(/\s/g, ""),
    country: countryOf(g.nationality),
    state: indian ? g.state ?? "" : g.state && g.state !== "Outside India" ? g.state : "",
    dateOfBirth: g.dateOfBirth ?? "",
    phone: mobile,
    email: g.email ?? "",
  };
  const stay: PathikStay = {
    roomNumber: b.room.roomNumber,
    checkInDate: b.actualCheckIn ? localDateKey(new Date(b.actualCheckIn)) : b.checkInDate,
    checkInTime: b.actualCheckIn ? hhmm(b.actualCheckIn) : s.checkInTime,
    checkOutDate: b.actualCheckOut ? localDateKey(new Date(b.actualCheckOut)) : b.checkOutDate,
    checkOutTime: b.actualCheckOut ? hhmm(b.actualCheckOut) : s.checkOutTime,
    adults: b.adults,
    children: b.children,
    comingFrom: b.comingFrom ?? "",
    goingTo: b.goingTo ?? "",
    vehicleType: b.vehicleType || null,
    vehicleNumber: b.vehicleNumber ?? "",
  };
  // The other adults: the names written on the booking, with the ID ticked for each.
  const others = b.companions.map((c) => {
    const p = person(c.name, "", mobileFor(c.phone, indian), checkFor(c.name));
    return p;
  });

  const missing: string[] = [];
  const need = (ok: unknown, label: string) => !ok && missing.push(label);
  need(guest.lastName, "Last name (surname)");
  need(guest.address, "Address");
  need(guest.city, "City");
  need(guest.district, "District");
  need(guest.zipCode, "PIN code");
  need(guest.state || !indian, "State");
  need(guest.dateOfBirth, "Date of birth");
  need(guest.mobile, "Mobile number");
  need(guest.email, "Email");
  need(docType, "ID proof type (tick the guest's ID)");
  need(stay.comingFrom, "Coming from");
  need(stay.goingTo, "Going to");
  need(stay.vehicleType, "How the guest travels (vehicle type)");
  if (others.length < stay.adults - 1) {
    const n = stay.adults - 1 - others.length;
    missing.push(`Names of the other ${n === 1 ? "adult" : `${n} adults`}`);
  }
  others.forEach((o) => need(o.docType, `ID proof type of ${o.fullName}`));

  const withId = [...(docType ? [guest.fullName] : []), ...others.filter((o) => o.docType).map((o) => o.fullName)];
  const byHand = withId.length ? [`ID number and photo for ${withId.join(", ")}`] : ["ID number and photo"];

  return {
    bookingId: b.id,
    title: `Booking #${b.number} · Room ${b.room.roomNumber} · ${guest.fullName}`,
    guest,
    stay,
    others,
    missing,
    byHand,
    pathikAt: b.pathikAt,
    pathikBy: b.pathikBy,
  };
}

const dmy = (key: string) => (key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : "");

/** Every value in the order of Pathik's form, for copying one by one. */
export function pathikCopyRows(r: PathikRecord, label: (v: string) => string): Array<[string, string]> {
  const g = r.guest;
  const s = r.stay;
  const rows: Array<[string, string]> = [
    ["First name", g.firstName],
    ["Middle name", g.middleName],
    ["Last name", g.lastName],
    ["Company", g.company],
    ["Address", g.address],
    ["Locality", g.locality],
    ["City", g.city],
    ["District", g.district],
    ["PIN code", g.zipCode],
    ["Country", g.country],
    ["State", g.state],
    ["Date of birth", dmy(g.dateOfBirth)],
    ["Mobile", g.mobile],
    ["Email", g.email],
    ["Document type", g.docType ? label(g.docType) : ""],
    ["Coming from", s.comingFrom],
    ["Going to", s.goingTo],
    ["Room number", s.roomNumber],
    ["Check-in date", dmy(s.checkInDate)],
    ["Check-in time", s.checkInTime],
    ["Check-out date", dmy(s.checkOutDate)],
    ["Check-out time", s.checkOutTime],
    ["Adults", String(s.adults)],
    ["Children", String(s.children)],
    ["Vehicle type", s.vehicleType ? VEHICLE_LABELS[s.vehicleType] ?? s.vehicleType : ""],
    ["Vehicle number", s.vehicleNumber],
  ];
  r.others.forEach((o, i) => rows.push([`Adult ${i + 2}`, [o.fullName, o.mobile, o.docType ? label(o.docType) : ""].filter(Boolean).join(" · ")]));
  return rows.filter(([, v]) => v);
}
