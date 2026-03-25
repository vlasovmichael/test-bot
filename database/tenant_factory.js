import { LRUCache } from "lru-cache";
import Database from "better-sqlite3";
import { getTenantById } from "./master_db.js";
import { tenantSchema } from "./schema.js";
import fs from "fs";
import path from "path";

const options = {
  max: 50,
  dispose: (db, key) => {
    db.close();
  },
};

const cache = new LRUCache(options);

export function getTenantDb(tenantId) {
  if (cache.has(tenantId)) {
    return cache.get(tenantId);
  }

  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found in Master Registry`);
  }

  // Ensure directory exists
  const dbDir = path.dirname(tenant.db_path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const isNew = !fs.existsSync(tenant.db_path);
  const db = new Database(tenant.db_path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (isNew) {
    db.exec(tenantSchema);
    console.log(`Initialized new database for tenant: ${tenantId}`);
  }

  cache.set(tenantId, db);
  return db;
}

export function closeAllTenantDbs() {
  cache.clear();
}
