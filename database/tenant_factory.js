import { LRUCache } from "lru-cache";
import Database from "better-sqlite3";
import { getTenantById } from "./master_db.js";
import path from "path";

const options = {
  max: 50, // Keep 50 tenant DB connections active
  dispose: (db, key) => {
    db.close();
    console.log(`Closed DB connection for tenant: ${key}`);
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

  const db = new Database(tenant.db_path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  cache.set(tenantId, db);
  return db;
}

export function closeAllTenantDbs() {
  cache.clear();
}
