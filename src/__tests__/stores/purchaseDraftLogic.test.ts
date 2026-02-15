/**
 * Tests for purchaseDraftLogic pure functions
 * Covers: normalizePurchaseDraftItem, findPurchaseDraftMatchIndex, mergePurchaseDraftItems
 */
import {
  normalizePurchaseDraftItem,
  findPurchaseDraftMatchIndex,
  mergePurchaseDraftItems,
  type PurchaseDraftItem,
  type PurchaseDraftInput,
} from '../../stores/purchaseDraftLogic';

describe('purchaseDraftLogic', () => {
  describe('normalizePurchaseDraftItem', () => {
    it('marks COMPLETE when all fields are present', () => {
      const result = normalizePurchaseDraftItem({
        barcode: '123',
        name: 'Test',
        quantity: 3,
        purchasePriceMinor: 500,
        sellingPriceMinor: 700,
        currency: 'INR',
      });
      expect(result.status).toBe('COMPLETE');
      expect(result.name).toBe('Test');
      expect(result.quantity).toBe(3);
    });

    it('auto-fills name from barcode when name missing (still COMPLETE if prices set)', () => {
      const result = normalizePurchaseDraftItem({
        barcode: '123',
        quantity: 3,
        purchasePriceMinor: 500,
        sellingPriceMinor: 700,
      });
      // Name is auto-filled via buildName(), so it's not "missing" for completeness check
      expect(result.status).toBe('COMPLETE');
      expect(result.name).toBe('Item 123'); // slice(-4) of '123' = '123'
    });

    it('marks INCOMPLETE when quantity is 0', () => {
      const result = normalizePurchaseDraftItem({
        barcode: '123',
        name: 'Test',
        quantity: 0,
        purchasePriceMinor: 500,
        sellingPriceMinor: 700,
      });
      expect(result.status).toBe('INCOMPLETE');
    });

    it('marks INCOMPLETE when purchasePriceMinor is null', () => {
      const result = normalizePurchaseDraftItem({
        barcode: '123',
        name: 'Test',
        quantity: 3,
        purchasePriceMinor: null,
        sellingPriceMinor: 700,
      });
      expect(result.status).toBe('INCOMPLETE');
    });

    it('marks INCOMPLETE when sellingPriceMinor is null', () => {
      const result = normalizePurchaseDraftItem({
        barcode: '123',
        name: 'Test',
        quantity: 3,
        purchasePriceMinor: 500,
        sellingPriceMinor: null,
      });
      expect(result.status).toBe('INCOMPLETE');
    });

    it('defaults currency to INR', () => {
      const result = normalizePurchaseDraftItem({
        barcode: '123',
        name: 'Test',
        quantity: 1,
        purchasePriceMinor: 100,
        sellingPriceMinor: 200,
      });
      expect(result.currency).toBe('INR');
    });

    it('uses barcode as id when id not provided', () => {
      const result = normalizePurchaseDraftItem({
        barcode: 'BC999',
        quantity: 1,
      });
      expect(result.id).toBe('BC999');
    });

    it('uses provided id', () => {
      const result = normalizePurchaseDraftItem({
        id: 'custom-id',
        barcode: 'BC999',
        quantity: 1,
      });
      expect(result.id).toBe('custom-id');
    });

    it('sets globalProductId and scanFormat to null when not provided', () => {
      const result = normalizePurchaseDraftItem({
        barcode: 'BC',
        quantity: 1,
      });
      expect(result.globalProductId).toBeNull();
      expect(result.scanFormat).toBeNull();
    });

    it('builds name from short barcode', () => {
      const result = normalizePurchaseDraftItem({
        barcode: 'AB',
        quantity: 1,
      });
      expect(result.name).toBe('Item AB');
    });
  });

  describe('findPurchaseDraftMatchIndex', () => {
    const items: PurchaseDraftItem[] = [
      { id: 'id1', barcode: 'BC1', globalProductId: 'GP1', scanFormat: null, name: 'A', quantity: 1, purchasePriceMinor: 100, sellingPriceMinor: 200, currency: 'INR', status: 'COMPLETE' },
      { id: 'id2', barcode: 'BC2', globalProductId: null, scanFormat: null, name: 'B', quantity: 2, purchasePriceMinor: 100, sellingPriceMinor: 200, currency: 'INR', status: 'COMPLETE' },
    ];

    it('matches by globalProductId', () => {
      const idx = findPurchaseDraftMatchIndex(items, { barcode: 'WHATEVER', globalProductId: 'GP1' });
      expect(idx).toBe(0);
    });

    it('matches by id when globalProductId matches id', () => {
      const idx = findPurchaseDraftMatchIndex(items, { barcode: 'X', id: 'id2' });
      expect(idx).toBe(1);
    });

    it('matches by barcode fallback', () => {
      const idx = findPurchaseDraftMatchIndex(items, { barcode: 'BC2' });
      expect(idx).toBe(1);
    });

    it('returns -1 when no match', () => {
      const idx = findPurchaseDraftMatchIndex(items, { barcode: 'NONEXISTENT' });
      expect(idx).toBe(-1);
    });

    it('returns -1 for empty items', () => {
      const idx = findPurchaseDraftMatchIndex([], { barcode: 'BC1' });
      expect(idx).toBe(-1);
    });

    it('ignores empty globalProductId strings', () => {
      const idx = findPurchaseDraftMatchIndex(items, { barcode: 'BC1', globalProductId: '   ' });
      expect(idx).toBe(0); // falls through to barcode match
    });
  });

  describe('mergePurchaseDraftItems', () => {
    it('adds new item when no match found', () => {
      const result = mergePurchaseDraftItems([], {
        barcode: 'BC1',
        name: 'New Item',
        quantity: 2,
        purchasePriceMinor: 100,
        sellingPriceMinor: 200,
      });
      expect(result).toHaveLength(1);
      expect(result[0].barcode).toBe('BC1');
      expect(result[0].quantity).toBe(2);
    });

    it('defaults quantity to 1 for new item', () => {
      const result = mergePurchaseDraftItems([], { barcode: 'BC1' });
      expect(result[0].quantity).toBe(1);
    });

    it('merges with existing item, incrementing quantity', () => {
      const existing: PurchaseDraftItem[] = [
        { id: 'id1', barcode: 'BC1', globalProductId: null, scanFormat: null, name: 'Item', quantity: 3, purchasePriceMinor: 100, sellingPriceMinor: 200, currency: 'INR', status: 'COMPLETE' },
      ];
      const result = mergePurchaseDraftItems(existing, { barcode: 'BC1', quantity: 2 });
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(5);
    });

    it('uses existing name when merging', () => {
      const existing: PurchaseDraftItem[] = [
        { id: 'id1', barcode: 'BC1', globalProductId: null, scanFormat: null, name: 'Original', quantity: 1, purchasePriceMinor: 100, sellingPriceMinor: 200, currency: 'INR', status: 'COMPLETE' },
      ];
      const result = mergePurchaseDraftItems(existing, { barcode: 'BC1', name: 'New Name' });
      expect(result[0].name).toBe('Original');
    });

    it('preserves existing prices when merging', () => {
      const existing: PurchaseDraftItem[] = [
        { id: 'id1', barcode: 'BC1', globalProductId: null, scanFormat: null, name: 'Item', quantity: 1, purchasePriceMinor: 100, sellingPriceMinor: 200, currency: 'INR', status: 'COMPLETE' },
      ];
      const result = mergePurchaseDraftItems(existing, { barcode: 'BC1', purchasePriceMinor: 999, sellingPriceMinor: 999 });
      expect(result[0].purchasePriceMinor).toBe(100);
      expect(result[0].sellingPriceMinor).toBe(200);
    });

    it('quantity never goes below 1 when merging', () => {
      const existing: PurchaseDraftItem[] = [
        { id: 'id1', barcode: 'BC1', globalProductId: null, scanFormat: null, name: 'Item', quantity: 1, purchasePriceMinor: 100, sellingPriceMinor: 200, currency: 'INR', status: 'COMPLETE' },
      ];
      const result = mergePurchaseDraftItems(existing, { barcode: 'BC1', quantity: -5 });
      expect(result[0].quantity).toBeGreaterThanOrEqual(1);
    });

    it('does not mutate original array', () => {
      const existing: PurchaseDraftItem[] = [
        { id: 'id1', barcode: 'BC1', globalProductId: null, scanFormat: null, name: 'Item', quantity: 1, purchasePriceMinor: 100, sellingPriceMinor: 200, currency: 'INR', status: 'COMPLETE' },
      ];
      const result = mergePurchaseDraftItems(existing, { barcode: 'BC1' });
      expect(result).not.toBe(existing);
      expect(existing[0].quantity).toBe(1); // original unchanged
    });

    it('fills null prices from input when existing has null', () => {
      const existing: PurchaseDraftItem[] = [
        { id: 'id1', barcode: 'BC1', globalProductId: null, scanFormat: null, name: 'Item', quantity: 1, purchasePriceMinor: null, sellingPriceMinor: null, currency: 'INR', status: 'INCOMPLETE' },
      ];
      const result = mergePurchaseDraftItems(existing, { barcode: 'BC1', purchasePriceMinor: 100, sellingPriceMinor: 200 });
      expect(result[0].purchasePriceMinor).toBe(100);
      expect(result[0].sellingPriceMinor).toBe(200);
    });
  });
});
