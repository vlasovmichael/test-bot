import { getSetting, setSetting } from "../database/db_adapter.js";

export function generateSlots(db) {
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
