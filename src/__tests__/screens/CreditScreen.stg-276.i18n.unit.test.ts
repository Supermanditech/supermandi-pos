/**
 * STG-276: CreditScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All credit.* keys used in CreditScreen exist in en.json and hi.json
 * 2. CreditScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component
 * 4. useTranslation is imported and used
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'CreditScreen.tsx'),
  'utf-8'
);

// All credit.* keys used in CreditScreen
const EXPECTED_KEYS = [
  'title',
  'loading',
  'errorTitle',
  'loadError',
  'creditScore',
  'eligible',
  'monthlyGmv',
  'transactions',
  'repaymentRate',
  'offers',
  'loans',
  'history',
  'tenure',
  'interest',
  'emi',
  'validUntil',
  'interestFree',
  'apply',
  'applicationPending',
  'noOffers',
  'noOffersDescription',
  'noLoans',
  'noLoansDescription',
  'noHistory',
  'noHistoryDescription',
  'active',
  'loanAmount',
  'monthlyEmi',
  'nextEmi',
  'remaining',
  'interestRate',
  'emis',
  'emisPaid',
  'applyForCredit',
  'approved',
  'maxAmount',
  'enterAmount',
  'invalidAmount',
  'continue',
  'applyError',
  'kycVerification',
  'kycDescription',
  'panNumber',
  'aadhaarLast4',
  'invalidPan',
  'invalidAadhaar',
  'verifyKyc',
  'kycError',
  'applicationApproved',
  'disbursementInfo',
  'done',
  'kycProcessing',
  'utilizationWarning',
  'perMonth',
  'perAnnum',
] as const;

describe('STG-276: CreditScreen i18n', () => {
  describe('en.json has all credit keys', () => {
    it.each(EXPECTED_KEYS)('credit.%s exists in en.json', (key) => {
      expect(en.credit).toBeDefined();
      expect(en.credit[key]).toBeTruthy();
      expect(typeof en.credit[key]).toBe('string');
    });
  });

  describe('hi.json has all credit keys', () => {
    it.each(EXPECTED_KEYS)('credit.%s exists in hi.json', (key) => {
      expect(hi.credit).toBeDefined();
      expect(hi.credit[key]).toBeTruthy();
      expect(typeof hi.credit[key]).toBe('string');
    });
  });

  describe('en/hi key parity', () => {
    it('en and hi have the same credit keys', () => {
      const enKeys = Object.keys(en.credit).sort();
      const hiKeys = Object.keys(hi.credit).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('CreditScreen.tsx uses t() calls', () => {
    const normalizedSource = screenSource.replace(/\s+/g, '');

    it.each(EXPECTED_KEYS)(
      'uses t("credit.%s") in source',
      (key) => {
        expect(normalizedSource).toContain(`t("credit.${key}"`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded Alert.alert titles', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\(\s*"Error"/);
      expect(screenSource).not.toMatch(/Alert\.alert\(\s*"Failed/);
    });

    it('should not have hardcoded "/mo" suffix without t()', () => {
      // "/mo" should be wrapped in t("credit.perMonth")
      expect(screenSource).not.toMatch(/\}\/mo</);
    });

    it('should not have hardcoded "% p.a." suffix without t()', () => {
      // "% p.a." should be wrapped in t("credit.perAnnum")
      expect(screenSource).not.toMatch(/\}% p\.a\.</);
    });

    it('should not have hardcoded "Credit" as header text', () => {
      expect(screenSource).not.toMatch(/>Credit</);
    });

    it('should not have hardcoded "Loading Credit Info..." as raw text', () => {
      expect(screenSource).not.toMatch(/>Loading Credit Info\.\.\.</);
    });

    it('should not have hardcoded "Apply Now" as raw text', () => {
      expect(screenSource).not.toMatch(/>Apply Now</);
    });

    it('should not have hardcoded "No Offers Available" as raw text', () => {
      expect(screenSource).not.toMatch(/>No Offers Available</);
    });

    it('should not have hardcoded "No Active Loans" as raw text', () => {
      expect(screenSource).not.toMatch(/>No Active Loans</);
    });

    it('should not have hardcoded "KYC Verification" as raw text', () => {
      expect(screenSource).not.toMatch(/>KYC Verification</);
    });

    it('should not have hardcoded "Verify & Submit" as raw text', () => {
      expect(screenSource).not.toMatch(/>Verify & Submit</);
    });

    it('should not have hardcoded "Application Approved!" as raw text', () => {
      expect(screenSource).not.toMatch(/>Application Approved!</);
    });

    it('should not have hardcoded "PAN Number" as raw text', () => {
      expect(screenSource).not.toMatch(/>PAN Number</);
    });

    it('should not have hardcoded "Aadhaar Last 4 Digits" as raw text', () => {
      expect(screenSource).not.toMatch(/>Aadhaar Last 4 Digits</);
    });

    it('should import useTranslation', () => {
      expect(screenSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(screenSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});
