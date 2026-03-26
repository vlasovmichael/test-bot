import { getAllTenants } from "./database/master_db.js";
import { CURRENT_DB_VERSION } from "./database/schema.js";
import Database from "better-sqlite3";
import fs from "fs";

async function runHealthCheck() {
  const tenants = getAllTenants();
  console.log(`--- SaaS Health Check ---`);
  console.log(`Total Tenants Registered: ${tenants.length}\n`);

  const results = {
    healthy: 0,
    unreachable: 0,
    outdated: 0,
    details: []
  };

  for (const tenant of tenants) {
    let status = "OK";
    let version = "Unknown";
    let reachable = true;

    try {
      if (!fs.existsSync(tenant.db_path)) {
        throw new Error("File not found");
      }

      const db = new Database(tenant.db_path, { readonly: true });
      const row = db.prepare("SELECT value FROM settings WHERE key = 'db_version'").get();
      version = row ? parseInt(row.value) : 0;
      db.close();

      if (version < CURRENT_DB_VERSION) {
        status = "OUTDATED";
        results.outdated++;
      } else {
        results.healthy++;
      }
    } catch (error) {
      reachable = false;
      status = "ERROR";
      results.unreachable++;
    }

    results.details.push({
      id: tenant.id,
      status,
      version,
      path: tenant.db_path
    });
  }

  // Summary
  console.table(results.details);
  console.log(`\nSummary:`);
  console.log(`✅ Healthy: ${results.healthy}`);
  console.log(`⚠️ Outdated: ${results.outdated}`);
  console.log(`❌ Unreachable: ${results.unreachable}`);

  if (results.unreachable > 0 || results.outdated > 0) {
    process.exit(1);
  }
}

runHealthCheck();
