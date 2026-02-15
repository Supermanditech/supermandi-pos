/**
 * Tests for services/api/staffApi
 * Covers: staffLogin export, StaffLoginResponse type
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

import { staffLogin } from '../../../services/api/staffApi';
import type { StaffLoginResponse } from '../../../services/api/staffApi';

describe('staffApi', () => {
  it('exports staffLogin function', () => {
    expect(typeof staffLogin).toBe('function');
  });

  it('StaffLoginResponse type has correct shape', () => {
    const response: StaffLoginResponse = {
      staffId: 'staff-1',
      name: 'John Doe',
      role: 'CASHIER',
    };
    expect(response.staffId).toBe('staff-1');
    expect(response.role).toBe('CASHIER');

    const manager: StaffLoginResponse = {
      staffId: 'staff-2',
      name: 'Jane Admin',
      role: 'MANAGER',
    };
    expect(manager.role).toBe('MANAGER');

    const stockMgr: StaffLoginResponse = {
      staffId: 'staff-3',
      name: 'Bob Stock',
      role: 'STOCK_MANAGER',
    };
    expect(stockMgr.role).toBe('STOCK_MANAGER');
  });
});
