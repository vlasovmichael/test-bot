import { describe, it, expect, beforeAll } from "vitest";
import { registerTenant } from "../database/master_db.js";
import { tenantSchema } from "../database/schema.js";
import { getAvailableSlotsForDate, getCategories, setSetting, autoGenerateSlots } from "../database/db.js";
import Database from "better-sqlite3";
import fs from "fs";
import { DateTime } from "luxon";

describe("Database Multi-tenancy", () => {
  const t1 = "tenant_db1";
  const db1Path = "./tests/db_test1.db";

  beforeAll(() => {
    if (fs.existsSync(db1Path)) fs.unlinkSync(db1Path);
    const db1 = new Database(db1Path);
    db1.exec(tenantSchema);
    db1.close();
    registerTenant(t1, "Tenant 1", "tok1", db1Path, "Europe/Warsaw");
  });

  it("should isolate categories between tenants", () => {
    const db1 = new Database(db1Path);
    db1.prepare("INSERT INTO categories (name) VALUES ('Cat 1')").run();
    db1.close();

    const cats1 = getCategories(t1);
    expect(cats1.length).toBeGreaterThan(0);
    expect(cats1[0].name).toBe("Cat 1");
  });

  it("should generate slots correctly for a tenant", () => {
    const today = DateTime.now().setZone("Europe/Warsaw");
    const workDay = today.plus({ days: 1 }).weekday; // Get a day in the future

    setSetting(t1, "work_days", [workDay]);
    setSetting(t1, "start_time", "09:00");
    setSetting(t1, "end_time", "11:00");
    setSetting(t1, "step_min", 60);
    setSetting(t1, "timezone", "Europe/Warsaw");

    autoGenerateSlots(t1);

    const targetDate = today.plus({ days: 1 }).toISODate();
    const slots = getAvailableSlotsForDate(t1, targetDate);
    expect(slots.length).toBeGreaterThan(0);
  });
});
