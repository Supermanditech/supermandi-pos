// STG-487: Unit tests for GET /api/v1/pos/staff/me response contract
// Validates the staff "me" endpoint returns correct shape with role + max discount

import { z } from "zod";

// Contract schema matching the endpoint response
const StaffMeResponse = z.object({
  staffId: z.string().uuid(),
  name: z.string().min(1),
  role: z.enum(["CASHIER", "STOCK_MANAGER", "MANAGER"]),
  maxDiscountPct: z.number().min(0).max(100),
});

describe("STG-487: GET /api/v1/pos/staff/me contract", () => {
  it("validates a cashier response with default 100% discount limit", () => {
    const response = {
      staffId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Raju Cashier",
      role: "CASHIER",
      maxDiscountPct: 100,
    };
    expect(() => StaffMeResponse.parse(response)).not.toThrow();
    const parsed = StaffMeResponse.parse(response);
    expect(parsed.role).toBe("CASHIER");
    expect(parsed.maxDiscountPct).toBe(100);
  });

  it("validates a manager response with custom discount limit", () => {
    const response = {
      staffId: "b2c3d4e5-f678-9012-bcde-f12345678901",
      name: "Sharma Manager",
      role: "MANAGER",
      maxDiscountPct: 15,
    };
    const parsed = StaffMeResponse.parse(response);
    expect(parsed.role).toBe("MANAGER");
    expect(parsed.maxDiscountPct).toBe(15);
  });

  it("validates stock manager role", () => {
    const response = {
      staffId: "c3d4e5f6-7890-1234-cdef-123456789012",
      name: "Kumar Stock",
      role: "STOCK_MANAGER",
      maxDiscountPct: 10,
    };
    expect(() => StaffMeResponse.parse(response)).not.toThrow();
  });

  it("rejects response with missing staffId", () => {
    const response = {
      name: "No ID",
      role: "CASHIER",
      maxDiscountPct: 100,
    };
    expect(() => StaffMeResponse.parse(response)).toThrow();
  });

  it("rejects response with invalid role", () => {
    const response = {
      staffId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Bad Role",
      role: "ADMIN",
      maxDiscountPct: 100,
    };
    expect(() => StaffMeResponse.parse(response)).toThrow();
  });

  it("rejects negative discount limit", () => {
    const response = {
      staffId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Negative",
      role: "CASHIER",
      maxDiscountPct: -5,
    };
    expect(() => StaffMeResponse.parse(response)).toThrow();
  });

  it("rejects discount limit over 100", () => {
    const response = {
      staffId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Over Limit",
      role: "CASHIER",
      maxDiscountPct: 150,
    };
    expect(() => StaffMeResponse.parse(response)).toThrow();
  });

  it("accepts fractional discount limit", () => {
    const response = {
      staffId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Fractional",
      role: "MANAGER",
      maxDiscountPct: 12.5,
    };
    const parsed = StaffMeResponse.parse(response);
    expect(parsed.maxDiscountPct).toBe(12.5);
  });

  it("accepts zero discount limit (no discounts allowed)", () => {
    const response = {
      staffId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "No Discount",
      role: "CASHIER",
      maxDiscountPct: 0,
    };
    const parsed = StaffMeResponse.parse(response);
    expect(parsed.maxDiscountPct).toBe(0);
  });
});
