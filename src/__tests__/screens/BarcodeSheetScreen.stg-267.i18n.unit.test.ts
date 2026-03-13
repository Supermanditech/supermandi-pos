/**
 * STG-267: BarcodeSheetScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All barcodeSheet.* keys exist in en.json and hi.json
 * 2. BarcodeSheetScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'BarcodeSheetScreen.tsx'),
  'utf-8'
);

const EXPECTED_KEYS = [
  'emptyTitle',
  'emptyDescription',
  'addProducts',
  'loadError',
  'generatePrompt',
  'generatorTitle',
  'generatorSubtitle',
  'generateSheets',
  'printSettings',
  'tier1Sheet',
  'tier1Subtitle',
  'tier2Sheet',
  'tier2Subtitle',
  'filterByCategory',
  'customSelection',
  'selectedCount',
  'searchPlaceholder',
  'selectAll',
  'deselectAll',
  'noProductsMatch',
  'loadMore',
  'preview',
  'generatingPreview',
  'labelsSummary',
  'capacity',
  'unnamed',
  'prev',
  'next',
  'previousPage',
  'nextPage',
  'showingLabels',
  'actions',
  'preparing',
  'downloadPdf',
  'sharing',
  'sendViaWhatsApp',
  'downloadUnavailableTitle',
  'downloadUnavailableMessage',
  'downloadFailedTitle',
  'downloadFailedMessage',
  'shareUnavailableTitle',
  'shareUnavailableMessage',
  'shareFailedTitle',
  'shareFailedMessage',
  'limitReachedTitle',
  'limitReachedMessage',
  'paperSize',
  'labelSize',
  'labelsPerRow',
  'labelsPerRowValue',
  'saveSettings',
] as const;

describe('STG-267: BarcodeSheetScreen i18n', () => {
  describe('en.json has all barcodeSheet keys', () => {
    it.each(EXPECTED_KEYS)('barcodeSheet.%s exists in en.json', (key) => {
      expect(en.barcodeSheet).toBeDefined();
      expect(en.barcodeSheet[key]).toBeTruthy();
      expect(typeof en.barcodeSheet[key]).toBe('string');
    });
  });

  describe('hi.json has all barcodeSheet keys', () => {
    it.each(EXPECTED_KEYS)('barcodeSheet.%s exists in hi.json', (key) => {
      expect(hi.barcodeSheet).toBeDefined();
      expect(hi.barcodeSheet[key]).toBeTruthy();
      expect(typeof hi.barcodeSheet[key]).toBe('string');
    });
  });

  describe('en/hi key parity', () => {
    it('en and hi have the same barcodeSheet keys', () => {
      const enKeys = Object.keys(en.barcodeSheet).sort();
      const hiKeys = Object.keys(hi.barcodeSheet).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('BarcodeSheetScreen.tsx uses t() calls', () => {
    // Remove all whitespace for matching multi-line t() calls
    const normalizedSource = screenSource.replace(/\s+/g, '');

    it.each(EXPECTED_KEYS)(
      'uses t("barcodeSheet.%s") in source',
      (key) => {
        expect(normalizedSource).toContain(`t("barcodeSheet.${key}"`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded "Barcode Sheet Generator" as raw text', () => {
      expect(screenSource).not.toMatch(/>Barcode Sheet Generator</);
    });

    it('should not have hardcoded "Generate Sheets" as raw text', () => {
      expect(screenSource).not.toMatch(/>Generate Sheets</);
    });

    it('should not have hardcoded "Filter by Category" as raw text', () => {
      expect(screenSource).not.toMatch(/>Filter by Category</);
    });

    it('should not have hardcoded "Custom Selection" as raw text', () => {
      expect(screenSource).not.toMatch(/>Custom Selection</);
      // Allow the string only inside t() calls
      expect(screenSource).not.toMatch(/>\s*Custom Selection\s*</);
    });

    it('should not have hardcoded "Preview" section title as raw text', () => {
      expect(screenSource).not.toMatch(/>Preview</);
    });

    it('should not have hardcoded "Generating preview..." as raw text', () => {
      expect(screenSource).not.toMatch(/>Generating preview\.\.\.</);
    });

    it('should not have hardcoded "Actions" as raw text', () => {
      expect(screenSource).not.toMatch(/>Actions</);
    });

    it('should not have hardcoded "Download PDF" as raw text', () => {
      expect(screenSource).not.toMatch(/"Download PDF"/);
    });

    it('should not have hardcoded "Send via WhatsApp" as raw text', () => {
      expect(screenSource).not.toMatch(/"Send via WhatsApp"/);
    });

    it('should not have hardcoded Alert.alert titles', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("Download/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Share/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Limit/);
    });

    it('should not have hardcoded "Print Settings" as raw text', () => {
      expect(screenSource).not.toMatch(/>Print Settings</);
    });

    it('should not have hardcoded "Paper Size" as raw text', () => {
      expect(screenSource).not.toMatch(/>Paper Size</);
    });

    it('should not have hardcoded "Label Size" as raw text', () => {
      expect(screenSource).not.toMatch(/>Label Size</);
    });

    it('should not have hardcoded "Save Settings" as raw text', () => {
      expect(screenSource).not.toMatch(/>Save Settings</);
    });

    it('should import useTranslation', () => {
      expect(screenSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(screenSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});
