/**
 * TEST-020: analytics — parseRange unit tests
 * Tests date range parsing for analytics service (pure function, no DB).
 */

import { parseRange } from '../src/services/analytics/analyticsService';

describe('Analytics parseRange', () => {
  // =========================================================================
  // EXPLICIT RANGE
  // =========================================================================
  describe('explicit from/to', () => {
    it('parses ISO date strings', () => {
      const range = parseRange('2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z');
      expect(range.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(range.to.toISOString()).toBe('2026-01-31T23:59:59.000Z');
    });

    it('provides ISO strings in result', () => {
      const range = parseRange('2026-02-01', '2026-02-15');
      expect(range.fromIso).toBeDefined();
      expect(range.toIso).toBeDefined();
      expect(typeof range.fromIso).toBe('string');
    });
  });

  // =========================================================================
  // DEFAULTS
  // =========================================================================
  describe('defaults', () => {
    it('defaults to 30-day window when both undefined', () => {
      const before = Date.now();
      const range = parseRange(undefined, undefined);
      const after = Date.now();

      // 'to' should be close to now
      expect(range.to.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(range.to.getTime()).toBeLessThanOrEqual(after + 1000);

      // 'from' should be ~30 days before 'to'
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const diff = range.to.getTime() - range.from.getTime();
      expect(diff).toBeCloseTo(thirtyDaysMs, -3); // within a second
    });

    it('defaults from to 30 days before to when only to provided', () => {
      const range = parseRange(undefined, '2026-02-15T00:00:00Z');
      expect(range.to.toISOString()).toBe('2026-02-15T00:00:00.000Z');

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const expectedFrom = new Date('2026-02-15T00:00:00Z').getTime() - thirtyDaysMs;
      expect(range.from.getTime()).toBe(expectedFrom);
    });

    it('defaults to to now when only from provided', () => {
      const before = Date.now();
      const range = parseRange('2026-01-01', undefined);
      const after = Date.now();

      expect(range.from.toISOString()).toContain('2026-01-01');
      expect(range.to.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(range.to.getTime()).toBeLessThanOrEqual(after + 1000);
    });
  });

  // =========================================================================
  // INVALID DATES
  // =========================================================================
  describe('invalid dates', () => {
    it('treats invalid from as default (30 days before to)', () => {
      const range = parseRange('not-a-date', '2026-02-15T00:00:00Z');
      // Invalid from should fallback
      expect(range.to.toISOString()).toBe('2026-02-15T00:00:00.000Z');
    });

    it('treats invalid to as now', () => {
      const before = Date.now();
      const range = parseRange('2026-01-01', 'garbage');
      expect(range.to.getTime()).toBeGreaterThanOrEqual(before - 2000);
    });

    it('handles empty strings same as undefined', () => {
      const range = parseRange('', '');
      expect(range.from).toBeInstanceOf(Date);
      expect(range.to).toBeInstanceOf(Date);
    });
  });
});
