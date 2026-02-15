/**
 * Deep tests for POS posMode service
 * Covers: getLastPosMode (default SELL, stored value), setLastPosMode, normalization
 */

jest.mock('../../services/storeScope', () => {
  const store: Record<string, string> = {};
  return {
    storeScopedStorage: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
      removeItem: jest.fn(async (key: string) => { delete store[key]; }),
    },
    __store: store,
  };
});

import { getLastPosMode, setLastPosMode } from '../../services/posMode';

beforeEach(() => {
  const { __store } = require('../../services/storeScope');
  for (const key of Object.keys(__store)) delete __store[key];
  jest.clearAllMocks();
});

describe('posMode', () => {
  describe('getLastPosMode', () => {
    it('defaults to SELL when nothing stored', async () => {
      const mode = await getLastPosMode();
      expect(mode).toBe('SELL');
    });

    it('returns SELL when stored', async () => {
      await setLastPosMode('SELL');
      const mode = await getLastPosMode();
      expect(mode).toBe('SELL');
    });

    it('returns PURCHASE when stored', async () => {
      await setLastPosMode('PURCHASE');
      const mode = await getLastPosMode();
      expect(mode).toBe('PURCHASE');
    });

    it('defaults to SELL on storage error', async () => {
      const { storeScopedStorage } = require('../../services/storeScope');
      storeScopedStorage.getItem.mockRejectedValueOnce(new Error('fail'));

      const mode = await getLastPosMode();
      expect(mode).toBe('SELL');
    });
  });

  describe('setLastPosMode', () => {
    it('persists mode to storage', async () => {
      const { storeScopedStorage } = require('../../services/storeScope');
      await setLastPosMode('PURCHASE');
      expect(storeScopedStorage.setItem).toHaveBeenCalled();
    });
  });
});
