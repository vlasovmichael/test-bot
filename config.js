// Конфигурация бота и окружения
import dotenv from "dotenv";
dotenv.config();

// Константы лучше выносить отдельно
const DEFAULT_SCHEDULE = {
  workDays: [1, 2, 3, 4, 5],
  slots: ["10:00", "12:00", "14:00", "16:00", "18:00"],
};

// Экспортируем всё по отдельности — это стандарт для ESM
export const BOT_TOKEN = process.env.BOT_TOKEN;
export const ADMIN_ID = Number(process.env.ADMIN_ID);
export const SCHEDULE_CHANNEL_ID = process.env.SCHEDULE_CHANNEL_ID;
export const SUBSCRIPTION_CHANNEL_ID = process.env.SUBSCRIPTION_CHANNEL_ID;
export const INSTAGRAM_LINK =
  process.env.INSTAGRAM_LINK || "https://instagram.com";

// Переменные для базы данных (мониторинг и бэкапы)
export const DB_NAME = process.env.DB_NAME || "beauty-bot.db";
export const KUMA_URL = process.env.KUMA_PUSH_URL || null;

export { DEFAULT_SCHEDULE };
