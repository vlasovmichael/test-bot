import fs from "fs";
import path from "path";
import { registerTenant } from "./database/master_db.js";
import { tenantSchema } from "./database/schema.js";
import { setSetting, autoGenerateSlots } from "./database/db.js";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function initializeTenant(tenantId, name, botToken, timezone = "Europe/Warsaw") {
  const dbDir = path.join(__dirname, "tenants_db");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
  }

  const dbPath = path.join(dbDir, `${tenantId}.db`);

  // 1. Create physical DB and run schema
  const db = new Database(dbPath);
  db.exec(tenantSchema);
  db.close();

  // 2. Register in Master DB
  registerTenant(tenantId, name, botToken, dbPath, timezone);

  // 3. Default settings (now directing to the new physical DB)
  setSetting(tenantId, "work_days", [1, 2, 3, 4, 5]);
  setSetting(tenantId, "start_time", "09:00");
  setSetting(tenantId, "end_time", "18:00");
  setSetting(tenantId, "step_min", 60);

  // 4. Generate initial slots
  autoGenerateSlots(tenantId);

  console.log(`Tenant ${tenantId} initialized with separate database at ${dbPath}`);
}

// CLI usage: node onboard.js <ID> <NAME> <TOKEN> [TIMEZONE]
if (process.argv[2] && process.argv[4]) {
  initializeTenant(process.argv[2], process.argv[3], process.argv[4], process.argv[5]);
}
