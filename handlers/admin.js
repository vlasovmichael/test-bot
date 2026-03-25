import {
  getSetting,
  setSetting,
  getAdminStats,
  openDay,
  closeDay,
  isDayClosed,
  getSlotsForDate,
  addSlot,
  getBookingsForDate,
  cancelBooking,
} from "../database/db.js";
import { t } from "../i18n.js";
import { getAuthUrl } from "../utils/google-calendar.js";
import { monthsNominative } from "./months.js";

function buildInlineKeyboard(rows) {
  return { inline_keyboard: rows };
}

function buildAdminMainKeyboard(lang) {
  return buildInlineKeyboard([
    [{ text: t(lang, "admin_btn_settings"), callback_data: "admin:settings" }, { text: t(lang, "admin_btn_manage_days"), callback_data: "admin:manage_days" }],
    [{ text: t(lang, "admin_btn_view_schedule"), callback_data: "admin:view_schedule" }, { text: t(lang, "admin_btn_cancel_booking"), callback_data: "admin:cancel_booking" }],
    [{ text: t(lang, "admin_btn_announcement"), callback_data: "admin:broadcast_slot" }, { text: t(lang, "admin_btn_statistics"), callback_data: "admin:stats" }],
    [{ text: t(lang, "admin_btn_google_auth"), callback_data: "admin:google_auth" }],
    [{ text: t(lang, "btn_back_main"), callback_data: "menu:back" }],
  ]);
}

async function showAdminPanel(ctx, lang) {
  await ctx.reply(t(lang, "admin_panel_title"), { parse_mode: "HTML", reply_markup: buildAdminMainKeyboard(lang) });
}

async function showAdminSettings(ctx, lang) {
  const keyboard = buildInlineKeyboard([
    [{ text: `📅 ${t(lang, "set_work_days")}`, callback_data: "admin:conf_days" }],
    [{ text: `⏳ ${t(lang, "set_interval")}`, callback_data: "admin:conf_step" }, { text: `🕒 ${t(lang, "set_hours")}`, callback_data: "admin:conf_hours" }],
    [{ text: t(lang, "admin_btn_edit_prices"), callback_data: "admin:edit_prices" }, { text: t(lang, "admin_btn_edit_portfolio"), callback_data: "admin:edit_portfolio" }],
    [{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }],
  ]);
  await ctx.editMessageText(t(lang, "admin_settings_title"), { parse_mode: "HTML", reply_markup: keyboard });
}

async function showWorkDaysSettings(ctx, lang) {
  const currentDays = getSetting(ctx.tenantId, "work_days", [1, 2, 3, 4, 5]);
  const weekDaysShort = t(lang, "week_days");
  const buttons = weekDaysShort.map((name, index) => {
    const dayNum = index === 6 ? 0 : index + 1;
    const isWorking = currentDays.includes(dayNum);
    return { text: `${isWorking ? "✅" : "❌"} ${name}`, callback_data: `admin:toggle_workday:${dayNum}` };
  });
  const keyboard = [];
  while (buttons.length) keyboard.push(buttons.splice(0, 4));
  keyboard.push([{ text: t(lang, "admin_btn_back"), callback_data: "admin:settings" }]);
  await ctx.editMessageText(t(lang, "admin_select_workdays"), { parse_mode: "HTML", reply_markup: buildInlineKeyboard(keyboard) });
}

async function showStats(ctx, lang) {
  const stats = getAdminStats(ctx.tenantId);
  const text = t(lang, "admin_stats_text", {
    totalUsers: stats.totalUsers,
    activeClients: stats.activeClients,
    upcoming: stats.upcomingBookings,
    total: stats.totalBookings,
  });
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: buildInlineKeyboard([[{ text: `⬅️ ${t(lang, "admin_btn_back")}`, callback_data: "admin:main" }]]) });
}

async function handleGoogleAuth(ctx, lang) {
  const url = getAuthUrl(ctx.tenantId);
  await ctx.reply(t(lang, "admin_google_auth_msg", { url }));
}

export {
  showAdminPanel,
  showAdminSettings,
  showWorkDaysSettings,
  showStats,
  handleGoogleAuth,
};
