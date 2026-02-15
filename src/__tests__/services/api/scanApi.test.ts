/**
 * Tests for services/api/scanApi
 * Covers: function exports, type shapes
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

jest.mock('../../../services/networkStatus', () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../services/offline/outbox', () => ({
  enqueueEvent: jest.fn(),
}));

jest.mock('../../../services/offline/scan', () => ({
  fetchLocalProduct: jest.fn(),
  resolveOfflineScan: jest.fn(),
  setLocalPrice: jest.fn(),
}));

import {
  resolveScan,
  setProductPrice,
  lookupProductByBarcode,
  resolveScanForDigitisation,
  createStoreProduct,
} from '../../../services/api/scanApi';
import type { ScanProduct, ScanResolveResponse, ScanMode } from '../../../services/api/scanApi';

describe('scanApi', () => {
  describe('exports', () => {
    it('exports resolveScan', () => expect(typeof resolveScan).toBe('function'));
    it('exports setProductPrice', () => expect(typeof setProductPrice).toBe('function'));
    it('exports lookupProductByBarcode', () => expect(typeof lookupProductByBarcode).toBe('function'));
    it('exports resolveScanForDigitisation', () => expect(typeof resolveScanForDigitisation).toBe('function'));
    it('exports createStoreProduct', () => expect(typeof createStoreProduct).toBe('function'));
  });

  describe('types', () => {
    it('ScanProduct has correct shape', () => {
      const product: ScanProduct = {
        id: 'p1',
        name: 'Test Product',
        barcode: '123456',
        priceMinor: 5000,
        currency: 'INR',
      };
      expect(product.currency).toBe('INR');
    });

    it('ScanMode values', () => {
      const sell: ScanMode = 'SELL';
      const digitise: ScanMode = 'DIGITISE';
      expect(sell).toBe('SELL');
      expect(digitise).toBe('DIGITISE');
    });
  });

  describe('lookupProductByBarcode', () => {
    it('returns null for empty barcode', async () => {
      const result = await lookupProductByBarcode('');
      expect(result).toBeNull();
    });

    it('returns null for whitespace-only barcode', async () => {
      const result = await lookupProductByBarcode('   ');
      expect(result).toBeNull();
    });
  });
});
