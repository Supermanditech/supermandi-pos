/**
 * Tests for services/api/reorderApi helper functions
 * Covers: getStockDeficit, isCriticallyLow, getEstimatedTotal
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
  getStockDeficit,
  isCriticallyLow,
  getEstimatedTotal,
  type PendingReorder,
} from '../../../services/api/reorderApi';

const mockPending = (overrides: Partial<PendingReorder> = {}): PendingReorder => ({
  id: 'pr1',
  storeId: 's1',
  productId: 'p1',
  productName: 'Test Product',
  barcode: '123',
  currentStock: 5,
  minThreshold: 20,
  targetStock: 50,
  suggestedQuantity: 45,
  suggestedSupplierId: 'sup1',
  suggestedSupplierName: 'Supplier 1',
  suggestedUnitPrice: 100,
  supplierProductId: 'sp1',
  paymentTerms: 'NET30',
  status: 'pending',
  dismissedReason: null,
  purchaseOrderId: null,
  expiresAt: '2025-01-01T00:00:00Z',
  createdAt: '2024-12-01T00:00:00Z',
  updatedAt: '2024-12-01T00:00:00Z',
  ...overrides,
});

describe('reorderApi helpers', () => {
  describe('getStockDeficit', () => {
    it('returns deficit when stock is below threshold', () => {
      const pending = mockPending({ currentStock: 5, minThreshold: 20 });
      expect(getStockDeficit(pending)).toBe(15);
    });

    it('returns 0 when stock is at threshold', () => {
      const pending = mockPending({ currentStock: 20, minThreshold: 20 });
      expect(getStockDeficit(pending)).toBe(0);
    });

    it('returns 0 when stock is above threshold', () => {
      const pending = mockPending({ currentStock: 50, minThreshold: 20 });
      expect(getStockDeficit(pending)).toBe(0);
    });

    it('handles zero stock', () => {
      const pending = mockPending({ currentStock: 0, minThreshold: 10 });
      expect(getStockDeficit(pending)).toBe(10);
    });
  });

  describe('isCriticallyLow', () => {
    it('returns true when stock is below 50% of threshold', () => {
      const pending = mockPending({ currentStock: 4, minThreshold: 20 });
      expect(isCriticallyLow(pending)).toBe(true);
    });

    it('returns false when stock is at 50% of threshold', () => {
      const pending = mockPending({ currentStock: 10, minThreshold: 20 });
      expect(isCriticallyLow(pending)).toBe(false);
    });

    it('returns false when stock is above 50% of threshold', () => {
      const pending = mockPending({ currentStock: 15, minThreshold: 20 });
      expect(isCriticallyLow(pending)).toBe(false);
    });

    it('returns true when stock is zero', () => {
      const pending = mockPending({ currentStock: 0, minThreshold: 10 });
      expect(isCriticallyLow(pending)).toBe(true);
    });

    it('returns false when threshold is zero', () => {
      const pending = mockPending({ currentStock: 0, minThreshold: 0 });
      expect(isCriticallyLow(pending)).toBe(false);
    });
  });

  describe('getEstimatedTotal', () => {
    it('calculates total from quantity and unit price', () => {
      const pending = mockPending({ suggestedQuantity: 10, suggestedUnitPrice: 150 });
      expect(getEstimatedTotal(pending)).toBe(1500);
    });

    it('returns 0 when unit price is null', () => {
      const pending = mockPending({ suggestedQuantity: 10, suggestedUnitPrice: null });
      expect(getEstimatedTotal(pending)).toBe(0);
    });

    it('returns 0 when unit price is 0', () => {
      const pending = mockPending({ suggestedQuantity: 10, suggestedUnitPrice: 0 });
      expect(getEstimatedTotal(pending)).toBe(0);
    });

    it('handles large quantities', () => {
      const pending = mockPending({ suggestedQuantity: 1000, suggestedUnitPrice: 5000 });
      expect(getEstimatedTotal(pending)).toBe(5000000);
    });
  });
});
