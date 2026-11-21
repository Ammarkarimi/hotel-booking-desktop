// Shapes of the records passed between the database (main process) and the screens.
import type { Folio, GstSlab } from "./pricing";

export type Role = "owner" | "manager" | "front_desk" | "housekeeping";
export type BookingStatus = "reserved" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type Housekeeping = "clean" | "dirty" | "cleaning" | "inspect";

export interface Settings {
  hotelName: string;
  tagline: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  phone: string;
  email: string;
  gstin: string;
  legalName: string;
  currency: string;
  countryCode: string; // for WhatsApp numbers typed without one, e.g. "91"
  taxMode: "india_gst" | "flat" | "none";
  taxRate: number; // used when taxMode = flat
  gstSlabs: GstSlab[];
  extrasTaxRate: number;
  roomPricesIncludeTax: boolean;
  weekendSurcharge: number;
  checkInTime: string;
  checkOutTime: string;
  invoicePrefix: string;
  bookingTerms: string;
  upiId: string;
  upiName: string;
  roomTypes: string[];
  // WhatsApp
  whatsappMode: "app" | "web";
  msgBooking: string;
  msgCheckIn: string;
  msgCheckOut: string;
  msgReminder: string;
  reviewLink: string;
  // Front desk
  staffShifts: boolean;
  idCheckRequired: boolean;
  // Pathik (Gujarat police guest register)
  pathik: boolean;
  pathikUrl: string;
  pathikDateFormat: string; // dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, mm/dd/yyyy
  pathikTimeFormat: "12h" | "24h";
  // Backups
  autoBackup: boolean;
  backupFolder: string;
  keepBackups: number;
}

export interface Staff {
  id: string;
  name: string;
  username: string;
  role: Role;
  phone: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Room {
  id: string;
  roomNumber: string;
  type: string;
  floor: string | null;
  capacity: number;
  pricePerNight: number;
  description: string | null;
  status: "available" | "maintenance";
  housekeeping: Housekeeping;
  housekeeper: string | null;
  hkNotes: string | null;
  hkUpdatedAt: string | null;
  sortOrder: number;
}

export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  nationality: string;
  address: string | null;
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pinCode: string | null;
  company: string | null;
  gstin: string | null;
  idType: string | null;
  idLast4: string | null;
  passportNo: string | null;
  visaNo: string | null;
  notes: string | null;
  vip: boolean;
  blacklisted: boolean;
  createdAt: string;
}

export interface GuestSummary extends Guest {
  stays: number;
  nights: number;
  spent: number;
  lastStay: string | null;
}

export interface Companion {
  name: string;
  phone?: string;
}

export interface Booking {
  id: string;
  number: number;
  guestId: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  status: BookingStatus;
  source: string;
  otaReference: string | null;
  ratePerNight: number;
  fixedRate: boolean;
  gstRate: number | null;
  pricesIncludeTax: boolean;
  discount: number;
  adults: number;
  children: number;
  notes: string | null;
  cancelReason: string | null;
  comingFrom: string | null;
  goingTo: string | null;
  purpose: string | null;
  vehicleNumber: string | null;
  vehicleType: string | null; // four_wheeler, two_wheeler, bus, auto, other, none
  pathikAt: string | null; // when the stay was marked as entered in Pathik
  pathikBy: string | null;
  companions: Companion[];
  createdBy: string | null;
  createdAt: string;
}

export interface Charge {
  id: string;
  bookingId: string;
  category: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  date: string;
  addedBy: string | null;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  method: string;
  type: "advance" | "payment" | "refund";
  reference: string | null;
  notes: string | null;
  receivedBy: string | null;
  paidAt: string;
}

export interface Bill {
  id: string;
  bookingId: string;
  invoiceNumber: string;
  invoiceDate: string;
  nights: number;
  roomCharges: number;
  discount: number;
  roomTaxable: number;
  roomTaxRate: number;
  roomTax: number;
  extras: number;
  extrasTaxRate: number;
  extrasTax: number;
  totalAmount: number;
  generatedAt: string;
}

export interface IdCheck {
  id: string;
  bookingId: string;
  person: string;
  idType: string;
  idLast4: string | null;
  checkedBy: string;
  createdAt: string;
}

export interface MessageLog {
  id: string;
  bookingId: string | null;
  guestId: string | null;
  kind: string;
  phone: string;
  text: string;
  sentBy: string;
  createdAt: string;
}

export interface FullBooking extends Booking {
  guest: Guest;
  room: Room;
  charges: Charge[];
  payments: Payment[];
  bill: Bill | null;
  idChecks: IdCheck[];
  messages: MessageLog[];
  folio: Folio;
  guestName: string;
}

/** A booking row in lists, the calendar and the dashboard. */
export interface BookingRow extends Booking {
  guestName: string;
  guestPhone: string;
  vip: boolean;
  roomNumber: string;
  roomType: string;
  total: number;
  paid: number;
  balance: number;
  invoiceNumber: string | null;
  idsChecked: number;
}

export interface Shift {
  id: string;
  staffId: string | null;
  staffName: string;
  startedAt: string;
  endedAt: string | null;
  startNote: string | null;
  handoverNote: string | null;
  cashCounted: number | null;
  closedBy: string | null;
  summary: ShiftSummary | null;
}

export interface ShiftSummary {
  checkIns: number;
  checkOuts: number;
  bookings: number;
  received: number;
  refunded: number;
  cash: number;
  byMethod: Record<string, number>;
}

export interface ActivityEntry {
  id: string;
  staffName: string;
  action: string;
  details: string | null;
  createdAt: string;
}

export interface SeasonalRate {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  roomType: string | null;
  percent: number;
}

export interface Session {
  staff: Staff;
  shift: Shift | null;
}

export type LicenseState = "trial" | "active" | "grace" | "expired" | "invalid";

export interface LicenseInfo {
  state: LicenseState;
  plan: string | null; // monthly, yearly, trial
  licensedTo: string | null;
  expiresOn: string | null; // YYYY-MM-DD
  daysLeft: number;
  machineCode: string;
  message: string;
  canUse: boolean;
}

export interface AppInfo {
  version: string;
  dataFolder: string;
  databaseFile: string;
  firstRun: boolean;
  license: LicenseInfo;
}
