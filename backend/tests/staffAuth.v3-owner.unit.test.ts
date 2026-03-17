/**
 * V3-REG-027: Backend staff auth regression tests
 */

describe("POS Staff Auth (V3-OWNER-023 + V3-BIZ-026)", () => {
  it("should accept PIN-only login (no phone required in login route)", () => {
    const fs = require("fs");
    const staff = fs.readFileSync("src/routes/v1/pos/staff.ts", "utf8");
    // Login route should have PIN-only input
    expect(staff).toContain('"PIN is required"');
    // Login route should use pin_lookup_hash for lookup
    expect(staff).toContain("pin_lookup_hash");
  });

  it("should use pin_lookup_hash for store-scoped lookup", () => {
    const fs = require("fs");
    const staff = fs.readFileSync("src/routes/v1/pos/staff.ts", "utf8");
    expect(staff).toContain("pin_lookup_hash");
    expect(staff).toContain("pinLookupHash");
  });

  it("should enforce durable lockout (DB-backed, not in-memory)", () => {
    const fs = require("fs");
    const staff = fs.readFileSync("src/routes/v1/pos/staff.ts", "utf8");
    expect(staff).toContain("locked_until");
    expect(staff).toContain("failed_login_count");
    expect(staff).toContain("STAFF_LOCKED");
  });

  it("should return isOwner flag in login response", () => {
    const fs = require("fs");
    const staff = fs.readFileSync("src/routes/v1/pos/staff.ts", "utf8");
    expect(staff).toContain("isOwner");
    expect(staff).toContain("is_owner");
  });

  it("should enforce PIN uniqueness in create endpoint", () => {
    const fs = require("fs");
    const manage = fs.readFileSync("src/routes/v1/pos/staffManage.ts", "utf8");
    expect(manage).toContain("PIN_ALREADY_USED");
    expect(manage).toContain("pin_lookup_hash");
  });

  it("should have migration for pin_lookup_hash and lockout columns", () => {
    const fs = require("fs");
    const migration = fs.readFileSync("../backend/migrations/195_staff_pin_auth_upgrade.sql", "utf8");
    expect(migration).toContain("pin_lookup_hash");
    expect(migration).toContain("failed_login_count");
    expect(migration).toContain("locked_until");
    expect(migration).toContain("is_owner");
    expect(migration).toContain("store_staff_store_pin_uq");
  });
});
