// SA-P1-002: Spending limit enforcement unit tests

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: jest.fn(() => ({
    query: mockQuery,
  })),
}));

jest.mock("../src/lib/logger", () => ({
  log: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { checkSpendingLimits } from "../src/services/spendingLimitService";
import { getPool } from "../src/db/client";

describe("checkSpendingLimits", () => {
  let pool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    pool = getPool();
  });

  it("allows order when no limits are configured (both NULL)", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ daily_order_limit_paise: null, monthly_order_limit_paise: null }],
      });

    const result = await checkSpendingLimits(pool, "store-1", 500000);
    expect(result.allowed).toBe(true);
    expect(result.code).toBeUndefined();
  });

  it("allows order when store not found (defensive)", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await checkSpendingLimits(pool, "nonexistent", 500000);
    expect(result.allowed).toBe(true);
  });

  it("allows order when daily spend is within limit", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ daily_order_limit_paise: 1000000, monthly_order_limit_paise: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ daily_spend: "400000", monthly_spend: "2000000" }],
      });

    const result = await checkSpendingLimits(pool, "store-1", 500000);
    expect(result.allowed).toBe(true);
  });

  it("rejects order when daily limit would be exceeded", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ daily_order_limit_paise: 1000000, monthly_order_limit_paise: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ daily_spend: "600000", monthly_spend: "2000000" }],
      });

    const result = await checkSpendingLimits(pool, "store-1", 500000);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("SPENDING_LIMIT_EXCEEDED");
    expect(result.period).toBe("daily");
    expect(result.current).toBe(600000);
    expect(result.limit).toBe(1000000);
  });

  it("rejects order when monthly limit would be exceeded", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ daily_order_limit_paise: null, monthly_order_limit_paise: 5000000 }],
      })
      .mockResolvedValueOnce({
        rows: [{ daily_spend: "100000", monthly_spend: "4800000" }],
      });

    const result = await checkSpendingLimits(pool, "store-1", 300000);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("SPENDING_LIMIT_EXCEEDED");
    expect(result.period).toBe("monthly");
    expect(result.current).toBe(4800000);
    expect(result.limit).toBe(5000000);
  });

  it("checks daily limit before monthly limit", async () => {
    // Both limits exceeded — daily should be reported first
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ daily_order_limit_paise: 500000, monthly_order_limit_paise: 1000000 }],
      })
      .mockResolvedValueOnce({
        rows: [{ daily_spend: "400000", monthly_spend: "900000" }],
      });

    const result = await checkSpendingLimits(pool, "store-1", 200000);
    expect(result.allowed).toBe(false);
    expect(result.period).toBe("daily");
  });

  it("allows order at exact limit boundary", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ daily_order_limit_paise: 1000000, monthly_order_limit_paise: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ daily_spend: "500000", monthly_spend: "500000" }],
      });

    // Exactly at limit (500000 + 500000 = 1000000 which equals limit)
    const result = await checkSpendingLimits(pool, "store-1", 500000);
    expect(result.allowed).toBe(true);
  });

  it("rejects order that would exceed by 1 paise", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ daily_order_limit_paise: 1000000, monthly_order_limit_paise: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ daily_spend: "500000", monthly_spend: "500000" }],
      });

    // 500000 + 500001 = 1000001 > 1000000
    const result = await checkSpendingLimits(pool, "store-1", 500001);
    expect(result.allowed).toBe(false);
    expect(result.period).toBe("daily");
  });
});
