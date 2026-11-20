// Labels and number formatting shared by every screen and printout.
import type { Role } from "./types";

export function money(n: number, currency = "INR", decimals = 0) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n || 0);
  } catch {
    return `${currency} ${(n || 0).toFixed(decimals)}`;
  }
}

export function money2(n: number, currency = "INR") {
  return money(n, currency, 2);
}

export function num(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals }).format(n || 0);
}

export function pct(n: number) {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

/** "checked_in" → "Checked in", unless a nicer label is known. */
export function label(value: string | null | undefined): string {
  if (!value) return "";
  if (LABELS[value]) return LABELS[value];
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const LABELS: Record<string, string> = {
  reserved: "Booked",
  checked_in: "Staying",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
  walk_in: "Walk-in",
  phone: "Phone / WhatsApp",
  booking_com: "Booking.com",
  makemytrip: "MakeMyTrip",
  goibibo: "Goibibo",
  agoda: "Agoda",
  airbnb: "Airbnb",
  expedia: "Expedia",
  travel_agent: "Travel agent",
  corporate: "Company / corporate",
  website: "Our website",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  ota_prepaid: "Paid to booking site",
  aadhaar: "Aadhaar card",
  passport: "Passport",
  driving_licence: "Driving licence",
  voter_id: "Voter ID",
  pan: "PAN card",
  owner: "Owner",
  manager: "Manager",
  front_desk: "Front desk",
  housekeeping: "Housekeeping",
  extra_bed: "Extra bed",
  inspect: "Ready to check",
};

export const SOURCES = ["walk_in", "phone", "website", "booking_com", "makemytrip", "goibibo", "agoda", "airbnb", "expedia", "travel_agent", "corporate", "other"];
export const PAYMENT_METHODS = ["cash", "upi", "card", "bank_transfer", "ota_prepaid", "other"];
export const ID_TYPES = ["aadhaar", "passport", "driving_licence", "voter_id", "pan", "other"];
export const CHARGE_CATEGORIES = ["food", "beverages", "laundry", "minibar", "transport", "extra_bed", "late_checkout", "damage", "other"];
export const ROLES: Role[] = ["owner", "manager", "front_desk", "housekeeping"];
export const DEFAULT_ROOM_TYPES = ["standard", "deluxe", "super_deluxe", "suite", "family", "dormitory"];

/** SAC codes printed on GST invoices. */
export function sacFor(category: string) {
  if (category === "food" || category === "beverages" || category === "minibar") return "996331";
  if (category === "laundry") return "999712";
  if (category === "transport") return "996601";
  return "996311";
}

export const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including staff, licence, backups and reports",
  manager: "Everything except the licence and restoring backups",
  front_desk: "Bookings, check-in/out, payments, guests, housekeeping. No reports or settings",
  housekeeping: "Only the housekeeping board",
};

export type Permission = "reports" | "settings" | "rooms" | "staff" | "license" | "restore" | "delete" | "frontdesk" | "housekeeping" | "editPrices";

const PERMS: Record<Role, Permission[]> = {
  owner: ["reports", "settings", "rooms", "staff", "license", "restore", "delete", "frontdesk", "housekeeping", "editPrices"],
  manager: ["reports", "settings", "rooms", "staff", "delete", "frontdesk", "housekeeping", "editPrices"],
  front_desk: ["frontdesk", "housekeeping"],
  housekeeping: ["housekeeping"],
};

export function can(role: Role | undefined | null, perm: Permission) {
  return !!role && PERMS[role].includes(perm);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Phone number for WhatsApp: digits only, with the country code added when missing. */
export function whatsappNumber(phone: string, countryCode = "91") {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && countryCode) digits = countryCode + digits;
  return digits;
}

export function isValidGstin(v: string) {
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test((v || "").trim().toUpperCase());
}

export const INDIAN_STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};
