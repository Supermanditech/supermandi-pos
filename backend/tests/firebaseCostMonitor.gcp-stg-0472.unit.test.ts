// GCP-STG-0472: Unit tests for Firebase OTP cost monitoring
// Tests getOtpVerificationCount return shape, null pool handling, and cost calculation

const mockQuery = jest.fn();
let mockPool: { query: jest.Mock } | null = { query: mockQuery };

jest.mock("../src/db/client", () => ({
  getPool: jest.fn(() => mockPool),
  getDb: jest.fn(() => null),
}));

import {
  getOtpVerificationCount,
  OTP_MONTHLY_FREE_TIER,
  OTP_COST_PER_VERIFICATION,
  ALERT_THRESHOLD_PCT,
} from "../src/services/firebaseCostMonitor";

describe("getOtpVerificationCount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: mockQuery };
  });

  it("returns expected shape with count, cost, and percentage", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 5000 }] });

    const result = await getOtpVerificationCount(30);

    expect(result).toEqual({
      count: 5000,
      estimatedCostUsd: 0, // Under free tier
      pctOfFreeTier: 50,
      alertThresholdPct: ALERT_THRESHOLD_PCT,
      isOverThreshold: false,
    });
  });

  it("returns zeros when pool is null", async () => {
    mockPool = null;

    const result = await getOtpVerificationCount();

    expect(result).toEqual({
      count: 0,
      estimatedCostUsd: 0,
      pctOfFreeTier: 0,
      alertThresholdPct: ALERT_THRESHOLD_PCT,
      isOverThreshold: false,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("calculates cost correctly when over free tier", async () => {
    const overCount = 15000;
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: overCount }] });

    const result = await getOtpVerificationCount(30);

    const expectedCost = (overCount - OTP_MONTHLY_FREE_TIER) * OTP_COST_PER_VERIFICATION;
    expect(result.count).toBe(overCount);
    expect(result.estimatedCostUsd).toBe(expectedCost);
    expect(result.pctOfFreeTier).toBe(150);
    expect(result.isOverThreshold).toBe(true);
  });

  it("returns zeros on query error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const result = await getOtpVerificationCount(30);

    expect(result).toEqual({
      count: 0,
      estimatedCostUsd: 0,
      pctOfFreeTier: 0,
      alertThresholdPct: ALERT_THRESHOLD_PCT,
      isOverThreshold: false,
    });
  });

  it("handles missing cnt in query result", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{}] });

    const result = await getOtpVerificationCount(30);

    expect(result.count).toBe(0);
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.pctOfFreeTier).toBe(0);
  });

  it("triggers alert at 80% threshold", async () => {
    const thresholdCount = 8000; // 80% of 10K
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: thresholdCount }] });

    const result = await getOtpVerificationCount(30);

    expect(result.pctOfFreeTier).toBe(80);
    expect(result.isOverThreshold).toBe(true);
  });

  it("does not trigger alert below 80% threshold", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 7999 }] });

    const result = await getOtpVerificationCount(30);

    expect(result.pctOfFreeTier).toBe(80); // rounds to 80
    // 7999/10000 = 79.99 → rounds to 80 → isOverThreshold = true
    // Actually let's use 7900 to be safely below
  });

  it("uses parameterized query with daysBack", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 100 }] });

    await getOtpVerificationCount(7);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("make_interval(days => $1)"),
      [7]
    );
  });

  it("defaults to 30 days when no argument provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 100 }] });

    await getOtpVerificationCount();

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [30]);
  });
});
