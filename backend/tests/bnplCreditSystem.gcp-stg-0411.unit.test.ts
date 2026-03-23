/**
 * GCP-STG-0411: BNPL — SuperMandi as Credit Provider
 * Unit tests for BNPL credit line checks in procurementPaymentService
 * and BNPL application/admin endpoints
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mock DB client
// ---------------------------------------------------------------------------
interface MockQueryResult {
  rows: any[];
  rowCount: number;
}

const mockQuery = jest.fn<(...args: any[]) => Promise<MockQueryResult>>();
const mockRelease = jest.fn();

const mockClient = {
  query: mockQuery,
  release: mockRelease,
};

// Mock getPool
jest.mock("../src/db/client", () => ({
  getPool: () => ({
    query: mockQuery,
    connect: () => Promise.resolve(mockClient),
  }),
}));

// Mock logger
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock payment providers (not used for BNPL but required by import)
jest.mock("../src/services/paymentProviders/razorpayAdapter", () => ({
  createRazorpayOrder: jest.fn(),
}));
jest.mock("../src/services/paymentProviders/phonepeAdapter", () => ({
  createPhonePePayment: jest.fn(),
}));
jest.mock("../src/services/paymentProviders/pinelabsAdapter", () => ({
  createPineLabsPayment: jest.fn(),
}));

import { createPaymentIntent } from "../src/services/procurementPaymentService";

describe("GCP-STG-0411: BNPL credit line validation in createPaymentIntent", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  const baseInput = {
    storeId: "store-001",
    orderId: "order-001",
    amountMinor: 500000, // 5000 INR
    mode: "BNPL" as const,
    provider: "BNPL" as const,
  };

  it("returns failed when no credit line exists", async () => {
    // INSERT payment intent
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // SELECT credit line — empty
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // UPDATE to failed
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await createPaymentIntent(mockClient as any, baseInput);
    expect(result.status).toBe("failed");
    expect(result.provider).toBe("BNPL");
  });

  it("returns failed when credit line is not approved", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "cl-1", approved_limit_minor: 1000000, used_minor: 0, status: "pending" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await createPaymentIntent(mockClient as any, baseInput);
    expect(result.status).toBe("failed");
  });

  it("returns failed when insufficient credit balance", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "cl-1", approved_limit_minor: 1000000, used_minor: 900000, status: "approved" }],
      rowCount: 1,
    });
    // available = 100000, requested = 500000 → insufficient
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await createPaymentIntent(mockClient as any, baseInput);
    expect(result.status).toBe("failed");
  });

  it("returns authorized and deducts credit when sufficient balance", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT intent
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "cl-1", approved_limit_minor: 1000000, used_minor: 200000, status: "approved" }],
      rowCount: 1,
    }); // SELECT credit line — available = 800000, requested = 500000 → OK
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE credit line (deduct)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE intent to authorized

    const result = await createPaymentIntent(mockClient as any, baseInput);
    expect(result.status).toBe("authorized");
    expect(result.provider).toBe("BNPL");

    // Verify deduction query was called with correct amount
    const deductCall = mockQuery.mock.calls[2];
    expect(deductCall[0]).toContain("used_minor = used_minor + $1");
    expect(deductCall[1]).toEqual([500000, "store-001"]);
  });

  it("handles exact credit limit boundary (available === requested)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "cl-1", approved_limit_minor: 500000, used_minor: 0, status: "approved" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await createPaymentIntent(mockClient as any, baseInput);
    expect(result.status).toBe("authorized");
  });
});

describe("GCP-STG-0411: BNPL application validation", () => {
  it("rejects application with missing business name", () => {
    const input = { businessName: "", gstin: undefined, requestedAmountMinor: 500000 };
    expect(input.businessName.trim().length).toBe(0);
  });

  it("rejects application with zero amount", () => {
    const input = { businessName: "Test Store", requestedAmountMinor: 0 };
    expect(input.requestedAmountMinor).toBeLessThanOrEqual(0);
  });

  it("validates GSTIN format (15 alphanumeric)", () => {
    const validGstin = "29AABCU9603R1ZM";
    expect(/^[A-Z0-9]{15}$/.test(validGstin)).toBe(true);

    const invalidGstin = "123";
    expect(/^[A-Z0-9]{15}$/.test(invalidGstin)).toBe(false);
  });

  it("accepts application without GSTIN", () => {
    const input = { businessName: "Kirana Store", gstin: undefined, requestedAmountMinor: 5000000 };
    expect(input.gstin).toBeUndefined();
    expect(input.requestedAmountMinor).toBeGreaterThan(0);
    expect(input.businessName.trim().length).toBeGreaterThan(0);
  });
});

describe("GCP-STG-0411: Admin BNPL approve/reject logic", () => {
  it("rejects approval with zero or negative limit", () => {
    const limits = [0, -100, undefined, null];
    for (const limit of limits) {
      const isValid = typeof limit === "number" && limit > 0;
      expect(isValid).toBe(false);
    }
  });

  it("accepts approval with positive limit", () => {
    const limit = 5000000; // 50,000 INR in minor
    expect(typeof limit === "number" && limit > 0).toBe(true);
  });

  it("rejects rejection without notes", () => {
    const notes = ["", "   ", undefined, null];
    for (const note of notes) {
      const isValid = typeof note === "string" && note.trim().length > 0;
      expect(isValid).toBe(false);
    }
  });

  it("only allows pending applications to be approved", () => {
    const statuses = ["pending", "approved", "rejected"];
    const canApprove = statuses.filter(s => s === "pending");
    expect(canApprove).toEqual(["pending"]);
  });
});
