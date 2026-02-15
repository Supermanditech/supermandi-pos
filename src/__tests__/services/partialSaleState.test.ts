/**
 * Deep tests for POS partialSaleState service
 * Covers: save/load/clear, TTL expiry, invalid state detection, updateConfirmed, updateSaleId
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

import {
  savePartialSaleState,
  loadPartialSaleState,
  clearPartialSaleState,
  updatePartialSaleConfirmed,
  updatePartialSaleSaleId,
} from '../../services/partialSaleState';

beforeEach(() => {
  const mod = require('@react-native-async-storage/async-storage');
  for (const key of Object.keys(mod.__store)) delete mod.__store[key];
  jest.clearAllMocks();
});

describe('partialSaleState', () => {
  describe('savePartialSaleState + loadPartialSaleState', () => {
    it('saves and loads state', async () => {
      await savePartialSaleState({ saleItemIds: ['a', 'b'], confirmed: false });
      const loaded = await loadPartialSaleState();

      expect(loaded).not.toBeNull();
      expect(loaded!.saleItemIds).toEqual(['a', 'b']);
      expect(loaded!.confirmed).toBe(false);
      expect(loaded!.createdAt).toBeGreaterThan(0);
    });

    it('returns null when nothing saved', async () => {
      const loaded = await loadPartialSaleState();
      expect(loaded).toBeNull();
    });
  });

  describe('TTL expiry', () => {
    it('returns null for expired state (>30 minutes)', async () => {
      // Save state with old timestamp
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const expiredState = {
        saleItemIds: ['a'],
        confirmed: false,
        createdAt: Date.now() - 31 * 60 * 1000, // 31 minutes ago
      };
      await AsyncStorage.setItem('supermandi.partial_sale.v1', JSON.stringify(expiredState));

      const loaded = await loadPartialSaleState();
      expect(loaded).toBeNull();
    });

    it('returns state within TTL', async () => {
      await savePartialSaleState({ saleItemIds: ['a'], confirmed: true });
      const loaded = await loadPartialSaleState();
      expect(loaded).not.toBeNull();
    });
  });

  describe('invalid state detection', () => {
    it('returns null for empty saleItemIds', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const invalidState = {
        saleItemIds: [],
        confirmed: false,
        createdAt: Date.now(),
      };
      await AsyncStorage.setItem('supermandi.partial_sale.v1', JSON.stringify(invalidState));

      const loaded = await loadPartialSaleState();
      expect(loaded).toBeNull();
    });
  });

  describe('clearPartialSaleState', () => {
    it('removes state from storage', async () => {
      await savePartialSaleState({ saleItemIds: ['a'], confirmed: false });
      await clearPartialSaleState();
      const loaded = await loadPartialSaleState();
      expect(loaded).toBeNull();
    });
  });

  describe('updatePartialSaleConfirmed', () => {
    it('updates confirmed flag without changing other fields', async () => {
      await savePartialSaleState({ saleItemIds: ['a', 'b'], confirmed: false });
      await updatePartialSaleConfirmed(true);

      const loaded = await loadPartialSaleState();
      expect(loaded!.confirmed).toBe(true);
      expect(loaded!.saleItemIds).toEqual(['a', 'b']);
    });

    it('no-ops when no state exists', async () => {
      await updatePartialSaleConfirmed(true);
      const loaded = await loadPartialSaleState();
      expect(loaded).toBeNull();
    });
  });

  describe('updatePartialSaleSaleId', () => {
    it('sets saleId on existing state', async () => {
      await savePartialSaleState({ saleItemIds: ['a'], confirmed: true });
      await updatePartialSaleSaleId('sale-123');

      const loaded = await loadPartialSaleState();
      expect(loaded!.saleId).toBe('sale-123');
    });
  });
});
