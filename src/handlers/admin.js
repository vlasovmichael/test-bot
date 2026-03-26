import {
  addSlot,
  getBookingsForDate,
  closeDay,
  openDay,
  isDayClosed,
  cancelBooking,
  getSetting,
  setSetting,
  getAdminStats,
  autoGenerateSlots,
} from "../database/db_adapter.js";
import { monthsNominative } from "./months.js";
import { t } from "../core/i18n.js";
import { DateTime } from "luxon";

function buildAdminMainKeyboard(lang) {
  return {
    inline_keyboard: [
      [
        { text: t(lang, "admin_btn_settings"), callback_data: "admin:settings" },
        { text: t(lang, "admin_btn_manage_days"), callback_data: "admin:manage_days" },
      ],
      [
        { text: t(lang, "admin_btn_view_schedule"), callback_data: "admin:view_schedule" },
        { text: t(lang, "admin_btn_cancel_booking"), callback_data: "admin:cancel_booking" },
      ],
      [
        { text: t(lang, "admin_btn_announcement"), callback_data: "admin:broadcast_slot" },
        { text: t(lang, "admin_btn_statistics"), callback_data: "admin:stats" },
      ],
      [{ text: t(lang, "btn_back_main"), callback_data: "menu:back" }],
    ],
  };
}

async function showAdminPanel(ctx, lang) {
  await ctx.reply(t(lang, "admin_panel_title"), {
    parse_mode: "HTML",
    reply_markup: buildAdminMainKeyboard(lang),
  });
}

async function handleManageDays(ctx, lang) {
  await ctx.editMessageText(t(lang, "admin_pick_date"), {
    parse_mode: "HTML",
    reply_markup: buildAdminDatesKeyboard(ctx, lang, "admin_day"),
  });
}

function buildAdminDatesKeyboard(ctx, lang, actionPrefix, monthOffset = 0) {
  const now = DateTime.now().setZone(ctx.tenant.timezone);
  const viewDate = now.plus({ months: monthOffset }).startOf("month");
  const currentMonth = viewDate.month;
  const currentYear = viewDate.year;

  const today = now.startOf("day");
  const weekDays = t(lang, "week_days");
  const monthList = monthsNominative[lang] || monthsNominative["en"];
  const headerText = `── ${monthList[currentMonth - 1]} ${currentYear} ──`;

  const keyboard = [
    [{ text: headerText, callback_data: "none" }],
    weekDays.map((day) => ({ text: ` ${day} `, callback_data: "none" })),
  ];

  let offset = viewDate.weekday - 1;
  let row = [];
  for (let i = 0; i < offset; i++) row.push({ text: " ", callback_data: "none" });

  const daysInMonth = viewDate.daysInMonth;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = viewDate.set({ day });
    const iso = d.toISODate();
    const isPast = d < today;
    let text = day < 10 ? `  ${day}  ` : ` ${day} `;
    if (isPast) text = `·${day}·`;
    row.push({ text, callback_data: `${actionPrefix}:${iso}` });
    if (row.length === 7) { keyboard.push(row); row = []; }
  }
  if (row.length > 0) {
    while (row.length < 7) row.push({ text: " ", callback_data: "none" });
    keyboard.push(row);
  }

  keyboard.push([
    { text: "⬅️", callback_data: `admin_cal_offset:${actionPrefix}:${monthOffset - 1}` },
    { text: "➡️", callback_data: `admin_cal_offset:${actionPrefix}:${monthOffset + 1}` },
  ]);
  keyboard.push([{ text: `⬅️ ${t(lang, "admin_btn_back")}`, callback_data: "admin:main" }]);
  return { inline_keyboard: keyboard };
}

async function handleAdminDayOverview(ctx, lang, date) {
  const closed = isDayClosed(ctx.db, date);
  const bookings = getBookingsForDate(ctx.db, date);
  const displayDate = DateTime.fromISO(date).toLocaleString(DateTime.DATE_MED);

  let text = t(lang, "admin_day_overview", {
    date: displayDate,
    closed: closed ? t(lang, "admin_closed_yes") : t(lang, "admin_closed_no"),
  }) + "\n";

  if (!bookings.length) {
    text += `\n${t(lang, "admin_no_slots")}`;
  } else {
    for (const b of bookings) {
      text += `\n🔹 <b>${b.time}</b> — <b>${b.name}</b> (${b.phone})`;
    }
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, "admin_btn_add_time"), callback_data: `admin_add_time:${date}` }],
        [{ text: t(lang, "admin_btn_toggle_close_day"), callback_data: `admin_toggle_day:${date}` }],
        [{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }],
      ],
    },
  });
}

