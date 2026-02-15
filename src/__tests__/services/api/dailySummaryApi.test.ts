/**
 * Tests for services/api/dailySummaryApi
 * Covers: getDailySummary export, PaymentBreakdown type, DailySummary type
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

import { getDailySummary } from '../../../services/api/dailySummaryApi';
import type { PaymentBreakdown, DailySummary, TopSellingItem } from '../../../services/api/dailySummaryApi';

describe('dailySummaryApi', () => {
  it('exports getDailySummary function', () => {
    expect(typeof getDailySummary).toBe('function');
  });

  it('DailySummary type has correct shape', () => {
    const summary: DailySummary = {
      date: '2024-01-15',
      totalSales: 50000,
      totalBills: 25,
      averageBillValue: 2000,
      paymentBreakdown: { cash: 30000, upi: 15000, card: 5000, credit: 0 },
      itemsSold: 100,
      topSellingItems: [],
    };
    expect(summary.date).toBe('2024-01-15');
    expect(summary.totalBills).toBe(25);
  });

  it('PaymentBreakdown type has correct shape', () => {
    const breakdown: PaymentBreakdown = {
      cash: 1000,
      upi: 2000,
      card: 500,
      credit: 0,
    };
    expect(breakdown.cash + breakdown.upi + breakdown.card + breakdown.credit).toBe(3500);
  });

  it('TopSellingItem type has correct shape', () => {
    const item: TopSellingItem = {
      productId: 'p1',
      productName: 'Tomato',
      quantitySold: 50,
      totalAmount: 5000,
    };
    expect(item.productName).toBe('Tomato');
  });
});
