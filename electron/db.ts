// The hotel's database: one SQLite file on this computer (node:sqlite, built into Electron).
// Every change runs through these helpers so values are converted the same way everywhere.
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

let db: DatabaseSync | null = null;
let dbFile = "";

export function openDatabase(file: string) {
  dbFile = file;
  db = new DatabaseSync(file);
  // WAL with synchronous=NORMAL is safe against power cuts for a single-PC app and much faster to save.
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -16000;");
  stmts.clear();
  migrate();
  return db;
}

export function closeDatabase() {
  if (db) {
    try {
      db.exec("PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      /* ignore */
    }
    stmts.clear();
    db.close();
    db = null;
  }
}

export function databaseFile() {
  return dbFile;
}

export function conn(): DatabaseSync {
  if (!db) throw new Error("The database is not open");
  return db;
}

type Param = SQLInputValue | boolean | undefined;

function clean(params: Param[]): SQLInputValue[] {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
}

// Prepared statements are kept and reused: most screens run the same queries again and again.
const stmts = new Map<string, StatementSync>();
function prep(sql: string): StatementSync {
  let s = stmts.get(sql);
  if (!s) {
    s = conn().prepare(sql);
    if (stmts.size > 500) stmts.clear();
    stmts.set(sql, s);
  }
  return s;
}

export function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): T[] {
  return prep(sql).all(...clean(params)) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: Param[]): T | undefined {
  return prep(sql).get(...clean(params)) as T | undefined;
}

export function run(sql: string, ...params: Param[]) {
  return prep(sql).run(...clean(params));
}

export function scalar<T = number>(sql: string, ...params: Param[]): T {
  const row = prep(sql).get(...clean(params)) as Record<string, unknown> | undefined;
  return (row ? Object.values(row)[0] : null) as T;
}

let depth = 0;
/** Runs fn in one transaction: everything is saved, or nothing is. */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  const c = conn();
  c.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const result = fn();
    c.exec("COMMIT");
    return result;
  } catch (err) {
    c.exec("ROLLBACK");
    throw err;
  } finally {
    depth--;
  }
}

/** INSERT from an object; returns the id. */
export function insert(table: string, values: Record<string, Param>): string {
  const row = { id: (values.id as string) || randomUUID(), ...values };
  const keys = Object.keys(row);
  run(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, ...keys.map((k) => row[k as keyof typeof row] as Param));
  return row.id as string;
}

/** UPDATE the given columns of one row. */
export function update(table: string, id: string, values: Record<string, Param>) {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => values[k]), id);
}

export function getMeta(key: string): string | null {
  return get<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)?.value ?? null;
}

