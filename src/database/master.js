import Database from "better-sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, "../../data/master.sqlite");
const masterDb = new Database(dbPath);

masterDb.pragma("journal_mode = WAL");

masterDb.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL, -- Admin's Telegram ID
  business_name TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  bot_token TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

export function getTenantByBotToken(token) {
  return masterDb.prepare("SELECT * FROM tenants WHERE bot_token = ?").get(token);
}

export function getTenantByAdminId(adminId) {
  return masterDb.prepare("SELECT * FROM tenants WHERE telegram_id = ?").get(String(adminId));
}

export function registerTenant(data) {
  const { telegramId, businessName, timezone, botToken } = data;
  return masterDb.prepare(
    "INSERT INTO tenants (telegram_id, business_name, timezone, bot_token) VALUES (?, ?, ?, ?)"
  ).run(String(telegramId), businessName, timezone || 'UTC', botToken);
}

export { masterDb };
