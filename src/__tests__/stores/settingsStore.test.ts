/**
 * Deep tests for POS settingsStore
 * Covers: all feature flags, printer settings, language, store info,
 * default values, setter functions, value constraints
 */

// Must mock AsyncStorage before importing store (zustand persist)
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getAllKeys: jest.fn(),
  },
}));

import { useSettingsStore } from '../../stores/settingsStore';

// Mock i18n
jest.mock('../../i18n', () => ({
  setLanguage: jest.fn(),
}));

const store = useSettingsStore;

beforeEach(() => {
  // Reset to defaults
  store.setState({
    buyEnabled: true,
    reorderEnabled: true,
    categoryBrowsingEnabled: true,
    voiceEnabled: true,
    bnplEnabled: false,
    bnplCreditLimit: 5000000,
    bnplAvailableCredit: 5000000,
    creditEnabled: false,
    language: 'en',
    storeName: null,
    storeCode: null,
    printerPaperWidth: 58,
    printerAutoPrint: false,
    printerCopies: 1,
  });
});

describe('settingsStore', () => {
  // ════════════════════════════════════════════════════════════════════
  // Default values
  // ════════════════════════════════════════════════════════════════════

  describe('default values', () => {
    it('has correct initial state', () => {
      const state = store.getState();
      expect(state.buyEnabled).toBe(true);
      expect(state.reorderEnabled).toBe(true);
      expect(state.categoryBrowsingEnabled).toBe(true);
      expect(state.voiceEnabled).toBe(true);
      expect(state.bnplEnabled).toBe(false);
      expect(state.bnplCreditLimit).toBe(5000000);
      expect(state.bnplAvailableCredit).toBe(5000000);
      expect(state.creditEnabled).toBe(false);
      expect(state.language).toBe('en');
      expect(state.storeName).toBeNull();
      expect(state.storeCode).toBeNull();
      expect(state.printerPaperWidth).toBe(58);
      expect(state.printerAutoPrint).toBe(false);
      expect(state.printerCopies).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Feature flag setters
  // ════════════════════════════════════════════════════════════════════

  describe('feature flag setters', () => {
    it('setBuyEnabled toggles buy feature', () => {
      store.getState().setBuyEnabled(false);
      expect(store.getState().buyEnabled).toBe(false);
      store.getState().setBuyEnabled(true);
      expect(store.getState().buyEnabled).toBe(true);
    });

    it('setReorderEnabled toggles reorder feature', () => {
      store.getState().setReorderEnabled(false);
      expect(store.getState().reorderEnabled).toBe(false);
    });

    it('setCategoryBrowsingEnabled toggles category browsing', () => {
      store.getState().setCategoryBrowsingEnabled(false);
      expect(store.getState().categoryBrowsingEnabled).toBe(false);
    });

    it('setVoiceEnabled toggles voice assistant', () => {
      store.getState().setVoiceEnabled(false);
      expect(store.getState().voiceEnabled).toBe(false);
    });

    it('setBnplEnabled toggles BNPL', () => {
      store.getState().setBnplEnabled(true);
      expect(store.getState().bnplEnabled).toBe(true);
    });

    it('setCreditEnabled toggles credit feature', () => {
      store.getState().setCreditEnabled(true);
      expect(store.getState().creditEnabled).toBe(true);
    });

    it('coerces truthy values to boolean', () => {
      store.getState().setBuyEnabled(1 as unknown as boolean);
      expect(store.getState().buyEnabled).toBe(true);
      store.getState().setBuyEnabled(0 as unknown as boolean);
      expect(store.getState().buyEnabled).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // BNPL settings
  // ════════════════════════════════════════════════════════════════════

  describe('BNPL settings', () => {
    it('setBnplCreditLimit updates credit limit', () => {
      store.getState().setBnplCreditLimit(10000000);
      expect(store.getState().bnplCreditLimit).toBe(10000000);
    });

    it('setBnplAvailableCredit updates available credit', () => {
      store.getState().setBnplAvailableCredit(3000000);
      expect(store.getState().bnplAvailableCredit).toBe(3000000);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Printer settings
  // ════════════════════════════════════════════════════════════════════

  describe('printer settings', () => {
    it('setPrinterPaperWidth accepts 58mm', () => {
      store.getState().setPrinterPaperWidth(58);
      expect(store.getState().printerPaperWidth).toBe(58);
    });

    it('setPrinterPaperWidth accepts 80mm', () => {
      store.getState().setPrinterPaperWidth(80);
      expect(store.getState().printerPaperWidth).toBe(80);
    });

    it('setPrinterAutoPrint toggles auto-print', () => {
      store.getState().setPrinterAutoPrint(true);
      expect(store.getState().printerAutoPrint).toBe(true);
    });

    it('setPrinterCopies sets copies within range', () => {
      store.getState().setPrinterCopies(2);
      expect(store.getState().printerCopies).toBe(2);
    });

    it('setPrinterCopies clamps to minimum 1', () => {
      store.getState().setPrinterCopies(0);
      expect(store.getState().printerCopies).toBe(1);
    });

    it('setPrinterCopies clamps to maximum 3', () => {
      store.getState().setPrinterCopies(5);
      expect(store.getState().printerCopies).toBe(3);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Language
  // ════════════════════════════════════════════════════════════════════

  describe('language', () => {
    it('setLanguage updates language', () => {
      store.getState().setLanguage('hi');
      expect(store.getState().language).toBe('hi');
    });

    it('setLanguage calls i18n setLanguage', () => {
      const { setLanguage } = require('../../i18n');
      store.getState().setLanguage('hi');
      expect(setLanguage).toHaveBeenCalledWith('hi');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Store info
  // ════════════════════════════════════════════════════════════════════

  describe('store info', () => {
    it('setStoreName sets store name', () => {
      store.getState().setStoreName('Test Mart');
      expect(store.getState().storeName).toBe('Test Mart');
    });

    it('setStoreName accepts null', () => {
      store.getState().setStoreName('Test');
      store.getState().setStoreName(null);
      expect(store.getState().storeName).toBeNull();
    });

    it('setStoreCode sets store code', () => {
      store.getState().setStoreCode('SM-001');
      expect(store.getState().storeCode).toBe('SM-001');
    });

    it('setStoreCode accepts null', () => {
      store.getState().setStoreCode('SM-001');
      store.getState().setStoreCode(null);
      expect(store.getState().storeCode).toBeNull();
    });
  });
});