async function toggleDayClosed(ctx, lang, date) {
  if (isDayClosed(ctx.db, date)) {
    openDay(ctx.db, date);
    await ctx.answerCallbackQuery({ text: t(lang, "admin_day_opened", { date }), show_alert: true });
  } else {
    closeDay(ctx.db, date);
    await ctx.answerCallbackQuery({ text: t(lang, "admin_day_closed", { date }), show_alert: true });
  }
  await handleAdminDayOverview(ctx, lang, date);
}

async function askAdminForTime(ctx, lang, date) {
  ctx.session.admin = { ...ctx.session.admin, step: "enter_time", date };
  await ctx.editMessageText(t(lang, "admin_send_time"), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }]] },
  });
}

async function handleAdminTimeInput(ctx, lang) {
  const timeStr = ctx.message.text.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) {
    return ctx.reply(t(lang, "admin_time_invalid"));
  }
  addSlot(ctx.db, ctx.session.admin.date, timeStr);
  await ctx.reply(t(lang, "admin_time_added", { date: ctx.session.admin.date, time: timeStr }));
  ctx.session.admin = null;
}

async function handleAdminViewSchedule(ctx, lang) {
  await ctx.editMessageText(t(lang, "admin_pick_date"), {
    parse_mode: "HTML",
    reply_markup: buildAdminDatesKeyboard(ctx, lang, "admin_view"),
  });
}

async function showScheduleForDate(ctx, lang, date) {
  const bookings = getBookingsForDate(ctx.db, date);
  const displayDate = DateTime.fromISO(date).toLocaleString(DateTime.DATE_MED);
  let text = t(lang, "admin_schedule_for_date", { date: displayDate });
  if (!bookings.length) {
    text += "\n\n" + t(lang, "admin_schedule_empty");
  } else {
    for (const b of bookings) {
      text += `\n\n🔹 <b>${b.time}</b> — <b>${b.name}</b> (${b.phone})`;
    }
  }
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }]] },
  });
}

async function handleAdminCancelBooking(ctx, lang) {
  await ctx.editMessageText(t(lang, "admin_pick_date"), {
    parse_mode: "HTML",
    reply_markup: buildAdminDatesKeyboard(ctx, lang, "admin_cancel_date"),
  });
}

async function pickBookingToCancel(ctx, lang, date) {
  const bookings = getBookingsForDate(ctx.db, date);
  if (!bookings.length) {
    return ctx.editMessageText(t(lang, "admin_cancel_no_bookings", { date }), {
      reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }]] },
    });
  }
  const kb = bookings.map((b) => [{ text: `${b.time} — ${b.name}`, callback_data: `admin_cancel_id:${b.id}` }]);
  kb.push([{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }]);
  await ctx.editMessageText(t(lang, "admin_cancel_pick_booking", { date }), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: kb },
  });
}

async function cancelBookingById(ctx, lang, bookingId) {
  const booking = cancelBooking(ctx.db, bookingId);
  await ctx.answerCallbackQuery({ text: t(lang, "admin_booking_canceled") });
  await ctx.editMessageText(t(lang, "admin_cancel_success_custom", { name: booking.name, date: booking.date, time: booking.time }), {
    reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }]] },
  });
}

async function showAdminSettings(ctx, lang) {
  const keyboard = {
    inline_keyboard: [
      [{ text: `📅 ${t(lang, "set_work_days")}`, callback_data: "admin:conf_days" }],
      [{ text: `⏳ ${t(lang, "set_interval")}`, callback_data: "admin:conf_step" }, { text: `🕒 ${t(lang, "set_hours")}`, callback_data: "admin:conf_hours" }],
      [{ text: `👥 Capacity`, callback_data: "admin:conf_capacity" }],
      [{ text: t(lang, "admin_btn_edit_services"), callback_data: "admin:edit_services" }],
      [{ text: t(lang, "admin_btn_edit_assets"), callback_data: "admin:edit_assets" }],
      [{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }],
    ],
  };
  await ctx.editMessageText(t(lang, "admin_settings"), { parse_mode: "HTML", reply_markup: keyboard });
}

