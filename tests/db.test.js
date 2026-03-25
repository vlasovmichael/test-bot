import { describe, it, expect, beforeAll, vi } from "vitest";
import { db, createBooking, getCategories, setSetting, autoGenerateSlots } from "../database/db.js";

describe("Database Multi-tenancy", () => {
  beforeAll(() => {
    // Setup dummy data for testing
    db.prepare("INSERT OR IGNORE INTO tenants (id, name) VALUES ('tenant1', 'Tenant 1')").run();
    db.prepare("INSERT OR IGNORE INTO tenants (id, name) VALUES ('tenant2', 'Tenant 2')").run();
    db.prepare("INSERT OR IGNORE INTO categories (tenant_id, name) VALUES ('tenant1', 'Cat 1')").run();
  });

  it("should isolate categories between tenants", () => {
    const cats1 = getCategories("tenant1");
    const cats2 = getCategories("tenant2");
    expect(cats1.length).toBeGreaterThan(0);
    expect(cats2.length).toBe(0);
  });

  it("should prevent cross-tenant slot booking", () => {
    db.prepare("INSERT INTO slots (tenant_id, date, time, is_booked) VALUES ('tenant1', '2025-05-20', '10:00', 0)").run();
    const slot = db.prepare("SELECT * FROM slots WHERE tenant_id = 'tenant1'").get();

    expect(() => {
      createBooking({
        tenantId: 'tenant2',
        slotId: slot.id,
        userTelegramId: '123',
        name: 'Test',
        phone: '123',
        appointmentAt: '2025-05-20T10:00:00Z'
      });
    }).toThrow("SLOT_NOT_AVAILABLE");
  });

  it("should generate slots correctly for a tenant", () => {
    setSetting("tenant1", "work_days", [1, 2, 3, 4, 5]);
    setSetting("tenant1", "start_time", "09:00");
    setSetting("tenant1", "end_time", "11:00");
    setSetting("tenant1", "step_min", 60);

    autoGenerateSlots("tenant1");
    const slots = db.prepare("SELECT * FROM slots WHERE tenant_id = 'tenant1' AND time = '09:00'").all();
    expect(slots.length).toBeGreaterThan(0);
  });
});
