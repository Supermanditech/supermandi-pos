/**
 * STG-497: GRN duplicate submission — idempotency key + double-tap guard
 *
 * Verifies:
 * 1. receiveGoods() generates deterministic idempotency key from orderId + sorted items
 * 2. Same items in different order produce the same key
 * 3. Different items produce different keys
 * 4. Header name matches backend expectation (X-Idempotency-Key)
 *
 * Test type: UNIT_TEST (logic verification, no component render)
 */

// Mock fetch to capture headers
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  text: () => Promise.resolve(JSON.stringify({ success: true, data: {} })),
});
(global as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

// Mock config and i18n
jest.mock("../../config/api", () => ({
  API_BASE_URL: "http://localhost:3000",
}));
jest.mock("../../i18n", () => ({ language: "en" }));

// Mock dependencies used by apiClient
jest.mock("../../services/deviceSession", () => ({
  getDeviceToken: jest.fn().mockResolvedValue("test-token"),
  getDeviceStoreId: jest.fn().mockResolvedValue("store-1"),
  getDeviceSession: jest.fn().mockResolvedValue({ deviceToken: "test-token", storeId: "store-1" }),
  clearDeviceSession: jest.fn(),
  saveDeviceSession: jest.fn(),
}));

jest.mock("../../stores/staffSessionStore", () => ({
  useStaffSessionStore: {
    getState: () => ({
      session: { staffId: "staff-1" },
    }),
  },
}));

jest.mock("../../services/networkStatus", () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));

import { receiveGoods, ReceiveGoodsParams } from "../../services/api/orderApi";

describe("STG-497: GRN idempotency key", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  test("receiveGoods sends X-Idempotency-Key header", async () => {
    const params: ReceiveGoodsParams = {
      items: [{ orderItemId: "item-1", quantityReceived: 5 }],
    };

    try {
      await receiveGoods("store-1", "order-123", params);
    } catch {
      // May fail due to mock response format, that's OK — we just need the fetch call
    }

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, fetchOptions] = mockFetch.mock.calls[0];
    const headers = fetchOptions.headers;
    expect(headers["X-Idempotency-Key"]).toBeDefined();
    expect(headers["X-Idempotency-Key"]).toContain("grn-order-123");
  });

  test("same items produce same idempotency key regardless of order", async () => {
    const params1: ReceiveGoodsParams = {
      items: [
        { orderItemId: "item-b", quantityReceived: 3 },
        { orderItemId: "item-a", quantityReceived: 5 },
      ],
    };
    const params2: ReceiveGoodsParams = {
      items: [
        { orderItemId: "item-a", quantityReceived: 5 },
        { orderItemId: "item-b", quantityReceived: 3 },
      ],
    };

    try { await receiveGoods("store-1", "order-1", params1); } catch { /* ignore */ }
    try { await receiveGoods("store-1", "order-1", params2); } catch { /* ignore */ }

    const key1 = mockFetch.mock.calls[0][1].headers["X-Idempotency-Key"];
    const key2 = mockFetch.mock.calls[1][1].headers["X-Idempotency-Key"];
    expect(key1).toBe(key2);
  });

  test("different quantities produce different idempotency keys", async () => {
    const params1: ReceiveGoodsParams = {
      items: [{ orderItemId: "item-a", quantityReceived: 5 }],
    };
    const params2: ReceiveGoodsParams = {
      items: [{ orderItemId: "item-a", quantityReceived: 10 }],
    };

    try { await receiveGoods("store-1", "order-1", params1); } catch { /* ignore */ }
    try { await receiveGoods("store-1", "order-1", params2); } catch { /* ignore */ }

    const key1 = mockFetch.mock.calls[0][1].headers["X-Idempotency-Key"];
    const key2 = mockFetch.mock.calls[1][1].headers["X-Idempotency-Key"];
    expect(key1).not.toBe(key2);
  });

  test("different orderId produces different idempotency key", async () => {
    const params: ReceiveGoodsParams = {
      items: [{ orderItemId: "item-a", quantityReceived: 5 }],
    };

    try { await receiveGoods("store-1", "order-1", params); } catch { /* ignore */ }
    try { await receiveGoods("store-1", "order-2", params); } catch { /* ignore */ }

    const key1 = mockFetch.mock.calls[0][1].headers["X-Idempotency-Key"];
    const key2 = mockFetch.mock.calls[1][1].headers["X-Idempotency-Key"];
    expect(key1).not.toBe(key2);
  });

  test("idempotency key format is deterministic", async () => {
    const params: ReceiveGoodsParams = {
      items: [
        { orderItemId: "item-c", quantityReceived: 2 },
        { orderItemId: "item-a", quantityReceived: 7 },
      ],
    };

    try { await receiveGoods("store-1", "order-99", params); } catch { /* ignore */ }

    const key = mockFetch.mock.calls[0][1].headers["X-Idempotency-Key"];
    // Items sorted by orderItemId: item-a:7,item-c:2
    expect(key).toBe("grn-order-99-item-a:7,item-c:2");
  });
});
