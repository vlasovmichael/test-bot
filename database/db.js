import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DB_NAME, TENANT_ID } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, "..", DB_NAME);
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Multi-tenant Generic Schema
db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  price REAL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  language TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, telegram_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  date TEXT NOT NULL,           -- YYYY-MM-DD
  time TEXT NOT NULL,           -- HH:MM
  is_booked INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS closed_days (
  tenant_id TEXT NOT NULL,
  date TEXT NOT NULL,           -- YYYY-MM-DD
  is_closed INTEGER DEFAULT 1,
  PRIMARY KEY (tenant_id, date),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  slot_id INTEGER NOT NULL,
  service_id INTEGER,
  user_telegram_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active / canceled
  created_at TEXT DEFAULT (datetime('now')),
  appointment_at TEXT NOT NULL,         -- ISO datetime
  reminder_at TEXT,
  reminder_sent INTEGER DEFAULT 0,
  google_event_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (slot_id) REFERENCES slots(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS settings (
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (tenant_id, key),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS google_auth (
  tenant_id TEXT PRIMARY KEY,
  access_token TEXT,
  refresh_token TEXT,
  expiry_date INTEGER,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
`);

// Ensure default tenant exists
db.prepare("INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)").run(TENANT_ID, "Default Tenant");

// ---------- Multi-tenant Scoped Functions ----------

function getSetting(tenantId, key, defaultValue) {
  const row = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = ?").get(tenantId, key);
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setSetting(tenantId, key, value) {
  db.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES (?, ?, ?)").run(
    tenantId,
    key,
    JSON.stringify(value),
  );
}

function upsertUser(tenantId, telegramId, fields) {
  const existing = db
    .prepare("SELECT * FROM users WHERE tenant_id = ? AND telegram_id = ?")
    .get(tenantId, String(telegramId));
  if (existing) {
    db.prepare(
      "UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), language = COALESCE(?, language), is_admin = COALESCE(?, is_admin) WHERE tenant_id = ? AND telegram_id = ?",
    ).run(
      fields.name ?? null,
      fields.phone ?? null,
      fields.language ?? null,
      fields.is_admin ?? null,
      tenantId,
      String(telegramId),
    );
  } else {
    db.prepare(
      "INSERT INTO users (tenant_id, telegram_id, name, phone, language, is_admin) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      tenantId,
      String(telegramId),
      fields.name || null,
      fields.phone || null,
      fields.language || null,
      fields.is_admin || 0,
    );
  }
}

function getUserByTelegramId(tenantId, telegramId) {
  return db
    .prepare("SELECT * FROM users WHERE tenant_id = ? AND telegram_id = ?")
    .get(tenantId, String(telegramId));
}

function getAvailableSlotsForDate(tenantId, date) {
  return db
    .prepare(
      `SELECT s.* FROM slots s
       LEFT JOIN closed_days cd ON cd.tenant_id = s.tenant_id AND cd.date = s.date AND cd.is_closed = 1
       WHERE s.tenant_id = ? AND s.date = ? AND s.is_active = 1 AND s.is_booked = 0 AND cd.date IS NULL
       ORDER BY s.time ASC`,
    )
    .all(tenantId, date);
}

function getSlotById(tenantId, slotId) {
  return db.prepare("SELECT * FROM slots WHERE tenant_id = ? AND id = ?").get(tenantId, slotId);
}

function addSlot(tenantId, date, time) {
  const existing = db.prepare("SELECT * FROM slots WHERE tenant_id = ? AND date = ? AND time = ?").get(tenantId, date, time);
  if (existing) return existing.id;
  const info = db.prepare("INSERT INTO slots (tenant_id, date, time, is_booked, is_active) VALUES (?, ?, ?, 0, 1)").run(tenantId, date, time);
  return info.lastInsertRowid;
}

function getSlotsForDate(tenantId, date) {
  return db.prepare("SELECT * FROM slots WHERE tenant_id = ? AND date = ?").all(tenantId, date);
}

const createBookingTx = db.transaction(
  (tenantId, slotId, serviceId, userTelegramId, name, phone, appointmentAt, reminderAt) => {
    const slot = db
      .prepare(
        "SELECT * FROM slots WHERE tenant_id = ? AND id = ? AND is_active = 1 AND is_booked = 0",
      )
      .get(tenantId, slotId);
    if (!slot) throw new Error("SLOT_NOT_AVAILABLE");
    db.prepare("UPDATE slots SET is_booked = 1 WHERE tenant_id = ? AND id = ?").run(tenantId, slotId);
    const info = db
      .prepare(
        `INSERT INTO bookings (tenant_id, slot_id, service_id, user_telegram_id, name, phone, status, appointment_at, reminder_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        tenantId,
        slotId,
        serviceId || null,
        String(userTelegramId),
        name,
        phone,
        appointmentAt,
        reminderAt || null,
      );
    return info.lastInsertRowid;
  },
);

function createBooking(params) {
  return createBookingTx(
    params.tenantId,
    params.slotId,
    params.serviceId,
    params.userTelegramId,
    params.name,
    params.phone,
    params.appointmentAt,
    params.reminderAt,
  );
}

const cancelBookingTx = db.transaction((tenantId, bookingId) => {
  const booking = db
    .prepare("SELECT * FROM bookings WHERE tenant_id = ? AND id = ?")
    .get(tenantId, bookingId);
  if (!booking) return null;
  db.prepare("UPDATE bookings SET status = 'canceled' WHERE tenant_id = ? AND id = ?").run(
    tenantId,
    bookingId,
  );
  db.prepare("UPDATE slots SET is_booked = 0 WHERE tenant_id = ? AND id = ?").run(
    tenantId,
    booking.slot_id,
  );
  return booking;
});

function cancelBooking(tenantId, bookingId) {
  return cancelBookingTx(tenantId, bookingId);
}

function openDay(tenantId, date) {
  db.prepare("INSERT INTO closed_days (tenant_id, date, is_closed) VALUES (?, ?, 0) ON CONFLICT(tenant_id, date) DO UPDATE SET is_closed = 0").run(tenantId, date);
}

function closeDay(tenantId, date) {
  db.prepare("INSERT INTO closed_days (tenant_id, date, is_closed) VALUES (?, ?, 1) ON CONFLICT(tenant_id, date) DO UPDATE SET is_closed = 1").run(tenantId, date);
}

function isDayClosed(tenantId, date) {
  const row = db.prepare("SELECT is_closed FROM closed_days WHERE tenant_id = ? AND date = ?").get(tenantId, date);
  return row ? row.is_closed === 1 : false;
}

function getBookingsForDate(tenantId, date) {
  return db.prepare("SELECT b.*, s.time FROM bookings b JOIN slots s ON b.slot_id = s.id WHERE b.tenant_id = ? AND s.date = ?").all(tenantId, date);
}

function autoGenerateSlots(tenantId) {
  const workDays = getSetting(tenantId, "work_days", [1, 2, 3, 4, 5]);
  const startHour = getSetting(tenantId, "start_time", "10:00");
  const endHour = getSetting(tenantId, "end_time", "18:00");
  const step = getSetting(tenantId, "step_min", 60);

  const today = new Date().toISOString().split("T")[0];
  db.prepare("DELETE FROM slots WHERE tenant_id = ? AND date >= ? AND is_booked = 0 AND id NOT IN (SELECT slot_id FROM bookings)").run(tenantId, today);

  const insert = db.prepare("INSERT INTO slots (tenant_id, date, time, is_booked, is_active) VALUES (?, ?, ?, 0, 1)");
  const checkExists = db.prepare("SELECT id FROM slots WHERE tenant_id = ? AND date = ? AND time = ? LIMIT 1");

  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];

    if (workDays.includes(d.getDay() === 0 ? 7 : d.getDay())) { // Adjusted for 1(Mon)-7(Sun) if necessary
      let current = new Date(`${dateStr}T${startHour}:00`);
      const end = new Date(`${dateStr}T${endHour}:00`);

      while (current < end) {
        const timeStr = current.toTimeString().slice(0, 5);
        if (!checkExists.get(tenantId, dateStr, timeStr)) {
          insert.run(tenantId, dateStr, timeStr);
        }
        current.setMinutes(current.getMinutes() + step);
      }
    }
  }
}

