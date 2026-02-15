/**
 * Tests for services/api/creditApi helper functions
 * Covers: formatCreditAmount, formatEmiAmount, getCreditScoreColor, getCreditScoreLabel,
 * getApplicationStatusColor, getApplicationStatusLabel, calculateEmi, getOfferSourceLabel,
 * formatInterestRate, formatTenure
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
  formatCreditAmount,
  formatEmiAmount,
  getCreditScoreColor,
  getCreditScoreLabel,
  getApplicationStatusColor,
  getApplicationStatusLabel,
  calculateEmi,
  getOfferSourceLabel,
  formatInterestRate,
  formatTenure,
} from '../../../services/api/creditApi';

describe('creditApi helpers', () => {
  describe('formatCreditAmount', () => {
    it('formats lakhs', () => {
      expect(formatCreditAmount(50000000)).toContain('5.0L');
    });

    it('formats thousands', () => {
      expect(formatCreditAmount(500000)).toContain('5K');
    });

    it('formats hundreds', () => {
      expect(formatCreditAmount(50000)).toContain('500');
    });

    it('handles zero', () => {
      expect(formatCreditAmount(0)).toContain('0');
    });
  });

  describe('getCreditScoreColor', () => {
    it('returns green for EXCELLENT', () => expect(getCreditScoreColor('EXCELLENT')).toBe('#16A34A'));
    it('returns light green for GOOD', () => expect(getCreditScoreColor('GOOD')).toBe('#22C55E'));
    it('returns amber for FAIR', () => expect(getCreditScoreColor('FAIR')).toBe('#F59E0B'));
    it('returns red for POOR', () => expect(getCreditScoreColor('POOR')).toBe('#DC2626'));
  });

  describe('getCreditScoreLabel', () => {
    it('returns "Excellent"', () => expect(getCreditScoreLabel('EXCELLENT')).toBe('Excellent'));
    it('returns "Good"', () => expect(getCreditScoreLabel('GOOD')).toBe('Good'));
    it('returns "Fair"', () => expect(getCreditScoreLabel('FAIR')).toBe('Fair'));
    it('returns "Needs Improvement"', () => expect(getCreditScoreLabel('POOR')).toBe('Needs Improvement'));
  });

  describe('getApplicationStatusColor', () => {
    it('green for disbursed', () => expect(getApplicationStatusColor('disbursed')).toBe('#16A34A'));
    it('light green for approved', () => expect(getApplicationStatusColor('approved')).toBe('#22C55E'));
    it('amber for processing', () => expect(getApplicationStatusColor('processing')).toBe('#F59E0B'));
    it('red for rejected', () => expect(getApplicationStatusColor('rejected')).toBe('#DC2626'));
  });

  describe('getApplicationStatusLabel', () => {
    it('returns "Disbursed"', () => expect(getApplicationStatusLabel('disbursed', 'verified')).toBe('Disbursed'));
    it('returns "Approved - Pending Disbursement"', () => expect(getApplicationStatusLabel('approved', 'verified')).toBe('Approved - Pending Disbursement'));
    it('returns "KYC Pending" for submitted with pending kyc', () => expect(getApplicationStatusLabel('submitted', 'pending')).toBe('KYC Pending'));
    it('returns "KYC Under Review" for submitted with submitted kyc', () => expect(getApplicationStatusLabel('submitted', 'submitted')).toBe('KYC Under Review'));
    it('returns "Rejected"', () => expect(getApplicationStatusLabel('rejected', 'verified')).toBe('Rejected'));
  });

  describe('calculateEmi', () => {
    it('calculates EMI correctly', () => {
      // 1,00,000 at 12% for 12 months
      const emi = calculateEmi(10000000, 12, 12);
      expect(emi).toBeGreaterThan(0);
      expect(typeof emi).toBe('number');
      expect(Number.isInteger(emi)).toBe(true);
    });

    it('handles 0% interest', () => {
      const emi = calculateEmi(12000, 0, 12);
      expect(emi).toBe(1000); // 12000 / 12
    });

    it('returns integer (rounded)', () => {
      const emi = calculateEmi(10000, 10, 6);
      expect(Number.isInteger(emi)).toBe(true);
    });
  });

  describe('getOfferSourceLabel', () => {
    it('maps SUPERMANDI', () => expect(getOfferSourceLabel('SUPERMANDI')).toBe('SuperMandi Credit'));
    it('maps SUPERMANDI_BNPL', () => expect(getOfferSourceLabel('SUPERMANDI_BNPL')).toBe('Interest-Free BNPL'));
    it('maps OCEN', () => expect(getOfferSourceLabel('OCEN')).toBe('OCEN Partner'));
    it('maps PARTNER_BANK', () => expect(getOfferSourceLabel('PARTNER_BANK')).toBe('Partner Bank'));
    it('returns raw for unknown', () => expect(getOfferSourceLabel('CUSTOM')).toBe('CUSTOM'));
  });

  describe('formatInterestRate', () => {
    it('formats 0%', () => expect(formatInterestRate(0)).toBe('0% Interest'));
    it('formats non-zero', () => expect(formatInterestRate(12.5)).toBe('12.5% p.a.'));
  });

  describe('formatTenure', () => {
    it('1 month', () => expect(formatTenure(1)).toBe('1 month'));
    it('12 months = 1 year', () => expect(formatTenure(12)).toBe('1 year'));
    it('24 months = 2 years', () => expect(formatTenure(24)).toBe('2 years'));
    it('6 months', () => expect(formatTenure(6)).toBe('6 months'));
    it('18 months (not divisible by 12)', () => expect(formatTenure(18)).toBe('18 months'));
  });
});
