/**
 * Deep tests for POS customSku utility
 * Covers: normalizeCategory, formatCategoryLabel, buildCustomSkuBarcode,
 * buildCustomSkuName, isCustomSkuBarcode — edge cases, special chars, empty input
 */
import {
  normalizeCategory,
  formatCategoryLabel,
  buildCustomSkuBarcode,
  buildCustomSkuName,
  isCustomSkuBarcode,
} from '../../utils/customSku';

describe('customSku', () => {
  // ════════════════════════════════════════════════════════════════════
  // normalizeCategory
  // ════════════════════════════════════════════════════════════════════

  describe('normalizeCategory', () => {
    it('lowercases and replaces special chars with underscores', () => {
      expect(normalizeCategory('Fruits & Vegetables')).toBe('fruits_vegetables');
    });

    it('trims whitespace', () => {
      expect(normalizeCategory('  Rice  ')).toBe('rice');
    });

    it('returns "general" for empty string', () => {
      expect(normalizeCategory('')).toBe('general');
    });

    it('returns "general" for whitespace-only string', () => {
      expect(normalizeCategory('   ')).toBe('general');
    });

    it('removes leading and trailing underscores', () => {
      expect(normalizeCategory('--rice--')).toBe('rice');
    });

    it('handles multiple special chars', () => {
      expect(normalizeCategory('Dairy / Milk & Curd')).toBe('dairy_milk_curd');
    });

    it('handles numeric input', () => {
      expect(normalizeCategory('123')).toBe('123');
    });

    it('returns "general" for all-special-char input', () => {
      expect(normalizeCategory('---')).toBe('general');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // formatCategoryLabel
  // ════════════════════════════════════════════════════════════════════

  describe('formatCategoryLabel', () => {
    it('title cases words', () => {
      expect(formatCategoryLabel('fruits and vegetables')).toBe('Fruits And Vegetables');
    });

    it('handles underscore-separated words', () => {
      expect(formatCategoryLabel('dairy_products')).toBe('Dairy Products');
    });

    it('handles hyphen-separated words', () => {
      expect(formatCategoryLabel('dry-fruits')).toBe('Dry Fruits');
    });

    it('returns "General" for empty string', () => {
      expect(formatCategoryLabel('')).toBe('General');
    });

    it('returns "General" for whitespace only', () => {
      expect(formatCategoryLabel('   ')).toBe('General');
    });

    it('handles single word', () => {
      expect(formatCategoryLabel('rice')).toBe('Rice');
    });

    it('handles UPPERCASE input', () => {
      expect(formatCategoryLabel('SPICES')).toBe('Spices');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // buildCustomSkuBarcode / buildCustomSkuName
  // ════════════════════════════════════════════════════════════════════

  describe('buildCustomSkuBarcode', () => {
    it('prepends CUSTOM: prefix to normalized category', () => {
      expect(buildCustomSkuBarcode('Rice')).toBe('CUSTOM:rice');
    });

    it('handles special characters', () => {
      expect(buildCustomSkuBarcode('Fruits & Vegs')).toBe('CUSTOM:fruits_vegs');
    });
  });

  describe('buildCustomSkuName', () => {
    it('builds "Custom {Label}" name', () => {
      expect(buildCustomSkuName('rice')).toBe('Custom Rice');
    });

    it('title cases category', () => {
      expect(buildCustomSkuName('dairy_products')).toBe('Custom Dairy Products');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // isCustomSkuBarcode
  // ════════════════════════════════════════════════════════════════════

  describe('isCustomSkuBarcode', () => {
    it('returns true for custom SKU barcodes', () => {
      expect(isCustomSkuBarcode('CUSTOM:rice')).toBe(true);
    });

    it('returns false for regular barcodes', () => {
      expect(isCustomSkuBarcode('1234567890')).toBe(false);
    });

    it('returns false for partial prefix', () => {
      expect(isCustomSkuBarcode('CUST:rice')).toBe(false);
    });

    it('is case sensitive', () => {
      expect(isCustomSkuBarcode('custom:rice')).toBe(false);
    });
  });
});