// Generic Service functions
function getCategories(tenantId) {
  return db.prepare("SELECT * FROM categories WHERE tenant_id = ?").all(tenantId);
}

function getServicesByCategory(tenantId, categoryId) {
  return db.prepare("SELECT * FROM services WHERE tenant_id = ? AND category_id = ?").all(tenantId, categoryId);
}

function getServiceById(tenantId, serviceId) {
  return db.prepare("SELECT * FROM services WHERE tenant_id = ? AND id = ?").get(tenantId, serviceId);
}

function getAdminStats(tenantId) {
  const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND is_admin = 0").get(tenantId).count;
  const activeClients = db.prepare(`SELECT COUNT(DISTINCT user_telegram_id) as count FROM bookings WHERE tenant_id = ?`).get(tenantId).count;
  const totalBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE tenant_id = ?").get(tenantId).count;
  const today = new Date().toISOString().split("T")[0];
  const upcomingBookings = db.prepare(`SELECT COUNT(*) as count FROM bookings b JOIN slots s ON b.slot_id = s.id WHERE b.tenant_id = ? AND s.date >= ? AND b.status = 'active'`).get(tenantId, today).count;

  return { totalUsers, activeClients, totalBookings, upcomingBookings };
}

export {
  db,
  getSetting,
  setSetting,
  upsertUser,
  getUserByTelegramId,
  getAvailableSlotsForDate,
  getSlotById,
  createBooking,
  cancelBooking,
  getCategories,
  getServicesByCategory,
  getServiceById,
  getAdminStats,
  openDay,
  closeDay,
  isDayClosed,
  getSlotsForDate,
  addSlot,
  getBookingsForDate,
  autoGenerateSlots,
};
