// Работа с SQLite через better-sqlite3
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Воссоздаем __dirname для ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Теперь твоя строка будет работать без ошибок:
const dbPath = join(__dirname, "..", "beauty-bot.db");
const db = new Database(dbPath);

// Инициализация схемы БД
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  language TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,           -- YYYY-MM-DD
  time TEXT NOT NULL,           -- HH:MM
  is_booked INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS closed_days (
  date TEXT PRIMARY KEY,        -- YYYY-MM-DD
  is_closed INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL,
  user_telegram_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active / canceled
  created_at TEXT DEFAULT (datetime('now')),
  appointment_at TEXT NOT NULL,         -- ISO datetime
  reminder_at TEXT,
  reminder_sent INTEGER DEFAULT 0,
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// Вспомогательная функция для формирования ISO-строки даты YYYY-MM-DD
function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Добавим функции для работы с настройками
function getSetting(key, defaultValue) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setSetting(key, value) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    JSON.stringify(value),
  );
}

// ---------- АВТОГЕНЕРАЦИЯ СЛОТОВ ----------
function autoGenerateSlots() {
  const workDays = getSetting("work_days", [1, 2, 3, 4, 5]);
  const startHour = getSetting("start_time", "10:00");
  const endHour = getSetting("end_time", "18:00");
  const step = getSetting("step_min", 120);
  const breaks = getSetting("breaks", []);

  const today = new Date();
  // Форматируем дату в YYYY-MM-DD для SQL
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;

  // 1. ОЧИЩАЕМ старые свободные слоты на будущее.
  // Удаляем только свободные слоты, которые НИКОГДА не использовались в бронированиях
  db.prepare(
    `
  DELETE FROM slots 
  WHERE date >= ? 
    AND is_booked = 0 
    AND id NOT IN (SELECT slot_id FROM bookings)
`,
  ).run(todayStr);

  const insert = db.prepare(
    "INSERT INTO slots (date, time, is_booked, is_active) VALUES (?, ?, 0, 1)",
  );

  // Проверяем, существует ли уже слот, чтобы не продублировать забронированные
  const checkExists = db.prepare(
    "SELECT id FROM slots WHERE date = ? AND time = ? LIMIT 1",
  );

  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);

    const dYear = d.getFullYear();
    const dMonth = String(d.getMonth() + 1).padStart(2, "0");
    const dDay = String(d.getDate()).padStart(2, "0");
    const dateStr = `${dYear}-${dMonth}-${dDay}`;

    // Генерируем только если день рабочий
    if (workDays.includes(d.getDay())) {
      let current = new Date(`${dateStr}T${startHour}:00`);
      const end = new Date(`${dateStr}T${endHour}:00`);

      while (current < end) {
        const timeStr = current.toTimeString().slice(0, 5);

        // Добавляем слот, если нет перерыва и его еще нет в базе
        if (!breaks.includes(timeStr) && !checkExists.get(dateStr, timeStr)) {
          insert.run(dateStr, timeStr);
        }
        current.setMinutes(current.getMinutes() + step);
      }
    }
  }
}

// ---------- Остальные функции (Пользователи, Слоты, Записи) ----------

function upsertUser(telegramId, fields) {
  const existing = db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(String(telegramId));
  if (existing) {
    const merged = {
      name: fields.name ?? existing.name,
      phone: fields.phone ?? existing.phone,
      language: fields.language ?? existing.language,
      is_admin:
        typeof fields.is_admin === "number"
          ? fields.is_admin
          : existing.is_admin,
      telegram_id: String(telegramId),
    };
    db.prepare(
      "UPDATE users SET name = ?, phone = ?, language = ?, is_admin = ? WHERE telegram_id = ?",
    ).run(
      merged.name,
      merged.phone,
      merged.language,
      merged.is_admin,
      merged.telegram_id,
    );
  } else {
    db.prepare(
      "INSERT INTO users (telegram_id, name, phone, language, is_admin) VALUES (?, ?, ?, ?, ?)",
    ).run(
      String(telegramId),
      fields.name || null,
      fields.phone || null,
      fields.language || null,
      fields.is_admin || 0,
    );
  }
}

