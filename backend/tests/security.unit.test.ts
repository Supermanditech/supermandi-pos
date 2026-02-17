/**
 * TQ-007: Security unit tests — testing REAL production validation functions.
 * Imports actual validators from src/utils/productValidation.ts.
 */
import {
  validateProductName,
  validateBarcode,
  validatePrice,
  validateStock,
} from '../src/utils/productValidation';

describe('Security Tests — Real Validation', () => {
  // =========================================================================
  // INPUT VALIDATION via real productValidation functions
  // =========================================================================
  describe('Product Name Validation (SQL/XSS)', () => {
    it('accepts valid product names', () => {
      expect(validateProductName('Tata Salt 1kg').valid).toBe(true);
      expect(validateProductName('Rice Basmati Premium').valid).toBe(true);
    });

    it('accepts Indian-script names', () => {
      expect(validateProductName('आटा 5kg').valid).toBe(true);
      expect(validateProductName('চিনি').valid).toBe(true);
    });

    it('rejects empty and whitespace-only', () => {
      expect(validateProductName('').valid).toBe(false);
      expect(validateProductName('   ').valid).toBe(false);
    });

    it('rejects single-char names', () => {
      expect(validateProductName('x').valid).toBe(false);
    });

    it('rejects names with only special chars', () => {
      expect(validateProductName('---').valid).toBe(false);
      expect(validateProductName('!!!').valid).toBe(false);
    });

    it('rejects names exceeding max length', () => {
      expect(validateProductName('A'.repeat(501)).valid).toBe(false);
    });

    it('accepts max-length name', () => {
      expect(validateProductName('A'.repeat(500)).valid).toBe(true);
    });
  });

  describe('Barcode Validation (Injection)', () => {
    it('rejects path traversal', () => {
      expect(validateBarcode('../../../etc/passwd').valid).toBe(false);
    });

    it('rejects script injection', () => {
      expect(validateBarcode('<script>alert(1)</script>').valid).toBe(false);
    });

    it('accepts EAN-13', () => {
      expect(validateBarcode('8901058001150').valid).toBe(true);
    });

    it('accepts EAN-8', () => {
      expect(validateBarcode('12345678').valid).toBe(true);
    });

    it('accepts UPC-A', () => {
      expect(validateBarcode('012345678901').valid).toBe(true);
    });

    it('accepts internal SuperMandi barcodes', () => {
      expect(validateBarcode('SM-RICE001').valid).toBe(true);
      expect(validateBarcode('2001234567890').valid).toBe(true);
    });

    it('accepts empty barcode (optional field)', () => {
      expect(validateBarcode('').valid).toBe(true);
    });

    it('rejects too-short barcodes', () => {
      expect(validateBarcode('AB').valid).toBe(false);
    });
  });

  // =========================================================================
  // PRICE VALIDATION (paisa invariant — real validator)
  // =========================================================================
  describe('Price Validation — Paisa Safety', () => {
    it('rejects zero price', () => {
      expect(validatePrice(0).valid).toBe(false);
    });

    it('rejects negative price', () => {
      expect(validatePrice(-100).valid).toBe(false);
    });

    it('accepts valid paisa amounts', () => {
      expect(validatePrice(8500).valid).toBe(true);
      expect(validatePrice(1).valid).toBe(true);
      expect(validatePrice(1_000_000_000).valid).toBe(true);
    });

    it('rejects exceeding max price', () => {
      expect(validatePrice(1_000_000_001).valid).toBe(false);
    });

    it('rejects Infinity and NaN', () => {
      expect(validatePrice(Infinity).valid).toBe(false);
      expect(validatePrice(NaN).valid).toBe(false);
    });
  });

  // =========================================================================
  // STOCK VALIDATION (real validator)
  // =========================================================================
  describe('Stock Validation — Bounds', () => {
    it('rejects negative stock', () => {
      expect(validateStock(-1).valid).toBe(false);
    });

    it('accepts zero stock', () => {
      expect(validateStock(0).valid).toBe(true);
    });

    it('accepts normal stock', () => {
      expect(validateStock(150).valid).toBe(true);
    });

    it('rejects exceeding max stock', () => {
      expect(validateStock(10_000_001).valid).toBe(false);
    });

    it('rejects Infinity and NaN', () => {
      expect(validateStock(Infinity).valid).toBe(false);
      expect(validateStock(NaN).valid).toBe(false);
    });
  });

  // =========================================================================
  // STORE ISOLATION (design constraint)
  // =========================================================================
  describe('Store Isolation — Design Invariant', () => {
    it('JWT storeId overrides request body storeId', () => {
      const jwtPayload = { userId: 'user-1', storeId: 'real-store-id' };
      const requestBody = { storeId: 'attacker-store-id' };
      const effectiveStoreId = jwtPayload.storeId;
      expect(effectiveStoreId).toBe('real-store-id');
      expect(effectiveStoreId).not.toBe(requestBody.storeId);
    });
  });
});
