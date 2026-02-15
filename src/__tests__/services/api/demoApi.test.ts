/**
 * Tests for services/api/demoApi
 * Covers: seedDemoStore export, DemoSeedResponse type
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

import { seedDemoStore } from '../../../services/api/demoApi';
import type { DemoSeedResponse } from '../../../services/api/demoApi';

describe('demoApi', () => {
  it('exports seedDemoStore function', () => {
    expect(typeof seedDemoStore).toBe('function');
  });

  it('DemoSeedResponse type has correct shape', () => {
    const response: DemoSeedResponse = {
      success: true,
      storeId: 'store-1',
      storeName: 'Demo Store',
      storeCode: 'DM001',
      seeded: {
        products: 10,
        store_products: 10,
        barcodes: 10,
        suppliers: 3,
        supplier_products: 15,
        purchase_orders: 5,
        grn_headers: 5,
        bills: 20,
        reorder_policies: 10,
      },
    };
    expect(response.success).toBe(true);
    expect(response.seeded.products).toBe(10);
  });
});
