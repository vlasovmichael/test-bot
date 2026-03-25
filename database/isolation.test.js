import { describe, it, expect, beforeAll } from "vitest";
import { db, createBooking, getCategories, setSetting, autoGenerateSlots, getUserByTelegramId, upsertUser } from "../database/db.js";

describe("Multi-Tenant Data Isolation (RLS)", () => {
  const tenant1 = "master1";
  const tenant2 = "master2";

  beforeAll(() => {
    db.prepare("INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)").run(tenant1, "Tenant 1");
    db.prepare("INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)").run(tenant2, "Tenant 2");
  });

  it("should isolate users by tenant", () => {
    upsertUser(tenant1, "123", { name: "User T1" });
    upsertUser(tenant2, "123", { name: "User T2" });

    const user1 = getUserByTelegramId(tenant1, "123");
    const user2 = getUserByTelegramId(tenant2, "123");

    expect(user1.name).toBe("User T1");
    expect(user2.name).toBe("User T2");
    expect(user1.tenant_id).toBe(tenant1);
    expect(user2.tenant_id).toBe(tenant2);
  });

  it("should isolate settings by tenant", () => {
    setSetting(tenant1, "price", 100);
    setSetting(tenant2, "price", 200);

    expect(db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'price'").get(tenant1).value).toBe("100");
    expect(db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'price'").get(tenant2).value).toBe("200");
  });

  it("should isolate bookings and slots by tenant", () => {
    db.prepare("INSERT INTO slots (tenant_id, date, time, is_booked) VALUES (?, '2025-06-01', '10:00', 0)").run(tenant1);
    db.prepare("INSERT INTO slots (tenant_id, date, time, is_booked) VALUES (?, '2025-06-01', '10:00', 0)").run(tenant2);

    const slot1 = db.prepare("SELECT * FROM slots WHERE tenant_id = ? AND date = '2025-06-01'").get(tenant1);
    const slot2 = db.prepare("SELECT * FROM slots WHERE tenant_id = ? AND date = '2025-06-01'").get(tenant2);

    expect(slot1.tenant_id).toBe(tenant1);
    expect(slot2.tenant_id).toBe(tenant2);

    // Cross-tenant booking attempt should fail (using our RLS-aware functions)
    expect(() => {
      createBooking({
        tenantId: tenant1,
        slotId: slot2.id, // Slot belongs to tenant2
        userTelegramId: "123",
        name: "Test",
        phone: "123",
        appointmentAt: "2025-06-01T10:00:00Z"
      });
    }).toThrow("SLOT_NOT_AVAILABLE");
  });
});
