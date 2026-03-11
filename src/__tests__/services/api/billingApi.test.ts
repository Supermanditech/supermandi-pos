/**
 * Tests for services/api/billingApi
 * Covers: listBills, fetchBillSnapshot exports
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
  isOnline: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../../services/billing/billStorage', () => ({
  fetchLocalBillSnapshot: jest.fn().mockResolvedValue(null),
  listLocalBills: jest.fn().mockResolvedValue([]),
  upsertLocalBillSnapshot: jest.fn(),
}));

jest.mock('../../../services/billing/billTypes', () => ({
  paymentModeFromStatus: jest.fn((status: string) => {
    if (status === 'PAID') return 'CASH';
    return 'UNKNOWN';
  }),
}));

import { listBills, fetchBillSnapshot } from '../../../services/api/billingApi';

describe('billingApi', () => {
  describe('exports', () => {
    it('exports listBills', () => expect(typeof listBills).toBe('function'));
    it('exports fetchBillSnapshot', () => expect(typeof fetchBillSnapshot).toBe('function'));
  });

  describe('listBills when offline', () => {
    it('returns local bills when offline', async () => {
      const { listLocalBills } = require('../../../services/billing/billStorage');
      const localBills = [
        { saleId: 'sale-1', billRef: 'BILL-001', totalMinor: 1000, status: 'PAID', createdAt: '2024-01-01' },
      ];
      listLocalBills.mockResolvedValue(localBills);

      const result = await listBills();
      expect(result).toEqual({ bills: localBills, hasMore: false });
    });
  });

  describe('fetchBillSnapshot when offline', () => {
    it('returns local snapshot when offline', async () => {
      const { fetchLocalBillSnapshot } = require('../../../services/billing/billStorage');
      const snapshot = {
        saleId: 'sale-1',
        billRef: 'BILL-001',
        status: 'PAID',
        totalMinor: 1000,
        items: [],
      };
      fetchLocalBillSnapshot.mockResolvedValue(snapshot);

      const result = await fetchBillSnapshot('sale-1');
      expect(result).toEqual(snapshot);
    });

    it('returns null when no local snapshot', async () => {
      const { fetchLocalBillSnapshot } = require('../../../services/billing/billStorage');
      fetchLocalBillSnapshot.mockResolvedValue(null);

      const result = await fetchBillSnapshot('sale-nonexistent');
      expect(result).toBeNull();
    });
  });
});
