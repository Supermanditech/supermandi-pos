/**
 * GCP-STG-0377: Admin Slow-Mover Report — Unit Tests
 *
 * Verifies:
 * 1. GET /analytics/slow-movers route is registered on adminAnalyticsRouter
 * 2. With storeId query param: calls detectSlowMovers(storeId) and returns result
 * 3. Without storeId: queries all active stores and aggregates results
 * 4. Error handling returns 500 with ANALYTICS_FAILED code
 * 5. requireAdminToken middleware is applied (router-level)
 */

// Mock slowMoverService
const mockDetectSlowMovers = jest.fn();
jest.mock("../src/services/ai/slowMoverService", () => ({
  detectSlowMovers: mockDetectSlowMovers,
}));

// Mock db/client for aggregate mode
const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock analyticsService (required by the module but not under test)
jest.mock("../src/services/analytics/analyticsService", () => ({
  fetchConsumerSalesAnalytics: jest.fn(),
  fetchDuesAnalytics: jest.fn(),
  fetchPaymentsAnalytics: jest.fn(),
  fetchDevicesAnalytics: jest.fn(),
  fetchOverview: jest.fn(),
  fetchProductsAnalytics: jest.fn(),
  fetchPurchasesAnalytics: jest.fn(),
  fetchActivityAnalytics: jest.fn(),
}));

// Mock logger
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock errorUtils
jest.mock("../src/lib/errorUtils", () => ({
  asError: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
}));

// Mock middleware — pass-through
jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/middleware/rateLimit", () => ({
  redisRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/middleware/apiCache", () => ({
  apiCache: () => (_req: any, _res: any, next: any) => next(),
}));

import { adminAnalyticsRouter } from "../src/routes/v1/admin/analytics";

// Helper: find matching route layer
function findRoute(router: any, method: string, path: string): any {
  const stack = router.stack || [];
  return stack.find((layer: any) => {
    if (!layer.route) return false;
    return (
      layer.route.path === path &&
      layer.route.methods[method.toLowerCase()]
    );
  });
}

// Mock Express req/res
function createMockReq(query: Record<string, string> = {}): any {
  return { query };
}

function createMockRes(): any {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) { res.statusCode = code; return res; },
    json(data: any) { res.body = data; return res; },
  };
  return res;
}

describe("GCP-STG-0377: Admin Slow-Mover Report", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("route GET /analytics/slow-movers is registered", () => {
    const layer = findRoute(adminAnalyticsRouter, "get", "/analytics/slow-movers");
    expect(layer).toBeDefined();
  });

  test("with storeId — calls detectSlowMovers and returns single-store response", async () => {
    const mockData = {
      slowMovers: [
        {
          productId: "prod-1",
          productName: "Stale Rice",
          currentStock: 50,
          sellPrice: 200,
          lastSoldDate: "2026-01-01",
          daysSinceLastSale: 80,
          salesLast30Days: 0,
          salesLast60Days: 3,
          trend: "dead_stock",
          recommendation: "Consider discontinuing or deep discount clearance.",
        },
      ],
      total: 1,
    };
    mockDetectSlowMovers.mockResolvedValue(mockData);

    const layer = findRoute(adminAnalyticsRouter, "get", "/analytics/slow-movers");
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req = createMockReq({ storeId: "store-abc" });
    const res = createMockRes();

    await handler(req, res);

    expect(mockDetectSlowMovers).toHaveBeenCalledWith("store-abc", { limit: 50, offset: 0 });
    expect(res.body).toEqual({
      success: true,
      storeId: "store-abc",
      slowMovers: mockData.slowMovers,
      total: 1,
      pagination: { limit: 50, offset: 0 },
    });
  });

  test("with storeId + limit/offset — passes pagination params", async () => {
    mockDetectSlowMovers.mockResolvedValue({ slowMovers: [], total: 0 });

    const layer = findRoute(adminAnalyticsRouter, "get", "/analytics/slow-movers");
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req = createMockReq({ storeId: "store-xyz", limit: "10", offset: "20" });
    const res = createMockRes();

    await handler(req, res);

    expect(mockDetectSlowMovers).toHaveBeenCalledWith("store-xyz", { limit: 10, offset: 20 });
    expect(res.body.pagination).toEqual({ limit: 10, offset: 20 });
  });

  test("without storeId — aggregates across all active stores", async () => {
    // Mock: 3 active stores, only 2 have slow movers
    mockQuery.mockResolvedValue({
      rows: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
    });

    mockDetectSlowMovers
      .mockResolvedValueOnce({ slowMovers: [{ productId: "p1" }], total: 1 }) // s1
      .mockResolvedValueOnce({ slowMovers: [], total: 0 })                      // s2
      .mockResolvedValueOnce({ slowMovers: [{ productId: "p2" }], total: 1 }); // s3

    const layer = findRoute(adminAnalyticsRouter, "get", "/analytics/slow-movers");
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req = createMockReq({});
    const res = createMockRes();

    await handler(req, res);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id FROM public.stores WHERE status = 'active'")
    );
    expect(mockDetectSlowMovers).toHaveBeenCalledTimes(3);
    expect(res.body.storeCount).toBe(3);
    expect(res.body.storesWithSlowMovers).toBe(2);
    expect(res.body.stores).toHaveLength(2);
  });

  test("error in detectSlowMovers returns 500 with ANALYTICS_FAILED", async () => {
    mockDetectSlowMovers.mockRejectedValue(new Error("DB down"));

    const layer = findRoute(adminAnalyticsRouter, "get", "/analytics/slow-movers");
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req = createMockReq({ storeId: "store-fail" });
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe("ANALYTICS_FAILED");
  });

  test("requireAdminToken middleware is applied at router level", () => {
    // The router uses .use(requireAdminToken) — check it's in the middleware stack
    const middlewareLayers = adminAnalyticsRouter.stack.filter(
      (layer: any) => !layer.route && layer.name === "requireAdminToken"
    );
    expect(middlewareLayers.length).toBeGreaterThanOrEqual(1);
  });
});
