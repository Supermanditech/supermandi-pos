// Unit tests for backend/src/services/deduplication.ts
// We test the DB-dependent functions by mocking the pool

import {
  checkStorePhoneDuplicate,
  checkStoreGstinDuplicate,
  checkStoreUpiDuplicate,
  checkStoreDuplicates,
} from "../src/services/deduplication";

function mockPool(rows: any[] = [], rowCount: number = 0): any {
  return {
    query: jest.fn().mockResolvedValue({ rows, rowCount }),
  };
}

describe("checkStorePhoneDuplicate", () => {
  it("allows when no duplicate found", async () => {
    const pool = mockPool([], 0);
    const result = await checkStorePhoneDuplicate(pool, "9876543210");
    expect(result.hasDuplicate).toBe(false);
    expect(result.action).toBe("allow");
  });

  it("blocks when duplicate phone found", async () => {
    const pool = mockPool([{ id: "store-1", name: "Existing Store" }], 1);
    const result = await checkStorePhoneDuplicate(pool, "9876543210");
    expect(result.hasDuplicate).toBe(true);
    expect(result.action).toBe("block");
    expect(result.duplicateType).toBe("phone");
    expect(result.existingEntityId).toBe("store-1");
    expect(result.existingEntityName).toBe("Existing Store");
  });

  it("allows empty phone (no check needed)", async () => {
    const pool = mockPool();
    const result = await checkStorePhoneDuplicate(pool, "");
    expect(result.hasDuplicate).toBe(false);
    expect(result.action).toBe("allow");
    // Should not call the database
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("normalizes phone with +91 prefix for 10-digit numbers", async () => {
    const pool = mockPool([], 0);
    await checkStorePhoneDuplicate(pool, "9876543210");
    const calledWith = pool.query.mock.calls[0][1][0];
    expect(calledWith).toBe("+919876543210");
  });

  it("normalizes phone starting with 0", async () => {
    const pool = mockPool([], 0);
    await checkStorePhoneDuplicate(pool, "09876543210");
    const calledWith = pool.query.mock.calls[0][1][0];
    expect(calledWith).toBe("+919876543210");
  });

  it("normalizes phone with spaces/dashes", async () => {
    const pool = mockPool([], 0);
    await checkStorePhoneDuplicate(pool, "+91 98765-43210");
    const calledWith = pool.query.mock.calls[0][1][0];
    expect(calledWith).toBe("+919876543210");
  });

  it("passes excludeStoreId when provided", async () => {
    const pool = mockPool([], 0);
    await checkStorePhoneDuplicate(pool, "9876543210", "store-exclude");
    expect(pool.query.mock.calls[0][1]).toContain("store-exclude");
  });
});

describe("checkStoreGstinDuplicate", () => {
  it("allows when no duplicate found", async () => {
    const pool = mockPool([], 0);
    const result = await checkStoreGstinDuplicate(pool, "29ABCDE1234F1Z5");
    expect(result.hasDuplicate).toBe(false);
    expect(result.action).toBe("allow");
  });

  it("flags (not blocks) when duplicate GSTIN found", async () => {
    const pool = mockPool([{ id: "store-2", name: "Another Store" }], 1);
    const result = await checkStoreGstinDuplicate(pool, "29ABCDE1234F1Z5");
    expect(result.hasDuplicate).toBe(true);
    expect(result.action).toBe("flag"); // NOT block
    expect(result.duplicateType).toBe("gstin");
  });

  it("allows empty GSTIN", async () => {
    const pool = mockPool();
    const result = await checkStoreGstinDuplicate(pool, "");
    expect(result.hasDuplicate).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("normalizes GSTIN to uppercase", async () => {
    const pool = mockPool([], 0);
    await checkStoreGstinDuplicate(pool, "29abcde1234f1z5");
    const calledWith = pool.query.mock.calls[0][1][0];
    expect(calledWith).toBe("29ABCDE1234F1Z5");
  });
});

describe("checkStoreUpiDuplicate", () => {
  it("allows when no duplicate found", async () => {
    const pool = mockPool([], 0);
    const result = await checkStoreUpiDuplicate(pool, "store@upi");
    expect(result.hasDuplicate).toBe(false);
    expect(result.action).toBe("allow");
  });

  it("flags when duplicate UPI found", async () => {
    const pool = mockPool([{ id: "store-3", name: "UPI Store" }], 1);
    const result = await checkStoreUpiDuplicate(pool, "store@upi");
    expect(result.hasDuplicate).toBe(true);
    expect(result.action).toBe("flag");
    expect(result.duplicateType).toBe("upi");
  });

  it("allows empty UPI", async () => {
    const pool = mockPool();
    const result = await checkStoreUpiDuplicate(pool, "");
    expect(result.hasDuplicate).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("normalizes UPI to lowercase", async () => {
    const pool = mockPool([], 0);
    await checkStoreUpiDuplicate(pool, "Store@UPI");
    const calledWith = pool.query.mock.calls[0][1][0];
    expect(calledWith).toBe("store@upi");
  });
});

describe("checkStoreDuplicates", () => {
  it("allows when no duplicates exist", async () => {
    const pool = mockPool([], 0);
    const result = await checkStoreDuplicates(pool, {
      phone: "9876543210",
      gstin: "29ABCDE1234F1Z5",
      upiVpa: "store@upi",
    });
    expect(result.canProceed).toBe(true);
    expect(result.blockingDuplicate).toBeUndefined();
    expect(result.flaggedDuplicates).toHaveLength(0);
  });

  it("blocks when phone duplicate found", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: "store-1", name: "Existing" }],
        rowCount: 1,
      }),
    };
    const result = await checkStoreDuplicates(pool as any, {
      phone: "9876543210",
    });
    expect(result.canProceed).toBe(false);
    expect(result.blockingDuplicate).toBeDefined();
    expect(result.blockingDuplicate!.duplicateType).toBe("phone");
  });

  it("skips GSTIN/UPI checks when phone is blocked", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: "store-1", name: "Existing" }],
        rowCount: 1,
      }),
    };
    const result = await checkStoreDuplicates(pool as any, {
      phone: "9876543210",
      gstin: "29ABCDE1234F1Z5",
      upiVpa: "store@upi",
    });
    expect(result.canProceed).toBe(false);
    // Only phone check should have been called (1 query for phone)
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("flags GSTIN and UPI duplicates when phone is clean", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // phone: no dup
        .mockResolvedValueOnce({
          rows: [{ id: "store-2", name: "GSTIN Store" }],
          rowCount: 1,
        }) // gstin: dup
        .mockResolvedValueOnce({
          rows: [{ id: "store-3", name: "UPI Store" }],
          rowCount: 1,
        }), // upi: dup
    };
    const result = await checkStoreDuplicates(pool as any, {
      phone: "9876543210",
      gstin: "29ABCDE1234F1Z5",
      upiVpa: "store@upi",
    });
    expect(result.canProceed).toBe(true);
    expect(result.flaggedDuplicates).toHaveLength(2);
  });

  it("handles empty data (no checks needed)", async () => {
    const pool = mockPool([], 0);
    const result = await checkStoreDuplicates(pool, {});
    expect(result.canProceed).toBe(true);
    expect(result.flaggedDuplicates).toHaveLength(0);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
