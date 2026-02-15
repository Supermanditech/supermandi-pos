/**
 * Tests for services/api/stockInApi
 * Covers: submitStockInDemo (pure function), exports, types
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
  getDeviceStoreId: jest.fn().mockResolvedValue(null),
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

import {
  submitStockIn,
  submitStockInDemo,
  getStockInHistory,
  cancelStockIn,
} from '../../../services/api/stockInApi';
import type { StockInPayload, StockInItem, StockInEntry } from '../../../services/api/stockInApi';

describe('stockInApi', () => {
  describe('exports', () => {
    it('exports submitStockIn', () => expect(typeof submitStockIn).toBe('function'));
    it('exports submitStockInDemo', () => expect(typeof submitStockInDemo).toBe('function'));
    it('exports getStockInHistory', () => expect(typeof getStockInHistory).toBe('function'));
    it('exports cancelStockIn', () => expect(typeof cancelStockIn).toBe('function'));
  });

  describe('submitStockInDemo', () => {
    it('returns mock response with correct item count', async () => {
      const payload: StockInPayload = {
        items: [
          { barcode: '123', productName: 'Item 1', quantity: 10, buyPrice: 100, sellPrice: 150 },
          { barcode: '456', productName: 'Item 2', quantity: 5, buyPrice: 200, sellPrice: 300 },
        ],
        totalAmount: 2000,
      };

      const result = await submitStockInDemo(payload);
      expect(result.itemsProcessed).toBe(2);
      expect(result.totalAmount).toBe(2000);
      expect(result.ledgerEntryId).toMatch(/^DEMO-/);
      expect(result.createdAt).toBeTruthy();
    });

    it('returns valid ISO date', async () => {
      const payload: StockInPayload = {
        items: [{ barcode: '123', productName: 'Item', quantity: 1, buyPrice: 100, sellPrice: 150 }],
        totalAmount: 100,
      };
      const result = await submitStockInDemo(payload);
      expect(() => new Date(result.createdAt).toISOString()).not.toThrow();
    });
  });

  describe('types', () => {
    it('StockInItem has correct shape', () => {
      const item: StockInItem = {
        barcode: '123',
        productName: 'Test',
        quantity: 10,
        buyPrice: 100,
        sellPrice: 150,
      };
      expect(item.barcode).toBe('123');
    });

    it('StockInEntry has correct shape', () => {
      const entry: StockInEntry = {
        id: 'entry-1',
        itemCount: 5,
        totalAmount: 5000,
        createdAt: '2024-01-01T00:00:00Z',
        status: 'completed',
      };
      expect(entry.status).toBe('completed');
    });
  });
});
