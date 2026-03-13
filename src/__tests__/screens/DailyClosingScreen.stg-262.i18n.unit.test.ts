/**
 * STG-262: DailyClosingScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All dailyClosing.* keys exist in en.json and hi.json
 * 2. DailyClosingScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component JSX
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'DailyClosingScreen.tsx'),
  'utf-8'
);

const EXPECTED_KEYS = [
  'title',
  'summary',
  'history',
  'loadingSummary',
  'salesSummary',
  'totalSales',
  'transactions',
  'byPaymentType',
  'cash',
  'upi',
  'due',
  'card',
  'refunds',
  'openingCash',
  'expectedCash',
  'enterActualCash',
  'cashMatches',
  'variance',
  'varianceLabel',
  'excessCash',
  'shortCash',
  'closeDay',
  'invalidAmount',
  'invalidAmountMessage',
  'today',
  'noData',
  'noDataDescription',
  'noHistory',
  'noHistoryDescription',
  'match',
  'mismatch',
  'actualCash',
  'closedBy',
] as const;

describe('STG-262: DailyClosingScreen i18n', () => {
  describe('en.json has all dailyClosing keys', () => {
    it.each(EXPECTED_KEYS)('dailyClosing.%s exists in en.json', (key) => {
      expect(en.dailyClosing).toBeDefined();
      expect(en.dailyClosing[key]).toBeTruthy();
      expect(typeof en.dailyClosing[key]).toBe('string');
    });
  });

  describe('hi.json has all dailyClosing keys', () => {
    it.each(EXPECTED_KEYS)('dailyClosing.%s exists in hi.json', (key) => {
      expect(hi.dailyClosing).toBeDefined();
      expect(hi.dailyClosing[key]).toBeTruthy();
      expect(typeof hi.dailyClosing[key]).toBe('string');
    });
  });

  describe('en/hi key parity', () => {
    it('en and hi have the same dailyClosing keys', () => {
      const enKeys = Object.keys(en.dailyClosing).sort();
      const hiKeys = Object.keys(hi.dailyClosing).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('menu.dailyClosing key exists', () => {
    it('en.json has menu.dailyClosing', () => {
      expect(en.menu.dailyClosing).toBeTruthy();
    });
    it('hi.json has menu.dailyClosing', () => {
      expect(hi.menu.dailyClosing).toBeTruthy();
    });
  });

  describe('DailyClosingScreen.tsx uses t() calls', () => {
    it.each(EXPECTED_KEYS)(
      'uses t("dailyClosing.%s") in source',
      (key) => {
        expect(screenSource).toContain(`t("dailyClosing.${key}"`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded "Daily Closing" as a raw string prop', () => {
      expect(screenSource).not.toMatch(/title="Daily Closing"/);
    });

    it('should not have hardcoded "Summary" tab text', () => {
      // Should be wrapped in t(), not raw text between tags
      expect(screenSource).not.toMatch(/>\s*Summary\s*<\/Text>/);
    });

    it('should not have hardcoded "History" tab text', () => {
      expect(screenSource).not.toMatch(/>\s*History\s*<\/Text>/);
    });

    it('should not have hardcoded "Loading summary..."', () => {
      expect(screenSource).not.toMatch(/>Loading summary\.\.\.</);
    });

    it('should not have hardcoded "Sales Summary"', () => {
      expect(screenSource).not.toMatch(/>Sales Summary</);
    });

    it('should not have hardcoded "Close Day" button text', () => {
      expect(screenSource).not.toMatch(/>Close Day</);
    });

    it('should not have hardcoded "No data available"', () => {
      expect(screenSource).not.toMatch(/title="No data available"/);
    });

    it('should not have hardcoded "No closing history"', () => {
      expect(screenSource).not.toMatch(/title="No closing history"/);
    });

    it('should not have hardcoded "MATCH" / "MISMATCH"', () => {
      expect(screenSource).not.toMatch(/[?:]\s*"MATCH"/);
      expect(screenSource).not.toMatch(/[?:]\s*"MISMATCH"/);
    });

    it('should not have hardcoded "Closed by" text', () => {
      expect(screenSource).not.toMatch(/>\s*Closed by /);
    });

    it('should not have hardcoded "Invalid Amount" alert', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("Invalid Amount"/);
    });

    it('should not have hardcoded "Today" badge text', () => {
      expect(screenSource).not.toMatch(/>Today</);
    });

    it('should not have hardcoded "Cash matches expected amount"', () => {
      expect(screenSource).not.toMatch(/"Cash matches expected amount"/);
    });

    it('should not have hardcoded "Excess cash" / "Short cash"', () => {
      expect(screenSource).not.toMatch(/"Excess cash"/);
      expect(screenSource).not.toMatch(/"Short cash"/);
    });
  });
});
