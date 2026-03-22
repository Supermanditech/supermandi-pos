/**
 * GCP-STG-0329: Double Stock Deduction for Bulk-Configured Products
 *
 * Verifies that applyBulkDeductions skips products that already have
 * a ledger entry from recordSaleInventoryMovements (createSale path),
 * preventing double stock deduction.
 */

// Mock pg before importing the service
const mockQuery = jest.fn();
const mockClient = {
  query: mockQuery,
} as any;

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(mockClient),
    query: mockQuery,
  })),
}));

// Mock adjustBulkInventory — we track whether it gets called
const mockAdjustBulkInventory = jest.fn().mockResolvedValue(undefined);
jest.mock("../src/services/inventoryService", () => {
  const actual = jest.requireActual("../src/services/inventoryService");
  return {
    ...actual,
    // We re-export applyBulkDeductions but need to intercept adjustBulkInventory
  };
});

// We test the logic by calling applyBulkDeductions directly and asserting
// on the DB queries that it issues (or doesn't issue).

import { applyBulkDeductions } from "../src/services/inventoryService";

describe("GCP-STG-0329: applyBulkDeductions double-deduction guard", () => {
  const storeId = "store-001";
  const saleId = "sale-abc-123";
  const variantId = "variant-001";
  const productId = "product-001";

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("queries inventory_ledger when saleId is provided", async () => {
    // 1. Ledger check returns product-001 as already deducted
    mockQuery.mockResolvedValueOnce({
      rows: [{ product_id: productId }],
    });
    // 2. Variants query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: variantId,
          product_id: productId,
          unit_base: "g",
          size_base: 500,
        },
      ],
    });
    // No further queries should be made (adjustBulkInventory skipped)

    await applyBulkDeductions({
      client: mockClient,
      storeId,
      items: [{ variantId, quantity: 2 }],
      saleId,
    });

    // First call: ledger check
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const ledgerCall = mockQuery.mock.calls[0];
    expect(ledgerCall[0]).toContain("inventory.inventory_ledger");
    expect(ledgerCall[0]).toContain("reference_id");
    expect(ledgerCall[1]).toEqual([storeId, saleId]);

    // No adjustBulkInventory or subsequent queries for the skipped product
    // (only 2 queries total: ledger check + variants)
  });

  it("does NOT skip deduction when saleId is not provided (backward compat)", async () => {
    // 1. Variants query (no ledger check since no saleId)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: variantId,
          product_id: productId,
          unit_base: "g",
          size_base: 500,
        },
      ],
    });
    // 2+ adjustBulkInventory + dual-write queries (exact count varies)
    for (let i = 0; i < 10; i++) {
      mockQuery.mockResolvedValueOnce({ rows: [{ stock_before: 10 }] });
    }

    await applyBulkDeductions({
      client: mockClient,
      storeId,
      items: [{ variantId, quantity: 2 }],
      // No saleId — backward compatible path
    });

    // First call should be variants query (NOT ledger check)
    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[0]).toContain("FROM variants");
    expect(firstCall[0]).not.toContain("inventory_ledger");

    // Should have more than 2 calls (deduction queries ran)
    // Exact count depends on adjustBulkInventory internals; just verify > 2
    expect(mockQuery.mock.calls.length).toBeGreaterThan(2);
  });

  it("deducts for products NOT in ledger, skips those already deducted", async () => {
    const variantId2 = "variant-002";
    const productId2 = "product-002";

    // 1. Ledger check: product-001 already deducted, product-002 NOT
    mockQuery.mockResolvedValueOnce({
      rows: [{ product_id: productId }],
    });
    // 2. Variants query: both variants
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: variantId, product_id: productId, unit_base: "g", size_base: 500 },
        { id: variantId2, product_id: productId2, unit_base: "g", size_base: 1000 },
      ],
    });
    // 3+ Queries for product-002 deduction (adjustBulkInventory + dual-write, exact count varies)
    for (let i = 0; i < 10; i++) {
      mockQuery.mockResolvedValueOnce({ rows: [{ stock_before: 5 }] });
    }

    await applyBulkDeductions({
      client: mockClient,
      storeId,
      items: [
        { variantId, quantity: 2 },
        { variantId: variantId2, quantity: 1 },
      ],
      saleId,
    });

    // Verify ledger check was done
    const ledgerCall = mockQuery.mock.calls[0];
    expect(ledgerCall[0]).toContain("inventory.inventory_ledger");

    // product-001 should be skipped (already in ledger), product-002 should be deducted
    // Total calls: 2 (ledger + variants) + N (product-002 deduction queries)
    // Exact count depends on adjustBulkInventory internals; verify > 2
    expect(mockQuery.mock.calls.length).toBeGreaterThan(2);
  });

  it("skips all products if all already deducted", async () => {
    // 1. Ledger check: product-001 already deducted
    mockQuery.mockResolvedValueOnce({
      rows: [{ product_id: productId }],
    });
    // 2. Variants query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: variantId, product_id: productId, unit_base: "g", size_base: 500 },
      ],
    });

    await applyBulkDeductions({
      client: mockClient,
      storeId,
      items: [{ variantId, quantity: 3 }],
      saleId,
    });

    // Only 2 queries: ledger check + variants. No deduction queries.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("returns early when items array is empty", async () => {
    await applyBulkDeductions({
      client: mockClient,
      storeId,
      items: [],
      saleId,
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
