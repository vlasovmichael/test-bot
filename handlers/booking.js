import {
  getAvailableDatesWithin,
  getAvailableSlotsForDate,
  getActiveBookingByUser,
  getAllActiveBookingsByUser,
  createBooking,
  getSlotById,
  getSetting,
} from "../database/db.js";
import { monthsGenitive, monthsNominative } from "./months.js";
import { t } from "../i18n.js";
import { ADMIN_ID, SCHEDULE_CHANNEL_ID } from "../config.js";
import { sendMainMenu } from "./mainMenu.js";

// Вспомогательные функции
function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Календарь с переводами дней недели
 */
function buildUserCalendar(lang, actionPrefix, monthOffset = 0) {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. ПОЛУЧАЕМ РАБОЧИЕ ДНИ ИЗ НАСТРОЕК (дефолт Пн-Пт)
  const workDays = getSetting("work_days", [1, 2, 3, 4, 5]);

  const weekDays = t(lang, "week_days");
  const emptyChar = "⠀";
  const monthList = monthsNominative[lang] || monthsNominative["en"];
  const headerText = `─── ${monthList[currentMonth]} ${currentYear} ───`;

  const keyboard = [
    [{ text: headerText, callback_data: "none" }],
    weekDays.map((day) => ({ text: day, callback_data: "none" })),
  ];

  let startDay = viewDate.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1;

  let row = [];
  for (let i = 0; i < startDay; i++) {
    row.push({ text: emptyChar, callback_data: "none" });
  }

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(currentYear, currentMonth, day);
    const iso = toDateString(d);
    const checkDate = new Date(d).setHours(0, 0, 0, 0);

    // ОПРЕДЕЛЯЕМ НОМЕР ДНЯ НЕДЕЛИ (0-Вс, 1-Пн...)
    const dayOfWeek = d.getDay();

    const isPast = checkDate < today.getTime();
    const isToday = checkDate === today.getTime();

    // 2. ПРОВЕРЯЕМ, РАБОЧИЙ ЛИ ЭТО ДЕНЬ
    const isWorkDay = workDays.includes(dayOfWeek);

    let text = String(day);
    let callback_data = `${actionPrefix}:${iso}`;

    if (isPast) {
      text = "·";
      callback_data = "none";
    } else if (!isWorkDay) {
      // 3. ЕСЛИ ДЕНЬ НЕ РАБОЧИЙ - ЗАМЕНЯЕМ ТЕКСТ И ВЫКЛЮЧАЕМ КНОПКУ
      text = "▫️"; // Или "✖️", или просто пусто
      callback_data = "none";
    } else if (isToday) {
      text = `📍${day}`;
    }

    row.push({ text, callback_data });
    if (row.length === 7) {
      keyboard.push(row);
      row = [];
    }
  }

  if (row.length > 0) {
    while (row.length < 7) row.push({ text: emptyChar, callback_data: "none" });
    keyboard.push(row);
  }

  // --- НАВИГАЦИЯ МЕЖДУ МЕСЯЦАМИ ---
  const navRow = [];
  if (monthOffset > 0) {
    navRow.push({ text: "⬅️", callback_data: `cal_offset:${monthOffset - 1}` });
  } else {
    navRow.push({ text: " ", callback_data: "none" }); // Для симметрии
  }

  // Кнопка "Вперед" (разрешаем смотреть на 1 месяц вперед)
  if (monthOffset < 1) {
    navRow.push({ text: "➡️", callback_data: `cal_offset:${monthOffset + 1}` });
  } else {
    navRow.push({ text: " ", callback_data: "none" });
  }
  keyboard.push(navRow);

  keyboard.push([
    { text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" },
  ]);
  return { inline_keyboard: keyboard };
}

function buildTimesKeyboard(lang, date, slots) {
  const rows = slots.map((s) => [
    { text: s.time, callback_data: `book_time:${s.id}` },
  ]);
  rows.push([
    { text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" },
  ]);
  return { inline_keyboard: rows };
}

/**
 * Логика процессов
 */
// handlers/booking.js

async function startBooking(ctx, lang) {
  const userId = String(ctx.from.id); // Принудительно в строку для БД

  const activeBookings = getAllActiveBookingsByUser(userId);

  // ЛОГ ДЛЯ ТЕБЯ (потом удалишь):
  console.log(
    `[DEBUG] Юзер ${userId} имеет активных записей: ${activeBookings.length}`,
  );

  if (activeBookings && activeBookings.length >= 2) {
    await ctx.answerCallbackQuery();

    const list = activeBookings
      .map((b) => `• ${b.date} в ${b.time}`)
      .join("\n");

    // Отправляем сообщение об ограничении
    return ctx.reply(
      t(lang, "booking_limit_reached") ||
        `⛔️ <b>Превышен лимит записей</b>\n\nУ вас уже есть 2 активных записи:\n${list}\n\nПожалуйста, дождитесь их завершения или отмените одну из них.`,
      { parse_mode: "HTML" },
    );
  }

  // Если всё ок — открываем календарь
  await ctx.answerCallbackQuery();
  await ctx.reply(t(lang, "booking_start_title"), {
    parse_mode: "HTML",
    reply_markup: buildUserCalendar(lang, "book_date", 0),
  });
}

async function handleDateSelect(ctx, lang, date) {
  const slots = getAvailableSlotsForDate(date);
  await ctx.answerCallbackQuery();

  if (!slots.length) {
    return ctx.reply(t(lang, "no_available_times"), { parse_mode: "HTML" });
  }

  // 1. Парсим ISO дату (YYYY-MM-DD)
  const [year, month, day] = date.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);

  // 2. Получаем индекс месяца (0-11)
  const monthIdx = dateObj.getMonth();

  // 3. Формируем красивую дату на нужном языке
  // Если языка нет в словаре, берем английский
  const monthList = monthsGenitive[lang] || monthsGenitive["en"];
  const monthName = monthList[monthIdx];

  const dateStr = `${day} ${monthName}`;

  await ctx.editMessageText(t(lang, "booking_choose_time", { date: dateStr }), {
    parse_mode: "HTML",
    reply_markup: buildTimesKeyboard(lang, date, slots),
  });
}

