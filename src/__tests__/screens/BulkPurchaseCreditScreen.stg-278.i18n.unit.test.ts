/**
 * STG-278: BulkPurchaseCreditScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All bulkCredit.* keys exist in en.json and hi.json
 * 2. BulkPurchaseCreditScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component
 * 4. useTranslation is imported and used
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'BulkPurchaseCreditScreen.tsx'),
  'utf-8'
);

const EXPECTED_KEYS = [
  'title',
  'infoBanner',
  'maxAmount',
  'interestRate',
  'tenure',
  'emi',
  'applyNow',
  'applyForCredit',
  'apply',
  'submitApplicationConfirm',
  'applicationSubmitted',
  'applicationSubmittedStatus',
  'failedToLoad',
  'failedToSubmit',
  'noOffersTitle',
  'noOffersDescription',
] as const;

describe('STG-278: BulkPurchaseCreditScreen i18n', () => {
  describe('en.json has all bulkCredit keys', () => {
    it.each(EXPECTED_KEYS)('bulkCredit.%s exists in en.json', (key) => {
      expect(en.bulkCredit).toBeDefined();
      expect(en.bulkCredit[key]).toBeTruthy();
      expect(typeof en.bulkCredit[key]).toBe('string');
    });
  });

  describe('hi.json has all bulkCredit keys', () => {
    it.each(EXPECTED_KEYS)('bulkCredit.%s exists in hi.json', (key) => {
      expect(hi.bulkCredit).toBeDefined();
      expect(hi.bulkCredit[key]).toBeTruthy();
      expect(typeof hi.bulkCredit[key]).toBe('string');
    });
  });

  describe('en/hi key parity', () => {
    it('en and hi have the same bulkCredit keys', () => {
      const enKeys = Object.keys(en.bulkCredit).sort();
      const hiKeys = Object.keys(hi.bulkCredit).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('BulkPurchaseCreditScreen.tsx uses t() calls', () => {
    const normalizedSource = screenSource.replace(/\s+/g, '');

    it.each(EXPECTED_KEYS)(
      'uses t("bulkCredit.%s") in source',
      (key) => {
        expect(normalizedSource).toContain(`t("bulkCredit.${key}"`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded "Bulk Purchase Credit" as raw text', () => {
      expect(screenSource).not.toMatch(/"Bulk Purchase Credit"/);
    });

    it('should not have hardcoded "Apply for Credit" as raw text', () => {
      expect(screenSource).not.toMatch(/"Apply for Credit"/);
    });

    it('should not have hardcoded "Apply Now" as raw text', () => {
      expect(screenSource).not.toMatch(/"Apply Now"/);
    });

    it('should not have hardcoded "Max Amount" as raw text', () => {
      expect(screenSource).not.toMatch(/>Max Amount</);
    });

    it('should not have hardcoded "Interest Rate" as raw text', () => {
      expect(screenSource).not.toMatch(/>Interest Rate</);
    });

    it('should not have hardcoded "Tenure" as raw text', () => {
      expect(screenSource).not.toMatch(/>Tenure</);
    });

    it('should not have hardcoded "EMI" as raw text', () => {
      expect(screenSource).not.toMatch(/>EMI</);
    });

    it('should not have hardcoded "No Credit Offers Available" as raw text', () => {
      expect(screenSource).not.toMatch(/"No Credit Offers Available"/);
    });

    it('should not have hardcoded "Application submitted" as raw text', () => {
      expect(screenSource).not.toMatch(/>Application submitted</);
    });

    it('should not have hardcoded "Failed to load" as raw text', () => {
      expect(screenSource).not.toMatch(/'Failed to load'/);
    });

    it('should not have hardcoded Alert.alert titles', () => {
      expect(screenSource).not.toMatch(/RNAlert\.alert\('Apply for Credit'/);
      expect(screenSource).not.toMatch(/RNAlert\.alert\('Success'/);
      expect(screenSource).not.toMatch(/RNAlert\.alert\('Error'/);
    });

    it('should not have hardcoded info banner text', () => {
      expect(screenSource).not.toMatch(/Apply for credit to finance bulk purchases/);
    });

    it('should not have hardcoded "Go back" as accessibility label', () => {
      expect(screenSource).not.toMatch(/accessibilityLabel="Go back"/);
    });

    it('should import useTranslation', () => {
      expect(screenSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(screenSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});
