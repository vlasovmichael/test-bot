import { describe, it, expect, beforeAll } from "vitest";
import { registerTenant } from "../database/master_db.js";
import { tenantSchema } from "../database/schema.js";
import { upsertUser, getUserByTelegramId, setSetting, createBooking } from "../database/db.js";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

describe("Database-per-Tenant Isolation", () => {
  const t1 = "tenant1";
  const t2 = "tenant2";
  const db1Path = "./tests/t1.db";
  const db2Path = "./tests/t2.db";

  beforeAll(() => {
    if (fs.existsSync(db1Path)) fs.unlinkSync(db1Path);
    if (fs.existsSync(db2Path)) fs.unlinkSync(db2Path);

    const db1 = new Database(db1Path);
    db1.exec(tenantSchema);
    db1.close();

    const db2 = new Database(db2Path);
    db2.exec(tenantSchema);
    db2.close();

    registerTenant(t1, "T1", "token1", db1Path, "Europe/Warsaw");
    registerTenant(t2, "T2", "token2", db2Path, "Europe/Warsaw");
  });

  it("should write data to separate physical files", () => {
    upsertUser(t1, "user_t1", { name: "John" });
    upsertUser(t2, "user_t2", { name: "Jane" });

    const u1 = getUserByTelegramId(t1, "user_t1");
    const u2 = getUserByTelegramId(t2, "user_t2");

    expect(u1.name).toBe("John");
    expect(u2.name).toBe("Jane");

    // Verify cross-tenant retrieval fails (no leakage)
    expect(getUserByTelegramId(t1, "user_t2")).toBeUndefined();
    expect(getUserByTelegramId(t2, "user_t1")).toBeUndefined();
  });

  it("should maintain separate settings", () => {
    setSetting(t1, "mode", "private");
    setSetting(t2, "mode", "public");

    const db1 = new Database(db1Path);
    const s1 = db1.prepare("SELECT value FROM settings WHERE key = 'mode'").get().value;
    db1.close();

    expect(s1).toBe('"private"');
  });
});
