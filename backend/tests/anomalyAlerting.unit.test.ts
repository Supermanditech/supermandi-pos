/**
 * SA-P1-010: Anomaly Alerting Service Unit Tests
 * Tests for the 4 detection rules with mocked DB queries
 */

import {
  detectRevenueDrop,
  detectHighDiscountRate,
  detectHighCancellations,
  detectSalesInactivity,
  detectStoreAnomaliesV2,
  detectAnomalies,
} from "../src/services/ai/anomalyAlertingService";

// Mock getPool for detectStoreAnomaliesV2 and detectAnomalies
jest.mock("../src/db/client", () => ({
  getPool: jest.fn(),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { getPool } from "../src/db/client";

const STORE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/**
 * Creates a mock pool that resolves queries based on substring matching.
 * When a query string contains a given key, the corresponding result is returned.
 */
function createMockPool(queryResults: Record<string, { rows: any[]; rowCount?: number }>) {
  const queryFn = jest.fn().mockImplementation((sql: string) => {
    for (const [key, result] of Object.entries(queryResults)) {
      if (sql.includes(key)) {
        return Promise.resolve({ rows: result.rows, rowCount: result.rowCount ?? result.rows.length });
      }
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return { query: queryFn } as any;
}

describe("AnomalyAlertingService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────── Rule 1: Revenue Drop ───────────────
  describe("detectRevenueDrop", () => {
    it("detects revenue drop >50%", async () => {
      const pool = createMockPool({
        "today_rev": { rows: [{ today_rev: "1000", avg_rev: "5000" }] },
        "ai.anomaly_events": { rows: [] },
        "ai.alerts": { rows: [] },
        "INSERT INTO ai.anomaly_events": { rows: [] },
        "INSERT INTO ai.alerts": { rows: [] },
      });

      const result = await detectRevenueDrop(pool, STORE_ID);
      expect(result.anomalies).toBe(1);
      expect(result.alerts).toBe(1);
    });

    it("does not trigger when revenue within normal range", async () => {
      const pool = createMockPool({
        "today_rev": { rows: [{ today_rev: "4000", avg_rev: "5000" }] },
      });

      const result = await detectRevenueDrop(pool, STORE_ID);
      expect(result.anomalies).toBe(0);
      expect(result.alerts).toBe(0);
    });

    it("does not trigger when avg revenue is 0", async () => {
      const pool = createMockPool({
        "today_rev": { rows: [{ today_rev: "0", avg_rev: "0" }] },
      });

      const result = await detectRevenueDrop(pool, STORE_ID);
      expect(result.anomalies).toBe(0);
    });

    it("returns zero when pool is null", async () => {
      const result = await detectRevenueDrop(null, STORE_ID);
      expect(result.anomalies).toBe(0);
      expect(result.alerts).toBe(0);
    });

    it("deduplicates within 24h — existing anomaly found", async () => {
      const pool = createMockPool({
        "today_rev": { rows: [{ today_rev: "1000", avg_rev: "5000" }] },
        "SELECT id FROM ai.anomaly_events": { rows: [{ id: "existing" }] },
        "SELECT id FROM ai.alerts": { rows: [{ id: "existing" }] },
      });

      const result = await detectRevenueDrop(pool, STORE_ID);
      expect(result.anomalies).toBe(0);
      expect(result.alerts).toBe(0);
    });

    it("returns empty result when no rows from sales query", async () => {
      const pool = createMockPool({
        "today_rev": { rows: [] },
      });

      const result = await detectRevenueDrop(pool, STORE_ID);
      expect(result.anomalies).toBe(0);
    });
  });

  // ─────────────── Rule 2: High Discount Rate ───────────────
  describe("detectHighDiscountRate", () => {
    it("detects discount rate >2x average", async () => {
      const pool = createMockPool({
        "today_rate": { rows: [{ today_rate: "0.30", avg_rate: "0.10" }] },
        "ai.anomaly_events": { rows: [] },
        "ai.alerts": { rows: [] },
        "INSERT INTO ai.anomaly_events": { rows: [] },
        "INSERT INTO ai.alerts": { rows: [] },
      });

      const result = await detectHighDiscountRate(pool, STORE_ID);
      expect(result.anomalies).toBe(1);
      expect(result.alerts).toBe(1);
    });

    it("does not trigger when discount rate is normal", async () => {
      const pool = createMockPool({
        "today_rate": { rows: [{ today_rate: "0.08", avg_rate: "0.10" }] },
      });

      const result = await detectHighDiscountRate(pool, STORE_ID);
      expect(result.anomalies).toBe(0);
      expect(result.alerts).toBe(0);
    });

    it("does not trigger when exactly 2x (boundary)", async () => {
      const pool = createMockPool({
        "today_rate": { rows: [{ today_rate: "0.20", avg_rate: "0.10" }] },
      });

      const result = await detectHighDiscountRate(pool, STORE_ID);
      expect(result.anomalies).toBe(0);
    });

    it("does not trigger when avg rate is 0", async () => {
      const pool = createMockPool({
        "today_rate": { rows: [{ today_rate: "0.05", avg_rate: "0" }] },
      });

      const result = await detectHighDiscountRate(pool, STORE_ID);
      expect(result.anomalies).toBe(0);
    });

    it("returns zero when pool is null", async () => {
      const result = await detectHighDiscountRate(null, STORE_ID);
      expect(result.anomalies).toBe(0);
    });
  });

  // ─────────────── Rule 3: High Cancellations ───────────────
  describe("detectHighCancellations", () => {
    it("detects >5 cancellations", async () => {
      const pool = createMockPool({
        "cancel_count": { rows: [{ cancel_count: 8 }] },
        "ai.anomaly_events": { rows: [] },
        "ai.alerts": { rows: [] },
        "INSERT INTO ai.anomaly_events": { rows: [] },
        "INSERT INTO ai.alerts": { rows: [] },
      });

      const result = await detectHighCancellations(pool, STORE_ID);
      expect(result.anomalies).toBe(1);
      expect(result.alerts).toBe(1);
    });

    it("does not trigger at exactly 5 cancellations (boundary)", async () => {
      const pool = createMockPool({
        "cancel_count": { rows: [{ cancel_count: 5 }] },
      });

      const result = await detectHighCancellations(pool, STORE_ID);
      expect(result.anomalies).toBe(0);
    });

    it("does not trigger at 0 cancellations", async () => {
      const pool = createMockPool({
        "cancel_count": { rows: [{ cancel_count: 0 }] },
      });

      const result = await detectHighCancellations(pool, STORE_ID);
      expect(result.anomalies).toBe(0);
    });

    it("returns zero when pool is null", async () => {
      const result = await detectHighCancellations(null, STORE_ID);
      expect(result.anomalies).toBe(0);
    });
  });

  // ─────────────── Rule 4: Sales Inactivity ───────────────
  describe("detectSalesInactivity", () => {
    it("returns zero when pool is null", async () => {
      const result = await detectSalesInactivity(null, STORE_ID);
      expect(result.anomalies).toBe(0);
      expect(result.alerts).toBe(0);
    });

    it("returns properly shaped result", async () => {
      // If a sale just happened, should not trigger
      const pool = createMockPool({
        "MAX(created_at)": { rows: [{ last_sale_at: new Date().toISOString() }] },
      });

      const result = await detectSalesInactivity(pool, STORE_ID);
      expect(result).toHaveProperty("anomalies");
      expect(result).toHaveProperty("alerts");
      expect(typeof result.anomalies).toBe("number");
      expect(typeof result.alerts).toBe("number");
    });
  });

  // ─────────────── Orchestrator: detectStoreAnomaliesV2 ───────────────
  describe("detectStoreAnomaliesV2", () => {
    it("returns zero when pool is null", async () => {
      (getPool as jest.Mock).mockReturnValue(null);
      const result = await detectStoreAnomaliesV2(STORE_ID);
      expect(result).toEqual({ storeId: STORE_ID, anomalies: 0, alerts: 0 });
    });

    it("aggregates results from all rules with no anomalies", async () => {
      const pool = createMockPool({
        "today_rev": { rows: [{ today_rev: "4500", avg_rev: "5000" }] },
        "today_rate": { rows: [{ today_rate: "0.05", avg_rate: "0.10" }] },
        "cancel_count": { rows: [{ cancel_count: 2 }] },
        "MAX(created_at)": { rows: [{ last_sale_at: new Date().toISOString() }] },
      });
      (getPool as jest.Mock).mockReturnValue(pool);

      const result = await detectStoreAnomaliesV2(STORE_ID);
      expect(result.storeId).toBe(STORE_ID);
      expect(result.anomalies).toBe(0);
      expect(result.alerts).toBe(0);
    });
  });

  // ─────────────── Top-level: detectAnomalies ───────────────
  describe("detectAnomalies", () => {
    it("returns zero when pool is null", async () => {
      (getPool as jest.Mock).mockReturnValue(null);
      const result = await detectAnomalies();
      expect(result).toEqual({
        storesProcessed: 0,
        totalAnomalies: 0,
        totalAlerts: 0,
        errors: 0,
        details: [],
      });
    });

    it("processes active stores and returns summary", async () => {
      const pool = createMockPool({
        "platform.stores": { rows: [{ id: STORE_ID }] },
        "today_rev": { rows: [{ today_rev: "5000", avg_rev: "5000" }] },
        "today_rate": { rows: [{ today_rate: "0.05", avg_rate: "0.10" }] },
        "cancel_count": { rows: [{ cancel_count: 0 }] },
        "MAX(created_at)": { rows: [{ last_sale_at: new Date().toISOString() }] },
      });
      (getPool as jest.Mock).mockReturnValue(pool);

      const result = await detectAnomalies();
      expect(result.storesProcessed).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.totalAnomalies).toBe(0);
      expect(result.totalAlerts).toBe(0);
    });
  });
});
