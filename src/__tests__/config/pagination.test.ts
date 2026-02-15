/**
 * Tests for config/pagination
 * Covers: constants, shouldStopPagination
 */
import {
  PRODUCTS_PAGE_SIZE,
  LIST_PAGE_SIZE,
  SEARCH_PAGE_SIZE,
  MAX_PAGINATION_PAGE,
  shouldStopPagination,
} from '../../config/pagination';

describe('pagination config', () => {
  describe('constants', () => {
    it('has correct page sizes', () => {
      expect(PRODUCTS_PAGE_SIZE).toBe(40);
      expect(LIST_PAGE_SIZE).toBe(20);
      expect(SEARCH_PAGE_SIZE).toBe(30);
      expect(MAX_PAGINATION_PAGE).toBe(100);
    });
  });

  describe('shouldStopPagination', () => {
    it('stops when hasMore is false', () => {
      expect(shouldStopPagination(1, false)).toBe(true);
    });

    it('does not stop on page 1 with hasMore', () => {
      expect(shouldStopPagination(1, true)).toBe(false);
    });

    it('stops at max page limit', () => {
      expect(shouldStopPagination(100, true)).toBe(true);
    });

    it('stops above max page limit', () => {
      expect(shouldStopPagination(150, true)).toBe(true);
    });

    it('does not stop below max page with hasMore', () => {
      expect(shouldStopPagination(99, true)).toBe(false);
    });

    it('stops at max page even if hasMore true (buggy backend)', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      expect(shouldStopPagination(100, true)).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('GO-LIVE-170'));
      consoleSpy.mockRestore();
    });
  });
});
