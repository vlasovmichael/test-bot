import { getTenantDb } from "./tenant_factory.js";
import { generateSlots } from "../services/slot_generator.js";

function getSetting(tenantId, key, defaultValue) {
  const db = getTenantDb(tenantId);
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!row) return defaultValue;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function setSetting(tenantId, key, value) {
  const db = getTenantDb(tenantId);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
}

function upsertUser(tenantId, telegramId, fields) {
  const db = getTenantDb(tenantId);
  const existing = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(String(telegramId));
  if (existing) {
    db.prepare("UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), language = COALESCE(?, language), is_admin = COALESCE(?, is_admin) WHERE telegram_id = ?").run(fields.name ?? null, fields.phone ?? null, fields.language ?? null, fields.is_admin ?? null, String(telegramId));
  } else {
    db.prepare("INSERT INTO users (telegram_id, name, phone, language, is_admin) VALUES (?, ?, ?, ?, ?)").run(String(telegramId), fields.name || null, fields.phone || null, fields.language || null, fields.is_admin || 0);
  }
}

function getUserByTelegramId(tenantId, telegramId) {
  const db = getTenantDb(tenantId);
  return db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(String(telegramId));
}

function getAvailableSlotsForDate(tenantId, date) {
  const db = getTenantDb(tenantId);
  return db.prepare("SELECT s.* FROM slots s LEFT JOIN closed_days cd ON cd.date = s.date AND cd.is_closed = 1 WHERE s.date = ? AND s.is_active = 1 AND s.is_booked = 0 AND cd.date IS NULL ORDER BY s.time ASC").all(date);
}

function getSlotById(tenantId, slotId) {
  const db = getTenantDb(tenantId);
  return db.prepare("SELECT * FROM slots WHERE id = ?").get(slotId);
}

function addSlot(tenantId, date, time) {
  const db = getTenantDb(tenantId);
  const existing = db.prepare("SELECT * FROM slots WHERE date = ? AND time = ?").get(date, time);
  if (existing) return existing.id;
  return db.prepare("INSERT INTO slots (date, time, is_booked, is_active) VALUES (?, ?, 0, 1)").run(date, time).lastInsertRowid;
}

function getSlotsForDate(tenantId, date) {
  const db = getTenantDb(tenantId);
  return db.prepare("SELECT * FROM slots WHERE date = ?").all(date);
}

function createBooking(params) {
  const db = getTenantDb(params.tenantId);
  const tx = db.transaction((slotId, serviceId, userTelegramId, name, phone, appointmentAt, reminderAt) => {
    const slot = db.prepare("SELECT * FROM slots WHERE id = ? AND is_active = 1 AND is_booked = 0").get(slotId);
    if (!slot) throw new Error("SLOT_NOT_AVAILABLE");
    db.prepare("UPDATE slots SET is_booked = 1 WHERE id = ?").run(slotId);
    return db.prepare("INSERT INTO bookings (slot_id, service_id, user_telegram_id, name, phone, status, appointment_at, reminder_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)").run(slotId, serviceId || null, String(userTelegramId), name, phone, appointmentAt, reminderAt || null).lastInsertRowid;
  });
  return tx(params.slotId, params.serviceId, params.userTelegramId, params.name, params.phone, params.appointmentAt, params.reminderAt);
}

function cancelBooking(tenantId, bookingId) {
  const db = getTenantDb(tenantId);
  const tx = db.transaction((id) => {
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
    if (!booking) return null;
    db.prepare("UPDATE bookings SET status = 'canceled' WHERE id = ?").run(id);
    db.prepare("UPDATE slots SET is_booked = 0 WHERE id = ?").run(booking.slot_id);
    return booking;
  });
  return tx(bookingId);
}

function openDay(tenantId, date) {
  getTenantDb(tenantId).prepare("INSERT INTO closed_days (date, is_closed) VALUES (?, 0) ON CONFLICT(date) DO UPDATE SET is_closed = 0").run(date);
}

function closeDay(tenantId, date) {
  getTenantDb(tenantId).prepare("INSERT INTO closed_days (date, is_closed) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET is_closed = 1").run(date);
}

function isDayClosed(tenantId, date) {
  const row = getTenantDb(tenantId).prepare("SELECT is_closed FROM closed_days WHERE date = ?").get(date);
  return row ? row.is_closed === 1 : false;
}

function getBookingsForDate(tenantId, date) {
  return getTenantDb(tenantId).prepare("SELECT b.*, s.time FROM bookings b JOIN slots s ON b.slot_id = s.id WHERE s.date = ?").all(date);
}

function autoGenerateSlots(tenantId) {
  const db = getTenantDb(tenantId);
  const config = {
    work_days: getSetting(tenantId, "work_days", [1, 2, 3, 4, 5]),
    start_time: getSetting(tenantId, "start_time", "10:00"),
    end_time: getSetting(tenantId, "end_time", "18:00"),
    step_min: getSetting(tenantId, "step_min", 60),
    timezone: getSetting(tenantId, "timezone", "Europe/Warsaw")
  };

  const slots = generateSlots(config);

  const today = new Date().toISOString().split("T")[0];
  db.prepare("DELETE FROM slots WHERE date >= ? AND is_booked = 0 AND id NOT IN (SELECT slot_id FROM bookings)").run(today);

  const insert = db.prepare("INSERT INTO slots (date, time, is_booked, is_active) VALUES (?, ?, 0, 1)");
  const checkExists = db.prepare("SELECT id FROM slots WHERE date = ? AND time = ? LIMIT 1");

  for (const s of slots) {
    if (!checkExists.get(s.date, s.time)) {
      insert.run(s.date, s.time);
    }
  }
}

function getCategories(tenantId) {
  return getTenantDb(tenantId).prepare("SELECT * FROM categories").all();
}

function getServicesByCategory(tenantId, categoryId) {
  return getTenantDb(tenantId).prepare("SELECT * FROM services WHERE category_id = ?").all(categoryId);
}

function getServiceById(tenantId, serviceId) {
  return getTenantDb(tenantId).prepare("SELECT * FROM services WHERE id = ?").get(serviceId);
}

function getAdminStats(tenantId) {
  const db = getTenantDb(tenantId);
  const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 0").get().count;
  const activeClients = db.prepare("SELECT COUNT(DISTINCT user_telegram_id) as count FROM bookings").get().count;
  const totalBookings = db.prepare("SELECT COUNT(*) as count FROM bookings").get().count;
  const today = new Date().toISOString().split("T")[0];
  const upcomingBookings = db.prepare("SELECT COUNT(*) as count FROM bookings b JOIN slots s ON b.slot_id = s.id WHERE s.date >= ? AND b.status = 'active'").get(today).count;
  return { totalUsers, activeClients, totalBookings, upcomingBookings };
}

export { getSetting, setSetting, upsertUser, getUserByTelegramId, getAvailableSlotsForDate, getSlotById, createBooking, cancelBooking, getCategories, getServicesByCategory, getServiceById, getAdminStats, openDay, closeDay, isDayClosed, getSlotsForDate, addSlot, getBookingsForDate, autoGenerateSlots };
