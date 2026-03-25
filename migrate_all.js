import { getAllTenants } from "./database/master_db.js";
import Database from "better-sqlite3";

export function migrateAll(sql) {
  const tenants = getAllTenants();
  console.log(`Starting migration for ${tenants.length} tenants...`);

  for (const tenant of tenants) {
    console.log(`Migrating tenant: ${tenant.id} (${tenant.db_path})`);
    try {
      const db = new Database(tenant.db_path);
      db.exec(sql);
      db.close();
      console.log(`✅ Success: ${tenant.id}`);
    } catch (error) {
      console.error(`❌ Failed: ${tenant.id}`, error);
    }
  }
}

// CLI usage: node migrate_all.js "ALTER TABLE users ADD COLUMN bio TEXT;"
if (process.argv[2]) {
  migrateAll(process.argv[2]);
}
