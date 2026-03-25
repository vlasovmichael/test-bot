import { t, getLanguageButtons } from "../core/i18n.js";
import { getSetting, getActiveBookingsByUser } from "../database/db_adapter.js";

function mainMenuKeyboard(ctx, lang, userId) {
  const keyboard = [
    [{ text: t(lang, "btn_book"), callback_data: "menu:book" }],
    [{ text: t(lang, "btn_services"), callback_data: "menu:services" }],
    [{ text: t(lang, "btn_assets"), callback_data: "menu:assets" }],
    [{ text: "📅 My Bookings", callback_data: "menu:my_bookings" }],
    [{ text: t(lang, "btn_change_language"), callback_data: "menu:language" }],
  ];

  if (userId && String(userId) === String(ctx.tenant.telegram_id)) {
    keyboard.push([{ text: "🛠 ADMIN PANEL", callback_data: "admin:main" }]);
  }

  return { inline_keyboard: keyboard };
}

async function sendMainMenu(ctx, lang) {
  const userId = ctx.from.id;
  await ctx.reply(t(lang, "main_menu_title"), {
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(ctx, lang, userId),
  });
}

async function handleChangeLanguageMenu(ctx, lang) {
  await ctx.editMessageText(t(lang, "language_select_title"), {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: getLanguageButtons(),
    },
  });
}

async function updateMainMenu(ctx, lang) {
  const userId = ctx.from.id;
  await ctx.editMessageText(t(lang, "main_menu_title"), {
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(ctx, lang, userId),
  });
}

async function handleServices(ctx, lang) {
  const customServices = getSetting(ctx.db, "custom_services", null);
  const text = customServices || t(lang, "services_text");

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" }]],
    },
  });
}

async function handleAssets(ctx, lang) {
  const customAssets = getSetting(ctx.db, "custom_assets", null);
  const text = customAssets || t(lang, "assets_text");

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" }]],
    },
  });
}

async function handleMyBookings(ctx, lang) {
  const bookings = getActiveBookingsByUser(ctx.db, ctx.from.id);
  if (bookings.length === 0) {
    return ctx.editMessageText("You have no active bookings.", {
      reply_markup: { inline_keyboard: [[{ text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" }]] }
    });
  }

  let text = "<b>Your Active Bookings:</b>\n\n";
  const keyboard = [];
  for (const b of bookings) {
    text += `📅 ${b.date} at ${b.time}\n`;
    keyboard.push([{ text: `Cancel ${b.date} ${b.time}`, callback_data: `cancel_my_booking:${b.id}` }]);
  }
  keyboard.push([{ text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" }]);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard }
  });
}

export {
  mainMenuKeyboard,
  sendMainMenu,
  handleChangeLanguageMenu,
  updateMainMenu,
  handleServices,
  handleAssets,
  handleMyBookings,
};
