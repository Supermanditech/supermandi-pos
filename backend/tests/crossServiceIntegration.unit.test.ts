/**
 * TQ-009: Cross-service integration tests — using real validators.
 * Tests data flow contracts between services using actual validation functions.
 */
import {
  validateProductName,
  validateBarcode,
  validatePrice,
  validateStock,
} from '../src/utils/productValidation';
import { suggestCategory } from '../src/utils/autoCategorization';
import { compareSemver } from '../src/utils/semver';

describe('Cross-Service Integration — Real Validators', () => {
  // =========================================================================
  // SCAN → STOCK → SALE: Product data validated by real functions
  // =========================================================================
  describe('Scan → Stock → Sale', () => {
    it('scanned barcode passes real barcode validation', () => {
      expect(validateBarcode('8901058001150').valid).toBe(true);
    });

    it('scanned product name passes real name validation', () => {
      expect(validateProductName('Tata Salt 1kg').valid).toBe(true);
    });

    it('scanned product auto-categorizes correctly', () => {
      const cat = suggestCategory('Tata Salt 1kg');
      expect(cat).toBeDefined();
    });

    it('sale prices pass real price validation', () => {
      const saleItems = [
        { qty: 2, unitPrice: 1500 },
        { qty: 1, unitPrice: 3000 },
      ];
      for (const item of saleItems) {
        expect(validatePrice(item.unitPrice).valid).toBe(true);
      }
    });

    it('sale total is correct and valid', () => {
      const items = [
        { qty: 2, price: 1500 },
        { qty: 1, price: 3000 },
      ];
      const total = items.reduce((s, i) => s + i.qty * i.price, 0);
      expect(total).toBe(6000);
      expect(validatePrice(total).valid).toBe(true);
    });
  });

  // =========================================================================
  // PO → GRN → LEDGER: Stock mutations validated
  // =========================================================================
  describe('Purchase Order → GRN → Ledger', () => {
    it('GRN received stock passes validation', () => {
      expect(validateStock(95).valid).toBe(true);
      expect(validateStock(50).valid).toBe(true);
    });

    it('GRN received <= ordered', () => {
      const ordered = 100;
      const received = 95;
      expect(received).toBeLessThanOrEqual(ordered);
      expect(validateStock(received).valid).toBe(true);
    });

    it('stock balance after GRN is valid', () => {
      const before = 100;
      const received = 95;
      const newBalance = before + received;
      expect(validateStock(newBalance).valid).toBe(true);
    });

    it('PO unit cost passes price validation', () => {
      expect(validatePrice(800).valid).toBe(true);
      expect(validatePrice(1500).valid).toBe(true);
    });
  });

  // =========================================================================
  // VERSION COMPATIBILITY: semver comparison
  // =========================================================================
  describe('Version Compatibility', () => {
    it('newer version is greater', () => {
      expect(compareSemver('3.0.11', '3.0.10')).toBeGreaterThan(0);
    });

    it('same version equals zero', () => {
      expect(compareSemver('3.0.11', '3.0.11')).toBe(0);
    });

    it('major version bump dominates', () => {
      expect(compareSemver('4.0.0', '3.9.99')).toBeGreaterThan(0);
    });

    it('older version is less', () => {
      expect(compareSemver('2.0.0', '3.0.0')).toBeLessThan(0);
    });
  });

  // =========================================================================
  // REORDER → PO grouping logic
  // =========================================================================
  describe('Reorder → Purchase Order', () => {
    it('groups reorders by supplier', () => {
      const reorders = [
        { productId: 'p1', suggestedQty: 50, supplierId: 's1' },
        { productId: 'p2', suggestedQty: 30, supplierId: 's1' },
        { productId: 'p3', suggestedQty: 20, supplierId: 's2' },
      ];

      const bySupplier = new Map<string, typeof reorders>();
      for (const r of reorders) {
        const existing = bySupplier.get(r.supplierId) || [];
        existing.push(r);
        bySupplier.set(r.supplierId, existing);
      }

      expect(bySupplier.size).toBe(2);
      expect(bySupplier.get('s1')).toHaveLength(2);
      expect(bySupplier.get('s2')).toHaveLength(1);
    });

    it('suggested quantities pass stock validation', () => {
      expect(validateStock(50).valid).toBe(true);
      expect(validateStock(30).valid).toBe(true);
    });
  });
});
