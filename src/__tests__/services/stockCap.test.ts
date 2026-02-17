/**
 * Deep tests for POS stockCap service
 * Covers: capAddQuantity (unknown/zero/positive stock, NaN normalization),
 * capRequestedQuantity (unknown/zero/positive stock, capping, out-of-stock)
 *
 * NOTE: normalizeStock(null) returns 0 (since Number(null)===0),
 *       normalizeStock(undefined) returns null (since Number(undefined)===NaN).
 *       Use `undefined` for unknown stock tests, `null` maps to 0 stock.
 */
import { capAddQuantity, capRequestedQuantity } from '../../services/stockCap';

describe('stockCap', () => {
  describe('capAddQuantity', () => {
    it('allows adding when stock is sufficient', () => {
      const result = capAddQuantity(0, 5, 10);
      expect(result.nextQty).toBe(5);
      expect(result.addedQty).toBe(5);
      expect(result.capped).toBe(false);
      expect(result.outOfStock).toBe(false);
      expect(result.unknownStock).toBe(false);
    });

    it('caps to available stock when adding exceeds', () => {
      const result = capAddQuantity(5, 10, 8);
      expect(result.requestedQty).toBe(15);
      expect(result.nextQty).toBe(8);
      expect(result.addedQty).toBe(3);
      expect(result.capped).toBe(true);
    });

    it('marks out-of-stock when stock is 0', () => {
      const result = capAddQuantity(0, 5, 0);
      expect(result.nextQty).toBe(0);
      expect(result.addedQty).toBe(0);
      expect(result.outOfStock).toBe(true);
      expect(result.capped).toBe(true);
    });

    it('treats null stock as unknown — caps to current qty', () => {
      // T1-015: null stock = unknown (not 0), so unknownStock=true and addedQty=0
      const result = capAddQuantity(0, 5, null);
      expect(result.unknownStock).toBe(true);
      expect(result.addedQty).toBe(0);
      expect(result.nextQty).toBe(0);
    });

    it('marks unknownStock when stock is undefined (truly unknown)', () => {
      // normalizeStock(undefined) = null (Number(undefined)=NaN → not finite → null)
      const result = capAddQuantity(0, 5, undefined);
      expect(result.unknownStock).toBe(true);
      expect(result.addedQty).toBe(0);
      expect(result.nextQty).toBe(0);
    });

    it('returns unknownStock=false when addQty is 0 and stock unknown', () => {
      const result = capAddQuantity(3, 0, undefined);
      expect(result.unknownStock).toBe(false);
      expect(result.nextQty).toBe(3);
    });

    it('normalizes NaN quantities to 0', () => {
      const result = capAddQuantity(NaN, NaN, 10);
      expect(result.requestedQty).toBe(0);
      expect(result.nextQty).toBe(0);
    });

    it('normalizes negative quantities to 0', () => {
      const result = capAddQuantity(-5, -3, 10);
      expect(result.requestedQty).toBe(0);
      expect(result.nextQty).toBe(0);
    });

    it('rounds fractional quantities', () => {
      const result = capAddQuantity(1.7, 2.3, 100);
      // 1.7 rounds to 2, 2.3 rounds to 2, requested = 4
      expect(result.requestedQty).toBe(4);
      expect(result.nextQty).toBe(4);
    });

    it('normalizes NaN stock to null (unknown)', () => {
      const result = capAddQuantity(0, 5, NaN);
      expect(result.unknownStock).toBe(true);
    });

    it('handles string inputs via coercion', () => {
      const result = capAddQuantity('3' as any, '2' as any, '10' as any);
      expect(result.requestedQty).toBe(5);
      expect(result.nextQty).toBe(5);
    });
  });

  describe('capRequestedQuantity', () => {
    it('allows setting to requested when stock sufficient', () => {
      const result = capRequestedQuantity(1, 5, 10);
      expect(result.nextQty).toBe(5);
      expect(result.capped).toBe(false);
      expect(result.outOfStock).toBe(false);
    });

    it('caps to available stock when exceeds', () => {
      const result = capRequestedQuantity(1, 15, 10);
      expect(result.nextQty).toBe(10);
      expect(result.capped).toBe(true);
    });

    it('marks out-of-stock when stock is 0', () => {
      const result = capRequestedQuantity(1, 5, 0);
      expect(result.nextQty).toBe(0);
      expect(result.outOfStock).toBe(true);
      expect(result.capped).toBe(true);
    });

    it('handles unknown stock (undefined) — caps increase to current qty', () => {
      const result = capRequestedQuantity(3, 10, undefined);
      expect(result.nextQty).toBe(3);
      expect(result.unknownStock).toBe(true);
      expect(result.capped).toBe(true);
    });

    it('allows decrease even with unknown stock', () => {
      const result = capRequestedQuantity(10, 5, undefined);
      expect(result.nextQty).toBe(5);
      expect(result.unknownStock).toBe(false);
      expect(result.capped).toBe(false);
    });

    it('treats null stock as unknown — caps increase to current qty', () => {
      // T1-015: null stock = unknown (same as undefined), caps increase to current
      const result = capRequestedQuantity(3, 10, null);
      expect(result.nextQty).toBe(3);
      expect(result.unknownStock).toBe(true);
      expect(result.capped).toBe(true);
    });

    it('normalizes NaN to 0', () => {
      const result = capRequestedQuantity(NaN, NaN, 10);
      expect(result.nextQty).toBe(0);
      expect(result.requestedQty).toBe(0);
    });

    it('allows setting to 0 (removal)', () => {
      const result = capRequestedQuantity(5, 0, 10);
      expect(result.nextQty).toBe(0);
      expect(result.capped).toBe(false);
      expect(result.outOfStock).toBe(false);
    });
  });
});
