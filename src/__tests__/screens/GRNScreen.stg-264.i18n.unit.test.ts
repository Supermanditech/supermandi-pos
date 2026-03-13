/**
 * STG-264: GRNScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All grn.* keys exist in en.json and hi.json
 * 2. GRNScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'GRNScreen.tsx'),
  'utf-8'
);

const EXPECTED_GRN_KEYS = [
  'title',
  'loadError',
  'offlineError',
  'orderNotFound',
  'notFoundTitle',
  'notFoundMessage',
  'receiveAll',
  'receiveAllMessage',
  'searchPlaceholder',
  'done',
  'bulk',
  'all',
  'selectAllPending',
  'deselectAll',
  'selectedCount',
  'notesPlaceholder',
  'setReceiveQty',
  'items',
  'quantity',
  'receiveButton',
  'enterQuantities',
  'successTitle',
  'receivedMessage',
  'generateLabels',
  'skip',
  'generateLabelsPrompt',
  'excessWarning',
  'excessWarningMessage',
  'continueAnyway',
  'confirmReceive',
  'confirmReceiveMessage',
  'receive',
  'offline',
  'receiveFailedOffline',
  'receiveFailed',
  'autoReorder',
  'loadingOrder',
] as const;

const EXPECTED_COMMON_KEYS = [
  'retry',
  'cancel',
  'yes',
  'error',
  'ok',
  'clear',
] as const;

describe('STG-264: GRNScreen i18n', () => {
  describe('en.json has all grn keys', () => {
    it.each(EXPECTED_GRN_KEYS)('grn.%s exists in en.json', (key) => {
      expect(en.grn).toBeDefined();
      expect(en.grn[key]).toBeTruthy();
      expect(typeof en.grn[key]).toBe('string');
    });
  });

  describe('hi.json has all grn keys', () => {
    it.each(EXPECTED_GRN_KEYS)('grn.%s exists in hi.json', (key) => {
      expect(hi.grn).toBeDefined();
      expect(hi.grn[key]).toBeTruthy();
      expect(typeof hi.grn[key]).toBe('string');
    });
  });

  describe('en.json has all common keys used by GRN', () => {
    it.each(EXPECTED_COMMON_KEYS)('common.%s exists in en.json', (key) => {
      expect(en.common).toBeDefined();
      expect(en.common[key]).toBeTruthy();
    });
  });

  describe('hi.json has all common keys used by GRN', () => {
    it.each(EXPECTED_COMMON_KEYS)('common.%s exists in hi.json', (key) => {
      expect(hi.common).toBeDefined();
      expect(hi.common[key]).toBeTruthy();
    });
  });

  describe('en/hi key parity for grn namespace', () => {
    it('en and hi have the same grn keys', () => {
      const enKeys = Object.keys(en.grn).sort();
      const hiKeys = Object.keys(hi.grn).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('GRNScreen.tsx uses t() calls for grn keys', () => {
    it.each(EXPECTED_GRN_KEYS)(
      'uses t("grn.%s") in source',
      (key) => {
        expect(screenSource).toContain(`t("grn.${key}"`);
      }
    );
  });

  describe('GRNScreen.tsx uses t() calls for common keys', () => {
    it.each(EXPECTED_COMMON_KEYS)(
      'uses t("common.%s") in source',
      (key) => {
        expect(screenSource).toContain(`t("common.${key}"`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded "Receive Goods" as a raw string', () => {
      expect(screenSource).not.toMatch(/>Receive Goods</);
    });

    it('should not have hardcoded "Loading order..." text', () => {
      expect(screenSource).not.toMatch(/>Loading order\.\.\.</);
    });

    it('should not have hardcoded "Order not found" text', () => {
      expect(screenSource).not.toMatch(/"Order not found"/);
    });

    it('should not have hardcoded "Retry" text', () => {
      expect(screenSource).not.toMatch(/>Retry</);
    });

    it('should not have hardcoded Alert.alert titles', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("Error"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Success"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Not Found"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Receive All"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Confirm Receive"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Excess Receipt Warning"/);
    });

    it('should not have hardcoded button texts in Alerts', () => {
      expect(screenSource).not.toMatch(/text: "Cancel"/);
      expect(screenSource).not.toMatch(/text: "Yes"/);
      expect(screenSource).not.toMatch(/text: "OK"/);
      expect(screenSource).not.toMatch(/text: "Receive"/);
      expect(screenSource).not.toMatch(/text: "Continue Anyway"/);
      expect(screenSource).not.toMatch(/text: "Generate Labels"/);
      expect(screenSource).not.toMatch(/text: "Skip"/);
    });

    it('should not have hardcoded placeholder strings', () => {
      expect(screenSource).not.toMatch(/placeholder="Scan barcode/);
      expect(screenSource).not.toMatch(/placeholder="Add notes/);
    });

    it('should not have hardcoded summary labels', () => {
      expect(screenSource).not.toMatch(/>Items</);
      expect(screenSource).not.toMatch(/>Quantity</);
    });

    it('should not have hardcoded "Auto Reorder" text', () => {
      expect(screenSource).not.toMatch(/"Auto Reorder"/);
    });

    it('should import useTranslation', () => {
      expect(screenSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(screenSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});