async function showStepSettings(ctx, lang) {
  const keyboard = {
    inline_keyboard: [
      [{ text: "30 min", callback_data: "admin:save_step:30" }, { text: "1 hour", callback_data: "admin:save_step:60" }],
      [{ text: "2 hours", callback_data: "admin:save_step:120" }],
      [{ text: t(lang, "admin_btn_back"), callback_data: "admin:settings" }],
    ],
  };
  await ctx.editMessageText(t(lang, "interval_select"), { parse_mode: "HTML", reply_markup: keyboard });
}

async function showWorkDaysSettings(ctx, lang) {
  const currentDays = getSetting(ctx.db, "work_days", [1, 2, 3, 4, 5]);
  const weekDaysShort = t(lang, "week_days");
  const buttons = weekDaysShort.map((name, index) => {
    const dayNum = index === 6 ? 0 : index + 1;
    const isWorking = currentDays.includes(dayNum);
    return { text: `${isWorking ? "✅" : "❌"} ${name}`, callback_data: `admin:toggle_workday:${dayNum}` };
  });
  const keyboard = [];
  while (buttons.length) keyboard.push(buttons.splice(0, 4));
  keyboard.push([{ text: t(lang, "admin_btn_back"), callback_data: "admin:settings" }]);
  await ctx.editMessageText(t(lang, "select_day"), { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } });
}

async function askAdminForHours(ctx, lang) {
  ctx.session.admin = { ...ctx.session.admin, step: "enter_hours" };
  const currentStart = getSetting(ctx.db, "start_time", "10:00");
  const currentEnd = getSetting(ctx.db, "end_time", "18:00");
  await ctx.editMessageText(t(lang, "admin_hours_status", { start: currentStart, end: currentEnd }), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_back"), callback_data: "admin:settings" }]] },
  });
}

async function askAdminForServices(ctx, lang) {
  ctx.session.admin = { ...ctx.session.admin, step: "enter_services" };
  await ctx.editMessageText(t(lang, "admin_edit_prices_msg", { current: getSetting(ctx.db, "custom_services", "") }), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_back"), callback_data: "admin:settings" }]] },
  });
}

async function askAdminForAssets(ctx, lang) {
  ctx.session.admin = { ...ctx.session.admin, step: "enter_assets" };
  await ctx.editMessageText(t(lang, "admin_portfolio_msg", { current: getSetting(ctx.db, "custom_assets", "") }), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_back"), callback_data: "admin:settings" }]] },
  });
}

async function askAdminForBroadcast(ctx, lang) {
  ctx.session.admin = { ...ctx.session.admin, step: "enter_broadcast" };
  await ctx.editMessageText(t(lang, "admin_broadcast_ask"), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_cancel"), callback_data: "admin:main" }]] },
  });
}

async function showStats(ctx, lang) {
  const stats = getAdminStats(ctx.db);
  await ctx.editMessageText(t(lang, "admin_stats_text", { totalUsers: stats.totalUsers, activeClients: stats.activeClients, upcoming: stats.upcomingBookings, total: stats.totalBookings }), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }]] },
  });
}

async function showCapacitySettings(ctx, lang) {
  const keyboard = {
    inline_keyboard: [
      [{ text: "1", callback_data: "admin:save_capacity:1" }, { text: "2", callback_data: "admin:save_capacity:2" }, { text: "3", callback_data: "admin:save_capacity:3" }, { text: "No Limit", callback_data: "admin:save_capacity:999" }],
      [{ text: t(lang, "admin_btn_back"), callback_data: "admin:settings" }],
    ],
  };
  await ctx.editMessageText("Select concurrent bookings limit per slot:", { parse_mode: "HTML", reply_markup: keyboard });
}

export {
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
  askAdminForServices,
  askAdminForAssets,
  askAdminForBroadcast,
  showStats,
  showCapacitySettings,
};
