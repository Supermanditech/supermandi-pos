/**
 * STG-222 / STG-226 / STG-227: SellTile bug fixes
 * - STG-222: Smart price formatting (no .toFixed(2) in formatPrice)
 * - STG-226: Null price shows "Price not set" instead of em dash "—"
 * - STG-227: IST timezone normalization in daysUntilExpiry
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const sellTileSource = readFileSync(
  join(__dirname, '..', '..', 'components', 'sell', 'SellTile.tsx'),
  'utf-8'
);

const enLocale = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'i18n', 'locales', 'en.json'), 'utf-8')
);

const hiLocale = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'i18n', 'locales', 'hi.json'), 'utf-8')
);

// Extract function body helper
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  if (start === -1) throw new Error(`Function ${name} not found`);
  // Grab a generous chunk to capture the whole function
  return source.substring(start, start + 800);
}

describe('STG-222: Smart price formatting (drop .00)', () => {
  it('formatPrice should NOT use .toFixed(2) directly', () => {
    const fnBody = extractFunction(sellTileSource, 'formatPrice');
    expect(fnBody).not.toContain('.toFixed(2)');
  });

  it('formatPrice should delegate to formatMoney (which handles smart formatting)', () => {
    const fnBody = extractFunction(sellTileSource, 'formatPrice');
    expect(fnBody).toContain('formatMoney(paise)');
  });

  it('formatMoney in money.ts should drop .00 on round amounts', () => {
    const moneySource = readFileSync(
      join(__dirname, '..', '..', 'utils', 'money.ts'),
      'utf-8'
    );
    // Verify the smart formatting logic exists
    expect(moneySource).toContain(".replace(/\\.00\\b/, '')");
  });
});

describe('STG-226: Null price shows "Price not set" instead of em dash', () => {
  it('formatPrice should return null for null/undefined price (not em dash)', () => {
    const fnBody = extractFunction(sellTileSource, 'formatPrice');
    // Should return null, not "—"
    expect(fnBody).toContain('return null');
    expect(fnBody).not.toMatch(/return\s+["']—["']/);
  });

  it('component should use t("sell.priceNotSet") for null price fallback', () => {
    expect(sellTileSource).toContain('t("sell.priceNotSet")');
  });

  it('component should apply warning color when price is not set', () => {
    expect(sellTileSource).toContain('isSellPriceNotSet');
    expect(sellTileSource).toContain('colors.warning');
  });

  it('sell.priceNotSet key exists in en.json', () => {
    expect(enLocale.sell.priceNotSet).toBe('Price not set');
  });

  it('sell.priceNotSet key exists in hi.json', () => {
    expect(hiLocale.sell.priceNotSet).toBe('कीमत निर्धारित नहीं');
  });
});

describe('STG-227: IST timezone normalization in daysUntilExpiry', () => {
  it('should normalize to IST using Asia/Kolkata timezone', () => {
    const fnBody = extractFunction(sellTileSource, 'daysUntilExpiry');
    expect(fnBody).toContain("timeZone: 'Asia/Kolkata'");
  });

  it('should apply IST normalization to both now and expiry date', () => {
    const fnBody = extractFunction(sellTileSource, 'daysUntilExpiry');
    // Both istNow and istExpiry should be created with IST normalization
    expect(fnBody).toContain('istNow');
    expect(fnBody).toContain('istExpiry');
    // Both should use toLocaleString with Asia/Kolkata
    const istMatches = fnBody.match(/toLocaleString\('en-US',\s*\{\s*timeZone:\s*'Asia\/Kolkata'\s*\}\)/g);
    expect(istMatches).not.toBeNull();
    expect(istMatches!.length).toBe(2);
  });

  it('should use IST-normalized dates for day calculation (not raw dates)', () => {
    const fnBody = extractFunction(sellTileSource, 'daysUntilExpiry');
    // The Date.UTC calls should use istNow/istExpiry, not now/expiry
    expect(fnBody).toContain('istNow.getFullYear()');
    expect(fnBody).toContain('istExpiry.getFullYear()');
  });
});
