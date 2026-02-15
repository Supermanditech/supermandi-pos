/**
 * Tests for services/api/sellSearchApi helper functions
 * Covers: flattenSearchGroups, getLocalizedGroupName, getLocalizedBrand
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
  flattenSearchGroups,
  getLocalizedGroupName,
  getLocalizedBrand,
  type StoreSearchGroup,
  type StoreSkuMatch,
} from '../../../services/api/sellSearchApi';

const mockMatch = (overrides: Partial<StoreSkuMatch> = {}): StoreSkuMatch => ({
  productId: 'p1',
  storeProductId: 'sp1',
  sku: 'SKU001',
  barcode: '123',
  sellPrice: 100,
  currentStock: 10,
  ...overrides,
});

const mockGroup = (overrides: Partial<StoreSearchGroup> = {}): StoreSearchGroup => ({
  groupId: 'g1',
  displayName: 'Test Group',
  matches: [mockMatch()],
  ...overrides,
});

describe('sellSearchApi helpers', () => {
  describe('flattenSearchGroups', () => {
    it('flattens single group with single match', () => {
      const groups = [mockGroup()];
      const result = flattenSearchGroups(groups);
      expect(result).toHaveLength(1);
      expect(result[0].groupDisplayName).toBe('Test Group');
      expect(result[0].productId).toBe('p1');
    });

    it('flattens single group with multiple matches', () => {
      const groups = [
        mockGroup({
          matches: [
            mockMatch({ productId: 'p1' }),
            mockMatch({ productId: 'p2', storeProductId: 'sp2' }),
          ],
        }),
      ];
      const result = flattenSearchGroups(groups);
      expect(result).toHaveLength(2);
      expect(result[0].productId).toBe('p1');
      expect(result[1].productId).toBe('p2');
    });

    it('flattens multiple groups', () => {
      const groups = [
        mockGroup({ groupId: 'g1', displayName: 'Group A', brand: 'Brand A' }),
        mockGroup({
          groupId: 'g2',
          displayName: 'Group B',
          brand: 'Brand B',
          matches: [mockMatch({ productId: 'p2' })],
        }),
      ];
      const result = flattenSearchGroups(groups);
      expect(result).toHaveLength(2);
      expect(result[0].groupDisplayName).toBe('Group A');
      expect(result[0].brand).toBe('Brand A');
      expect(result[1].groupDisplayName).toBe('Group B');
      expect(result[1].brand).toBe('Brand B');
    });

    it('returns empty array for no groups', () => {
      expect(flattenSearchGroups([])).toEqual([]);
    });

    it('returns empty array for groups with no matches', () => {
      const groups = [mockGroup({ matches: [] })];
      expect(flattenSearchGroups(groups)).toEqual([]);
    });

    it('preserves all match properties', () => {
      const match = mockMatch({
        productId: 'p1',
        storeProductId: 'sp1',
        sku: 'SKU-X',
        barcode: '999',
        sellPrice: 250,
        currentStock: 42,
      });
      const groups = [mockGroup({ matches: [match] })];
      const result = flattenSearchGroups(groups);
      expect(result[0].productId).toBe('p1');
      expect(result[0].storeProductId).toBe('sp1');
      expect(result[0].sku).toBe('SKU-X');
      expect(result[0].barcode).toBe('999');
      expect(result[0].sellPrice).toBe(250);
      expect(result[0].currentStock).toBe(42);
    });
  });

  describe('getLocalizedGroupName', () => {
    beforeEach(() => {
      const i18n = require('../../../i18n');
      i18n.language = 'en';
    });

    it('returns English name by default', () => {
      const group = mockGroup({ displayName: 'Tomato', displayNameHi: 'टमाटर' });
      expect(getLocalizedGroupName(group)).toBe('Tomato');
    });

    it('returns Hindi name when locale is hi', () => {
      const i18n = require('../../../i18n');
      i18n.language = 'hi';
      const group = mockGroup({ displayName: 'Tomato', displayNameHi: 'टमाटर' });
      expect(getLocalizedGroupName(group)).toBe('टमाटर');
    });

    it('falls back to English when Hindi not available', () => {
      const i18n = require('../../../i18n');
      i18n.language = 'hi';
      const group = mockGroup({ displayName: 'Tomato' });
      expect(getLocalizedGroupName(group)).toBe('Tomato');
    });
  });

  describe('getLocalizedBrand', () => {
    beforeEach(() => {
      const i18n = require('../../../i18n');
      i18n.language = 'en';
    });

    it('returns English brand by default', () => {
      const group = mockGroup({ brand: 'Fresh Farm', brandHi: 'ताज़ा खेत' });
      expect(getLocalizedBrand(group)).toBe('Fresh Farm');
    });

    it('returns Hindi brand when locale is hi', () => {
      const i18n = require('../../../i18n');
      i18n.language = 'hi';
      const group = mockGroup({ brand: 'Fresh Farm', brandHi: 'ताज़ा खेत' });
      expect(getLocalizedBrand(group)).toBe('ताज़ा खेत');
    });

    it('falls back to English brand when Hindi not available', () => {
      const i18n = require('../../../i18n');
      i18n.language = 'hi';
      const group = mockGroup({ brand: 'Fresh Farm' });
      expect(getLocalizedBrand(group)).toBe('Fresh Farm');
    });

    it('returns undefined when no brand set', () => {
      const group = mockGroup();
      expect(getLocalizedBrand(group)).toBeUndefined();
    });
  });
});
