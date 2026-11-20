// Hotel stays are counted in calendar nights, so stay dates are "date keys" (YYYY-MM-DD).
// Timestamps (check-in time, payments) are ISO strings. "Today" is the computer's own date.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY_RE.test(value) && !Number.isNaN(Date.parse(value));
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** The local calendar date of a moment, as YYYY-MM-DD. */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return localDateKey(new Date());
}

/** Accepts "YYYY-MM-DD", an ISO timestamp or a Date and returns the local date key. */
export function toDateKey(value: Date | string): string {
  if (typeof value === "string" && DATE_KEY_RE.test(value)) return value;
  return localDateKey(new Date(value));
}

function utc(key: string) {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

export function addDays(key: string, days: number): string {
  const d = new Date(utc(key) + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function diffDays(fromKey: string, toKey: string): number {
  return Math.round((utc(toKey) - utc(fromKey)) / DAY_MS);
}

/** Nights charged for a stay. Same-day stays count as one night. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(1, diffDays(checkIn, checkOut));
}

/** Each night of a stay, as the date of the evening the guest sleeps there. */
export function eachNight(checkIn: string, checkOut: string): string[] {
  const count = nightsBetween(checkIn, checkOut);
  return Array.from({ length: count }, (_, i) => addDays(checkIn, i));
}

/** Day of week, 0 = Sunday. */
export function weekday(key: string): number {
  return new Date(utc(key)).getUTCDay();
}

/** Friday and Saturday nights are the weekend. */
export function isWeekendNight(key: string): boolean {
  const d = weekday(key);
  return d === 5 || d === 6;
}

/** Stays overlap when one starts before the other ends (the leaving day is free). */
export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

export function monthStart(key: string) {
  return `${key.slice(0, 7)}-01`;
}

export function monthEnd(key: string) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${key.slice(0, 7)}-${pad(last)}`;
}

/** Indian financial year of a date: "2026-27" for 1 Apr 2026 – 31 Mar 2027. */
export function financialYear(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "20 Nov 2026" */
export function formatDate(key: string | null | undefined): string {
  if (!key) return "";
  const k = toDateKey(key);
  return `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
}

/** "Fri 20 Nov" */
export function formatShortDate(key: string): string {
  const k = toDateKey(key);
  return `${DAYS[weekday(k)]} ${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`;
}

export function dayName(key: string) {
  return DAYS[weekday(key)];
}

export function monthName(key: string) {
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/** "20 Nov 2026, 2:05 pm" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${formatDate(localDateKey(d))}, ${formatTime(iso)}`;
}

/** "2:05 pm" */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? "am" : "pm"}`;
}

/** "14:00" → "2:00 pm". */
export function clockLabel(hhmm: string | null | undefined) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return hhmm ?? "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
}

/** "3h 20m" between two moments. */
export function durationLabel(fromIso: string, toIso: string = new Date().toISOString()) {
  const mins = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}