export function setMeta(key: string, value: string) {
  run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

export function nextSeq(key: string, start: number): number {
  const current = Number(getMeta(key) ?? start);
  const next = current + 1;
  setMeta(key, String(next));
  return next;
}

/**
 * The current moment as a local ISO timestamp with the UTC offset ("2026-11-20T23:10:05.123+05:30"),
 * so its first 10 characters are the local date and SQL can group by day.
 */
export function now(d: Date = new Date()) {
  const p = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}${off >= 0 ? "+" : "-"}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

export const newId = () => randomUUID();

// ---------------------------------------------------------------------------------------------
// Schema. Each entry runs once, in order; never edit one that has shipped, add a new one instead.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE staff (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'front_desk',
    phone TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    lastLoginAt TEXT
  );

  CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    roomNumber TEXT NOT NULL,
    type TEXT NOT NULL,
    floor TEXT,
    capacity INTEGER NOT NULL DEFAULT 2,
    pricePerNight REAL NOT NULL DEFAULT 0,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    housekeeping TEXT NOT NULL DEFAULT 'clean',
    housekeeper TEXT,
    hkNotes TEXT,
    hkUpdatedAt TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE guests (
    id TEXT PRIMARY KEY,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT,
    gender TEXT,
    dateOfBirth TEXT,
    nationality TEXT NOT NULL DEFAULT 'Indian',
    address TEXT,
    city TEXT,
    state TEXT,
    pinCode TEXT,
    company TEXT,
    gstin TEXT,
    idType TEXT,
    idLast4 TEXT,
    passportNo TEXT,
    visaNo TEXT,
    notes TEXT,
    vip INTEGER NOT NULL DEFAULT 0,
    blacklisted INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX guests_phone ON guests (phone);

  CREATE TABLE bookings (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    guestId TEXT NOT NULL REFERENCES guests (id),
    roomId TEXT NOT NULL REFERENCES rooms (id),
    checkInDate TEXT NOT NULL,
    checkOutDate TEXT NOT NULL,
    actualCheckIn TEXT,
    actualCheckOut TEXT,
    status TEXT NOT NULL DEFAULT 'reserved',
    source TEXT NOT NULL DEFAULT 'walk_in',
    otaReference TEXT,
    ratePerNight REAL NOT NULL DEFAULT 0,
    fixedRate INTEGER NOT NULL DEFAULT 0,
    gstRate REAL,
    pricesIncludeTax INTEGER NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    adults INTEGER NOT NULL DEFAULT 1,
    children INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    cancelReason TEXT,
    comingFrom TEXT,
    goingTo TEXT,
    purpose TEXT,
    vehicleNumber TEXT,
    companions TEXT NOT NULL DEFAULT '[]',
    createdBy TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX bookings_room_dates ON bookings (roomId, checkInDate, checkOutDate);
  CREATE INDEX bookings_status ON bookings (status);
  CREATE INDEX bookings_guest ON bookings (guestId);

  CREATE TABLE charges (
    id TEXT PRIMARY KEY,
    bookingId TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'other',
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unitPrice REAL NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    addedBy TEXT
  );
  CREATE INDEX charges_booking ON charges (bookingId);

  CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    bookingId TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'payment',
    reference TEXT,
    notes TEXT,
    receivedBy TEXT,
    shiftId TEXT,
    paidAt TEXT NOT NULL
  );
  CREATE INDEX payments_booking ON payments (bookingId);
  CREATE INDEX payments_paid_at ON payments (paidAt);

  CREATE TABLE bills (
    id TEXT PRIMARY KEY,
    bookingId TEXT NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE CASCADE,
    invoiceNumber TEXT NOT NULL UNIQUE,
    invoiceDate TEXT NOT NULL,
    nights INTEGER NOT NULL,
    roomCharges REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    roomTaxable REAL NOT NULL,
    roomTaxRate REAL NOT NULL DEFAULT 0,
    roomTax REAL NOT NULL DEFAULT 0,
    extras REAL NOT NULL DEFAULT 0,
    extrasTaxRate REAL NOT NULL DEFAULT 0,
    extrasTax REAL NOT NULL DEFAULT 0,
    totalAmount REAL NOT NULL,
    generatedAt TEXT NOT NULL
  );

  CREATE TABLE id_checks (
    id TEXT PRIMARY KEY,
    bookingId TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    person TEXT NOT NULL,
    idType TEXT NOT NULL,
    idLast4 TEXT,
    checkedBy TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE shifts (
    id TEXT PRIMARY KEY,
    staffId TEXT,
    staffName TEXT NOT NULL,
    startedAt TEXT NOT NULL,
    endedAt TEXT,
    startNote TEXT,
    handoverNote TEXT,
    cashCounted REAL,
    closedBy TEXT,
    summary TEXT
  );
  CREATE INDEX shifts_started ON shifts (startedAt);

  CREATE TABLE activity (
    id TEXT PRIMARY KEY,
    staffId TEXT,
    staffName TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    bookingId TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX activity_created ON activity (createdAt);

  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    bookingId TEXT,
    guestId TEXT,
    kind TEXT NOT NULL,
    phone TEXT NOT NULL,
    text TEXT NOT NULL,
    sentBy TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX messages_booking ON messages (bookingId);

  CREATE TABLE seasonal_rates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    roomType TEXT,
    percent REAL NOT NULL
  );

  CREATE TABLE hk_log (
    id TEXT PRIMARY KEY,
    roomId TEXT NOT NULL,
    status TEXT NOT NULL,
    staffName TEXT NOT NULL,
    notes TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX hk_log_created ON hk_log (createdAt);
  `,
  // 2: Pathik (the Gujarat police guest register): which stays are entered, and the details it asks for.
  `
  ALTER TABLE bookings ADD COLUMN pathikAt TEXT;
  ALTER TABLE bookings ADD COLUMN pathikBy TEXT;
  ALTER TABLE bookings ADD COLUMN vehicleType TEXT;
  ALTER TABLE guests ADD COLUMN district TEXT;
  ALTER TABLE guests ADD COLUMN locality TEXT;
  `,
  // Indexes for the dashboard, reports, Pathik list and booking pages.
  `
  CREATE INDEX IF NOT EXISTS bookings_checkin ON bookings (checkInDate);
  CREATE INDEX IF NOT EXISTS bookings_checkout ON bookings (checkOutDate);
  CREATE INDEX IF NOT EXISTS bookings_actual_out ON bookings (actualCheckOut);
  CREATE INDEX IF NOT EXISTS bills_invoice_date ON bills (invoiceDate);
  CREATE INDEX IF NOT EXISTS id_checks_booking ON id_checks (bookingId);
  CREATE INDEX IF NOT EXISTS activity_booking ON activity (bookingId);
  CREATE INDEX IF NOT EXISTS guests_name ON guests (firstName, lastName);
  `,
];

function migrate() {
  const c = conn();
  c.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = c.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) c.prepare("INSERT INTO schema_version (version) VALUES (0)").run();
  while (version < MIGRATIONS.length) {
    c.exec("BEGIN");
    try {
      c.exec(MIGRATIONS[version]);
      version++;
      c.prepare("UPDATE schema_version SET version = ?").run(version);
      c.exec("COMMIT");
    } catch (err) {
      c.exec("ROLLBACK");
      throw err;
    }
  }
}
