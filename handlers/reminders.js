// Планировщик напоминаний с использованием node-cron
// Каждый день/минуту проверяем БД на предмет "просроченных" напоминаний

import cron from "node-cron";
import { getDueReminders, markReminderSent } from "../database/db.js";
import { t } from "../i18n.js";
import { formatWarsawDate, formatWarsawTime } from "../utils/date.js";

// Запуск периодической задачи
function startReminderScheduler(bot) {
  // Проверяем каждую минуту
  cron.schedule("* * * * *", async () => {
    const nowIso = new Date().toISOString();
    const due = getDueReminders(nowIso);
    for (const row of due) {
      try {
        const lang = row.language || "en";

        // Передаем дату прямо в функции
        const dateStr = formatWarsawDate(row.appointment_at);
        const timeStr = formatWarsawTime(row.appointment_at);

        await bot.api.sendMessage(
          row.user_telegram_id,
          t(lang, "reminder_text", { date: dateStr, time: timeStr }),
          { parse_mode: "HTML" },
        );

        markReminderSent(row.id);
      } catch (e) {
        console.error("Ошибка отправки напоминания:", e);
        markReminderSent(row.id);
      }
    }
  });
}

export { startReminderScheduler };
