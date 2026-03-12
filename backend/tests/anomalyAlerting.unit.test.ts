/**
 * SA-P1-010: Anomaly Alerting Service unit tests
 * Tests the 4 detection rules and deduplication logic.
 */

// Mock the db/client module
const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock("../src/db/client", () => ({
  getPool: () => mockPool,
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  detectAnomalies,
  getAnomalyAlerts,
  getAlertSummary,
  acknowledgeAlert,
  _testOnly,
} from "../src/services/ai/anomalyAlertingService";

describe("anomalyAlertingService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── detectAnomalies ────────────────────────────────────────────────────

  describe("detectAnomalies", () => {
    it("processes all active stores", async () => {
      // Return 2 active stores
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "store-1" }, { id: "store-2" }],
      });

      // For each store, 4 rules x 1 query each = 4 queries per store
      // (each rule's first query returns empty/no-anomaly, so no further queries)
      // 2 stores x 4 rules = 8 rule-check queries
      for (let i = 0; i < 8; i++) {
        mockQuery.mockResolvedValueOnce({ rows: [] });
      }

      const result = await detectAnomalies();
      expect(result.storesProcessed).toBe(2);
      expect(result.errors).toBe(0);
    });

    it("returns zeros when pool returns no stores", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await detectAnomalies();
      expect(result.storesProcessed).toBe(0);
      expect(result.anomaliesCreated).toBe(0);
      expect(result.alertsCreated).toBe(0);
    });
  });

  // ─── Rule 1: Revenue Drop ──────────────────────────────────────────────

  describe("checkRevenueDrop", () => {
    it("creates anomaly and alert when revenue drops >50%", async () => {
      // Revenue query returns avg=10000, today=3000 (70% drop)
      mockQuery.mockResolvedValueOnce({
        rows: [{ today_rev: "3000", avg_rev: "10000" }],
      });
      // Dedup check for anomaly_events - no existing
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert anomaly_events
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      // Dedup check for alerts - no existing
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert alert
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await _testOnly.checkRevenueDrop(mockPool, "store-1");
      expect(result.anomaly).toBe(true);
      expect(result.alert).toBe(true);

      // Verify the anomaly insert was called with severity 'critical'
      const anomalyInsertCall = mockQuery.mock.calls[2];
      expect(anomalyInsertCall[1]).toContain("critical");
    });

    it("does not trigger when drop is <50%", async () => {
      // avg=10000, today=6000 (40% drop)
      mockQuery.mockResolvedValueOnce({
        rows: [{ today_rev: "6000", avg_rev: "10000" }],
      });

      const result = await _testOnly.checkRevenueDrop(mockPool, "store-1");
      expect(result.anomaly).toBe(false);
      expect(result.alert).toBe(false);
    });

    it("skips when no history (avg=0)", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ today_rev: "0", avg_rev: "0" }],
      });

      const result = await _testOnly.checkRevenueDrop(mockPool, "store-1");
      expect(result.anomaly).toBe(false);
    });
  });

  // ─── Rule 2: Discount Rate ────────────────────────────────────────────

  describe("checkDiscountRate", () => {
    it("creates anomaly when discount rate is >2x average", async () => {
      // today rate=0.20 (20%), avg rate=0.05 (5%) -> 4x
      mockQuery.mockResolvedValueOnce({
        rows: [{ today_rate: "0.20", avg_rate: "0.05" }],
      });
      // Dedup: no existing anomaly
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert anomaly
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      // Dedup: no existing alert
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert alert
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await _testOnly.checkDiscountRate(mockPool, "store-1");
      expect(result.anomaly).toBe(true);
      expect(result.alert).toBe(true);
    });

    it("does not trigger when discount rate is below 2x", async () => {
      // today=0.06 (6%), avg=0.05 (5%) -> 1.2x
      mockQuery.mockResolvedValueOnce({
        rows: [{ today_rate: "0.06", avg_rate: "0.05" }],
      });

      const result = await _testOnly.checkDiscountRate(mockPool, "store-1");
      expect(result.anomaly).toBe(false);
    });
  });

  // ─── Rule 3: Cancellations ────────────────────────────────────────────

  describe("checkCancellations", () => {
    it("creates anomaly when >5 cancellations", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cancel_count: 8 }] });
      // Dedup: no existing
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await _testOnly.checkCancellations(mockPool, "store-1");
      expect(result.anomaly).toBe(true);
      expect(result.alert).toBe(true);
    });

    it("does not trigger for 5 or fewer cancellations", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cancel_count: 5 }] });

      const result = await _testOnly.checkCancellations(mockPool, "store-1");
      expect(result.anomaly).toBe(false);
    });
  });

  // ─── Rule 4: Sales Gap ────────────────────────────────────────────────

  describe("checkSalesGap", () => {
    it("creates anomaly when no sales for >4h during business hours", async () => {
      // Current hour = 14 (2pm, within 8am-10pm)
      mockQuery.mockResolvedValueOnce({ rows: [{ current_hour: 14 }] });
      // Last sale query - no sales today
      mockQuery.mockResolvedValueOnce({ rows: [{ last_sale_at: null }] });
      // 14 - 8 = 6 hours since 8am, > 4
      // Dedup: no existing
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await _testOnly.checkSalesGap(mockPool, "store-1");
      expect(result.anomaly).toBe(true);
      expect(result.alert).toBe(true);
    });

    it("does not trigger outside business hours", async () => {
      // Current hour = 6 (6am, outside 8am-10pm)
      mockQuery.mockResolvedValueOnce({ rows: [{ current_hour: 6 }] });

      const result = await _testOnly.checkSalesGap(mockPool, "store-1");
      expect(result.anomaly).toBe(false);
    });

    it("does not trigger when gap <4h", async () => {
      // Current hour = 10 (10am)
      mockQuery.mockResolvedValueOnce({ rows: [{ current_hour: 10 }] });
      // Last sale exists, recent
      const recentTime = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      mockQuery.mockResolvedValueOnce({ rows: [{ last_sale_at: recentTime }] });
      // Gap check: 2 hours
      mockQuery.mockResolvedValueOnce({ rows: [{ gap_hours: "2.0" }] });

      const result = await _testOnly.checkSalesGap(mockPool, "store-1");
      expect(result.anomaly).toBe(false);
    });
  });

  // ─── Deduplication ────────────────────────────────────────────────────

  describe("deduplication", () => {
    it("does not insert when duplicate exists within 24h", async () => {
      // Existing anomaly found
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "existing-1" }] });

      const result = await _testOnly.insertDedupedAnomaly(
        mockPool, "store-1", "revenue_drop", "critical",
        "Test", { key: "test_key" }
      );
      expect(result).toBe(false);
      // Only 1 query (the dedup check), no insert
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("inserts when no duplicate exists", async () => {
      // No existing anomaly
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert succeeds
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await _testOnly.insertDedupedAnomaly(
        mockPool, "store-1", "revenue_drop", "critical",
        "Test", { key: "test_key" }
      );
      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Query helpers ────────────────────────────────────────────────────

  describe("getAnomalyAlerts", () => {
    it("returns paginated alerts with filters", async () => {
      // Count query
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 2 }] });
      // Data query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "alert-1", store_id: "s1", store_name: "Test Store",
            alert_type: "revenue_drop", severity: "critical",
            title: "Revenue Drop", message: "Revenue dropped 60%",
            metadata: { key: "test" }, is_read: false, is_dismissed: false,
            created_at: "2026-03-11T10:00:00Z",
          },
        ],
      });

      const result = await getAnomalyAlerts({ severity: "critical", limit: 10 });
      expect(result.total).toBe(2);
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].severity).toBe("critical");
      expect(result.alerts[0].storeName).toBe("Test Store");
    });
  });

  describe("getAlertSummary", () => {
    it("returns counts by severity", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { severity: "critical", count: 3 },
          { severity: "warning", count: 7 },
          { severity: "info", count: 2 },
        ],
      });

      const summary = await getAlertSummary();
      expect(summary.critical).toBe(3);
      expect(summary.warning).toBe(7);
      expect(summary.info).toBe(2);
      expect(summary.total).toBe(12);
    });
  });

  describe("acknowledgeAlert", () => {
    it("returns true when alert is updated", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await acknowledgeAlert("alert-1");
      expect(result).toBe(true);
    });

    it("returns false when alert not found", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await acknowledgeAlert("nonexistent");
      expect(result).toBe(false);
    });
  });
});
