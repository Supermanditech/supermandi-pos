/**
 * Tests for services/api/productsApi helper functions
 * Covers: getProductPriceSources, resolvePriceMinorFromSources, resolveProductPriceMinor
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
  clearDeviceSession: jest.fn(), getDeviceToken: jest.fn().mockResolvedValue(null),
  getDeviceSession: jest.fn().mockResolvedValue(null), saveDeviceSession: jest.fn(),
  getDeviceStoreId: jest.fn().mockResolvedValue(null), getDeviceIdFromSession: jest.fn().mockResolvedValue(null),
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
  setAuthToken: jest.fn(), clearAuthToken: jest.fn(),
}));

import {
  getProductPriceSources,
  resolvePriceMinorFromSources,
  resolveProductPriceMinor,
  type ApiProduct,
} from '../../../services/api/productsApi';

describe('productsApi helpers', () => {
  describe('getProductPriceSources', () => {
    it('returns inventory and variant prices', () => {
      const product: ApiProduct = {
        id: 'p1', name: 'Test', barcode: null, sku: null, currency: 'INR', stock: 0,
        inventory: { selling_price: 100 },
        variant: { selling_price: 200, mrp: 300 },
      };
      const sources = getProductPriceSources(product);
      expect(sources.inventoryPrice).toBe(100);
      expect(sources.variantPrice).toBe(200);
      expect(sources.variantMrp).toBe(300);
    });

    it('falls back to product.price when no inventory/variant', () => {
      const product: ApiProduct = {
        id: 'p1', name: 'Test', barcode: null, sku: null, currency: 'INR', stock: 0,
        price: 500,
      };
      const sources = getProductPriceSources(product);
      expect(sources.inventoryPrice).toBe(500);
    });

    it('handles null inventory and variant', () => {
      const product: ApiProduct = {
        id: 'p1', name: 'Test', barcode: null, sku: null, currency: 'INR', stock: 0,
        inventory: null,
        variant: null,
      };
      const sources = getProductPriceSources(product);
      expect(sources.inventoryPrice).toBeNull();
      expect(sources.variantPrice).toBeNull();
      expect(sources.variantMrp).toBeNull();
    });
  });

  describe('resolvePriceMinorFromSources', () => {
    it('prefers inventory price', () => {
      const result = resolvePriceMinorFromSources({ inventoryPrice: 100, variantPrice: 200, variantMrp: 300 });
      expect(result.priceMinor).toBe(100);
    });

    it('falls back to variant price', () => {
      const result = resolvePriceMinorFromSources({ inventoryPrice: null, variantPrice: 200, variantMrp: 300 });
      expect(result.priceMinor).toBe(200);
    });

    it('falls back to MRP', () => {
      const result = resolvePriceMinorFromSources({ inventoryPrice: null, variantPrice: null, variantMrp: 300 });
      expect(result.priceMinor).toBe(300);
    });

    it('returns 0 for all null', () => {
      const result = resolvePriceMinorFromSources({ inventoryPrice: null, variantPrice: null, variantMrp: null });
      expect(result.priceMinor).toBe(0);
    });

    it('normalizes NaN to null', () => {
      const result = resolvePriceMinorFromSources({ inventoryPrice: NaN, variantPrice: NaN, variantMrp: NaN });
      expect(result.priceMinor).toBe(0);
    });

    it('normalizes negative to 0', () => {
      const result = resolvePriceMinorFromSources({ inventoryPrice: -100, variantPrice: null, variantMrp: null });
      expect(result.priceMinor).toBe(0);
    });

    it('rounds to integer', () => {
      const result = resolvePriceMinorFromSources({ inventoryPrice: 99.7, variantPrice: null, variantMrp: null });
      expect(result.priceMinor).toBe(100);
    });
  });

  describe('resolveProductPriceMinor', () => {
    it('resolves complete product price', () => {
      const product: ApiProduct = {
        id: 'p1', name: 'Test', barcode: null, sku: null, currency: 'INR', stock: 0,
        inventory: { selling_price: 150 },
        variant: { selling_price: 200, mrp: 250 },
      };
      expect(resolveProductPriceMinor(product)).toBe(150);
    });

    it('returns 0 for product with no prices', () => {
      const product: ApiProduct = {
        id: 'p1', name: 'Test', barcode: null, sku: null, currency: 'INR', stock: 0,
      };
      expect(resolveProductPriceMinor(product)).toBe(0);
    });
  });
});
