import { z } from "zod";

const configSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  ADMIN_ID: z.number().int(),
  DB_NAME: z.string().default("beauty-bot.db"),
  TENANT_ID: z.string().default("default"),
  TIMEZONE: z.string().default("Europe/Warsaw"),
  SCHEDULE_CHANNEL_ID: z.string().optional(),
  SUBSCRIPTION_CHANNEL_ID: z.string().optional(),
  INSTAGRAM_LINK: z.string().url().default("https://instagram.com"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
});

export function validateConfig(config) {
  return configSchema.parse(config);
}
