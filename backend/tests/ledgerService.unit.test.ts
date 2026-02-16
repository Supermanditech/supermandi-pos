/**
 * TEST-014: inventory-service — ledger service unit tests
 * Tests stock movement sign logic, batch validation, and edge cases.
 * DB calls are mocked — we're testing the business logic layer.
 */

// Mock the database queries
jest.mock('../services/inventory-service/src/db/queries', () => ({
  getStockBalance: jest.fn(),
  getAllStockBalancesForStore: jest.fn(),
  getLowStockProducts: jest.fn(),
  getLedgerEntriesForProduct: jest.fn(),
  getLedgerEntriesByReference: jest.fn(),
  getRecentLedgerEntriesForStore: jest.fn(),
  createLedgerEntryWithBalanceUpdate: jest.fn(),
  createBatchLedgerEntries: jest.fn(),
}));

import {
  getStock,
  getStockForMultipleProducts,
  listLowStockProducts,
  recordStockMovement,
  recordBatchStockMovement,
} from '../services/inventory-service/src/services/ledgerService';

import {
  getStockBalance,
  getAllStockBalancesForStore,
  createLedgerEntryWithBalanceUpdate,
  createBatchLedgerEntries,
} from '../services/inventory-service/src/db/queries';

const mockGetStockBalance = getStockBalance as jest.MockedFunction<typeof getStockBalance>;
const mockGetAllBalances = getAllStockBalancesForStore as jest.MockedFunction<typeof getAllStockBalancesForStore>;
const mockCreateEntry = createLedgerEntryWithBalanceUpdate as jest.MockedFunction<typeof createLedgerEntryWithBalanceUpdate>;
const mockBatchEntries = createBatchLedgerEntries as jest.MockedFunction<typeof createBatchLedgerEntries>;

