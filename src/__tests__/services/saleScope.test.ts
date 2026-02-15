/**
 * Deep tests for POS saleScope service
 * Covers: partitionSaleItems (full sale, partial, empty), buildStockDeductionLogs
 */
import { partitionSaleItems, buildStockDeductionLogs } from '../../services/saleScope';

describe('saleScope', () => {
  const items = [
    { id: 'a', name: 'Apples', priceMinor: 5000, quantity: 2, currency: 'INR' },
    { id: 'b', name: 'Bananas', priceMinor: 3000, quantity: 1, currency: 'INR' },
    { id: 'c', name: 'Carrots', priceMinor: 4000, quantity: 3, currency: 'INR' },
  ] as any[];

  describe('partitionSaleItems', () => {
    it('returns all items when no selection (full sale)', () => {
      const result = partitionSaleItems(items, null);
      expect(result.saleItems).toEqual(items);
      expect(result.remainingItems).toHaveLength(0);
      expect(result.isPartial).toBe(false);
    });

    it('returns all items when selection is empty array', () => {
      const result = partitionSaleItems(items, []);
      expect(result.saleItems).toEqual(items);
      expect(result.isPartial).toBe(false);
    });

    it('partitions items for partial sale', () => {
      const result = partitionSaleItems(items, ['a', 'c']);
      expect(result.saleItems).toHaveLength(2);
      expect(result.saleItems[0].id).toBe('a');
      expect(result.saleItems[1].id).toBe('c');
      expect(result.remainingItems).toHaveLength(1);
      expect(result.remainingItems[0].id).toBe('b');
      expect(result.isPartial).toBe(true);
    });

    it('handles selection of all items', () => {
      const result = partitionSaleItems(items, ['a', 'b', 'c']);
      expect(result.saleItems).toHaveLength(3);
      expect(result.remainingItems).toHaveLength(0);
      expect(result.isPartial).toBe(true); // isPartial=true because selection was provided
    });

    it('handles selection with non-existent IDs', () => {
      const result = partitionSaleItems(items, ['a', 'nonexistent']);
      expect(result.saleItems).toHaveLength(1);
      expect(result.remainingItems).toHaveLength(2);
    });
  });

  describe('buildStockDeductionLogs', () => {
    it('builds log strings with sku and quantity', () => {
      const cartItems = [
        { id: 'a', sku: 'SKU-001', barcode: '111', quantity: 2 },
        { id: 'b', sku: null, barcode: '222', quantity: 3 },
        { id: 'c', sku: null, barcode: null, quantity: 1 },
      ] as any[];

      const logs = buildStockDeductionLogs(cartItems);
      expect(logs[0]).toBe('stock_deducted:SKU-001:2');
      expect(logs[1]).toBe('stock_deducted:222:3');
      expect(logs[2]).toBe('stock_deducted:c:1');
    });

    it('appends saleId suffix when provided', () => {
      const cartItems = [{ id: 'a', sku: 'SKU-001', quantity: 1 }] as any[];
      const logs = buildStockDeductionLogs(cartItems, 'sale-123');
      expect(logs[0]).toBe('stock_deducted:SKU-001:1:saleId=sale-123');
    });

    it('omits saleId suffix when null/undefined', () => {
      const cartItems = [{ id: 'a', sku: 'SKU-001', quantity: 1 }] as any[];
      const logs = buildStockDeductionLogs(cartItems, null);
      expect(logs[0]).toBe('stock_deducted:SKU-001:1');
    });
  });
});
