import Database from "better-sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrations.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbConnections = new Map();

/**
 * Connect to a tenant-specific database and run migrations.
 * @param {string} tenantId
 */
export function getTenantDatabase(tenantId) {
  if (dbConnections.has(tenantId)) {
    return dbConnections.get(tenantId);
  }

  const dbPath = join(__dirname, `../../data/db_${tenantId}.sqlite`);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  runMigrations(db);

  dbConnections.set(tenantId, db);
  return db;
}

export function closeAllConnections() {
  for (const [tenantId, db] of dbConnections.entries()) {
    db.close();
  }
  dbConnections.clear();
}
