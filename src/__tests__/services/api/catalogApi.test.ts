/**
 * Tests for services/api/catalogApi helper functions
 * Covers: getStockStatusLabel, getStockStatusColor, getBestSupplier, getPreferredOrBestSupplier
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
  getStockStatusLabel,
  getStockStatusColor,
  getBestSupplier,
  getPreferredOrBestSupplier,
  type CatalogProduct,
  type CatalogSupplier,
} from '../../../services/api/catalogApi';

const mockSupplier = (overrides: Partial<CatalogSupplier> = {}): CatalogSupplier => ({
  supplierId: 's1',
  supplierName: 'Supplier 1',
  supplierProductId: 'sp1',
  purchasePrice: 100,
  moq: 1,
  stockQuantity: 10,
  stockStatus: 'in_stock',
  isPreferred: false,
  ...overrides,
});

const mockProduct = (suppliers: CatalogSupplier[] = []): CatalogProduct => ({
  id: 'p1',
  name: 'Test',
  isActive: true,
  bestPrice: 100,
  minMoq: 1,
  supplierCount: suppliers.length,
  stockStatus: 'in_stock',
  suppliers,
});

describe('catalogApi helpers', () => {
  describe('getStockStatusLabel', () => {
    it('returns "In Stock"', () => expect(getStockStatusLabel('in_stock')).toBe('In Stock'));
    it('returns "Low Stock"', () => expect(getStockStatusLabel('low_stock')).toBe('Low Stock'));
    it('returns "Out of Stock"', () => expect(getStockStatusLabel('out_of_stock')).toBe('Out of Stock'));
    it('returns "Unknown" for unknown', () => expect(getStockStatusLabel('xyz' as any)).toBe('Unknown'));
  });

  describe('getStockStatusColor', () => {
    it('returns green for in_stock', () => expect(getStockStatusColor('in_stock')).toBe('#22c55e'));
    it('returns amber for low_stock', () => expect(getStockStatusColor('low_stock')).toBe('#f59e0b'));
    it('returns red for out_of_stock', () => expect(getStockStatusColor('out_of_stock')).toBe('#ef4444'));
    it('returns gray for unknown', () => expect(getStockStatusColor('xyz' as any)).toBe('#6b7280'));
  });

  describe('getBestSupplier', () => {
    it('returns null for no suppliers', () => {
      expect(getBestSupplier(mockProduct())).toBeNull();
    });

    it('returns cheapest in-stock supplier', () => {
      const suppliers = [
        mockSupplier({ purchasePrice: 200, supplierId: 'expensive' }),
        mockSupplier({ purchasePrice: 50, supplierId: 'cheap' }),
        mockSupplier({ purchasePrice: 100, supplierId: 'mid' }),
      ];
      expect(getBestSupplier(mockProduct(suppliers))?.supplierId).toBe('cheap');
    });

    it('prefers in-stock over out-of-stock even if pricier', () => {
      const suppliers = [
        mockSupplier({ purchasePrice: 50, stockStatus: 'out_of_stock', supplierId: 'oos-cheap' }),
        mockSupplier({ purchasePrice: 200, stockStatus: 'in_stock', supplierId: 'is-expensive' }),
      ];
      expect(getBestSupplier(mockProduct(suppliers))?.supplierId).toBe('is-expensive');
    });

    it('falls back to cheapest when all out of stock', () => {
      const suppliers = [
        mockSupplier({ purchasePrice: 200, stockStatus: 'out_of_stock', supplierId: 'expensive' }),
        mockSupplier({ purchasePrice: 50, stockStatus: 'out_of_stock', supplierId: 'cheap' }),
      ];
      expect(getBestSupplier(mockProduct(suppliers))?.supplierId).toBe('cheap');
    });
  });

  describe('getPreferredOrBestSupplier', () => {
    it('returns preferred supplier when set', () => {
      const suppliers = [
        mockSupplier({ purchasePrice: 50, supplierId: 'cheap' }),
        mockSupplier({ purchasePrice: 200, isPreferred: true, supplierId: 'preferred' }),
      ];
      expect(getPreferredOrBestSupplier(mockProduct(suppliers))?.supplierId).toBe('preferred');
    });

    it('falls back to best when no preferred', () => {
      const suppliers = [
        mockSupplier({ purchasePrice: 50, supplierId: 'cheap' }),
        mockSupplier({ purchasePrice: 200, supplierId: 'expensive' }),
      ];
      expect(getPreferredOrBestSupplier(mockProduct(suppliers))?.supplierId).toBe('cheap');
    });
  });
});
