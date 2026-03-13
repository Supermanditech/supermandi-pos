/**
 * STG-257: PaymentSetupScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All paymentSetup.* keys exist in en.json and hi.json
 * 2. PaymentSetupScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component JSX
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'PaymentSetupScreen.tsx'),
  'utf-8'
);

const EXPECTED_KEYS = [
  'title',
  'subtitle',
  'offlineBanner',
  'upiLabel',
  'upiPlaceholder',
  'upiAccessibility',
  'bankAccountLabel',
  'bankAccountPlaceholder',
  'bankAccountAccessibility',
  'ifscLabel',
  'ifscPlaceholder',
  'ifscAccessibility',
  'saveButton',
  'savingAccessibility',
  'saveAccessibility',
  'skipButton',
  'skipAccessibility',
  'skipHint',
  'validationUpiRequired',
  'validationUpiInvalid',
  'validationBankAccount',
  'validationIfsc',
  'noInternetTitle',
  'noInternetMessage',
  'sessionExpiredTitle',
  'sessionExpiredMessage',
  'errorTitle',
  'saveFailed',
  'networkError',
] as const;

describe('STG-257: PaymentSetupScreen i18n', () => {
  describe('en.json has all paymentSetup keys', () => {
    it.each(EXPECTED_KEYS)('paymentSetup.%s exists in en.json', (key) => {
      expect(en.paymentSetup).toBeDefined();
      expect(en.paymentSetup[key]).toBeTruthy();
      expect(typeof en.paymentSetup[key]).toBe('string');
    });
  });

  describe('hi.json has all paymentSetup keys', () => {
    it.each(EXPECTED_KEYS)('paymentSetup.%s exists in hi.json', (key) => {
      expect(hi.paymentSetup).toBeDefined();
      expect(hi.paymentSetup[key]).toBeTruthy();
      expect(typeof hi.paymentSetup[key]).toBe('string');
    });
  });

  describe('en/hi key parity', () => {
    it('en and hi have the same paymentSetup keys', () => {
      const enKeys = Object.keys(en.paymentSetup).sort();
      const hiKeys = Object.keys(hi.paymentSetup).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('PaymentSetupScreen.tsx uses useTranslation', () => {
    it('imports useTranslation from react-i18next', () => {
      expect(screenSource).toContain('import { useTranslation } from "react-i18next"');
    });

    it('calls useTranslation() in the component', () => {
      expect(screenSource).toContain('const { t } = useTranslation()');
    });
  });

  describe('PaymentSetupScreen.tsx uses t() calls', () => {
    it.each(EXPECTED_KEYS)(
      'uses t("paymentSetup.%s") in source',
      (key) => {
        expect(screenSource).toContain(`t("paymentSetup.${key}")`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded "Set Up Payments" title', () => {
      expect(screenSource).not.toMatch(/>Set Up Payments</);
    });

    it('should not have hardcoded "Save & Continue" button text', () => {
      expect(screenSource).not.toMatch(/>Save & Continue</);
    });

    it('should not have hardcoded "Skip for Now" button text', () => {
      expect(screenSource).not.toMatch(/>Skip for Now</);
    });

    it('should not have hardcoded alert titles as string literals', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("No Internet"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Session Expired"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Error"/);
    });

    it('should not have hardcoded validation messages as string literals', () => {
      expect(screenSource).not.toMatch(/errs\.\w+ = "UPI ID is required"/);
      expect(screenSource).not.toMatch(/errs\.\w+ = "Bank account must be/);
      expect(screenSource).not.toMatch(/errs\.\w+ = "Invalid IFSC/);
    });

    it('should not have hardcoded placeholder strings', () => {
      expect(screenSource).not.toMatch(/placeholder="yourname@upi"/);
      expect(screenSource).not.toMatch(/placeholder="123456789012"/);
      expect(screenSource).not.toMatch(/placeholder="SBIN0001234"/);
    });

    it('should not have hardcoded accessibilityLabel strings', () => {
      expect(screenSource).not.toMatch(/accessibilityLabel="UPI ID"/);
      expect(screenSource).not.toMatch(/accessibilityLabel="Bank account number"/);
      expect(screenSource).not.toMatch(/accessibilityLabel="IFSC code"/);
      expect(screenSource).not.toMatch(/accessibilityLabel="Skip payment setup for now"/);
    });
  });
});
