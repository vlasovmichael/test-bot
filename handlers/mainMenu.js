// Обработчики главного меню: кнопки "Записаться", "Цены", "Портфолио", "Смена языка"

import { ADMIN_ID, INSTAGRAM_LINK } from "../config.js";
import { t, getLanguageButtons } from "../i18n.js";
import { getSetting } from "../database/db.js";

// Формирование клавиатуры главного меню (inline)
function mainMenuKeyboard(lang, userId) {
  const keyboard = [
    [{ text: t(lang, "btn_book"), callback_data: "menu:book" }],
    [{ text: t(lang, "btn_prices"), callback_data: "menu:prices" }],
    [{ text: t(lang, "btn_portfolio"), callback_data: "menu:portfolio" }],
    [{ text: t(lang, "btn_change_language"), callback_data: "menu:language" }],
  ];

  // Проверяем: userId не пустой и совпадает с админским
  if (userId && String(userId) === String(ADMIN_ID)) {
    keyboard.push([{ text: "🛠 ADMIN PANEL", callback_data: "admin:main" }]);
  }

  return { inline_keyboard: keyboard };
}

// 3. В функции sendMainMenu обязательно достаем userId из контекста
async function sendMainMenu(ctx, lang) {
  const userId = ctx.from.id; // Достаем ID того, кто нажал
  await ctx.reply(t(lang, "main_menu_title"), {
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(lang, userId), // Передаем его в клавиатуру
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
  // Используем editMessageText, чтобы заменить текст "Запись отменена" на меню
  await ctx.editMessageText(t(lang, "main_menu_title"), {
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(lang, userId),
  });
}

async function handlePrices(ctx, lang) {
  const userId = ctx.from.id; // Добавляем получение ID
  const customPrices = getSetting("custom_prices", null);
  const text = customPrices || t(lang, "prices_text");

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      // Вместо ручного создания массива, используем нашу готовую функцию
      inline_keyboard: [
        [
          {
            text: `⬅️ ${t(lang, "btn_back_main")}`,
            callback_data: "menu:back",
          },
        ],
      ],
    },
  });
}

async function handlePortfolio(ctx, lang) {
  const userId = ctx.from.id; // Добавляем получение ID
  const customLinks = getSetting("portfolio_links", [
    { name: "Instagram", url: INSTAGRAM_LINK || "https://instagram.com" },
  ]);

  const text = getSetting("portfolio_text", null) || t(lang, "portfolio_text");

  const keyboard = customLinks.map((link) => [
    { text: link.name, url: link.url },
  ]);

  // Кнопка назад
  keyboard.push([
    { text: `⬅️ ${t(lang, "btn_back_main")}`, callback_data: "menu:back" },
  ]);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

export {
  mainMenuKeyboard,
  sendMainMenu,
  handleChangeLanguageMenu,
  updateMainMenu,
  handlePrices,
  handlePortfolio,
};
