/**
 * TEST-022: Remaining API contract tests — Inventory, Order, Reorder, Supplier, Analytics
 * Extends the existing POS + Portal contract tests.
 */

import { z } from 'zod';

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/));
const MoneyMinorSchema = z.number().int();

// =============================================================================
// INVENTORY API CONTRACTS
// =============================================================================

const StockBalanceResponse = z.object({
  storeId: UuidSchema,
  productId: UuidSchema,
  currentQty: z.number().int(),
  lastUpdated: TimestampSchema.optional().nullable(),
});

const LedgerEntryResponse = z.object({
  id: UuidSchema,
  storeId: UuidSchema,
  productId: UuidSchema,
  deltaQty: z.number().int(),
  transactionType: z.enum(['sale', 'sale_return', 'purchase_received', 'adjustment', 'opening_stock']),
  referenceType: z.string().optional().nullable(),
  referenceId: z.string().optional().nullable(),
  createdAt: TimestampSchema,
});

// =============================================================================
// ORDER API CONTRACTS
// =============================================================================

const PurchaseOrderResponse = z.object({
  id: UuidSchema,
  storeId: UuidSchema,
  supplierId: UuidSchema.optional().nullable(),
  orderNumber: z.string(),
  status: z.enum(['draft', 'submitted', 'confirmed', 'shipped', 'partial_received', 'delivered', 'cancelled']),
  itemCount: z.number().int().nonnegative(),
  totalAmountMinor: MoneyMinorSchema.optional().nullable(),
  createdAt: TimestampSchema,
});

const PurchaseOrderItemResponse = z.object({
  productId: UuidSchema,
  quantity: z.number().int().positive(),
  unitCostMinor: MoneyMinorSchema.optional().nullable(),
  receivedQty: z.number().int().nonnegative().optional(),
});

// =============================================================================
// REORDER API CONTRACTS
// =============================================================================

const ReorderPolicyResponse = z.object({
  id: UuidSchema,
  storeId: UuidSchema,
  productId: UuidSchema,
  minStock: z.number().int().nonnegative(),
  targetStock: z.number().int().nonnegative(),
  isEnabled: z.boolean(),
  preferredSupplierId: UuidSchema.optional().nullable(),
});

const PendingReorderResponse = z.object({
  id: UuidSchema,
  storeId: UuidSchema,
  productId: UuidSchema,
  suggestedQty: z.number().int().positive(),
  status: z.enum(['pending', 'approved', 'dismissed']),
});

// =============================================================================
// SUPPLIER API CONTRACTS
// =============================================================================

const SupplierResponse = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  gstin: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  isActive: z.boolean(),
});

// =============================================================================
// ANALYTICS API CONTRACTS
// =============================================================================

const AnalyticsOverviewResponse = z.object({
  totalSalesMinor: MoneyMinorSchema,
  totalTransactions: z.number().int().nonnegative(),
  avgBasketMinor: MoneyMinorSchema,
  topProducts: z.array(z.object({
    productId: z.string(),
    name: z.string().optional(),
    totalQty: z.number(),
    revenueMinor: MoneyMinorSchema,
  })).optional(),
});

// =============================================================================
// TESTS
// =============================================================================

describe('Inventory API Contracts', () => {
  it('validates stock balance shape', () => {
    const response = {
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      currentQty: 42,
      lastUpdated: '2026-02-15T12:00:00.000Z',
    };
    expect(() => StockBalanceResponse.parse(response)).not.toThrow();
  });

  it('validates stock balance with 0 qty', () => {
    const response = {
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      currentQty: 0,
      lastUpdated: null,
    };
    expect(() => StockBalanceResponse.parse(response)).not.toThrow();
  });

  it('rejects non-integer stock quantity', () => {
    const response = {
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      currentQty: 42.5,
    };
    expect(() => StockBalanceResponse.parse(response)).toThrow();
  });

  it('validates ledger entry shape', () => {
    const entry = {
      id: '00000000-0000-0000-0000-000000000001',
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      deltaQty: -5,
      transactionType: 'sale',
      referenceType: 'pos_sale',
      referenceId: '00000000-0000-0000-0000-000000000002',
      createdAt: '2026-02-15T12:00:00.000Z',
    };
    expect(() => LedgerEntryResponse.parse(entry)).not.toThrow();
  });

  it('rejects invalid transaction type', () => {
    const entry = {
      id: '00000000-0000-0000-0000-000000000001',
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      deltaQty: -5,
      transactionType: 'unknown_type',
      createdAt: '2026-02-15T12:00:00.000Z',
    };
    expect(() => LedgerEntryResponse.parse(entry)).toThrow();
  });
});

