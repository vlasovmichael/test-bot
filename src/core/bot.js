import { Bot, session } from "grammy";
import { getTenantDatabase } from "../database/factory.js";
import { t, getLanguageButtons } from "./i18n.js";
import { startGlobalReminderScheduler } from "../handlers/reminders.js";
import * as db from "../database/db_adapter.js";
import * as mainMenu from "../handlers/mainMenu.js";
import * as booking from "../handlers/booking.js";
import * as admin from "../handlers/admin.js";

function initialSession() {
  return {
    language: null,
    booking: null,
    admin: null,
  };
}

export function createBot(token, tenant) {
  const bot = new Bot(token);

  bot.use(session({ initial: initialSession }));

  bot.use(async (ctx, next) => {
    ctx.tenant = tenant;
    ctx.db = getTenantDatabase(tenant.id);
    ctx.t = (key, vars) => t(ctx.session.language || "en", key, vars);
    return next();
  });

  bot.command("start", async (ctx) => {
    const userId = ctx.from.id;
    const user = db.getUserByTelegramId(ctx.db, userId);

    db.upsertUser(ctx.db, userId, {
      name: user?.name || null,
      phone: user?.phone || null,
      language: user?.language || ctx.session.language || null,
      is_admin: userId === Number(ctx.tenant.telegram_id) ? 1 : user?.is_admin || 0,
    });

    const lang = user?.language || ctx.session.language;

    if (!lang) {
      await ctx.reply(ctx.t("language_select_title"), {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: getLanguageButtons() },
      });
      return;
    }

    ctx.session.language = lang;
    await mainMenu.sendMainMenu(ctx, lang);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith("lang:")) {
      const lang = data.split(":")[1];
      ctx.session.language = lang;
      db.upsertUser(ctx.db, ctx.from.id, {
        language: lang,
        is_admin: ctx.from.id === Number(ctx.tenant.telegram_id) ? 1 : 0,
      });
      await ctx.answerCallbackQuery();
      await mainMenu.updateMainMenu(ctx, lang);
      return;
    }

    if (data.startsWith("menu:")) {
      const action = data.split(":")[1];
      const lang = ctx.session.language || "en";

      if (action === "book") {
        await booking.startBooking(ctx, lang);
        return;
      }
      if (action === "services") {
        await mainMenu.handleServices(ctx, lang);
        return;
      }
      if (action === "assets") {
        await mainMenu.handleAssets(ctx, lang);
        return;
      }
      if (action === "my_bookings") {
        await mainMenu.handleMyBookings(ctx, lang);
        return;
      }
      if (action === "language") {
        await mainMenu.handleChangeLanguageMenu(ctx, lang);
        return;
      }
      if (action === "back") {
        await mainMenu.updateMainMenu(ctx, lang);
        return;
      }
    }

    if (data.startsWith("cal_offset:")) {
      const offset = parseInt(data.split(":")[1]);
      const lang = ctx.session.language || "en";
      await ctx.editMessageReplyMarkup({
        reply_markup: booking.buildUserCalendar(ctx, lang, "book_date", offset),
      });
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith("book_date:")) {
      await booking.handleDateSelect(ctx, ctx.session.language || "en", data.split(":")[1]);
      return;
    }

    if (data.startsWith("book_time:")) {
      await booking.handleTimeSelect(ctx, ctx.session.language || "en", Number(data.split(":")[1]));
      return;
    }

    if (data.startsWith("admin:")) {
      if (String(ctx.from.id) !== String(ctx.tenant.telegram_id)) {
        await ctx.answerCallbackQuery({ text: ctx.t("admin_only"), show_alert: true });
        return;
      }
      const action = data.split(":")[1];
      const lang = ctx.session.language || "en";

      if (action === "main") { await admin.showAdminPanel(ctx, lang); return; }
      if (action === "manage_days") { await admin.handleManageDays(ctx, lang); return; }
      if (action === "view_schedule") { await admin.handleAdminViewSchedule(ctx, lang); return; }
      if (action === "cancel_booking") { await admin.handleAdminCancelBooking(ctx, lang); return; }
      if (action === "settings") { await admin.showAdminSettings(ctx, lang); return; }
      if (action === "conf_step") { await admin.showStepSettings(ctx, lang); return; }
      if (action === "conf_days") { await admin.showWorkDaysSettings(ctx, lang); return; }
      if (action === "conf_hours") { await admin.askAdminForHours(ctx, lang); return; }
      if (action === "conf_capacity") { await admin.showCapacitySettings(ctx, lang); return; }
      if (action === "edit_services") { await admin.askAdminForServices(ctx, lang); return; }
      if (action === "edit_assets") { await admin.askAdminForAssets(ctx, lang); return; }
      if (action === "broadcast_slot") { await admin.askAdminForBroadcast(ctx, lang); return; }
      if (action === "stats") { await admin.showStats(ctx, lang); return; }

      if (action === "save_step") {
        const step = parseInt(data.split(":")[2]);
        db.setSetting(ctx.db, "step_min", step);
        await ctx.answerCallbackQuery({ text: ctx.t("saved") });
        await admin.showAdminSettings(ctx, lang);
        db.autoGenerateSlots(ctx.db);
        return;
      }

      if (action === "save_capacity") {
        const cap = parseInt(data.split(":")[2]);
        db.setSetting(ctx.db, "default_capacity", cap);
        await ctx.answerCallbackQuery({ text: ctx.t("saved") });
        await admin.showAdminSettings(ctx, lang);
        db.autoGenerateSlots(ctx.db);
        return;
      }

      if (action === "toggle_workday") {
        const day = parseInt(data.split(":")[2]);
        let days = db.getSetting(ctx.db, "work_days", [1, 2, 3, 4, 5]);
        days = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
        db.setSetting(ctx.db, "work_days", days);
        await ctx.answerCallbackQuery();
        await admin.showWorkDaysSettings(ctx, lang);
        return;
      }
    }

    if (data.startsWith("admin_day:")) { await admin.handleAdminDayOverview(ctx, ctx.session.language || "en", data.split(":")[1]); return; }
    if (data.startsWith("admin_add_time:")) { await admin.askAdminForTime(ctx, ctx.session.language || "en", data.split(":")[1]); return; }
    if (data.startsWith("admin_toggle_day:")) { await admin.toggleDayClosed(ctx, ctx.session.language || "en", data.split(":")[1]); return; }
    if (data.startsWith("admin_view:")) { await admin.showScheduleForDate(ctx, ctx.session.language || "en", data.split(":")[1]); return; }
    if (data.startsWith("admin_cancel_date:")) { await admin.pickBookingToCancel(ctx, ctx.session.language || "en", data.split(":")[1]); return; }
    if (data.startsWith("admin_cancel_id:")) { await admin.cancelBookingById(ctx, ctx.session.language || "en", Number(data.split(":")[1])); return; }

    return next();
  });

  bot.on("message:text", async (ctx) => {
    const lang = ctx.session.language || "en";
    const adminId = Number(ctx.tenant.telegram_id);

    if (ctx.from.id === adminId && ctx.session.admin?.step) {
      const step = ctx.session.admin.step;
      if (step === "enter_hours") {
        const m = ctx.message.text.trim().match(/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/);
        if (!m) return ctx.reply(ctx.t("admin_hours_error"));
        db.setSetting(ctx.db, "start_time", `${m[1]}:${m[2]}`);
        db.setSetting(ctx.db, "end_time", `${m[3]}:${m[4]}`);
        ctx.session.admin.step = null;
        db.autoGenerateSlots(ctx.db);
        await ctx.reply(ctx.t("admin_hours_updated", { start: `${m[1]}:${m[2]}`, end: `${m[3]}:${m[4]}` }), {
          reply_markup: { inline_keyboard: [[{ text: t(lang, "admin_btn_back"), callback_data: "admin:main" }]] }
        });
        return;
      }
      if (step === "enter_time") { await admin.handleAdminTimeInput(ctx, lang); return; }
    }

    const bStep = ctx.session.booking?.step;
    if (bStep === "enter_name") return booking.handleNameInput(ctx, lang);
    if (bStep === "enter_phone") return booking.handlePhoneInput(ctx, lang);
  });

  bot.callbackQuery(/^book_confirm:(.+)$/, async (ctx) => {
    await booking.handleFinalConfirm(ctx, ctx.session.language || "en", ctx.match[1]);
  });

  bot.callbackQuery(/^cancel_my_booking:(.+)$/, async (ctx) => {
    db.cancelBooking(ctx.db, Number(ctx.match[1]));
    await ctx.answerCallbackQuery({ text: "Booking canceled." });
    await mainMenu.updateMainMenu(ctx, ctx.session.language || "en");
  });

  bot.command("admin", async (ctx) => {
    if (String(ctx.from.id) === String(ctx.tenant.telegram_id)) {
      await admin.showAdminPanel(ctx, ctx.session.language || "en");
    }
  });

  return bot;
}

export async function startAllBots() {
  const { masterDb } = await import("../database/master.js");
  const tenants = masterDb.prepare("SELECT * FROM tenants").all();
  for (const tenant of tenants) {
    try {
      const bot = createBot(tenant.bot_token, tenant);
      bot.start();
      console.log(`Bot for tenant ${tenant.business_name} started.`);
    } catch (e) { console.error(`Failed to start bot for tenant ${tenant.business_name}:`, e); }
  }
  startGlobalReminderScheduler(new Bot(tenants[0]?.bot_token || "").api);
}
