/**
 * Tests for services/api/bnplApi helper functions
 * Covers: formatDueDate, getBnplStatusColor, getBnplStatusLabel, isSupplierBnplEligible
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
  formatDueDate,
  getBnplStatusColor,
  getBnplStatusLabel,
  isSupplierBnplEligible,
} from '../../../services/api/bnplApi';

describe('bnplApi helpers', () => {
  describe('formatDueDate', () => {
    it('formats date correctly', () => {
      const result = formatDueDate('2024-03-15T00:00:00Z');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('getBnplStatusColor', () => {
    it('returns red for overdue', () => {
      expect(getBnplStatusColor('overdue', false)).toBe('#DC2626');
    });

    it('returns red for defaulted', () => {
      expect(getBnplStatusColor('defaulted', false)).toBe('#DC2626');
    });

    it('returns red when isOverdue flag true', () => {
      expect(getBnplStatusColor('active', true)).toBe('#DC2626');
    });

    it('returns green for paid', () => {
      expect(getBnplStatusColor('paid', false)).toBe('#16A34A');
    });

    it('returns amber for active', () => {
      expect(getBnplStatusColor('active', false)).toBe('#F59E0B');
    });

    it('returns amber for partial', () => {
      expect(getBnplStatusColor('partial', false)).toBe('#F59E0B');
    });
  });

  describe('getBnplStatusLabel', () => {
    it('returns "Paid" for paid', () => {
      expect(getBnplStatusLabel('paid', 0)).toBe('Paid');
    });

    it('returns "Defaulted" for defaulted', () => {
      expect(getBnplStatusLabel('defaulted', -5)).toBe('Defaulted');
    });

    it('returns "Overdue" for overdue status', () => {
      expect(getBnplStatusLabel('overdue', -1)).toBe('Overdue');
    });

    it('returns "Overdue" for negative days remaining', () => {
      expect(getBnplStatusLabel('active', -1)).toBe('Overdue');
    });

    it('returns "Due Today" for 0 days', () => {
      expect(getBnplStatusLabel('active', 0)).toBe('Due Today');
    });

    it('returns "Due Tomorrow" for 1 day', () => {
      expect(getBnplStatusLabel('active', 1)).toBe('Due Tomorrow');
    });

    it('returns "X days left" for multiple days', () => {
      expect(getBnplStatusLabel('active', 5)).toBe('5 days left');
    });
  });

  describe('isSupplierBnplEligible', () => {
    it('returns true when BNPL enabled and credit sufficient', () => {
      expect(isSupplierBnplEligible(true, 10000, 5000)).toBe(true);
    });

    it('returns false when BNPL disabled', () => {
      expect(isSupplierBnplEligible(false, 10000, 5000)).toBe(false);
    });

    it('returns false when credit insufficient', () => {
      expect(isSupplierBnplEligible(true, 5000, 10000)).toBe(false);
    });

    it('returns true when credit exactly equals purchase', () => {
      expect(isSupplierBnplEligible(true, 5000, 5000)).toBe(true);
    });
  });
});
