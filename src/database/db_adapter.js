// Adapt database functions to take the database connection as the first argument
export function getUserByTelegramId(db, telegramId) {
  return db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(String(telegramId));
}

export function upsertUser(db, telegramId, fields) {
  const existing = getUserByTelegramId(db, telegramId);
  if (existing) {
    const merged = {
      name: fields.name ?? existing.name,
      phone: fields.phone ?? existing.phone,
      language: fields.language ?? existing.language,
      is_admin: typeof fields.is_admin === "number" ? fields.is_admin : existing.is_admin,
      telegram_id: String(telegramId),
    };
    db.prepare(
      "UPDATE users SET name = ?, phone = ?, language = ?, is_admin = ? WHERE telegram_id = ?"
    ).run(merged.name, merged.phone, merged.language, merged.is_admin, merged.telegram_id);
  } else {
    db.prepare(
      "INSERT INTO users (telegram_id, name, phone, language, is_admin) VALUES (?, ?, ?, ?, ?)"
    ).run(String(telegramId), fields.name || null, fields.phone || null, fields.language || null, fields.is_admin || 0);
  }
}

export function getSetting(db, key, defaultValue) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export function setSetting(db, key, value) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    JSON.stringify(value)
  );
}

export function autoGenerateSlots(db) {
  const workDays = getSetting(db, "work_days", [1, 2, 3, 4, 5]);
  const startHour = getSetting(db, "start_time", "10:00");
  const endHour = getSetting(db, "end_time", "18:00");
  const step = getSetting(db, "step_min", 60);
  const capacity = getSetting(db, "default_capacity", 1);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  db.prepare(
    `DELETE FROM slots WHERE date >= ? AND id NOT IN (SELECT slot_id FROM appointments)`
  ).run(todayStr);

  const insert = db.prepare("INSERT INTO slots (date, time, capacity, is_active) VALUES (?, ?, ?, 1)");
  const checkExists = db.prepare("SELECT id FROM slots WHERE date = ? AND time = ? LIMIT 1");

  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];

    if (workDays.includes(d.getDay())) {
      let current = new Date(`${dateStr}T${startHour}:00`);
      const end = new Date(`${dateStr}T${endHour}:00`);
      while (current < end) {
        const timeStr = current.toTimeString().slice(0, 5);
        if (!checkExists.get(dateStr, timeStr)) {
          insert.run(dateStr, timeStr, capacity);
        }
        current.setMinutes(current.getMinutes() + step);
      }
    }
  }
}

export function getAvailableSlotsForDate(db, date) {
  return db.prepare(
    `SELECT s.* FROM slots s
     LEFT JOIN closed_days cd ON cd.date = s.date AND cd.is_closed = 1
     WHERE s.date = ? AND s.is_active = 1 AND cd.date IS NULL
     AND (SELECT COUNT(*) FROM appointments a WHERE a.slot_id = s.id AND a.status = 'active') < s.capacity
     ORDER BY s.time ASC`
  ).all(date);
}

export function getSlotById(db, slotId) {
  return db.prepare("SELECT * FROM slots WHERE id = ?").get(slotId);
}

export function createAppointment(db, params) {
  const { slotId, userTelegramId, name, phone, appointmentAt, reminderAt, serviceId } = params;
  return db.prepare(
    `INSERT INTO appointments (slot_id, user_telegram_id, name, phone, appointment_at, reminder_at, service_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(slotId, String(userTelegramId), name, phone, appointmentAt, reminderAt, serviceId || null);
}

export function getBookingsForDate(db, date) {
  return db.prepare(
    `SELECT a.*, s.time FROM appointments a JOIN slots s ON s.id = a.slot_id WHERE s.date = ? AND a.status = 'active' ORDER BY s.time ASC`
  ).all(date);
}

export function getActiveBookingsByUser(db, userId) {
  return db.prepare(
    `SELECT a.*, s.date, s.time FROM appointments a JOIN slots s ON s.id = a.slot_id WHERE a.user_telegram_id = ? AND a.status = 'active' ORDER BY a.appointment_at ASC`
  ).all(String(userId));
}

export function isDayClosed(db, date) {
  const row = db.prepare("SELECT is_closed FROM closed_days WHERE date = ?").get(date);
  return row ? row.is_closed === 1 : false;
}

export function closeDay(db, date) {
  db.prepare("INSERT OR REPLACE INTO closed_days (date, is_closed) VALUES (?, 1)").run(date);
}

export function openDay(db, date) {
  db.prepare("INSERT OR REPLACE INTO closed_days (date, is_closed) VALUES (?, 0)").run(date);
}

export function addSlot(db, date, time) {
  db.prepare("INSERT INTO slots (date, time, capacity, is_active) VALUES (?, ?, 1, 1)").run(date, time);
}

export function getAdminStats(db) {
  const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 0").get().count;
  const totalBookings = db.prepare("SELECT COUNT(*) as count FROM appointments").get().count;
  return { totalUsers, totalBookings, activeClients: totalUsers, upcomingBookings: totalBookings };
}

export function cancelBooking(db, bookingId) {
  db.prepare("UPDATE appointments SET status = 'canceled' WHERE id = ?").run(bookingId);
  return db.prepare("SELECT a.*, s.date, s.time FROM appointments a JOIN slots s ON s.id = a.slot_id WHERE a.id = ?").get(bookingId);
}

export function getDueReminders(db, nowIso) {
  return db.prepare(
    `SELECT a.*, u.language FROM appointments a JOIN users u ON u.telegram_id = a.user_telegram_id WHERE a.status = 'active' AND a.reminder_sent = 0 AND a.reminder_at IS NOT NULL AND a.reminder_at <= ?`
  ).all(nowIso);
}

export function markReminderSent(db, appointmentId) {
  db.prepare("UPDATE appointments SET reminder_sent = 1 WHERE id = ?").run(appointmentId);
}
