// SA-P1-010: SuperAdmin — Anomaly Alerts API client tests
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAnomalyAlerts,
  acknowledgeAlert,
  fetchAlertSummary,
} from "../../api/anomalyAlerts";

vi.mock("../../api/authToken", () => ({
  getAuthHeaders: vi.fn(() => ({
    Authorization: "Bearer mock-token",
    "X-Request-ID": "test-id",
  })),
  fetchWithTimeout: vi.fn((url: string, init?: RequestInit) => {
    const mockFetch = (globalThis as any).__mockFetch;
    if (!mockFetch) throw new Error("Mock fetch not set up");
    return mockFetch(url, init);
  }),
}));

describe("anomalyAlerts API client", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__mockFetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as any).__mockFetch;
  });

  // ─── fetchAnomalyAlerts ─────────────────────────────────────────────

  describe("fetchAnomalyAlerts", () => {
    it("returns alerts with total count", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: "alert-1",
              storeId: "store-1",
              storeName: "Test Store",
              alertType: "revenue_drop",
              severity: "critical",
              title: "Revenue Drop Alert",
              message: "Revenue dropped 60%",
              metadata: { key: "test" },
              isRead: false,
              isDismissed: false,
              createdAt: "2026-03-11T10:00:00Z",
            },
          ],
          total: 1,
        }),
      });

      const result = await fetchAnomalyAlerts();
      expect(result.alerts).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.alerts[0].severity).toBe("critical");
      expect(result.alerts[0].storeName).toBe("Test Store");
    });

    it("passes query params for filters", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: [], total: 0 }),
      });

      await fetchAnomalyAlerts({
        severity: "warning",
        storeId: "store-1",
        reviewed: false,
        limit: 20,
        offset: 10,
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("severity=warning");
      expect(calledUrl).toContain("storeId=store-1");
      expect(calledUrl).toContain("reviewed=false");
      expect(calledUrl).toContain("limit=20");
      expect(calledUrl).toContain("offset=10");
    });

    it("throws on 401 unauthorized", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(fetchAnomalyAlerts()).rejects.toThrow("Unauthorized");
    });

    it("throws on server error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      await expect(fetchAnomalyAlerts()).rejects.toThrow("Internal server error");
    });

    it("handles empty response gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: [], total: 0 }),
      });

      const result = await fetchAnomalyAlerts();
      expect(result.alerts).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ─── acknowledgeAlert ───────────────────────────────────────────────

  describe("acknowledgeAlert", () => {
    it("sends POST to acknowledge endpoint", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await acknowledgeAlert("alert-123");

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/anomaly-alerts/alert-123/acknowledge");
      const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
      expect(calledInit.method).toBe("POST");
    });

    it("throws on 404 not found", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Alert not found" }),
      });

      await expect(acknowledgeAlert("nonexistent")).rejects.toThrow("Alert not found");
    });

    it("throws on 401 unauthorized", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(acknowledgeAlert("alert-1")).rejects.toThrow("Unauthorized");
    });
  });

  // ─── fetchAlertSummary ──────────────────────────────────────────────

  describe("fetchAlertSummary", () => {
    it("returns summary counts by severity", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { critical: 3, warning: 7, info: 2, total: 12 },
        }),
      });

      const summary = await fetchAlertSummary();
      expect(summary.critical).toBe(3);
      expect(summary.warning).toBe(7);
      expect(summary.info).toBe(2);
      expect(summary.total).toBe(12);
    });

    it("defaults to zeros on missing data", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      const summary = await fetchAlertSummary();
      expect(summary.critical).toBe(0);
      expect(summary.warning).toBe(0);
      expect(summary.info).toBe(0);
      expect(summary.total).toBe(0);
    });

    it("throws on server error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Failed to fetch" }),
      });

      await expect(fetchAlertSummary()).rejects.toThrow("Failed to fetch");
    });
  });
});
