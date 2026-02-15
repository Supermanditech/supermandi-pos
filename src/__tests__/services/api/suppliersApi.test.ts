/**
 * Tests for services/api/suppliersApi
 * Covers: function exports, Supplier type
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
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../../../services/api/suppliersApi';
import type { Supplier } from '../../../services/api/suppliersApi';

describe('suppliersApi', () => {
  describe('exports', () => {
    it('exports getSuppliers', () => expect(typeof getSuppliers).toBe('function'));
    it('exports getSupplier', () => expect(typeof getSupplier).toBe('function'));
    it('exports createSupplier', () => expect(typeof createSupplier).toBe('function'));
    it('exports updateSupplier', () => expect(typeof updateSupplier).toBe('function'));
    it('exports deleteSupplier', () => expect(typeof deleteSupplier).toBe('function'));
  });

  describe('Supplier type', () => {
    it('has correct shape', () => {
      const supplier: Supplier = {
        id: 'sup-1',
        supplierCode: 'SUP001',
        businessName: 'Fresh Veggies Ltd',
        gstin: '29ABCDE1234F1ZH',
        creditDays: 30,
        minOrderValue: 5000,
        expectedDeliveryDays: 2,
        isPreferred: true,
        supplierVerified: true,
        supplierAccountId: 'acc-1',
        verificationSource: 'platform',
        supplierAppRegistered: true,
        superAdminVerified: true,
        hasRealGstin: true,
        name: 'Fresh Veggies Ltd',
        isActive: true,
      };
      expect(supplier.supplierVerified).toBe(true);
      expect(supplier.creditDays).toBe(30);
    });
  });
});
