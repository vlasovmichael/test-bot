import { db, setSetting, autoGenerateSlots } from "./database/db.js";

export function initializeTenant(tenantId, name, timezone = "Europe/Warsaw") {
  // Check if tenant exists
  const exists = db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
  if (exists) {
    console.log(`Tenant ${tenantId} already exists.`);
    return;
  }

  // Create tenant
  db.prepare("INSERT INTO tenants (id, name, timezone) VALUES (?, ?, ?)").run(tenantId, name, timezone);

  // Default settings
  setSetting(tenantId, "work_days", [1, 2, 3, 4, 5]);
  setSetting(tenantId, "start_time", "09:00");
  setSetting(tenantId, "end_time", "18:00");
  setSetting(tenantId, "step_min", 60);

  // Generate initial slots
  autoGenerateSlots(tenantId);

  console.log(`Tenant ${tenantId} initialized successfully.`);
}

// CLI usage
if (process.argv[2] && process.argv[3]) {
  initializeTenant(process.argv[2], process.argv[3], process.argv[4]);
}
