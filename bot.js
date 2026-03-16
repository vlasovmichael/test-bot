// Node.js + grammY + SQLite (better-sqlite3)
import { Bot, session } from "grammy";
import { BOT_TOKEN, ADMIN_ID } from "./config.js";
import {
  db,
  upsertUser,
  getUserByTelegramId,
  getSetting,
  setSetting,
  autoGenerateSlots,
} from "./database/db.js";
import { t, getLanguageButtons } from "./i18n.js";
import { startReminderScheduler } from "./handlers/reminders.js";
import {
  mainMenuKeyboard,
  sendMainMenu,
  handlePrices,
  handlePortfolio,
  updateMainMenu,
  handleChangeLanguageMenu,
} from "./handlers/mainMenu.js";
import {
  startBooking,
  handleDateSelect,
  handleTimeSelect,
  handleNameInput,
  handlePhoneInput,
  buildUserCalendar,
  handleFinalConfirm,
} from "./handlers/booking.js";
import {
  showAdminPanel,
  handleManageDays,
  handleAdminDayOverview,
  toggleDayClosed,
  askAdminForTime,
  handleAdminTimeInput,
  handleAdminViewSchedule,
  showScheduleForDate,
  handleAdminCancelBooking,
  pickBookingToCancel,
  cancelBookingById,
  buildAdminMainKeyboard,
  showAdminSettings,
  showStepSettings,
  showWorkDaysSettings,
  askAdminForHours,
  askAdminForPrices,
  askAdminForPortfolio,
  askAdminForBroadcast,
  showStats,
} from "./handlers/admin.js";
import {
  isUserSubscribed,
  sendSubscriptionRequest,
} from "./handlers/subscription.js";

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN не задан в .env");
}

// Инициализация бота
export const bot = new Bot(BOT_TOKEN);

// Состояние сессии пользователя
function initialSession() {
  return {
    language: null,
    booking: null,
    admin: null,
  };
}

// Функция для определения языка пользователя
async function getUserLanguage(ctx) {
  // 1. Сначала проверяем, есть ли язык в сессии (если пользователь уже нажимал кнопку выбора языка)
  if (ctx.session && ctx.session.lang) {
    return ctx.session.lang;
  }

  // 2. Если в сессии пусто, берем язык из настроек Telegram самого пользователя
  // ctx.from.language_code обычно возвращает 'ru', 'en', 'pl', 'ua'
  const tgLang = ctx.from?.language_code;

  if (tgLang === "ua") return "ua";
  if (tgLang === "pl") return "pl";
  if (tgLang === "ru") return "ru";

  // 3. Если ничего не подошло, возвращаем язык по умолчанию
  return "en";
}

bot.use(session({ initial: initialSession }));

// Вспомогательная функция: получить язык пользователя
function getLang(ctx) {
  return ctx.session.language || "en";
}

// ---------- Обработка /start ----------

bot.command("start", async (ctx) => {
  const userId = ctx.from.id;
  const user = getUserByTelegramId(userId);

  // Создаём пользователя в БД, язык из ранее выбранного (если был)
  upsertUser(userId, {
    name: user?.name || null,
    phone: user?.phone || null,
    language: user?.language || ctx.session.language || null,
    is_admin: userId === ADMIN_ID ? 1 : user?.is_admin || 0,
  });

  const lang = user?.language || ctx.session.language;

  if (!lang) {
    // Язык не выбран — предлагаем выбор
    await ctx.reply(t("en", "language_select_title"), {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: getLanguageButtons(),
      },
    });
    return;
  }

  ctx.session.language = lang;
  await sendMainMenu(ctx, lang);
});

// ---------- Выбор языка ----------

bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;

  // Выбор языка
  if (data.startsWith("lang:")) {
    const lang = data.split(":")[1];
    ctx.session.language = lang;

    upsertUser(ctx.from.id, {
      language: lang,
      is_admin: ctx.from.id === ADMIN_ID ? 1 : 0,
    });

    await ctx.answerCallbackQuery();
    await updateMainMenu(ctx, lang);
    return;
  }

  return next();
});

// ---------- Главное меню ----------

bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const lang = getLang(ctx);

  if (data.startsWith("menu:")) {
    const action = data.split(":")[1];

    if (action === "book") {
      await ctx.answerCallbackQuery(); // Просто подтверждаем нажатие
      await startBooking(ctx, lang); // Сразу переходим к выбору даты
      return;
    }

    if (action === "prices") {
      await handlePrices(ctx, lang);
      return;
    }

    if (action === "portfolio") {
      await handlePortfolio(ctx, lang);
      return;
    }

    if (action === "language") {
      await handleChangeLanguageMenu(ctx, lang);
      return;
    }

    if (action === "back") {
      const userId = ctx.from.id;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(t(lang, "main_menu_title"), {
        parse_mode: "HTML",
        reply_markup: mainMenuKeyboard(lang, userId),
      });
      return;
    }
  }

  return next();
});

bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  if (data.startsWith("cal_offset:")) {
    const offset = parseInt(data.split(":")[1]);
    const lang = getLang(ctx);

    await ctx.editMessageReplyMarkup({
      reply_markup: buildUserCalendar(lang, "book_date", offset),
    });
    await ctx.answerCallbackQuery();
    return;
  }
  return next();
});

// ---------- Проверка подписки по кнопке "Я подписан" ----------

bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const lang = getLang(ctx);

  if (data === "sub_check") {
    const subscribed = await isUserSubscribed(bot, ctx.from.id);
    if (!subscribed) {
      // Останавливаем "часики" на кнопке загрузки
      await ctx.answerCallbackQuery();
      await ctx.reply(t(lang, "still_not_subscribed"), {
        parse_mode: "HTML",
      });
      return;
    }

    // Останавливаем "часики" на кнопке загрузки
    await ctx.answerCallbackQuery();
    await ctx.reply(t(lang, "subscription_ok"), { parse_mode: "HTML" });
    await sendMainMenu(ctx, lang);
    return;
  }

  return next();
});

// ---------- Бронирование: выбор даты / времени ----------

bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const lang = getLang(ctx);

  if (data.startsWith("book_date:")) {
    const date = data.split(":")[1];
    await handleDateSelect(ctx, lang, date);
    return;
  }

  if (data.startsWith("book_time:")) {
    const idStr = data.split(":")[1];
    const slotId = Number(idStr);
    await handleTimeSelect(ctx, lang, slotId);
    return;
  }

  return next();
});

// ---------- Админ-панель ----------

bot.command("admin", async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) {
    // Если не админ — бот просто игнорирует команду, будто её не существует
    return;
  }

  const user = getUserByTelegramId(ctx.from.id);
  const lang = user?.language || "en";
  await showAdminPanel(ctx, lang);
});

bot.callbackQuery("menu:back", async (ctx) => {
  // 1. Получаем язык и ID
  const user = getUserByTelegramId(ctx.from.id);
  const lang = user?.language || "en";

  // 2. Убираем "часики" на кнопке
  await ctx.answerCallbackQuery();

  // 3. Удаляем сообщение с админ-панелью (или подменю)
  try {
    await ctx.deleteMessage();
  } catch (e) {
    // На случай, если сообщение слишком старое или уже удалено
    console.log("Не удалось удалить сообщение, просто отправим новое.");
  }

  // 4. Отправляем ГЛАВНОЕ МЕНЮ новым сообщением (как при /start)
  // Используем sendMainMenu из твоего файла handlers/mainMenu.js
  await sendMainMenu(ctx, lang);
});

bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const userFromDb = getUserByTelegramId(ctx.from.id);
  const lang = ctx.session.language || userFromDb?.language || "en";

  if (data.startsWith("admin:")) {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.answerCallbackQuery({
        text: t(lang, "admin_only"),
        show_alert: true,
      });
      return;
    }

    const action = data.split(":")[1];

    if (action === "manage_days") {
      await handleManageDays(ctx, lang);
      return;
    }
    if (action === "view_schedule") {
      await handleAdminViewSchedule(ctx, lang);
      return;
    }
    if (action === "cancel_booking") {
      await handleAdminCancelBooking(ctx, lang);
      return;
    }

    if (action === "settings") {
      await showAdminSettings(ctx, lang);
      return;
    }
    if (action === "conf_step") {
      await showStepSettings(ctx, lang);
      return;
    }
    if (action === "conf_days") {
      await showWorkDaysSettings(ctx, lang);
      return;
    }
    if (action === "conf_hours") {
      await askAdminForHours(ctx, lang);
      return;
    }
    if (action === "edit_prices") {
      await askAdminForPrices(ctx, lang);
      return;
    }
    if (action === "edit_portfolio") {
      await askAdminForPortfolio(ctx, lang);
      return;
    }
    if (action === "broadcast_slot") {
      await askAdminForBroadcast(ctx, lang);
      return;
    }
    if (action === "stats") {
      await showStats(ctx, lang);
      return;
    }

    // Логика переключения рабочего дня (✅/❌)
    if (action === "toggle_workday") {
      const day = parseInt(data.split(":")[2]);
      let currentDays = getSetting("work_days", [1, 2, 3, 4, 5]);

      if (currentDays.includes(day)) {
        currentDays = currentDays.filter((d) => d !== day);
      } else {
        currentDays.push(day);
      }

      setSetting("work_days", currentDays);
      await ctx.answerCallbackQuery();
      await showWorkDaysSettings(ctx, lang);
      return;
    }

    // Логика сохранения шага времени
    if (action === "save_step") {
      const step = parseInt(data.split(":")[2]);
      setSetting("step_min", step);

      await ctx.answerCallbackQuery({ text: t(lang, "admin_settings_saved") });
      await showAdminSettings(ctx, lang);

      // Перегенерируем слоты с новым шагом
      autoGenerateSlots();
      return;
    }
  }

  // admin_day:YYYY-MM-DD
  if (data.startsWith("admin_day:")) {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.answerCallbackQuery({
        text: t(lang, "admin_only"),
        show_alert: true,
      });
      return;
    }
    const date = data.split(":")[1];
    await handleAdminDayOverview(ctx, lang, date);
    return;
  }

  if (data.startsWith("admin_add_time:")) {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.answerCallbackQuery({
        text: t(lang, "admin_only"),
        show_alert: true,
      });
      return;
    }
    const date = data.split(":")[1];
    await askAdminForTime(ctx, lang, date);
    return;
  }

  if (data.startsWith("admin_toggle_day:")) {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.answerCallbackQuery({
        text: t(lang, "admin_only"),
        show_alert: true,
      });
      return;
    }
    const date = data.split(":")[1];
    await toggleDayClosed(ctx, lang, date);
    return;
  }

  if (data.startsWith("admin_view:")) {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.answerCallbackQuery({
        text: t(lang, "admin_only"),
        show_alert: true,
      });
      return;
    }
    const date = data.split(":")[1];
    await showScheduleForDate(ctx, lang, date);
    return;
  }

  if (data.startsWith("admin_cancel_date:")) {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.answerCallbackQuery({
        text: t(lang, "admin_only"),
        show_alert: true,
      });
      return;
    }
    const date = data.split(":")[1];
    await pickBookingToCancel(ctx, lang, date);
    return;
  }

  if (data.startsWith("admin_cancel_id:")) {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.answerCallbackQuery({
        text: t(lang, "admin_only"),
        show_alert: true,
      });
      return;
    }
    const idStr = data.split(":")[1];
    await cancelBookingById(ctx, lang, Number(idStr));
    return;
  }

  return next();
});

// ---------- Обработка текстовых сообщений в FSM ----------

