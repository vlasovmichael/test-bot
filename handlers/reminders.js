// Планировщик напоминаний с использованием node-cron
// Каждый день/минуту проверяем БД на предмет "просроченных" напоминаний

import cron from "node-cron";
import { getDueReminders, markReminderSent } from "../database/db.js";
import { t } from "../i18n.js";

// Запуск периодической задачи
function startReminderScheduler(bot) {
  // Проверяем каждую минуту
  cron.schedule("* * * * *", async () => {
    const nowIso = new Date().toISOString();
    const due = getDueReminders(nowIso);
    for (const row of due) {
      try {
        const lang = row.language || "ru";
        const appointment = new Date(row.appointment_at);
        const dateStr = appointment.toLocaleDateString("pl-PL");
        const timeStr = appointment.toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit",
        });

        await bot.api.sendMessage(
          row.user_telegram_id,
          t(lang, "reminder_text", { date: dateStr, time: timeStr }),
          { parse_mode: "HTML" },
        );

        markReminderSent(row.id);
      } catch (e) {
        // Игнорируем ошибки отправки (пользователь закрыл ЛС и т.п.)
        markReminderSent(row.id);
      }
    }
  });
}

export { startReminderScheduler };
