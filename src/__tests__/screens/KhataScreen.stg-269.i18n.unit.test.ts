/**
 * STG-269: KhataScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All khata.* keys used in KhataScreen exist in en.json and hi.json
 * 2. KhataScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component
 * 4. useTranslation is imported and used
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'KhataScreen.tsx'),
  'utf-8'
);

// Keys added/used by STG-269 in KhataScreen
const EXPECTED_KEYS = [
  'title',
  'searchPlaceholder',
  'addCredit',
  'recordPayment',
  'loadingKhata',
  'emptyTitle',
  'emptyDescription',
  'errorTitle',
  'invalidPhone',
  'invalidPhoneMessage',
  'invalidAmount',
  'invalidAmountMessage',
  'successTitle',
  'creditEntryAdded',
  'paymentRecorded',
  'creditGiven',
  'owes',
  'advance',
  'settled',
  'last',
  'viaMethod',
  'bal',
  'customerLedger',
  'customer',
  'currentBalance',
  'noEntries',
  'noEntriesDescription',
  'customerPhoneLabel',
  'phonePlaceholder',
  'customerNameLabel',
  'namePlaceholder',
  'amountLabel',
  'descriptionLabel',
  'descriptionPlaceholder',
  'addCreditEntry',
  'paymentMethodLabel',
  'cash',
  'upi',
] as const;

describe('STG-269: KhataScreen i18n', () => {
  describe('en.json has all khata keys', () => {
    it.each(EXPECTED_KEYS)('khata.%s exists in en.json', (key) => {
      expect(en.khata).toBeDefined();
      expect(en.khata[key]).toBeTruthy();
      expect(typeof en.khata[key]).toBe('string');
    });
  });

  describe('hi.json has all khata keys', () => {
    it.each(EXPECTED_KEYS)('khata.%s exists in hi.json', (key) => {
      expect(hi.khata).toBeDefined();
      expect(hi.khata[key]).toBeTruthy();
      expect(typeof hi.khata[key]).toBe('string');
    });
  });

  describe('en/hi key parity', () => {
    it('en and hi have the same khata keys', () => {
      const enKeys = Object.keys(en.khata).sort();
      const hiKeys = Object.keys(hi.khata).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('KhataScreen.tsx uses t() calls', () => {
    const normalizedSource = screenSource.replace(/\s+/g, '');

    it.each(EXPECTED_KEYS)(
      'uses t("khata.%s") in source',
      (key) => {
        expect(normalizedSource).toContain(`t("khata.${key}"`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded Alert.alert titles', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("Invalid Phone"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Invalid Amount"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Success"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Error"/);
    });

    it('should not have hardcoded "Add Credit" as raw text', () => {
      expect(screenSource).not.toMatch(/>Add Credit</);
    });

    it('should not have hardcoded "Record Payment" as raw text', () => {
      expect(screenSource).not.toMatch(/>Record Payment</);
    });

    it('should not have hardcoded "Add Credit Entry" as raw text', () => {
      expect(screenSource).not.toMatch(/>Add Credit Entry</);
    });

    it('should not have hardcoded "Loading khata..." as raw text', () => {
      expect(screenSource).not.toMatch(/>Loading khata\.\.\.</);
    });

    it('should not have hardcoded "Khata (Credit Book)" as raw text', () => {
      expect(screenSource).not.toMatch(/title="Khata \(Credit Book\)"/);
    });

    it('should not have hardcoded "Customer Phone *" as raw text', () => {
      expect(screenSource).not.toMatch(/>Customer Phone \*</);
    });

    it('should not have hardcoded "Amount" label as raw text', () => {
      expect(screenSource).not.toMatch(/>Amount \(₹\) \*</);
    });

    it('should not have hardcoded "Description" label as raw text', () => {
      expect(screenSource).not.toMatch(/>Description</);
    });

    it('should not have hardcoded "Payment Method *" as raw text', () => {
      expect(screenSource).not.toMatch(/>Payment Method \*</);
    });

    it('should not have hardcoded "Cash" as raw text', () => {
      expect(screenSource).not.toMatch(/>\s*Cash\s*</);
    });

    it('should not have hardcoded "UPI" as raw text in payment method', () => {
      expect(screenSource).not.toMatch(/>\s*UPI\s*</);
    });

    it('should not have hardcoded "Current Balance" as raw text', () => {
      expect(screenSource).not.toMatch(/>Current Balance</);
    });

    it('should not have hardcoded "No entries" as raw text', () => {
      expect(screenSource).not.toMatch(/title="No entries"/);
    });

    it('should not have hardcoded "No credit entries yet" as raw text', () => {
      expect(screenSource).not.toMatch(/title="No credit entries yet"/);
    });

    it('should not have hardcoded search placeholder', () => {
      expect(screenSource).not.toMatch(/placeholder="Search by name or phone\.\.\."/);
    });

    it('should import useTranslation', () => {
      expect(screenSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(screenSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});
