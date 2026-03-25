// bot.js - Updated with Admin FSM
import { Bot, session } from "grammy";
import { getRateLimit } from "p-ratelimit";
import { BOT_TOKEN, ADMIN_ID, TENANT_ID, TIMEZONE } from "./config.js";
import {
  db,
  upsertUser,
  getUserByTelegramId,
  getSetting,
  setSetting,
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
  handleCategorySelect,
  handleServiceSelect,
  handleDateSelect,
  handleTimeSelect,
  handleNameInput,
  handlePhoneInput,
  handleFinalConfirm,
} from "./handlers/booking.js";
import {
  showAdminPanel,
  showAdminSettings,
  showWorkDaysSettings,
  showStats,
  handleGoogleAuth,
  handleManageServices,
  handleManageCategory,
  askForCategoryName,
  handleCategoryNameInput,
  askForServiceName,
  handleServiceNameInput,
  handleServiceDurationInput,
  handleServicePriceInput,
} from "./handlers/admin.js";
import { startAuthServer } from "./auth-server.js";
import { getLogger } from "./utils/logger.js";

const limit = getRateLimit({ interval: 1000, rate: 50 });
export const bot = new Bot(BOT_TOKEN);

function initialSession() {
  return { language: null, booking: null, admin: null };
}

bot.use(session({ initial: initialSession }));

bot.use(async (ctx, next) => {
  await limit();
  ctx.tenantId = TENANT_ID;
  const tenant = db.prepare("SELECT timezone FROM tenants WHERE id = ?").get(TENANT_ID);
  ctx.timezone = tenant?.timezone || TIMEZONE;
  ctx.logger = getLogger(ctx.tenantId);
  await next();
});

function getLang(ctx) {
  return ctx.session.language || "en";
}

bot.command("start", async (ctx) => {
  const userId = ctx.from.id;
  const user = getUserByTelegramId(ctx.tenantId, userId);
  upsertUser(ctx.tenantId, userId, {
    name: user?.name || null,
    phone: user?.phone || null,
    language: user?.language || ctx.session.language || null,
    is_admin: userId === ADMIN_ID ? 1 : user?.is_admin || 0,
  });
  const lang = user?.language || ctx.session.language;
  if (!lang) {
    await ctx.reply(t("en", "language_select_title"), { parse_mode: "HTML", reply_markup: { inline_keyboard: getLanguageButtons() } });
    return;
  }
  ctx.session.language = lang;
  await sendMainMenu(ctx, lang);
});

bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const lang = getLang(ctx);

  if (data.startsWith("lang:")) {
    const l = data.split(":")[1];
    ctx.session.language = l;
    upsertUser(ctx.tenantId, ctx.from.id, { language: l });
    await ctx.answerCallbackQuery();
    await updateMainMenu(ctx, l);
    return;
  }

  if (data.startsWith("menu:")) {
    const action = data.split(":")[1];
    if (action === "book") { await ctx.answerCallbackQuery(); await startBooking(ctx, lang); return; }
    if (action === "prices") { await handlePrices(ctx, lang); return; }
    if (action === "portfolio") { await handlePortfolio(ctx, lang); return; }
    if (action === "language") { await handleChangeLanguageMenu(ctx, lang); return; }
    if (action === "back") { await ctx.answerCallbackQuery(); await sendMainMenu(ctx, lang); return; }
  }

  if (data.startsWith("admin:")) {
    if (ctx.from.id !== ADMIN_ID) return;
    const action = data.split(":")[1];
    if (action === "main") { await showAdminPanel(ctx, lang); return; }
    if (action === "settings") { await showAdminSettings(ctx, lang); return; }
    if (action === "conf_days") { await showWorkDaysSettings(ctx, lang); return; }
    if (action === "stats") { await showStats(ctx, lang); return; }
    if (action === "google_auth") { await handleGoogleAuth(ctx, lang); return; }
    if (action === "manage_services") { await handleManageServices(ctx, lang); return; }
    if (action === "add_cat") { await askForCategoryName(ctx, lang); return; }
    if (data.startsWith("admin:manage_cat:")) { await handleManageCategory(ctx, lang, Number(data.split(":")[2])); return; }
    if (data.startsWith("admin:add_srv:")) { await askForServiceName(ctx, lang, Number(data.split(":")[2])); return; }
    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith("book_cat:")) { await handleCategorySelect(ctx, lang, Number(data.split(":")[1])); return; }
  if (data.startsWith("book_srv:")) { await handleServiceSelect(ctx, lang, Number(data.split(":")[1])); return; }
  if (data.startsWith("book_date:")) { await handleDateSelect(ctx, lang, data.split(":")[1]); return; }
  if (data.startsWith("book_time:")) { await handleTimeSelect(ctx, lang, Number(data.split(":")[1])); return; }
  if (data.startsWith("book_confirm:")) { await handleFinalConfirm(ctx, lang, data.split(":")[1]); return; }

  return next();
});

bot.command("admin", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await showAdminPanel(ctx, getLang(ctx));
});

bot.on("message:text", async (ctx) => {
  const lang = getLang(ctx);
  const adminStep = ctx.session.admin?.step;
  if (adminStep === "add_cat_name") return handleCategoryNameInput(ctx, lang);
  if (adminStep === "add_srv_name") return handleServiceNameInput(ctx, lang);
  if (adminStep === "add_srv_duration") return handleServiceDurationInput(ctx, lang);
  if (adminStep === "add_srv_price") return handleServicePriceInput(ctx, lang);

  const bookingStep = ctx.session.booking?.step;
  if (bookingStep === "enter_name") return handleNameInput(ctx, lang);
  if (bookingStep === "enter_phone") return handlePhoneInput(ctx, lang);
});

startReminderScheduler(bot);

bot.catch((err) => {
  console.error(`Error while handling update ${err.ctx.update.update_id}:`, err.error);
});

if (process.env.NODE_ENV !== 'test') {
  bot.start();
  console.log("Bot has been started.");
  startAuthServer();
}
