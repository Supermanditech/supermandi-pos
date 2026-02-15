/**
 * Deep tests for POS searchHistory service
 * Covers: addTerm (dedup, max 10, trim, min length), getHistory, clearHistory
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
      removeItem: jest.fn(async (key: string) => { delete store[key]; }),
    },
    __store: store,
  };
});

import { addTerm, getHistory, clearHistory } from '../../services/searchHistory';

beforeEach(() => {
  const mod = require('@react-native-async-storage/async-storage');
  const store = mod.__store;
  for (const key of Object.keys(store)) delete store[key];
  jest.clearAllMocks();
});

describe('searchHistory', () => {
  const storeId = 'store-001';

  describe('addTerm', () => {
    it('adds a term to empty history', async () => {
      await addTerm(storeId, 'apple');
      const history = await getHistory(storeId);
      expect(history).toEqual(['apple']);
    });

    it('adds to front (most recent first)', async () => {
      await addTerm(storeId, 'apple');
      await addTerm(storeId, 'banana');
      const history = await getHistory(storeId);
      expect(history[0]).toBe('banana');
      expect(history[1]).toBe('apple');
    });

    it('deduplicates case-insensitively', async () => {
      await addTerm(storeId, 'apple');
      await addTerm(storeId, 'APPLE');
      const history = await getHistory(storeId);
      expect(history).toHaveLength(1);
      expect(history[0]).toBe('APPLE'); // Most recent version kept
    });

    it('caps at 10 terms', async () => {
      for (let i = 1; i <= 12; i++) {
        await addTerm(storeId, `term${i}`);
      }
      const history = await getHistory(storeId);
      expect(history).toHaveLength(10);
      expect(history[0]).toBe('term12');
    });

    it('ignores empty string', async () => {
      await addTerm(storeId, '');
      const history = await getHistory(storeId);
      expect(history).toHaveLength(0);
    });

    it('ignores whitespace-only string', async () => {
      await addTerm(storeId, '   ');
      const history = await getHistory(storeId);
      expect(history).toHaveLength(0);
    });

    it('ignores single character (less than 2)', async () => {
      await addTerm(storeId, 'a');
      const history = await getHistory(storeId);
      expect(history).toHaveLength(0);
    });

    it('trims whitespace', async () => {
      await addTerm(storeId, '  apple  ');
      const history = await getHistory(storeId);
      expect(history[0]).toBe('apple');
    });
  });

  describe('getHistory', () => {
    it('returns empty array for unknown store', async () => {
      const history = await getHistory('unknown-store');
      expect(history).toEqual([]);
    });

    it('returns stored terms in order', async () => {
      await addTerm(storeId, 'first');
      await addTerm(storeId, 'second');
      const history = await getHistory(storeId);
      expect(history).toEqual(['second', 'first']);
    });
  });

  describe('clearHistory', () => {
    it('removes all history for a store', async () => {
      await addTerm(storeId, 'apple');
      await addTerm(storeId, 'banana');
      await clearHistory(storeId);
      const history = await getHistory(storeId);
      expect(history).toEqual([]);
    });

    it('does not affect other stores', async () => {
      await addTerm('store-a', 'apple');
      await addTerm('store-b', 'banana');
      await clearHistory('store-a');

      const histA = await getHistory('store-a');
      const histB = await getHistory('store-b');
      expect(histA).toEqual([]);
      expect(histB).toEqual(['banana']);
    });
  });
});
