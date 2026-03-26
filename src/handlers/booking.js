import {
  getAvailableSlotsForDate,
  getSlotById,
  createAppointment,
  getSetting,
} from "../database/db_adapter.js";
import { monthsGenitive, monthsNominative } from "./months.js";
import { t } from "../core/i18n.js";
import { sendMainMenu } from "./mainMenu.js";
import { DateTime } from "luxon";

function toDateString(date) {
  return DateTime.fromJSDate(date).toISODate();
}

function parseLocalDate(dateStr) {
  return DateTime.fromISO(dateStr);
}

function buildUserCalendar(ctx, lang, actionPrefix, monthOffset = 0) {
  const now = DateTime.now().setZone(ctx.tenant.timezone);
  const viewDate = now.plus({ months: monthOffset }).startOf("month");
  const currentMonth = viewDate.month;
  const currentYear = viewDate.year;

  const today = now.startOf("day");

  const workDays = getSetting(ctx.db, "work_days", [1, 2, 3, 4, 5]);
  const weekDays = t(lang, "week_days");
  const emptyChar = "⠀";
  const monthList = monthsNominative[lang] || monthsNominative["en"];
  const headerText = `─── ${monthList[currentMonth - 1]} ${currentYear} ───`;

  const keyboard = [
    [{ text: headerText, callback_data: "none" }],
    weekDays.map((day) => ({ text: day, callback_data: "none" })),
  ];

  let startDay = viewDate.weekday; // 1-Mon, 7-Sun
  startDay = startDay === 7 ? 0 : startDay; // 0-Sun, 6-Sat

  // Re-adjust to Mon-Sun
  let offset = viewDate.weekday - 1;

  let row = [];
  for (let i = 0; i < offset; i++) {
    row.push({ text: emptyChar, callback_data: "none" });
  }

  const daysInMonth = viewDate.daysInMonth;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = viewDate.set({ day });
    const iso = d.toISODate();
    const isPast = d < today;
    const isToday = d.hasSame(today, "day");
    const dayOfWeek = d.weekday === 7 ? 0 : d.weekday; // JS day format

    const isWorkDay = workDays.includes(dayOfWeek);

    let text = String(day);
    let callback_data = `${actionPrefix}:${iso}`;

    if (isPast) {
      text = "·";
      callback_data = "none";
    } else if (!isWorkDay) {
      text = "▫️";
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

  const navRow = [];
  if (monthOffset > 0) {
    navRow.push({ text: "⬅️", callback_data: `cal_offset:${monthOffset - 1}` });
  } else {
    navRow.push({ text: " ", callback_data: "none" });
  }

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

async function startBooking(ctx, lang) {
  await ctx.answerCallbackQuery();
  await ctx.reply(t(lang, "booking_start_title"), {
    parse_mode: "HTML",
    reply_markup: buildUserCalendar(ctx, lang, "book_date", 0),
  });
}

async function handleDateSelect(ctx, lang, date) {
  const slots = getAvailableSlotsForDate(ctx.db, date);
  await ctx.answerCallbackQuery();

  if (!slots.length) {
    return ctx.reply(t(lang, "no_available_times"), { parse_mode: "HTML" });
  }

  const d = DateTime.fromISO(date);
  const monthIdx = d.month - 1;
  const monthList = monthsGenitive[lang] || monthsGenitive["en"];
  const dateStr = `${d.day} ${monthList[monthIdx]}`;

  await ctx.editMessageText(t(lang, "booking_choose_time", { date: dateStr }), {
    parse_mode: "HTML",
    reply_markup: buildTimesKeyboard(lang, date, slots),
  });
}

async function handleTimeSelect(ctx, lang, slotId) {
  const slot = getSlotById(ctx.db, slotId);
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

async function handlePhoneInput(ctx, lang) {
  const phone = ctx.message.text.trim();
  const phoneRegex = /^\+?[\d\s-]{7,15}$/;
  if (!phoneRegex.test(phone)) return ctx.reply(t(lang, "error_invalid_phone"));

  const session = ctx.session.booking;
  session.phone = phone;
  session.step = "confirm_data";

  const slot = getSlotById(ctx.db, session.slotId);
  const dateStr = DateTime.fromISO(slot.date).setLocale(lang).toLocaleString(DateTime.DATE_MED);

  const text = t(lang, "confirm_booking_title", {
    date: dateStr,
    time: slot.time,
    name: session.name,
    phone: session.phone,
  });

  const keyboard = {
    inline_keyboard: [
      [{ text: t(lang, "btn_confirm_yes"), callback_data: "book_confirm:yes" }],
      [{ text: t(lang, "btn_confirm_no"), callback_data: "book_confirm:no" }],
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

  const slot = getSlotById(ctx.db, session.slotId);
  if (!slot) return ctx.editMessageText(t(lang, "booking_slot_unavailable"));

  const d = DateTime.fromISO(slot.date);
  const monthList = monthsGenitive[lang] || monthsGenitive["en"];
  const displayDate = `${d.day} ${monthList[d.month - 1]}`;

  try {
    const appointmentAt = DateTime.fromISO(`${slot.date}T${slot.time}:00`, { zone: ctx.tenant.timezone }).toUTC().toISO();
    const reminderAt = DateTime.fromISO(appointmentAt).minus({ hours: 24 }).toISO();

    await createAppointment(ctx.db, {
      slotId: slot.id,
      userTelegramId: ctx.from.id,
      name: session.name,
      phone: session.phone,
      appointmentAt,
      reminderAt,
    });

    const successText = t(lang, "booking_confirmed_success", {
      date: displayDate,
      time: slot.time,
      name: session.name,
      phone: session.phone,
    });

    await ctx.editMessageText(successText, { parse_mode: "HTML" });
    await sendMainMenu(ctx, lang);
  } catch (e) {
    console.error("Booking error:", e);
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
