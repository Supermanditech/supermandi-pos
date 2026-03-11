/**
 * Tests for services/api/orderApi helper functions
 * Covers: getStatusLabel, getStatusColor, canCancel, canReceive, getOrderProgress, formatOrderNumber
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
  getStatusLabel,
  getStatusColor,
  canCancel,
  canReceive,
  getOrderProgress,
  formatOrderNumber,
} from '../../../services/api/orderApi';

describe('orderApi helpers', () => {
  describe('getStatusLabel', () => {
    it('returns "Draft"', () => expect(getStatusLabel('draft')).toBe('Draft'));
    it('returns "Submitted"', () => expect(getStatusLabel('submitted')).toBe('Submitted'));
    it('returns "Confirmed"', () => expect(getStatusLabel('confirmed')).toBe('Confirmed'));
    it('returns "Shipped"', () => expect(getStatusLabel('shipped')).toBe('Shipped'));
    it('returns "Partially Received"', () => expect(getStatusLabel('partial_received')).toBe('Partially Received'));
    it('returns "Delivered"', () => expect(getStatusLabel('delivered')).toBe('Delivered'));
    it('returns "Cancelled"', () => expect(getStatusLabel('cancelled')).toBe('Cancelled'));
  });

  describe('getStatusColor', () => {
    it('returns gray for draft', () => expect(getStatusColor('draft')).toBe('#64748B'));
    it('returns yellow for submitted', () => expect(getStatusColor('submitted')).toBe('#F59E0B'));
    it('returns green for delivered', () => expect(getStatusColor('delivered')).toBe('#16A34A'));
    it('returns red for cancelled', () => expect(getStatusColor('cancelled')).toBe('#DC2626'));
  });

  describe('canCancel', () => {
    it('true for draft', () => expect(canCancel('draft')).toBe(true));
    it('true for submitted', () => expect(canCancel('submitted')).toBe(true));
    it('true for confirmed', () => expect(canCancel('confirmed')).toBe(true));
    it('false for shipped', () => expect(canCancel('shipped')).toBe(false));
    it('false for delivered', () => expect(canCancel('delivered')).toBe(false));
    it('false for cancelled', () => expect(canCancel('cancelled')).toBe(false));
  });

  describe('canReceive', () => {
    it('true for shipped', () => expect(canReceive('shipped')).toBe(true));
    it('true for partial_received', () => expect(canReceive('partial_received')).toBe(true));
    it('true for confirmed', () => expect(canReceive('confirmed')).toBe(true));
    it('false for draft', () => expect(canReceive('draft')).toBe(false));
    it('false for submitted', () => expect(canReceive('submitted')).toBe(false));
    it('false for cancelled', () => expect(canReceive('cancelled')).toBe(false));
  });

  describe('getOrderProgress', () => {
    it('0 for draft', () => expect(getOrderProgress('draft')).toBe(0));
    it('20 for submitted', () => expect(getOrderProgress('submitted')).toBe(20));
    it('40 for confirmed', () => expect(getOrderProgress('confirmed')).toBe(40));
    it('60 for shipped', () => expect(getOrderProgress('shipped')).toBe(60));
    it('80 for partial_received', () => expect(getOrderProgress('partial_received')).toBe(80));
    it('100 for delivered', () => expect(getOrderProgress('delivered')).toBe(100));
    it('0 for cancelled', () => expect(getOrderProgress('cancelled')).toBe(0));
  });

  describe('formatOrderNumber', () => {
    it('prepends #', () => expect(formatOrderNumber('PO-001')).toBe('#PO-001'));
    it('handles empty string', () => expect(formatOrderNumber('')).toBe('#'));
  });
});
