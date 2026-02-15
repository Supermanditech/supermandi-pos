/**
 * Tests for utils/featureFlags
 * Covers: isFeatureEnabled, FEATURE_GATED_SCREENS, getRouteFeatureRequirement, isRouteAccessible
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn(), getAllKeys: jest.fn() },
}));

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn().mockReturnValue([{ languageCode: 'en' }]),
}));

jest.mock('../../i18n', () => ({ language: 'en' }));

import { useSettingsStore } from '../../stores/settingsStore';
import {
  isFeatureEnabled,
  FEATURE_GATED_SCREENS,
  getRouteFeatureRequirement,
  isRouteAccessible,
} from '../../utils/featureFlags';

beforeEach(() => {
  useSettingsStore.setState({
    buyEnabled: true,
    reorderEnabled: true,
    categoryBrowsingEnabled: true,
    voiceEnabled: true,
  });
});

describe('featureFlags', () => {
  describe('isFeatureEnabled', () => {
    it('returns true for buy when enabled', () => {
      expect(isFeatureEnabled('buy')).toBe(true);
    });

    it('returns false for buy when disabled', () => {
      useSettingsStore.setState({ buyEnabled: false });
      expect(isFeatureEnabled('buy')).toBe(false);
    });

    it('returns true for reorder when enabled', () => {
      expect(isFeatureEnabled('reorder')).toBe(true);
    });

    it('returns false for reorder when disabled', () => {
      useSettingsStore.setState({ reorderEnabled: false });
      expect(isFeatureEnabled('reorder')).toBe(false);
    });

    it('credit is always disabled', () => {
      expect(isFeatureEnabled('credit')).toBe(false);
    });

    it('returns true for category_browsing when enabled', () => {
      expect(isFeatureEnabled('category_browsing')).toBe(true);
    });

    it('returns true for voice when enabled', () => {
      expect(isFeatureEnabled('voice')).toBe(true);
    });

    it('returns false for unknown key', () => {
      expect(isFeatureEnabled('unknown_key' as any)).toBe(false);
    });
  });

  describe('FEATURE_GATED_SCREENS', () => {
    it('buy gates correct screens', () => {
      expect(FEATURE_GATED_SCREENS.buy).toContain('OrderHistory');
      expect(FEATURE_GATED_SCREENS.buy).toContain('OrderDetail');
      expect(FEATURE_GATED_SCREENS.buy).toContain('GRN');
    });

    it('reorder gates correct screens', () => {
      expect(FEATURE_GATED_SCREENS.reorder).toContain('ReorderSettings');
      expect(FEATURE_GATED_SCREENS.reorder).toContain('ReorderPolicies');
    });

    it('credit has no gated screens', () => {
      expect(FEATURE_GATED_SCREENS.credit).toEqual([]);
    });

    it('qa_menu gates UiShowcase', () => {
      expect(FEATURE_GATED_SCREENS.qa_menu).toContain('UiShowcase');
    });
  });

  describe('getRouteFeatureRequirement', () => {
    it('returns buy for OrderHistory', () => {
      expect(getRouteFeatureRequirement('OrderHistory')).toBe('buy');
    });

    it('returns reorder for ReorderSettings', () => {
      expect(getRouteFeatureRequirement('ReorderSettings')).toBe('reorder');
    });

    it('returns null for ungated routes', () => {
      expect(getRouteFeatureRequirement('Home')).toBeNull();
      expect(getRouteFeatureRequirement('SellScreen')).toBeNull();
    });
  });

  describe('isRouteAccessible', () => {
    it('returns true for ungated routes', () => {
      expect(isRouteAccessible('Home')).toBe(true);
    });

    it('returns true for gated route when feature enabled', () => {
      expect(isRouteAccessible('OrderHistory')).toBe(true);
    });

    it('returns false for gated route when feature disabled', () => {
      useSettingsStore.setState({ buyEnabled: false });
      expect(isRouteAccessible('OrderHistory')).toBe(false);
    });
  });
});
