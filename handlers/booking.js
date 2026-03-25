import {
  getAvailableSlotsForDate,
  getSlotById,
  createBooking,
  getCategories,
  getServicesByCategory,
  getServiceById,
  getSetting,
} from "../database/db.js";
import { t } from "../i18n.js";
import { DateTime } from "luxon";
import { createCalendarEvent } from "../utils/google-calendar.js";
import { sendMainMenu } from "./mainMenu.js";
import { monthsNominative, monthsGenitive } from "./months.js";
import { TIMEZONE } from "../config.js";

function buildInlineKeyboard(rows) {
  return { inline_keyboard: rows };
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function startBooking(ctx, lang) {
  const categories = getCategories(ctx.tenantId);
  if (!categories.length) {
    return ctx.reply(t(lang, "no_categories_available"));
  }

  const rows = categories.map((cat) => [{ text: cat.name, callback_data: `book_cat:${cat.id}` }]);
  await ctx.reply(t(lang, "booking_choose_category"), { reply_markup: buildInlineKeyboard(rows) });
}

async function handleCategorySelect(ctx, lang, catId) {
  const services = getServicesByCategory(ctx.tenantId, catId);
  if (!services.length) {
    return ctx.reply(t(lang, "no_services_available"));
  }

  const rows = services.map((srv) => [
    { text: `${srv.name} (${srv.price} PLN)`, callback_data: `book_srv:${srv.id}` },
  ]);
  await ctx.editMessageText(t(lang, "booking_choose_service"), {
    reply_markup: buildInlineKeyboard(rows),
  });
}

async function handleServiceSelect(ctx, lang, srvId) {
  ctx.session.booking = { serviceId: srvId };
  await ctx.editMessageText(t(lang, "booking_choose_date"), {
    reply_markup: buildUserCalendar(ctx.tenantId, lang, "book_date", 0, ctx.timezone),
  });
}

function buildUserCalendar(tenantId, lang, actionPrefix, monthOffset = 0, timezone = TIMEZONE) {
  const now = DateTime.now().setZone(timezone);
  const viewDate = now.plus({ months: monthOffset }).startOf('month');
  const currentMonth = viewDate.month;
  const currentYear = viewDate.year;

  const workDays = getSetting(tenantId, "work_days", [1, 2, 3, 4, 5]);
  const weekDays = t(lang, "week_days");
  const monthList = monthsNominative[lang] || monthsNominative["en"];
  const headerText = `─── ${monthList[currentMonth - 1]} ${currentYear} ───`;

  const keyboard = [
    [{ text: headerText, callback_data: "none" }],
    weekDays.map((day) => ({ text: day, callback_data: "none" })),
  ];

  let emptyCells = viewDate.weekday - 1;

  let row = [];
  for (let i = 0; i < emptyCells; i++) {
    row.push({ text: " ", callback_data: "none" });
  }

  const daysInMonth = viewDate.daysInMonth;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = viewDate.set({ day });
    const iso = d.toISODate();
    const isPast = d.startOf('day') < now.startOf('day');
    const isWorkDay = workDays.includes(d.weekday);

    let text = String(day);
    let callback_data = `${actionPrefix}:${iso}`;

    if (isPast || !isWorkDay) {
      text = isPast ? "·" : "▫️";
      callback_data = "none";
    }

    row.push({ text, callback_data });
    if (row.length === 7) {
      keyboard.push(row);
      row = [];
    }
  }

  if (row.length > 0) {
    while (row.length < 7) row.push({ text: " ", callback_data: "none" });
    keyboard.push(row);
  }

  const navRow = [
    { text: monthOffset > 0 ? "⬅️" : " ", callback_data: monthOffset > 0 ? `cal_offset:${monthOffset - 1}` : "none" },
    { text: monthOffset < 1 ? "➡️" : " ", callback_data: monthOffset < 1 ? `cal_offset:${monthOffset + 1}` : "none" }
  ];
  keyboard.push(navRow);
  keyboard.push([{ text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" }]);

  return { inline_keyboard: keyboard };
}

async function handleDateSelect(ctx, lang, date) {
  const slots = getAvailableSlotsForDate(ctx.tenantId, date);
  if (!slots.length) return ctx.reply(t(lang, "no_available_times"));

  const rows = slots.map((s) => [{ text: s.time, callback_data: `book_time:${s.id}` }]);
  await ctx.editMessageText(t(lang, "booking_choose_time", { date }), { reply_markup: buildInlineKeyboard(rows) });
}

async function handleTimeSelect(ctx, lang, slotId) {
  const slot = getSlotById(ctx.tenantId, slotId);
  if (!slot) return ctx.reply(t(lang, "booking_slot_unavailable"));
  ctx.session.booking.slotId = slot.id;
  ctx.session.booking.step = "enter_name";
  await ctx.reply(t(lang, "booking_enter_name"));
}

async function handleNameInput(ctx, lang) {
  ctx.session.booking.name = ctx.message.text.trim();
  ctx.session.booking.step = "enter_phone";
  await ctx.reply(t(lang, "booking_enter_phone"));
}

async function handlePhoneInput(ctx, lang) {
  ctx.session.booking.phone = ctx.message.text.trim();
  const session = ctx.session.booking;
  const slot = getSlotById(ctx.tenantId, session.slotId);
  const service = getServiceById(ctx.tenantId, session.serviceId);
  const text = t(lang, "confirm_booking_title", { date: slot.date, time: slot.time, name: session.name, phone: session.phone, service: service.name });
  const keyboard = buildInlineKeyboard([[{ text: t(lang, "btn_confirm_yes"), callback_data: "book_confirm:yes" }], [{ text: t(lang, "btn_confirm_no"), callback_data: "book_confirm:no" }]]);
  await ctx.reply(text, { reply_markup: keyboard });
}

async function handleFinalConfirm(ctx, lang, answer) {
  if (answer === "no") { ctx.session.booking = null; return sendMainMenu(ctx, lang); }
  const session = ctx.session.booking;
  const slot = getSlotById(ctx.tenantId, session.slotId);
  const service = getServiceById(ctx.tenantId, session.serviceId);
  try {
    const appointmentAt = DateTime.fromISO(`${slot.date}T${slot.time}`, { zone: ctx.timezone });
    const reminderAt = appointmentAt.minus({ hours: 24 });
    const bookingId = createBooking({ tenantId: ctx.tenantId, slotId: slot.id, serviceId: service.id, userTelegramId: ctx.from.id, name: session.name, phone: session.phone, appointmentAt: appointmentAt.toISO(), reminderAt: reminderAt.toISO() });
    await createCalendarEvent(ctx.tenantId, { id: bookingId, ...session, appointment_at: appointmentAt.toISO() }, service);
    await ctx.editMessageText(t(lang, "booking_confirmed_success"));
    await sendMainMenu(ctx, lang);
  } catch (e) { console.error(e); await ctx.reply(t(lang, "error_generic")); } finally { ctx.session.booking = null; }
}

export { startBooking, handleCategorySelect, handleServiceSelect, handleDateSelect, handleTimeSelect, handleNameInput, handlePhoneInput, handleFinalConfirm, buildUserCalendar };
