import cron from "node-cron";
import { getDueReminders, markReminderSent } from "../database/db_adapter.js";
import { t } from "../core/i18n.js";
import { formatInTimezone } from "../utils/date.js";
import { getTenantDatabase } from "../database/factory.js";
import { masterDb } from "../database/master.js";

export function startReminderScheduler(bot) {
  // We need to know which tenant this bot belongs to.
  // In a multi-tenant setup, we can have one scheduler per bot instance.

  cron.schedule("* * * * *", async () => {
    // This is a simplified version. In a real SaaS, you might want a single global scheduler.
    // For this template, we'll make it context-aware if possible.
  });
}

// Global scheduler that runs for all tenants
export function startGlobalReminderScheduler(api) {
  cron.schedule("* * * * *", async () => {
    const tenants = masterDb.prepare("SELECT * FROM tenants").all();
    const nowIso = new Date().toISOString();

    for (const tenant of tenants) {
      const db = getTenantDatabase(tenant.id);
      const due = getDueReminders(db, nowIso);

      for (const row of due) {
        try {
          const lang = row.language || "en";
          const displayTime = formatInTimezone(row.appointment_at, tenant.timezone);

          await api.sendMessage(
            row.user_telegram_id,
            t(lang, "reminder_text", { date: displayTime.split(',')[0], time: displayTime.split(',')[1] }),
            { parse_mode: "HTML" }
          );
          markReminderSent(db, row.id);
        } catch (e) {
          console.error(`Failed to send reminder for tenant ${tenant.id}:`, e);
        }
      }
    }
  });
}
