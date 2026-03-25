// Проверка подписки пользователя на обязательный канал

import { SUBSCRIPTION_CHANNEL_ID } from "../config.js";
import { t } from "../i18n.js";

// Проверяем подписку через getChatMember
async function isUserSubscribed(bot, userId) {
  if (!SUBSCRIPTION_CHANNEL_ID) return true; // еслиs канал не задан, не блокируем
  try {
    const member = await bot.api.getChatMember(SUBSCRIPTION_CHANNEL_ID, userId);
    const status = member.status;
    // считаем подписанными всех, кто не "left" и не "kicked"
    return status !== "left" && status !== "kicked";
  } catch (e) {
    // если ошибка (бот не админ на канале и т.п.) — считаем, что не подписан
    return false;
  }
}

// Отправляем сообщение с кнопками подписки
async function sendSubscriptionRequest(ctx, lang) {
  const url = SUBSCRIPTION_CHANNEL_ID
    ? `https://t.me/${SUBSCRIPTION_CHANNEL_ID.replace("@", "")}`
    : "https://t.me";

  await ctx.reply(t(lang, "subscription_required"), {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t(lang, "btn_subscribe"),
            url,
          },
        ],
        [
          {
            text: t(lang, "btn_check_subscription"),
            callback_data: "sub_check",
          },
        ],
      ],
    },
  });
}

export { isUserSubscribed, sendSubscriptionRequest };
