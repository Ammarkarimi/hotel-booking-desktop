// Hotel settings: one value per key, merged over the defaults so new settings appear by themselves.
import { DEFAULT_GST_SLABS, parseGstSlabs, type PricingRules, type TaxRules } from "../../shared/pricing";
import { DEFAULT_ROOM_TYPES } from "../../shared/format";
import type { SeasonalRate, Settings } from "../../shared/types";
import { all, insert, run, tx } from "../db";
import { fail, log, numberIn, requirePerm, str } from "./context";

export const DEFAULT_SETTINGS: Settings = {
  hotelName: "My Hotel",
  tagline: "",
  address: "",
  city: "",
  state: "",
  pinCode: "",
  phone: "",
  email: "",
  gstin: "",
  legalName: "",
  currency: "INR",
  countryCode: "91",
  taxMode: "india_gst",
  taxRate: 12,
  gstSlabs: DEFAULT_GST_SLABS,
  extrasTaxRate: 5,
  roomPricesIncludeTax: false,
  weekendSurcharge: 0,
  checkInTime: "12:00",
  checkOutTime: "11:00",
  invoicePrefix: "INV",
  bookingTerms: "Check-in from 12 noon, check-out by 11 am. Please carry a valid photo ID for every adult. Cancellation within 24 hours of arrival is charged one night.",
  upiId: "",
  upiName: "",
  roomTypes: DEFAULT_ROOM_TYPES,
  whatsappMode: "app",
  msgBooking: "",
  msgCheckIn: "",
  msgCheckOut: "",
  msgReminder: "",
  reviewLink: "",
  staffShifts: true,
  idCheckRequired: true,
  autoBackup: true,
  backupFolder: "",
  keepBackups: 30,
};

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const row of all<{ key: string; value: string }>("SELECT key, value FROM settings")) {
    if (row.key in s) {
      try {
        (s as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value);
      } catch {
        /* keep the default */
      }
    }
  }
  s.gstSlabs = parseGstSlabs(JSON.stringify(s.gstSlabs));
  cache = s;
  return s;
}

export function clearSettingsCache() {
  cache = null;
}

function sanitize(input: Partial<Settings>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
    if (typeof def === "number") out[key] = numberIn(value, key, -100, 1e7);
    else if (typeof def === "boolean") out[key] = !!value;
    else if (typeof def === "string") out[key] = str(value, 4000);
    else out[key] = value;
  }
  if (out.gstSlabs) out.gstSlabs = parseGstSlabs(JSON.stringify(out.gstSlabs));
  if (out.roomTypes) {
    const types = (out.roomTypes as unknown[]).map((t) => str(t, 40).toLowerCase().replace(/\s+/g, "_")).filter(Boolean);
    if (!types.length) fail("Keep at least one room type");
    out.roomTypes = [...new Set(types)];
  }
  if (out.taxMode && !["india_gst", "flat", "none"].includes(out.taxMode as string)) fail("Unknown tax mode");
  if (out.whatsappMode && !["app", "web"].includes(out.whatsappMode as string)) fail("Unknown WhatsApp mode");
  if (typeof out.gstin === "string") out.gstin = (out.gstin as string).toUpperCase();
  for (const t of ["checkInTime", "checkOutTime"]) {
    if (typeof out[t] === "string" && !/^\d{2}:\d{2}$/.test(out[t] as string)) fail("Please enter times like 12:00");
  }
  return out as Partial<Settings>;
}

export function writeSettings(input: Partial<Settings>) {
  const clean = sanitize(input);
  tx(() => {
    for (const [key, value] of Object.entries(clean)) {
      run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));
    }
  });
  clearSettingsCache();
  return getSettings();
}

export function taxRules(s = getSettings()): TaxRules {
  if (s.taxMode === "none") return { taxMode: "flat", taxRate: 0, gstSlabs: s.gstSlabs, extrasTaxRate: 0 };
  return { taxMode: s.taxMode, taxRate: s.taxRate, gstSlabs: s.gstSlabs, extrasTaxRate: s.extrasTaxRate };
}

export function seasonalRates(): SeasonalRate[] {
  return all<SeasonalRate>("SELECT * FROM seasonal_rates ORDER BY startDate");
}

export function pricingRules(s = getSettings()): PricingRules {
  return { weekendSurcharge: s.weekendSurcharge, seasonalRates: seasonalRates() };
}

export const settingsApi = {
  "settings.get": () => getSettings(),
  "settings.save": (input: Partial<Settings>) => {
    requirePerm("settings");
    const s = writeSettings(input);
    log("Changed settings", Object.keys(input).join(", "));
    return s;
  },
  "seasonal.list": () => seasonalRates(),
  "seasonal.save": (input: Partial<SeasonalRate>) => {
    requirePerm("settings");
    const name = str(input.name, 80);
    if (!name) fail("Please give the price change a name, like Diwali");
    const startDate = str(input.startDate);
    const endDate = str(input.endDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) fail("Please choose both dates");
    if (endDate < startDate) fail("The last day must be on or after the first day");
    const percent = numberIn(input.percent, "Price change %", -90, 500);
    const values = { name, startDate, endDate, percent, roomType: str(input.roomType) || null };
    if (input.id) run("UPDATE seasonal_rates SET name = ?, startDate = ?, endDate = ?, percent = ?, roomType = ? WHERE id = ?", name, startDate, endDate, percent, values.roomType, input.id);
    else insert("seasonal_rates", values);
    log("Saved special prices", `${name}: ${percent > 0 ? "+" : ""}${percent}%`);
    return seasonalRates();
  },
  "seasonal.delete": ({ id }: { id: string }) => {
    requirePerm("settings");
    run("DELETE FROM seasonal_rates WHERE id = ?", id);
    return seasonalRates();
  },
};
