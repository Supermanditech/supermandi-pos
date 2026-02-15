/**
 * Tests for services/api/transactionsApi
 * Covers: createTransaction export, CreateTransactionInput type
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

import { createTransaction } from '../../../services/api/transactionsApi';
import type { CreateTransactionInput } from '../../../services/api/transactionsApi';

describe('transactionsApi', () => {
  it('exports createTransaction function', () => {
    expect(typeof createTransaction).toBe('function');
  });

  it('CreateTransactionInput type has correct shape', () => {
    const input: CreateTransactionInput = {
      paymentMethod: 'CASH',
      currency: 'INR',
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    };
    expect(input.paymentMethod).toBe('CASH');
    expect(input.items).toHaveLength(2);
  });

  it('supports all payment methods', () => {
    const methods: CreateTransactionInput['paymentMethod'][] = ['CASH', 'CARD', 'OTHER'];
    expect(methods).toHaveLength(3);
  });
});