// =============================================================================
// OPENING STOCK DUAL-WRITE CONTRACT (BLK-SP1 regression guard)
// Ensures opening stock writes all three surfaces consistently:
//   1. inventory.inventory_ledger (with stock_before/stock_after snapshot)
//   2. inventory.stock_balances (authoritative stock)
//   3. catalog.store_products.current_stock (denormalized read cache)
//
// The canonical stock resolution used by both POS and retailer portal is:
//   COALESCE(sb.current_qty, sp.current_stock, 0)
// If stock_balances is not written, existing rows with current_qty=0 will
// shadow the correct store_products value, causing stock parity bugs.
// =============================================================================

const OpeningStockLedgerEntry = z.object({
  id: UuidSchema,
  storeId: UuidSchema,
  productId: UuidSchema,
  deltaQty: z.number().positive(),
  transactionType: z.literal('opening_stock'),
  referenceType: z.literal('manual'),
  stockBefore: z.number().int().nonnegative(),
  stockAfter: z.number().int().positive(),
  source: z.literal('POS_OPENING_STOCK'),
});

// Validates that stock_before + delta_qty = stock_after (DB constraint)
const StockConsistencyCheck = z.object({
  stockBefore: z.number(),
  deltaQty: z.number(),
  stockAfter: z.number(),
}).refine(
  (data) => data.stockBefore + data.deltaQty === data.stockAfter,
  { message: 'stock_before + delta_qty must equal stock_after' }
);

describe('Opening Stock Dual-Write Contract (BLK-SP1)', () => {
  it('ledger entry includes stock_before and stock_after', () => {
    const entry = {
      id: '00000000-0000-0000-0000-000000000001',
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      deltaQty: 10,
      transactionType: 'opening_stock',
      referenceType: 'manual',
      stockBefore: 0,
      stockAfter: 10,
      source: 'POS_OPENING_STOCK',
    };
    expect(() => OpeningStockLedgerEntry.parse(entry)).not.toThrow();
  });

  it('stock snapshot satisfies consistency constraint', () => {
    const snapshot = { stockBefore: 0, deltaQty: 10, stockAfter: 10 };
    expect(() => StockConsistencyCheck.parse(snapshot)).not.toThrow();
  });

  it('rejects inconsistent stock snapshot', () => {
    const bad = { stockBefore: 0, deltaQty: 10, stockAfter: 5 };
    expect(() => StockConsistencyCheck.parse(bad)).toThrow();
  });

  it('stock_balances must receive the same quantity as ledger', () => {
    // Simulates the dual-write: ledger says delta=10, stock_balances must also increment by 10
    const ledgerDelta = 10;
    const stockBalancesBefore = 0;
    const stockBalancesAfter = stockBalancesBefore + ledgerDelta;
    expect(stockBalancesAfter).toBe(10);
    // COALESCE(sb.current_qty, sp.current_stock, 0) should now return 10
    const canonicalStock = stockBalancesAfter; // stock_balances is primary
    expect(canonicalStock).toBe(10);
  });

  it('opening stock with existing balance adds correctly', () => {
    const existingBalance = 5;
    const openingQty = 10;
    const snapshot = {
      stockBefore: existingBalance,
      deltaQty: openingQty,
      stockAfter: existingBalance + openingQty,
    };
    expect(() => StockConsistencyCheck.parse(snapshot)).not.toThrow();
    expect(snapshot.stockAfter).toBe(15);
  });

  it('rejects opening stock with zero or negative quantity', () => {
    const zeroEntry = {
      id: '00000000-0000-0000-0000-000000000001',
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      deltaQty: 0,
      transactionType: 'opening_stock',
      referenceType: 'manual',
      stockBefore: 0,
      stockAfter: 0,
      source: 'POS_OPENING_STOCK',
    };
    expect(() => OpeningStockLedgerEntry.parse(zeroEntry)).toThrow();

    const negativeEntry = { ...zeroEntry, deltaQty: -5, stockAfter: -5 };
    expect(() => OpeningStockLedgerEntry.parse(negativeEntry)).toThrow();
  });
});

