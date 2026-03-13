/**
 * STG-259: BillDetailScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All billDetail.* keys exist in en.json and hi.json
 * 2. BillDetailScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'BillDetailScreen.tsx'),
  'utf-8'
);

const EXPECTED_KEYS = [
  'title',
  'loading',
  'billNotFound',
  'loadFailed',
  'billRef',
  'status',
  'payment',
  'subtotal',
  'discount',
  'total',
  'print',
  'whatsapp',
  'share',
  'noBarcode',
  'qty',
  'each',
  'reprintTitle',
  'reprintMessage',
  'cancel',
  'printQueued',
  'printQueuedMessage',
  'printerErrorTitle',
  'printerOutOfPaper',
  'printerNotConnected',
  'printFailedTitle',
  'printFailedMessage',
  'shareUnavailableTitle',
  'shareUnavailableMessage',
  'shareFailedTitle',
  'shareFailedMessage',
  'whatsappNotFoundTitle',
  'whatsappNotFoundMessage',
  'whatsappFailedMessage',
] as const;

describe('STG-259: BillDetailScreen i18n', () => {
  describe('en.json has all billDetail keys', () => {
    it.each(EXPECTED_KEYS)('billDetail.%s exists in en.json', (key) => {
      expect(en.billDetail).toBeDefined();
      expect(en.billDetail[key]).toBeTruthy();
      expect(typeof en.billDetail[key]).toBe('string');
    });
  });

  describe('hi.json has all billDetail keys', () => {
    it.each(EXPECTED_KEYS)('billDetail.%s exists in hi.json', (key) => {
      expect(hi.billDetail).toBeDefined();
      expect(hi.billDetail[key]).toBeTruthy();
      expect(typeof hi.billDetail[key]).toBe('string');
    });
  });

  describe('en/hi key parity', () => {
    it('en and hi have the same billDetail keys', () => {
      const enKeys = Object.keys(en.billDetail).sort();
      const hiKeys = Object.keys(hi.billDetail).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('BillDetailScreen.tsx uses t() calls', () => {
    it.each(EXPECTED_KEYS)(
      'uses t("billDetail.%s") in source',
      (key) => {
        expect(screenSource).toContain(`t("billDetail.${key}")`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded "Bill Details" as a raw string prop', () => {
      expect(screenSource).not.toMatch(/title="Bill Details"/);
    });

    it('should not have hardcoded "Bill Ref" label', () => {
      expect(screenSource).not.toMatch(/>Bill Ref</);
    });

    it('should not have hardcoded "Loading..." text', () => {
      expect(screenSource).not.toMatch(/>Loading\.\.\.</);
    });

    it('should not have hardcoded "No barcode" text', () => {
      expect(screenSource).not.toMatch(/"No barcode"/);
    });

    it('should not have hardcoded Alert.alert titles', () => {
      // All Alert.alert calls should use t(), not raw strings
      expect(screenSource).not.toMatch(/Alert\.alert\("Share/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Print/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Reprint/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Printer/);
      expect(screenSource).not.toMatch(/Alert\.alert\("WhatsApp/);
    });

    it('should import useTranslation', () => {
      expect(screenSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(screenSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});
