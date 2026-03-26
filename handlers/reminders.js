import cron from "node-cron";
import { getAllTenants } from "../database/master_db.js";
import { getTenantDb } from "../database/tenant_factory.js";
import { t } from "../i18n.js";
import { DateTime } from "luxon";

function getDueReminders(db, nowIso) {
  return db.prepare(`
    SELECT b.*, u.language
    FROM bookings b
    JOIN users u ON u.telegram_id = b.user_telegram_id
    WHERE b.status = 'active' AND b.reminder_sent = 0 AND b.reminder_at IS NOT NULL AND b.reminder_at <= ?
  `).all(nowIso);
}

function markReminderSent(db, bookingId) {
  db.prepare("UPDATE bookings SET reminder_sent = 1 WHERE id = ?").run(bookingId);
}

function startReminderScheduler(bot) {
  cron.schedule("* * * * *", async () => {
    const nowIso = DateTime.now().toISO();
    const tenants = getAllTenants();

    for (const tenant of tenants) {
      try {
        const db = getTenantDb(tenant.id);
        const due = getDueReminders(db, nowIso);

        for (const row of due) {
          try {
            const lang = row.language || "en";
            const appointment = DateTime.fromISO(row.appointment_at, { zone: tenant.timezone });
            const dateStr = appointment.toFormat("dd.MM.yyyy");
            const timeStr = appointment.toFormat("HH:mm");

            await bot.api.sendMessage(
              row.user_telegram_id,
              t(lang, "reminder_text", { date: dateStr, time: timeStr }),
              { parse_mode: "HTML" }
            );

            markReminderSent(db, row.id);
          } catch (e) {
            console.error(`Error sending reminder for booking ${row.id} in tenant ${tenant.id}:`, e);
            markReminderSent(db, row.id);
          }
        }
      } catch (e) {
        console.error(`Error processing reminders for tenant ${tenant.id}:`, e);
      }
    }
  });
}

export { startReminderScheduler };
