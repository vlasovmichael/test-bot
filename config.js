import dotenv from "dotenv";
import { validateConfig } from "./utils/config-validator.js";
dotenv.config();

const config = validateConfig({
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_ID: Number(process.env.ADMIN_ID),
  DB_NAME: process.env.DB_NAME,
  TENANT_ID: process.env.TENANT_ID,
  TIMEZONE: process.env.TIMEZONE,
  SCHEDULE_CHANNEL_ID: process.env.SCHEDULE_CHANNEL_ID,
  SUBSCRIPTION_CHANNEL_ID: process.env.SUBSCRIPTION_CHANNEL_ID,
  INSTAGRAM_LINK: process.env.INSTAGRAM_LINK,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
});

export const {
  BOT_TOKEN,
  ADMIN_ID,
  DB_NAME,
  TENANT_ID,
  TIMEZONE,
  SCHEDULE_CHANNEL_ID,
  SUBSCRIPTION_CHANNEL_ID,
  INSTAGRAM_LINK,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
} = config;

export const DEFAULT_SCHEDULE = {
  workDays: [1, 2, 3, 4, 5],
  slots: ["10:00", "12:00", "14:00", "16:00", "18:00"],
};