describe('Ledger Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // STOCK LOOKUP
  // =========================================================================
  describe('getStock', () => {
    it('returns 0 when no balance exists', async () => {
      mockGetStockBalance.mockResolvedValue(null as any);

      const result = await getStock('store-1', 'product-1');
      expect(result.currentQty).toBe(0);
      expect(result.storeId).toBe('store-1');
      expect(result.productId).toBe('product-1');
    });

    it('returns current quantity from balance', async () => {
      mockGetStockBalance.mockResolvedValue({ currentQty: 42, updatedAt: new Date() } as any);

      const result = await getStock('store-1', 'product-1');
      expect(result.currentQty).toBe(42);
    });
  });

  describe('getStockForMultipleProducts', () => {
    it('maps balances to product IDs', async () => {
      mockGetAllBalances.mockResolvedValue([
        { productId: 'p1', currentQty: 10 },
        { productId: 'p3', currentQty: 30 },
      ] as any);

      const result = await getStockForMultipleProducts('store-1', ['p1', 'p2', 'p3']);
      expect(result).toHaveLength(3);
      expect(result[0]!.currentQty).toBe(10);
      expect(result[1]!.currentQty).toBe(0); // p2 has no balance
      expect(result[2]!.currentQty).toBe(30);
    });
  });

  // =========================================================================
  // LOW STOCK
  // =========================================================================
  describe('listLowStockProducts', () => {
    it('throws for negative threshold', async () => {
      await expect(listLowStockProducts('store-1', -1)).rejects.toThrow('non-negative');
    });

    it('accepts zero threshold', async () => {
      const { getLowStockProducts } = jest.requireMock('../services/inventory-service/src/db/queries');
      getLowStockProducts.mockResolvedValue([]);

      await expect(listLowStockProducts('store-1', 0)).resolves.toEqual([]);
    });
  });

  // =========================================================================
  // STOCK MOVEMENT — SIGN APPLICATION
  // =========================================================================
  describe('recordStockMovement — sign logic', () => {
    it('sale: positive quantity becomes negative delta', async () => {
      mockCreateEntry.mockResolvedValue({ deltaQty: -5 } as any);

      await recordStockMovement({
        storeId: 'store-1',
        productId: 'product-1',
        quantity: 5,
        transactionType: 'sale',
      });

      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({ deltaQty: -5 })
      );
    });

    it('sale_return: positive quantity stays positive delta', async () => {
      mockCreateEntry.mockResolvedValue({ deltaQty: 3 } as any);

      await recordStockMovement({
        storeId: 'store-1',
        productId: 'product-1',
        quantity: 3,
        transactionType: 'sale_return',
      });

      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({ deltaQty: 3 })
      );
    });

    it('purchase_received: positive delta', async () => {
      mockCreateEntry.mockResolvedValue({ deltaQty: 100 } as any);

      await recordStockMovement({
        storeId: 'store-1',
        productId: 'product-1',
        quantity: 100,
        transactionType: 'purchase_received',
      });

      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({ deltaQty: 100 })
      );
    });

    it('adjustment: quantity passed as-is (can be negative)', async () => {
      mockCreateEntry.mockResolvedValue({ deltaQty: -10 } as any);

      await recordStockMovement({
        storeId: 'store-1',
        productId: 'product-1',
        quantity: -10,
        transactionType: 'adjustment',
      });

      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({ deltaQty: -10 })
      );
    });

    it('opening_stock: positive delta', async () => {
      mockCreateEntry.mockResolvedValue({ deltaQty: 50 } as any);

      await recordStockMovement({
        storeId: 'store-1',
        productId: 'product-1',
        quantity: 50,
        transactionType: 'opening_stock',
      });

      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({ deltaQty: 50 })
      );
    });
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================
  describe('recordStockMovement — validation', () => {
    it('rejects non-integer quantity', async () => {
      await expect(
        recordStockMovement({
          storeId: 'store-1',
          productId: 'product-1',
          quantity: 2.5,
          transactionType: 'sale',
        })
      ).rejects.toThrow('integer');
    });

    it('rejects zero quantity for sale', async () => {
      await expect(
        recordStockMovement({
          storeId: 'store-1',
          productId: 'product-1',
          quantity: 0,
          transactionType: 'sale',
        })
      ).rejects.toThrow('positive');
    });

    it('rejects negative quantity for sale', async () => {
      await expect(
        recordStockMovement({
          storeId: 'store-1',
          productId: 'product-1',
          quantity: -5,
          transactionType: 'sale',
        })
      ).rejects.toThrow('positive');
    });

    it('rejects zero quantity for purchase_received', async () => {
      await expect(
        recordStockMovement({
          storeId: 'store-1',
          productId: 'product-1',
          quantity: 0,
          transactionType: 'purchase_received',
        })
      ).rejects.toThrow('positive');
    });

    it('rejects invalid transaction type', async () => {
      await expect(
        recordStockMovement({
          storeId: 'store-1',
          productId: 'product-1',
          quantity: 1,
          transactionType: 'invalid_type' as any,
        })
      ).rejects.toThrow('Invalid transaction type');
    });

    it('wraps "Insufficient stock" error', async () => {
      mockCreateEntry.mockRejectedValue(new Error('Insufficient stock for product-1'));

      await expect(
        recordStockMovement({
          storeId: 'store-1',
          productId: 'product-1',
          quantity: 999,
          transactionType: 'sale',
        })
      ).rejects.toThrow('Insufficient stock');
    });
  });

  // =========================================================================
  // BATCH MOVEMENTS
  // =========================================================================
  describe('recordBatchStockMovement', () => {
    it('rejects empty items array', async () => {
      await expect(
        recordBatchStockMovement({
          storeId: 'store-1',
          items: [],
          transactionType: 'sale',
        })
      ).rejects.toThrow('At least one item');
    });

    it('rejects non-integer quantity in batch', async () => {
      await expect(
        recordBatchStockMovement({
          storeId: 'store-1',
          items: [{ productId: 'p1', quantity: 2.5 }],
          transactionType: 'sale',
        })
      ).rejects.toThrow('integer');
    });

    it('applies negative sign for sale batch', async () => {
      mockBatchEntries.mockResolvedValue([{ deltaQty: -3 }, { deltaQty: -5 }] as any);

      await recordBatchStockMovement({
        storeId: 'store-1',
        items: [
          { productId: 'p1', quantity: 3 },
          { productId: 'p2', quantity: 5 },
        ],
        transactionType: 'sale',
      });

      const entries = mockBatchEntries.mock.calls[0]![0] as any[];
      expect(entries[0].deltaQty).toBe(-3);
      expect(entries[1].deltaQty).toBe(-5);
    });

    it('applies positive sign for purchase_received batch', async () => {
      mockBatchEntries.mockResolvedValue([{ deltaQty: 10 }] as any);

      await recordBatchStockMovement({
        storeId: 'store-1',
        items: [{ productId: 'p1', quantity: 10 }],
        transactionType: 'purchase_received',
      });

      const entries = mockBatchEntries.mock.calls[0]![0] as any[];
      expect(entries[0].deltaQty).toBe(10);
    });

    it('rejects zero quantity in sale batch', async () => {
      await expect(
        recordBatchStockMovement({
          storeId: 'store-1',
          items: [
            { productId: 'p1', quantity: 5 },
            { productId: 'p2', quantity: 0 },
          ],
          transactionType: 'sale',
        })
      ).rejects.toThrow('positive');
    });
  });
});