function getUserByTelegramId(telegramId) {
  return db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(String(telegramId));
}

function setUserLanguage(telegramId, language) {
  upsertUser(telegramId, { language });
}

function addSlot(date, time) {
  const existing = db
    .prepare(
      "SELECT * FROM slots WHERE date = ? AND time = ? AND is_active = 1",
    )
    .get(date, time);
  if (existing) return existing.id;
  const info = db
    .prepare(
      "INSERT INTO slots (date, time, is_booked, is_active) VALUES (?, ?, 0, 1)",
    )
    .run(date, time);
  return info.lastInsertRowid;
}

function getSlotsForDate(date) {
  return db
    .prepare(
      `
    SELECT 
      s.*, 
      b.name, 
      b.phone, 
      b.status 
    FROM slots s
    LEFT JOIN bookings b ON s.id = b.slot_id
    WHERE s.date = ? AND s.is_active = 1
    ORDER BY s.time ASC
  `,
    )
    .all(date);
}

function getAvailableSlotsForDate(date) {
  return db
    .prepare(
      `SELECT s.* FROM slots s LEFT JOIN closed_days cd ON cd.date = s.date AND cd.is_closed = 1 WHERE s.date = ? AND s.is_active = 1 AND s.is_booked = 0 AND cd.date IS NULL ORDER BY s.time ASC`,
    )
    .all(date);
}

function deactivateSlot(slotId) {
  db.prepare("UPDATE slots SET is_active = 0 WHERE id = ?").run(slotId);
}
function markSlotBooked(slotId) {
  db.prepare("UPDATE slots SET is_booked = 1 WHERE id = ?").run(slotId);
}
function markSlotFree(slotId) {
  db.prepare("UPDATE slots SET is_booked = 0 WHERE id = ?").run(slotId);
}
function getSlotById(slotId) {
  return db.prepare("SELECT * FROM slots WHERE id = ?").get(slotId);
}

function getAvailableDatesWithin(startDate, endDate) {
  return db
    .prepare(
      `SELECT DISTINCT s.date FROM slots s LEFT JOIN closed_days cd ON cd.date = s.date AND cd.is_closed = 1 WHERE s.date BETWEEN ? AND ? AND s.is_active = 1 AND s.is_booked = 0 AND cd.date IS NULL ORDER BY s.date ASC`,
    )
    .all(startDate, endDate)
    .map((row) => row.date);
}

function closeDay(date) {
  db.prepare(
    "INSERT INTO closed_days (date, is_closed) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET is_closed = 1",
  ).run(date);
}
function openDay(date) {
  db.prepare(
    "INSERT INTO closed_days (date, is_closed) VALUES (?, 0) ON CONFLICT(date) DO UPDATE SET is_closed = 0",
  ).run(date);
}
function isDayClosed(date) {
  const row = db
    .prepare("SELECT is_closed FROM closed_days WHERE date = ?")
    .get(date);
  return row ? row.is_closed === 1 : false;
}

function getActiveBookingByUser(telegramId) {
  return db
    .prepare(
      `SELECT b.*, s.date, s.time FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE b.user_telegram_id = ? AND b.status = 'active' ORDER BY b.appointment_at ASC LIMIT 1`,
    )
    .get(String(telegramId));
}

