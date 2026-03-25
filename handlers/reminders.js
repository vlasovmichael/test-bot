import cron from "node-cron";
import { db } from "../database/db.js";
import { t } from "../i18n.js";
import { DateTime } from "luxon";

function getDueReminders(nowIso) {
  return db.prepare(`
    SELECT b.*, u.language, t.timezone
    FROM bookings b
    JOIN users u ON u.tenant_id = b.tenant_id AND u.telegram_id = b.user_telegram_id
    JOIN tenants t ON t.id = b.tenant_id
    WHERE b.status = 'active' AND b.reminder_sent = 0 AND b.reminder_at IS NOT NULL AND b.reminder_at <= ?
  `).all(nowIso);
}

function markReminderSent(bookingId) {
  db.prepare("UPDATE bookings SET reminder_sent = 1 WHERE id = ?").run(bookingId);
}

function startReminderScheduler(bot) {
  cron.schedule("* * * * *", async () => {
    const nowIso = DateTime.now().toISO();
    const due = getDueReminders(nowIso);
    for (const row of due) {
      try {
        const lang = row.language || "en";
        const appointment = DateTime.fromISO(row.appointment_at, { zone: row.timezone });
        const dateStr = appointment.toFormat("dd.MM.yyyy");
        const timeStr = appointment.toFormat("HH:mm");

        await bot.api.sendMessage(
          row.user_telegram_id,
          t(lang, "reminder_text", { date: dateStr, time: timeStr }),
          { parse_mode: "HTML" }
        );

        markReminderSent(row.id);
      } catch (e) {
        console.error(`Error sending reminder for booking ${row.id}:`, e);
        markReminderSent(row.id);
      }
    }
  });
}

export { startReminderScheduler };
