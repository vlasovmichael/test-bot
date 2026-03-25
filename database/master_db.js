import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const masterDbPath = path.join(__dirname, "..", "master.db");
const masterDb = new Database(masterDbPath);

masterDb.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bot_token TEXT UNIQUE NOT NULL,
  db_path TEXT UNIQUE NOT NULL,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

export function registerTenant(id, name, botToken, dbPath, timezone) {
  masterDb.prepare("INSERT OR REPLACE INTO tenants (id, name, bot_token, db_path, timezone) VALUES (?, ?, ?, ?, ?)").run(id, name, botToken, dbPath, timezone);
}

export function getTenantById(id) {
  return masterDb.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
}

export function getAllTenants() {
  return masterDb.prepare("SELECT * FROM tenants").all();
}

export { masterDb };
