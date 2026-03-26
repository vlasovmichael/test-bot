import { startAllBots } from "./src/core/bot.js";
import { registerTenant } from "./src/database/master.js";
import dotenv from "dotenv";
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (BOT_TOKEN && ADMIN_ID) {
  try {
    registerTenant({
      telegramId: ADMIN_ID,
      businessName: "Default Tenant",
      timezone: "Europe/Warsaw",
      botToken: BOT_TOKEN,
    });
    console.log("Registered default tenant from .env");
  } catch (e) {
    // Already registered, most likely.
  }
}

startAllBots();
