/**
 * Deep tests for POS dataConsistencyCheck service
 * Covers: validateStockDeduction, logConsistencyWarning, formatConsistencyReport
 */

// Mock transitive deps (deviceSession → AsyncStorage + SecureStore)
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(),
}));
jest.mock('../../services/api/apiClient', () => ({
  apiClient: { get: jest.fn() },
}));

import {
  validateStockDeduction,
  logConsistencyWarning,
  formatConsistencyReport,
  type ConsistencyCheckResult,
  type ConsistencyIssue,
} from '../../services/dataConsistencyCheck';

describe('dataConsistencyCheck', () => {
  describe('validateStockDeduction', () => {
    it('allows deduction within stock', () => {
      const result = validateStockDeduction(10, 5);
      expect(result.valid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('allows deducting exactly all stock', () => {
      const result = validateStockDeduction(10, 10);
      expect(result.valid).toBe(true);
    });

    it('rejects deduction exceeding stock', () => {
      const result = validateStockDeduction(5, 10);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Cannot deduct 10');
      expect(result.message).toContain('Only 5 in stock');
    });

    it('allows zero deduction', () => {
      const result = validateStockDeduction(5, 0);
      expect(result.valid).toBe(true);
    });
  });

  describe('logConsistencyWarning', () => {
    it('does nothing for empty issues', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      logConsistencyWarning([]);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('logs warnings for issues', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      const issues: ConsistencyIssue[] = [
        { productId: 'p1', stockBalance: 10, ledgerSum: 8, difference: 2 },
      ];
      logConsistencyWarning(issues);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('formatConsistencyReport', () => {
    it('formats consistent result', () => {
      const result: ConsistencyCheckResult = {
        isConsistent: true,
        totalProducts: 50,
        checkedProducts: 50,
        inconsistencies: [],
        checkedAt: '2025-06-15T10:00:00Z',
      };

      const report = formatConsistencyReport(result);
      expect(report).toContain('Data consistent');
      expect(report).toContain('50 products checked');
    });

    it('formats inconsistent result with issues', () => {
      const result: ConsistencyCheckResult = {
        isConsistent: false,
        totalProducts: 50,
        checkedProducts: 3,
        inconsistencies: [
          { productId: 'abcdefgh-1234-5678-9012', stockBalance: 10, ledgerSum: 8, difference: 2 },
          { productId: 'xxxxxxxx-1234-5678-9012', stockBalance: 5, ledgerSum: 3, difference: 2 },
        ],
        checkedAt: '2025-06-15T10:00:00Z',
      };

      const report = formatConsistencyReport(result);
      expect(report).toContain('DATA INCONSISTENCY DETECTED');
      expect(report).toContain('2 issues');
    });

    it('truncates to 5 issues with "and X more"', () => {
      const issues: ConsistencyIssue[] = Array.from({ length: 8 }, (_, i) => ({
        productId: `product-${i}`,
        stockBalance: 10,
        ledgerSum: 5,
        difference: 5,
      }));

      const result: ConsistencyCheckResult = {
        isConsistent: false,
        totalProducts: 50,
        checkedProducts: 8,
        inconsistencies: issues,
        checkedAt: '2025-06-15T10:00:00Z',
      };

      const report = formatConsistencyReport(result);
      expect(report).toContain('and 3 more');
    });
  });
});
