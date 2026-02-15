// Unit tests for backend/src/services/inventoryLedgerService.ts
// Tests the pure helper functions and error classes (no DB)
import {
  StockVersionConflictError,
  InsufficientStockError,
} from "../src/services/inventoryLedgerService";

describe("StockVersionConflictError", () => {
  it("extends Error", () => {
    const err = new StockVersionConflictError("store-1", "product-1");
    expect(err).toBeInstanceOf(Error);
  });

  it("stores storeId and productId", () => {
    const err = new StockVersionConflictError("store-1", "product-1");
    expect(err.storeId).toBe("store-1");
    expect(err.productId).toBe("product-1");
  });

  it("has descriptive message", () => {
    const err = new StockVersionConflictError("s1", "p1");
    expect(err.message).toBe("Stock changed, please refresh");
  });

  it("has correct name", () => {
    const err = new StockVersionConflictError("s1", "p1");
    expect(err.name).toBe("StockVersionConflictError");
  });
});

describe("InsufficientStockError", () => {
  it("extends Error", () => {
    const err = new InsufficientStockError([]);
    expect(err).toBeInstanceOf(Error);
  });

  it("stores details array", () => {
    const details = [
      {
        skuId: "sku-1",
        available: 5,
        required: 10,
        name: "Product A",
        message: "Stock changed. Available: 5",
      },
    ];
    const err = new InsufficientStockError(details);
    expect(err.details).toEqual(details);
  });

  it("has correct name and message", () => {
    const err = new InsufficientStockError([]);
    expect(err.name).toBe("InsufficientStockError");
    expect(err.message).toBe("insufficient_stock");
  });

  it("handles multiple items", () => {
    const details = [
      {
        skuId: "sku-1",
        available: 0,
        required: 5,
        name: "A",
        message: "Stock changed. Available: 0",
      },
      {
        skuId: "sku-2",
        available: 3,
        required: 8,
        name: "B",
        message: "Stock changed. Available: 3",
      },
    ];
    const err = new InsufficientStockError(details);
    expect(err.details).toHaveLength(2);
    expect(err.details[0].skuId).toBe("sku-1");
    expect(err.details[1].skuId).toBe("sku-2");
  });
});