const createBookingTx = db.transaction(
  (slotId, userTelegramId, name, phone, appointmentAt, reminderAt) => {
    const slot = db
      .prepare(
        "SELECT * FROM slots WHERE id = ? AND is_active = 1 AND is_booked = 0",
      )
      .get(slotId);
    if (!slot) throw new Error("SLOT_NOT_AVAILABLE");
    db.prepare("UPDATE slots SET is_booked = 1 WHERE id = ?").run(slotId);
    const info = db
      .prepare(
        `INSERT INTO bookings (slot_id, user_telegram_id, name, phone, status, appointment_at, reminder_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        slotId,
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
    params.slotId,
    params.userTelegramId,
    params.name,
    params.phone,
    params.appointmentAt,
    params.reminderAt,
  );
}

const cancelBookingTx = db.transaction((bookingId) => {
  const booking = db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .get(bookingId);
  if (!booking) return null;
  db.prepare("UPDATE bookings SET status = 'canceled' WHERE id = ?").run(
    bookingId,
  );
  db.prepare("UPDATE slots SET is_booked = 0 WHERE id = ?").run(
    booking.slot_id,
  );
  return booking;
});

function cancelBooking(bookingId) {
  return cancelBookingTx(bookingId);
}

function getBookingsForDate(date) {
  return db
    .prepare(
      `SELECT b.*, s.date, s.time, u.name AS user_name_db, u.phone AS user_phone_db FROM bookings b JOIN slots s ON s.id = b.slot_id LEFT JOIN users u ON u.telegram_id = b.user_telegram_id WHERE s.date = ? ORDER BY s.time ASC`,
    )
    .all(date);
}

function getDueReminders(nowIso) {
  return db
    .prepare(
      `SELECT b.*, u.language FROM bookings b JOIN users u ON u.telegram_id = b.user_telegram_id WHERE b.status = 'active' AND b.reminder_sent = 0 AND b.reminder_at IS NOT NULL AND b.reminder_at <= ?`,
    )
    .all(nowIso);
}

function markReminderSent(bookingId) {
  db.prepare("UPDATE bookings SET reminder_sent = 1 WHERE id = ?").run(
    bookingId,
  );
}

/**
 * Получает все активные (будущие) записи пользователя
 * @param {number|string} userId - Telegram ID пользователя
 * @returns {Array} - Список объектов записей
 */
function getAllActiveBookingsByUser(userId) {
  // Получаем текущую дату в формате ISO или YYYY-MM-DD
  // Чтобы отсечь записи, которые уже состоялись
  const today = new Date().toISOString().split("T")[0];

  const sql = `
    SELECT b.*, s.date, s.time 
    FROM bookings b
    JOIN slots s ON b.slot_id = s.id
    WHERE b.user_telegram_id = ? 
      AND s.date >= ?
    ORDER BY s.date ASC, s.time ASC
  `;

  return db.prepare(sql).all(userId, today);
}

function getAdminStats() {
  // Всего реальных пользователей (не считая админа)
  const totalUsers = db
    .prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 0")
    .get().count;

  // Реальные клиенты (не админ), которые делали хотя бы одну запись
  const activeClients = db
    .prepare(
      `
      SELECT COUNT(DISTINCT user_telegram_id) as count 
      FROM bookings 
      WHERE user_telegram_id != (SELECT telegram_id FROM users WHERE is_admin = 1 LIMIT 1)
    `,
    )
    .get().count;

  // Всего записей в системе (включая прошедшие и отмененные)
  const totalBookings = db
    .prepare("SELECT COUNT(*) as count FROM bookings")
    .get().count;

  // Записи на будущее (предстоящие)
  const today = new Date().toISOString().split("T")[0];
  const upcomingBookings = db
    .prepare(
      `
      SELECT COUNT(*) as count 
      FROM bookings b 
      JOIN slots s ON b.slot_id = s.id 
      WHERE s.date >= ? AND b.status = 'active'
    `,
    )
    .get(today).count;

  return {
    totalUsers,
    activeClients,
    totalBookings,
    upcomingBookings,
  };
}

export {
  db,
  upsertUser,
  getUserByTelegramId,
  setUserLanguage,
  addSlot,
  getSlotsForDate,
  getAvailableSlotsForDate,
  deactivateSlot,
  markSlotBooked,
  markSlotFree,
  getSlotById,
  getAvailableDatesWithin,
  closeDay,
  openDay,
  isDayClosed,
  getActiveBookingByUser,
  createBooking,
  cancelBooking,
  getBookingsForDate,
  getDueReminders,
  markReminderSent,
  autoGenerateSlots,
  getAllActiveBookingsByUser,
  getSetting,
  setSetting,
  getAdminStats,
};