async function handleTimeSelect(ctx, lang, slotId) {
  const slot = getSlotById(slotId);
  await ctx.answerCallbackQuery();
  if (!slot) return ctx.reply(t(lang, "booking_slot_unavailable"));

  ctx.session.booking = { step: "enter_name", slotId: slot.id };
  await ctx.reply(t(lang, "booking_enter_name"), { parse_mode: "HTML" });
}

async function handleNameInput(ctx, lang) {
  const name = ctx.message.text.trim();
  if (name.length < 2) return ctx.reply(t(lang, "error_invalid_name"));

  ctx.session.booking.name = name;
  ctx.session.booking.step = "enter_phone";
  await ctx.reply(t(lang, "booking_enter_phone"), { parse_mode: "HTML" });
}

// ПРАВКА 2: Новый этап проверки данных
async function handlePhoneInput(ctx, lang) {
  const phone = ctx.message.text.trim();
  const phoneRegex = /^\+?[\d\s-]{7,15}$/;
  if (!phoneRegex.test(phone)) return ctx.reply(t(lang, "error_invalid_phone"));

  const session = ctx.session.booking;
  session.phone = phone;
  session.step = "confirm_data"; // Новый шаг

  const slot = getSlotById(session.slotId);
  const dateStr = parseLocalDate(slot.date).toLocaleDateString(lang);

  const text = t(lang, "confirm_booking_title", {
    date: dateStr,
    time: slot.time,
    name: session.name,
    phone: session.phone,
  });

  const keyboard = {
    inline_keyboard: [
      [
        { text: t(lang, "btn_confirm_yes"), callback_data: "book_confirm:yes" },
        { text: t(lang, "btn_confirm_no"), callback_data: "book_confirm:no" },
      ],
    ],
  };

  await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
}

async function handleFinalConfirm(ctx, lang, answer) {
  await ctx.answerCallbackQuery();
  const session = ctx.session.booking;

  if (answer === "no") {
    ctx.session.booking = null;
    return sendMainMenu(ctx, lang);
  }

  const slot = getSlotById(session.slotId);
  if (!slot || slot.is_booked) {
    return ctx.editMessageText(t(lang, "booking_slot_unavailable"));
  }

  // Правильное формирование даты
  const [year, month, day] = slot.date.split("-").map(Number);
  const monthList = monthsGenitive[lang] || monthsGenitive["en"];
  const displayDate = `${day} ${monthList[month - 1]}`; // month - 1 так как в массиве индексы с 0

  try {
    createBooking({
      slotId: slot.id,
      userTelegramId: ctx.from.id,
      name: session.name,
      phone: session.phone,
      appointmentAt: new Date(`${slot.date}T${slot.time}:00`).toISOString(),
    });

    // Отправляем ПЕРЕВЕДЕННЫЙ текст пользователю
    const successText = t(lang, "booking_confirmed_success", {
      date: displayDate,
      time: slot.time,
      name: session.name,
      phone: session.phone,
    });

    await ctx.editMessageText(successText, { parse_mode: "HTML" });

    // Уведомление админу (можно оставить на одном языке или тоже локализовать)
    const adminMsg = t(lang, "admin_notification_new", {
      name: session.name,
      date: displayDate,
      time: slot.time,
      phone: session.phone,
    });

    await sendMainMenu(ctx, lang);

    if (ADMIN_ID) {
      await ctx.api.sendMessage(ADMIN_ID, adminMsg, { parse_mode: "HTML" });
    }

    if (SCHEDULE_CHANNEL_ID) {
      await ctx.api.sendMessage(SCHEDULE_CHANNEL_ID, adminMsg, {
        parse_mode: "HTML",
      });
    }
  } catch (e) {
    console.error(e);
    await ctx.reply(t(lang, "error_generic"));
  } finally {
    ctx.session.booking = null;
  }
}

export {
  startBooking,
  handleDateSelect,
  handleTimeSelect,
  handleNameInput,
  handlePhoneInput,
  handleFinalConfirm,
  buildUserCalendar,
};
