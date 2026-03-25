export const migrations = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    language TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER,
    duration_min INTEGER DEFAULT 60,
    is_active INTEGER DEFAULT 1
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER, -- Optional: link to a specific asset like a chair or room
    date TEXT NOT NULL,           -- YYYY-MM-DD
    time TEXT NOT NULL,           -- HH:MM (UTC internally, or stored as local with TZ awareness)
    capacity INTEGER DEFAULT 1,    -- How many concurrent bookings allowed
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (asset_id) REFERENCES assets(id)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER NOT NULL,
    user_telegram_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    service_id INTEGER,
    status TEXT NOT NULL DEFAULT 'active', -- active / canceled
    created_at TEXT DEFAULT (datetime('now')),
    appointment_at TEXT NOT NULL,         -- ISO datetime (UTC)
    reminder_at TEXT,
    reminder_sent INTEGER DEFAULT 0,
    FOREIGN KEY (slot_id) REFERENCES slots(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS closed_days (
    date TEXT PRIMARY KEY,        -- YYYY-MM-DD
    is_closed INTEGER DEFAULT 1
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `
];

export function runMigrations(db) {
  for (const migration of migrations) {
    db.exec(migration);
  }
}