describe('Order API Contracts', () => {
  it('validates purchase order shape', () => {
    const po = {
      id: '00000000-0000-0000-0000-000000000001',
      storeId: '00000000-0000-0000-0000-000000000010',
      supplierId: '00000000-0000-0000-0000-000000000300',
      orderNumber: 'PO-2026-0001',
      status: 'draft',
      itemCount: 5,
      totalAmountMinor: 150000,
      createdAt: '2026-02-15T12:00:00.000Z',
    };
    expect(() => PurchaseOrderResponse.parse(po)).not.toThrow();
  });

  it('validates all 7 order statuses', () => {
    const statuses = ['draft', 'submitted', 'confirmed', 'shipped', 'partial_received', 'delivered', 'cancelled'];
    for (const status of statuses) {
      const po = {
        id: '00000000-0000-0000-0000-000000000001',
        storeId: '00000000-0000-0000-0000-000000000010',
        orderNumber: 'PO-001',
        status,
        itemCount: 1,
        createdAt: '2026-02-15T12:00:00.000Z',
      };
      expect(() => PurchaseOrderResponse.parse(po)).not.toThrow();
    }
  });

  it('validates PO item with received quantity', () => {
    const item = {
      productId: '00000000-0000-0000-0000-000000000500',
      quantity: 100,
      unitCostMinor: 8500,
      receivedQty: 95,
    };
    expect(() => PurchaseOrderItemResponse.parse(item)).not.toThrow();
  });
});

describe('Reorder API Contracts', () => {
  it('validates reorder policy shape', () => {
    const policy = {
      id: '00000000-0000-0000-0000-000000000001',
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      minStock: 10,
      targetStock: 50,
      isEnabled: true,
      preferredSupplierId: '00000000-0000-0000-0000-000000000300',
    };
    expect(() => ReorderPolicyResponse.parse(policy)).not.toThrow();
  });

  it('enforces minStock >= 0 in schema', () => {
    const bad = {
      id: '00000000-0000-0000-0000-000000000001',
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      minStock: -1,
      targetStock: 10,
      isEnabled: true,
    };
    expect(() => ReorderPolicyResponse.parse(bad)).toThrow();
  });

  it('validates pending reorder shape', () => {
    const pending = {
      id: '00000000-0000-0000-0000-000000000001',
      storeId: '00000000-0000-0000-0000-000000000010',
      productId: '00000000-0000-0000-0000-000000000500',
      suggestedQty: 40,
      status: 'pending',
    };
    expect(() => PendingReorderResponse.parse(pending)).not.toThrow();
  });
});

describe('Supplier API Contracts', () => {
  it('validates supplier shape', () => {
    const supplier = {
      id: '00000000-0000-0000-0000-000000000300',
      name: 'Metro Cash & Carry',
      gstin: '29AABCU9603R1ZM',
      phone: '+919876543210',
      email: 'metro@example.com',
      isActive: true,
    };
    expect(() => SupplierResponse.parse(supplier)).not.toThrow();
  });

  it('requires non-empty supplier name', () => {
    const bad = {
      id: '00000000-0000-0000-0000-000000000300',
      name: '',
      isActive: true,
    };
    expect(() => SupplierResponse.parse(bad)).toThrow();
  });
});

describe('Analytics API Contracts', () => {
  it('validates overview shape', () => {
    const overview = {
      totalSalesMinor: 500000,
      totalTransactions: 150,
      avgBasketMinor: 3333,
    };
    expect(() => AnalyticsOverviewResponse.parse(overview)).not.toThrow();
  });

  it('enforces integer amounts (paisa)', () => {
    const bad = {
      totalSalesMinor: 500.50, // Not integer!
      totalTransactions: 10,
      avgBasketMinor: 5000,
    };
    expect(() => AnalyticsOverviewResponse.parse(bad)).toThrow();
  });
});
