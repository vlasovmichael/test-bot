import { ADMIN_ID, INSTAGRAM_LINK } from "../config.js";
import { t, getLanguageButtons } from "../i18n.js";
import { getSetting } from "../database/db.js";

function mainMenuKeyboard(lang, userId) {
  const keyboard = [
    [{ text: t(lang, "btn_book"), callback_data: "menu:book" }],
    [{ text: t(lang, "btn_prices"), callback_data: "menu:prices" }],
    [{ text: t(lang, "btn_portfolio"), callback_data: "menu:portfolio" }],
    [{ text: t(lang, "btn_change_language"), callback_data: "menu:language" }],
  ];
  if (userId && String(userId) === String(ADMIN_ID)) {
    keyboard.push([{ text: "🛠 ADMIN PANEL", callback_data: "admin:main" }]);
  }
  return { inline_keyboard: keyboard };
}

async function sendMainMenu(ctx, lang) {
  const userId = ctx.from.id;
  await ctx.reply(t(lang, "main_menu_title"), { parse_mode: "HTML", reply_markup: mainMenuKeyboard(lang, userId) });
}

async function handleChangeLanguageMenu(ctx, lang) {
  await ctx.editMessageText(t(lang, "language_select_title"), { parse_mode: "HTML", reply_markup: { inline_keyboard: getLanguageButtons() } });
}

async function updateMainMenu(ctx, lang) {
  const userId = ctx.from.id;
  await ctx.editMessageText(t(lang, "main_menu_title"), { parse_mode: "HTML", reply_markup: mainMenuKeyboard(lang, userId) });
}

async function handlePrices(ctx, lang) {
  const customPrices = getSetting(ctx.tenantId, "custom_prices", null);
  const current = customPrices || t(lang, "prices_default");
  const text = t(lang, "prices_text", { current });
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" }]] } });
}

async function handlePortfolio(ctx, lang) {
  const customLinks = getSetting(ctx.tenantId, "portfolio_links", [
    { name: "Instagram", url: INSTAGRAM_LINK || "https://instagram.com" },
  ]);
  const portfolioText = getSetting(ctx.tenantId, "portfolio_text", null) || t(lang, "portfolio_default");
  const text = t(lang, "portfolio_text", { current: portfolioText });
  const keyboard = customLinks.map((link) => [{ text: link.name, url: link.url }]);
  keyboard.push([{ text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" }]);
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } });
}

export { mainMenuKeyboard, sendMainMenu, handleChangeLanguageMenu, updateMainMenu, handlePrices, handlePortfolio };
