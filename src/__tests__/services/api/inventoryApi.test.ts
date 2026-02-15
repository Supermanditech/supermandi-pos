/**
 * Tests for services/api/inventoryApi
 * Covers: type exports, function exports
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn(), getAllKeys: jest.fn() },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(),
}));

jest.mock('../../../services/deviceSession', () => ({
  clearDeviceSession: jest.fn(),
  getDeviceToken: jest.fn().mockResolvedValue(null),
  getDeviceSession: jest.fn().mockResolvedValue(null),
  saveDeviceSession: jest.fn(),
  getDeviceStoreId: jest.fn().mockResolvedValue('store-1'),
  getDeviceIdFromSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../stores/staffSessionStore', () => ({
  useStaffSessionStore: { getState: () => ({ session: null }) },
}));

jest.mock('../../../i18n', () => ({ language: 'en' }));

jest.mock('../../../config/api', () => ({
  API_BASE_URL: 'http://localhost:3000',
}));

jest.mock('../../../services/api/storage', () => ({
  getAuthToken: jest.fn().mockResolvedValue(null),
  setAuthToken: jest.fn(),
  clearAuthToken: jest.fn(),
}));

jest.mock('../../../services/networkStatus', () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/stockCache', () => ({
  getCachedStock: jest.fn().mockReturnValue(null),
}));

jest.mock('../../../services/offlineQueue', () => ({
  queueOfflineTransaction: jest.fn(),
}));

import {
  getStock,
  getStockBatch,
  recordSaleTransaction,
  recordSaleReturnTransaction,
  recordManualInward,
  getLedgerEntries,
  getPurchaseHistory,
  getSalesHistory,
  getStockStatement,
} from '../../../services/api/inventoryApi';
import type { StockLookupResult, LedgerEntry } from '../../../services/api/inventoryApi';

describe('inventoryApi', () => {
  describe('exports', () => {
    it('exports getStock', () => expect(typeof getStock).toBe('function'));
    it('exports getStockBatch', () => expect(typeof getStockBatch).toBe('function'));
    it('exports recordSaleTransaction', () => expect(typeof recordSaleTransaction).toBe('function'));
    it('exports recordSaleReturnTransaction', () => expect(typeof recordSaleReturnTransaction).toBe('function'));
    it('exports recordManualInward', () => expect(typeof recordManualInward).toBe('function'));
    it('exports getLedgerEntries', () => expect(typeof getLedgerEntries).toBe('function'));
    it('exports getPurchaseHistory', () => expect(typeof getPurchaseHistory).toBe('function'));
    it('exports getSalesHistory', () => expect(typeof getSalesHistory).toBe('function'));
    it('exports getStockStatement', () => expect(typeof getStockStatement).toBe('function'));
  });

  describe('types', () => {
    it('StockLookupResult has correct shape', () => {
      const result: StockLookupResult = {
        storeId: 'store-1',
        productId: 'p1',
        currentQty: 50,
        lastUpdated: '2024-01-01T00:00:00Z',
      };
      expect(result.currentQty).toBe(50);
    });

    it('LedgerEntry has correct shape', () => {
      const entry: LedgerEntry = {
        id: 'le-1',
        storeId: 'store-1',
        productId: 'p1',
        deltaQty: -5,
        transactionType: 'sale',
        referenceType: 'sale',
        referenceId: 'sale-1',
        stockBefore: 50,
        stockAfter: 45,
        createdAt: '2024-01-01T00:00:00Z',
      };
      expect(entry.deltaQty).toBe(-5);
      expect(entry.stockBefore - entry.stockAfter).toBe(5);
    });
  });

  describe('getStockBatch edge case', () => {
    it('returns empty object for empty product IDs', async () => {
      const result = await getStockBatch([]);
      expect(result).toEqual({});
    });
  });
});
