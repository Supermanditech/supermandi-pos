/**
 * GCP-STG-0108: Real-Time SSE Events — Unit Tests
 *
 * Tests SSE service functions (no HTTP needed — pure unit tests).
 */

import {
  registerSseClient,
  emitStoreEvent,
  registerGlobalSseClient,
  emitGlobalEvent,
  registerSupplierSseClient,
  emitSupplierEvent,
  emitOrderEvent,
  emitPaymentEvent,
  emitDeliveryEvent,
  emitStockEvent,
  getSseStats,
} from "../src/services/sseService";

// Mock Response object
function createMockResponse(): any {
  const chunks: string[] = [];
  return {
    write: jest.fn((data: string) => { chunks.push(data); return true; }),
    end: jest.fn(),
    chunks,
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
  };
}

describe("GCP-STG-0108: Real-Time SSE Events", () => {
  // =========================================================================
  // Store-scoped SSE
  // =========================================================================
  describe("store-scoped SSE", () => {
    it("registers and emits events to store clients", () => {
      const res = createMockResponse();
      const cleanup = registerSseClient("test-store-108", res);

      emitStoreEvent("test-store-108", "order.created", { orderId: "123" });

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining("event: order.created")
      );
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('"orderId":"123"')
      );

      cleanup();
    });

    it("does not emit to wrong store", () => {
      const res = createMockResponse();
      const cleanup = registerSseClient("store-A-108", res);

      emitStoreEvent("store-B-108", "test_event", { foo: "bar" });

      // Only the initial registration logs, no event write for store-B
      const eventWrites = res.write.mock.calls.filter(
        (call: any[]) => call[0].includes("event: test_event")
      );
      expect(eventWrites).toHaveLength(0);

      cleanup();
    });

    it("cleanup removes client from store", () => {
      const res = createMockResponse();
      const cleanup = registerSseClient("cleanup-store-108", res);
      cleanup();

      emitStoreEvent("cleanup-store-108", "test", {});
      // After cleanup, no writes should happen
      const postCleanupWrites = res.write.mock.calls.filter(
        (call: any[]) => call[0].includes("event: test")
      );
      expect(postCleanupWrites).toHaveLength(0);
    });
  });

  // =========================================================================
  // Global SSE (Admin)
  // =========================================================================
  describe("global SSE (admin)", () => {
    it("registers and emits to global clients", () => {
      const res = createMockResponse();
      const cleanup = registerGlobalSseClient(res);

      emitGlobalEvent("payment.status_changed", { paymentId: "pay-1", status: "paid" });

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining("event: payment.status_changed")
      );

      cleanup();
    });
  });

  // =========================================================================
  // Supplier SSE
  // =========================================================================
  describe("supplier SSE", () => {
    it("registers and emits to supplier clients", () => {
      const res = createMockResponse();
      const cleanup = registerSupplierSseClient("supplier-1-108", res);

      emitSupplierEvent("supplier-1-108", "order.created", { orderId: "o-1" });

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining("event: order.created")
      );

      cleanup();
    });

    it("does not emit to wrong supplier", () => {
      const res = createMockResponse();
      const cleanup = registerSupplierSseClient("supplier-X-108", res);

      emitSupplierEvent("supplier-Y-108", "order.created", {});

      const eventWrites = res.write.mock.calls.filter(
        (call: any[]) => call[0].includes("event: order.created")
      );
      expect(eventWrites).toHaveLength(0);

      cleanup();
    });
  });

  // =========================================================================
  // Convenience Emitters
  // =========================================================================
  describe("convenience emitters", () => {
    it("emitOrderEvent broadcasts to store + global + supplier", () => {
      const storeRes = createMockResponse();
      const adminRes = createMockResponse();
      const supplierRes = createMockResponse();

      const cleanupStore = registerSseClient("store-conv-108", storeRes);
      const cleanupAdmin = registerGlobalSseClient(adminRes);
      const cleanupSupplier = registerSupplierSseClient("sup-conv-108", supplierRes);

      emitOrderEvent("store-conv-108", "sup-conv-108", {
        orderId: "o-99",
        status: "confirmed",
        type: "status_changed",
      });

      // Store gets order.status_changed
      expect(storeRes.write).toHaveBeenCalledWith(
        expect.stringContaining("event: order.status_changed")
      );
      // Admin gets it too (with storeId)
      expect(adminRes.write).toHaveBeenCalledWith(
        expect.stringContaining("event: order.status_changed")
      );
      expect(adminRes.write).toHaveBeenCalledWith(
        expect.stringContaining('"storeId":"store-conv-108"')
      );
      // Supplier gets it
      expect(supplierRes.write).toHaveBeenCalledWith(
        expect.stringContaining("event: order.status_changed")
      );

      cleanupStore();
      cleanupAdmin();
      cleanupSupplier();
    });

    it("emitPaymentEvent broadcasts to store + global", () => {
      const storeRes = createMockResponse();
      const adminRes = createMockResponse();

      const cleanupStore = registerSseClient("store-pay-108", storeRes);
      const cleanupAdmin = registerGlobalSseClient(adminRes);

      emitPaymentEvent("store-pay-108", {
        paymentId: "p-1",
        status: "paid",
        amountMinor: 50000,
      });

      expect(storeRes.write).toHaveBeenCalledWith(
        expect.stringContaining("payment.status_changed")
      );
      expect(adminRes.write).toHaveBeenCalledWith(
        expect.stringContaining("payment.status_changed")
      );

      cleanupStore();
      cleanupAdmin();
    });

    it("emitStockEvent only goes to store", () => {
      const storeRes = createMockResponse();
      const adminRes = createMockResponse();

      const cleanupStore = registerSseClient("store-stock-108", storeRes);
      const cleanupAdmin = registerGlobalSseClient(adminRes);

      emitStockEvent("store-stock-108", { productId: "prod-1", newQuantity: 42 });

      expect(storeRes.write).toHaveBeenCalledWith(
        expect.stringContaining("stock_updated")
      );
      // Admin should NOT get stock events (emitStockEvent only calls emitStoreEvent)
      const adminStockWrites = adminRes.write.mock.calls.filter(
        (call: any[]) => call[0].includes("stock_updated")
      );
      expect(adminStockWrites).toHaveLength(0);

      cleanupStore();
      cleanupAdmin();
    });
  });

  // =========================================================================
  // Stats
  // =========================================================================
  describe("getSseStats", () => {
    it("returns stats object with correct shape", () => {
      const stats = getSseStats();
      expect(stats).toHaveProperty("totalStores");
      expect(stats).toHaveProperty("totalConnections");
      expect(stats).toHaveProperty("globalConnections");
      expect(typeof stats.totalStores).toBe("number");
      expect(typeof stats.totalConnections).toBe("number");
      expect(typeof stats.globalConnections).toBe("number");
    });
  });
});
