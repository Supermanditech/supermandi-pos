/**
 * TEST-019: voice-service — intent parser unit tests
 * Tests Hindi/English voice command parsing for kirana store POS.
 */

import { parseIntent } from '../services/voice-service/src/services/intentParser';
import type { ParsedIntent } from '../services/voice-service/src/services/intentParser';

describe('Voice Intent Parser', () => {
  // =========================================================================
  // ADD TO CART INTENTS
  // =========================================================================
  describe('add_to_cart', () => {
    it('parses "2 kg rice chahiye"', () => {
      const result = parseIntent('2 kg rice chahiye');
      expect(result.action).toBe('add_to_cart');
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe('kg');
      expect(result.productName).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('parses "add 1 packet maggi"', () => {
      const result = parseIntent('add 1 packet maggi');
      expect(result.action).toBe('add_to_cart');
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe('pcs');
      expect(result.productName).toContain('maggi');
    });

    it('parses "do kilo atta dedo"', () => {
      const result = parseIntent('do kilo atta dedo');
      expect(result.action).toBe('add_to_cart');
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe('kg');
    });

    it('parses "ek litre oil"', () => {
      const result = parseIntent('ek litre oil');
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe('l');
    });

    it('parses numeric quantities with units', () => {
      const result = parseIntent('5 kg sugar');
      expect(result.quantity).toBe(5);
      expect(result.unit).toBe('kg');
    });

    it('defaults quantity to 1 when unit present but no number', () => {
      const result = parseIntent('kg rice');
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe('kg');
    });
  });

  // =========================================================================
  // HINDI NUMBER PARSING
  // =========================================================================
  describe('Hindi numbers', () => {
    const hindiNumbers: Array<[string, number]> = [
      ['ek', 1],
      ['do', 2],
      ['teen', 3],
      ['char', 4],
      ['paanch', 5],
      ['das', 10],
      ['bees', 20],
    ];

    test.each(hindiNumbers)('"%s" parses to %d', (word, expected) => {
      const result = parseIntent(`${word} kg rice`);
      expect(result.quantity).toBe(expected);
    });
  });

  // =========================================================================
  // UNIT NORMALIZATION
  // =========================================================================
  describe('unit normalization', () => {
    const unitMappings: Array<[string, string]> = [
      ['kg', 'kg'],
      ['kilo', 'kg'],
      ['gram', 'g'],
      ['litre', 'l'],
      ['ml', 'ml'],
      ['piece', 'pcs'],
      ['packet', 'pcs'],
      ['dozen', 'dozen'],
    ];

    test.each(unitMappings)('"%s" normalizes to "%s"', (input, expected) => {
      const result = parseIntent(`1 ${input} rice`);
      expect(result.unit).toBe(expected);
    });
  });

  // =========================================================================
  // SEARCH INTENTS
  // =========================================================================
  describe('search', () => {
    it('parses "show me rice"', () => {
      const result = parseIntent('show me rice');
      expect(result.action).toBe('search');
    });

    it('parses "dikhao atta"', () => {
      const result = parseIntent('dikhao atta');
      expect(result.action).toBe('search');
    });

    it('defaults to search for bare product names', () => {
      const result = parseIntent('rice');
      expect(result.action).toBe('search');
    });
  });

  // =========================================================================
  // STOCK CHECK INTENTS
  // =========================================================================
  describe('check_stock', () => {
    it('parses "stock check rice"', () => {
      const result = parseIntent('stock check rice');
      expect(result.action).toBe('check_stock');
    });

    it('parses "kitna rice hai"', () => {
      const result = parseIntent('kitna rice hai');
      expect(result.action).toBe('check_stock');
    });

    it('parses "rice available hai kya"', () => {
      const result = parseIntent('rice available hai kya');
      expect(result.action).toBe('check_stock');
    });
  });

  // =========================================================================
  // CONFIDENCE SCORING
  // =========================================================================
  describe('confidence', () => {
    it('higher confidence with action + product + quantity', () => {
      const full = parseIntent('2 kg rice chahiye');
      const partial = parseIntent('rice');

      expect(full.confidence).toBeGreaterThan(partial.confidence);
    });

    it('confidence is between 0 and 1', () => {
      const result = parseIntent('random gibberish xyz');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('base confidence is at least 0.5', () => {
      const result = parseIntent('xyz');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================
  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = parseIntent('');
      expect(result.action).toBe('search');
      expect(result.rawQuery).toBe('');
    });

    it('preserves rawQuery', () => {
      const input = '2 KG Rice Chahiye';
      const result = parseIntent(input);
      expect(result.rawQuery).toBe(input);
    });

    it('handles mixed case', () => {
      const result = parseIntent('ADD 3 KG RICE');
      expect(result.action).toBe('add_to_cart');
      expect(result.quantity).toBe(3);
    });

    it('handles decimal quantities', () => {
      const result = parseIntent('0.5 kg sugar');
      expect(result.quantity).toBe(0.5);
    });

    it('handles Hindi darjan (dozen)', () => {
      const result = parseIntent('ek darjan eggs');
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe('dozen');
    });
  });
});
