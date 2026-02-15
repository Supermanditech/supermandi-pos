/**
 * Tests for services/api/posApi
 * Covers: function exports, type shape
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

jest.mock('../../../services/offline/sales', () => ({
  createOfflineSale: jest.fn(),
  fetchOfflineSale: jest.fn(),
  recordOfflineCashPayment: jest.fn(),
  recordOfflineDuePayment: jest.fn(),
}));

jest.mock('../../../services/offline/collections', () => ({
  createOfflineCollection: jest.fn(),
}));

import {
  createSale,
  initUpiPayment,
  confirmUpiPaymentManual,
  recordCashPayment,
  recordDuePayment,
  cancelSale,
  initCollectionUpi,
  confirmCollectionUpiManual,
  recordCollectionCash,
  recordCollectionDue,
  createSplitPayment,
  confirmSplitCash,
  getSplitPaymentStatus,
  verifyUtr,
  getUtrVerificationStatus,
} from '../../../services/api/posApi';
import type { SaleItemInput, SaleCreateResponse, DiscountInput } from '../../../services/api/posApi';

describe('posApi', () => {
  describe('exports', () => {
    it('exports createSale', () => expect(typeof createSale).toBe('function'));
    it('exports initUpiPayment', () => expect(typeof initUpiPayment).toBe('function'));
    it('exports confirmUpiPaymentManual', () => expect(typeof confirmUpiPaymentManual).toBe('function'));
    it('exports recordCashPayment', () => expect(typeof recordCashPayment).toBe('function'));
    it('exports recordDuePayment', () => expect(typeof recordDuePayment).toBe('function'));
    it('exports cancelSale', () => expect(typeof cancelSale).toBe('function'));
    it('exports initCollectionUpi', () => expect(typeof initCollectionUpi).toBe('function'));
    it('exports confirmCollectionUpiManual', () => expect(typeof confirmCollectionUpiManual).toBe('function'));
    it('exports recordCollectionCash', () => expect(typeof recordCollectionCash).toBe('function'));
    it('exports recordCollectionDue', () => expect(typeof recordCollectionDue).toBe('function'));
    it('exports createSplitPayment', () => expect(typeof createSplitPayment).toBe('function'));
    it('exports confirmSplitCash', () => expect(typeof confirmSplitCash).toBe('function'));
    it('exports getSplitPaymentStatus', () => expect(typeof getSplitPaymentStatus).toBe('function'));
    it('exports verifyUtr', () => expect(typeof verifyUtr).toBe('function'));
    it('exports getUtrVerificationStatus', () => expect(typeof getUtrVerificationStatus).toBe('function'));
  });

  describe('types', () => {
    it('SaleItemInput has correct shape', () => {
      const item: SaleItemInput = {
        productId: 'p1',
        quantity: 2,
        priceMinor: 5000,
        barcode: '123',
        name: 'Test Item',
      };
      expect(item.productId).toBe('p1');
    });

    it('DiscountInput has correct shape', () => {
      const pctDiscount: DiscountInput = {
        type: 'percentage',
        value: 10,
        reason: 'Holiday offer',
      };
      expect(pctDiscount.type).toBe('percentage');

      const fixedDiscount: DiscountInput = {
        type: 'fixed',
        value: 500,
      };
      expect(fixedDiscount.type).toBe('fixed');
    });

    it('SaleCreateResponse has correct shape', () => {
      const response: SaleCreateResponse = {
        saleId: 'sale-1',
        billRef: 'BILL-001',
        totals: {
          subtotalMinor: 10000,
          discountMinor: 1000,
          totalMinor: 9000,
        },
      };
      expect(response.totals.subtotalMinor - response.totals.discountMinor).toBe(response.totals.totalMinor);
    });
  });
});
