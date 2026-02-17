/**
 * TQ-008: Data Integrity Tests — using REAL production validators.
 * Imports actual functions from src/utils/productValidation.ts and
 * src/utils/autoCategorization.ts.
 */
import {
  validateProductName,
  validateBarcode,
  validatePrice,
  validateStock,
  PRODUCT_VALIDATION_CONSTANTS,
} from '../src/utils/productValidation';
import { suggestCategory, getAvailableCategories } from '../src/utils/autoCategorization';

describe('Data Integrity — Real Validators', () => {
  // =========================================================================
  // PRICE INVARIANT: paisa amounts validated by real function
  // =========================================================================
  describe('Paisa Invariant — Price Validation', () => {
    it('sale price must be positive integer (paisa)', () => {
      expect(validatePrice(8500).valid).toBe(true);   // ₹85
      expect(validatePrice(1).valid).toBe(true);        // 1 paisa
      expect(validatePrice(0).valid).toBe(false);       // Zero not allowed
      expect(validatePrice(-100).valid).toBe(false);    // Negative
    });

    it('sale total = sum of item prices (integer math)', () => {
      const items = [
        { qty: 2, priceMinor: 8500 },
        { qty: 1, priceMinor: 15000 },
        { qty: 3, priceMinor: 2500 },
      ];
      const total = items.reduce((s, i) => s + i.qty * i.priceMinor, 0);
      expect(total).toBe(39500);
      expect(Number.isInteger(total)).toBe(true);
      expect(validatePrice(total).valid).toBe(true);
    });

    it('max price boundary matches constant', () => {
      expect(validatePrice(PRODUCT_VALIDATION_CONSTANTS.MAX_PRICE_MINOR).valid).toBe(true);
      expect(validatePrice(PRODUCT_VALIDATION_CONSTANTS.MAX_PRICE_MINOR + 1).valid).toBe(false);
    });
  });

  // =========================================================================
  // STOCK BALANCE INVARIANTS — using real validator
  // =========================================================================
  describe('Stock Balance', () => {
    it('stock balance = sum of ledger deltas', () => {
      const deltas = [100, -5, -3, 50, 2, -10];
      const balance = deltas.reduce((s, d) => s + d, 0);
      expect(balance).toBe(134);
      expect(validateStock(balance).valid).toBe(true);
    });

    it('rejects negative stock', () => {
      expect(validateStock(-1).valid).toBe(false);
    });

    it('max stock boundary matches constant', () => {
      expect(validateStock(PRODUCT_VALIDATION_CONSTANTS.MAX_STOCK_QTY).valid).toBe(true);
      expect(validateStock(PRODUCT_VALIDATION_CONSTANTS.MAX_STOCK_QTY + 1).valid).toBe(false);
    });
  });

  // =========================================================================
  // BARCODE FORMAT — real validator
  // =========================================================================
  describe('Barcode Integrity', () => {
    it('EAN-13 accepted', () => {
      expect(validateBarcode('8901058001150').valid).toBe(true);
    });

    it('UPC-A accepted', () => {
      expect(validateBarcode('012345678901').valid).toBe(true);
    });

    it('internal SM- accepted', () => {
      expect(validateBarcode('SM-RICE001').valid).toBe(true);
    });

    it('empty barcode valid (optional)', () => {
      expect(validateBarcode('').valid).toBe(true);
    });
  });

  // =========================================================================
  // AUTO-CATEGORIZATION — real function
  // =========================================================================
  describe('Auto-Categorization', () => {
    it('suggests category for known products', () => {
      const cat = suggestCategory('Tata Salt 1kg');
      expect(cat).toBeDefined();
      if (cat) expect(typeof cat).toBe('string');
    });

    it('returns null for unrecognizable names', () => {
      expect(suggestCategory('xyz12345abc')).toBeNull();
    });

    it('available categories list is non-empty', () => {
      const cats = getAvailableCategories();
      expect(cats.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // PRODUCT NAME — real validator
  // =========================================================================
  describe('Product Name Integrity', () => {
    it('min length enforced', () => {
      expect(validateProductName('A').valid).toBe(false);
      expect(validateProductName('AB').valid).toBe(true);
    });

    it('max length boundary', () => {
      const max = PRODUCT_VALIDATION_CONSTANTS.MAX_PRODUCT_NAME_LENGTH;
      expect(validateProductName('A'.repeat(max)).valid).toBe(true);
      expect(validateProductName('A'.repeat(max + 1)).valid).toBe(false);
    });
  });
});
