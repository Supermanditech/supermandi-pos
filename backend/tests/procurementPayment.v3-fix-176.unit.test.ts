/**
 * V3-FIX-176 + V3-HARDEN-178: Procurement payment service contract tests
 * Tests payment intent creation, provider resolution, and status transitions.
 */

// Mock the DB client and logger before importing service
const mockQuery = jest.fn();
const mockClient = { query: mockQuery } as any;

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  createPaymentIntent,
  updatePaymentIntentStatus,
  getPaymentIntentForOrder,
} from "../src/services/procurementPaymentService";

describe("V3-FIX-176: Procurement Payment Service", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe("createPaymentIntent", () => {
    it("creates intent with MANUAL provider for CASH mode", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await createPaymentIntent(mockClient, {
        storeId: "store-1",
        orderId: "order-1",
        amountMinor: 500000,
        mode: "CASH",
      });
      expect(result.provider).toBe("MANUAL");
      expect(result.status).toBe("created");
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain("INSERT INTO procurement.payment_intents");
    });

    it("creates intent with UPI_DIRECT provider for UPI mode", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await createPaymentIntent(mockClient, {
        storeId: "store-1",
        orderId: "order-1",
        amountMinor: 250000,
        mode: "UPI",
      });
      expect(result.provider).toBe("UPI_DIRECT");
    });

    it("creates intent with BNPL provider for BNPL mode", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await createPaymentIntent(mockClient, {
        storeId: "store-1",
        orderId: "order-1",
        amountMinor: 100000,
        mode: "BNPL",
      });
      expect(result.provider).toBe("BNPL");
    });

    it("creates intent with SUPERMANDI_CREDIT for CREDIT mode", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await createPaymentIntent(mockClient, {
        storeId: "store-1",
        orderId: "order-1",
        amountMinor: 750000,
        mode: "CREDIT",
      });
      expect(result.provider).toBe("SUPERMANDI_CREDIT");
    });

    it("respects explicit provider override", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await createPaymentIntent(mockClient, {
        storeId: "store-1",
        orderId: "order-1",
        amountMinor: 300000,
        mode: "UPI",
        provider: "PHONEPE",
      });
      expect(result.provider).toBe("PHONEPE");
    });
  });

  describe("updatePaymentIntentStatus", () => {
    it("updates status and provider payment ID", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await updatePaymentIntentStatus(mockClient, "intent-1", "paid", "txn-abc");
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain("UPDATE procurement.payment_intents");
      expect(mockQuery.mock.calls[0][1]).toEqual(["intent-1", "paid", "txn-abc"]);
    });
  });

  describe("getPaymentIntentForOrder", () => {
    it("returns null when no intent exists", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getPaymentIntentForOrder(mockClient, "order-1");
      expect(result).toBeNull();
    });

    it("returns latest intent for order", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "intent-1", status: "paid", provider: "UPI_DIRECT", provider_order_id: null, provider_payment_id: "txn-1" }],
      });
      const result = await getPaymentIntentForOrder(mockClient, "order-1");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("paid");
      expect(result!.provider).toBe("UPI_DIRECT");
    });
  });
});