bot.on("message:text", async (ctx) => {
  const lang = getLang(ctx);
  const userId = ctx.from.id;

  if (String(userId) === String(ADMIN_ID) && ctx.session.admin?.step) {
    const adminStep = ctx.session.admin.step;

    // --- РЕДАКТИРОВАНИЕ ЦЕН ---
    if (adminStep === "enter_prices") {
      setSetting("custom_prices", ctx.message.text);
      ctx.session.admin.step = null;

      return ctx.reply(t(lang, "admin_prices_updated"), {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `⬅️ ${t(lang, "admin_btn_back")}`,
                callback_data: "admin:main",
              },
            ],
          ],
        },
      });
    }

    // --- РЕДАКТИРОВАНИЕ ПОРТФОЛИО ---
    if (adminStep === "enter_portfolio") {
      const text = ctx.message.text.trim();
      const lines = text.split("\n");
      const links = [];

      for (const line of lines) {
        const parts = line.split("-");
        if (parts.length >= 2) {
          const name = parts[0].trim();
          const url = parts.slice(1).join("-").trim();
          if (url.startsWith("http")) links.push({ name, url });
        }
      }

      if (links.length === 0) {
        return ctx.reply(t(lang, "admin_portfolio_error"));
      }

      setSetting("portfolio_links", links);
      ctx.session.admin.step = null;
      await ctx.reply(`✅ ${t(lang, "admin_portfolio_updated")}`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `⬅️ ${t(lang, "admin_btn_back")}`,
                callback_data: "admin:main",
              },
            ],
          ],
        },
      });
      return;
    }

    // --- РЕДАКТИРОВАНИЕ ЧАСОВ РАБОТЫ ---
    if (adminStep === "enter_hours") {
      const text = ctx.message.text.trim();
      const match = text.match(
        /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/,
      );

      if (!match) {
        return ctx.reply(t(lang, "admin_hours_error"));
      }

      const startTime = `${match[1]}:${match[2]}`;
      const endTime = `${match[3]}:${match[4]}`;

      setSetting("start_time", startTime);
      setSetting("end_time", endTime);
      ctx.session.admin.step = null;
      autoGenerateSlots();

      await ctx.reply(
        t(lang, "admin_hours_updated", { start: startTime, end: endTime }),
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `⬅️ ${t(lang, "admin_btn_back")}`,
                  callback_data: "admin:main",
                },
              ],
            ],
          },
        },
      );
      return;
    }

    // --- МАССОВАЯ РАССЫЛКА ---
    if (adminStep === "enter_broadcast") {
      const messageText = ctx.message.text;
      const users = db.prepare("SELECT telegram_id FROM users").all();
      ctx.session.admin.step = null;

      await ctx.reply(
        t(lang, "admin_broadcast_start", { count: users.length }),
      );

      let successCount = 0;
      let failCount = 0;

      for (const user of users) {
        try {
          await ctx.api.sendMessage(
            user.telegram_id,
            `${t(lang, "broadcast_header")}\n\n${messageText}`,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: t(lang, "btn_book_now"),
                      callback_data: "menu:book",
                    },
                  ],
                ],
              },
            },
          );
          successCount++;
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (e) {
          failCount++;
        }
      }

      await ctx.reply(
        t(lang, "admin_broadcast_done", {
          success: successCount,
          fail: failCount,
        }),
        {
          parse_mode: "HTML", // На случай, если в тексте есть жирный шрифт
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `⬅️ ${t(lang, "admin_btn_back")}`,
                  callback_data: "admin:main",
                },
              ],
            ],
          },
        },
      );

      return;
    }

    // --- ОСТАЛЬНЫЕ ШАГИ ---
    if (adminStep === "enter_time") {
      await handleAdminTimeInput(ctx, lang);
      return;
    }
  }

  // 2. ПРОВЕРКА ПОЛЬЗОВАТЕЛЬСКОЙ ЗАПИСИ
  const bookingStep = ctx.session.booking?.step;
  if (bookingStep === "enter_name") return handleNameInput(ctx, lang);
  if (bookingStep === "enter_phone") return handlePhoneInput(ctx, lang);
});

bot.callbackQuery("admin:main", async (ctx) => {
  await ctx.answerCallbackQuery(); // Убираем анимацию загрузки на кнопке сразу

  const user = getUserByTelegramId(ctx.from.id);
  const lang = user?.language || "en";

  // Проверяем, не то же ли самое это меню (опционально, try/catch надежнее)
  try {
    await ctx.editMessageText(t(lang, "admin_panel_title"), {
      parse_mode: "HTML",
      reply_markup: buildAdminMainKeyboard(lang),
    });
  } catch (e) {
    // Если сообщение то же самое, просто ничего не делаем
  }
});

bot.callbackQuery("none", async (ctx) => {
  await ctx.answerCallbackQuery(); // Просто гасим уведомление
});

bot.callbackQuery(/^book_confirm:(.+)$/, async (ctx) => {
  const answer = ctx.match[1]; // Получаем 'yes' или 'no' из регулярки
  const userFromDb = getUserByTelegramId(ctx.from.id);
  const lang = ctx.session.language || userFromDb?.language || "en";

  await handleFinalConfirm(ctx, lang, answer);
});

// ---------- Запуск планировщика напоминаний ----------

startReminderScheduler(bot);

// ---------- Старт бота ----------
autoGenerateSlots();

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  console.error(err.error);
});

bot.start();

console.log("Bot has been started.");
