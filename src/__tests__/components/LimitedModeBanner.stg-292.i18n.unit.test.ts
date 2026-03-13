/**
 * STG-292: LimitedModeBanner i18n — no hardcoded user-facing strings
 * STG-013: FEFO badge jargon fix — "FEFO" renamed to "Expiring Soon" via i18n
 *
 * Verifies:
 * - LimitedModeBanner uses useTranslation and t() for all user-facing strings
 * - SellScanScreen FEFO badge uses t() instead of hardcoded "FEFO" text
 * - en.json/hi.json contain all required keys
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const srcDir = join(__dirname, '..', '..');
const componentsDir = join(srcDir, 'components');
const screensDir = join(srcDir, 'screens');
const localesDir = join(srcDir, 'i18n', 'locales');

// --- STG-292: LimitedModeBanner i18n ---

describe('STG-292: LimitedModeBanner i18n', () => {
  const source = readFileSync(join(componentsDir, 'LimitedModeBanner.tsx'), 'utf-8');

  it('should import useTranslation', () => {
    expect(source).toContain('useTranslation');
  });

  it('should use t() for LIMITED MODE badge', () => {
    expect(source).toContain('t("limitedMode.badge")');
  });

  it('should use t() for status label', () => {
    expect(source).toContain('t("limitedMode.status"');
  });

  it('should use t() for view/hide restrictions toggle', () => {
    expect(source).toContain('t("limitedMode.hideRestrictions")');
    expect(source).toContain('t("limitedMode.viewRestrictions")');
  });

  it('should use t() for blocked/allowed headers', () => {
    expect(source).toContain('t("limitedMode.blocked")');
    expect(source).toContain('t("limitedMode.allowed")');
  });

  it('should use i18n keys for blocked actions instead of hardcoded strings', () => {
    expect(source).toContain('limitedMode.createSales');
    expect(source).toContain('limitedMode.processPayments');
    expect(source).toContain('limitedMode.placeOrders');
    expect(source).toContain('limitedMode.runReorders');
  });

  it('should use i18n keys for allowed actions instead of hardcoded strings', () => {
    expect(source).toContain('limitedMode.viewMenu');
    expect(source).toContain('limitedMode.viewProducts');
    expect(source).toContain('limitedMode.syncData');
  });

  it('should NOT have hardcoded user-facing strings', () => {
    // These specific literals should no longer appear as display text
    expect(source).not.toMatch(/"LIMITED MODE"/);
    expect(source).not.toMatch(/"Create Sales"/);
    expect(source).not.toMatch(/"Process Payments"/);
    expect(source).not.toMatch(/"Place Orders \(BUY\)"/);
    expect(source).not.toMatch(/"Run Reorders"/);
    expect(source).not.toMatch(/"View Menu"/);
    expect(source).not.toMatch(/"View Products"/);
    expect(source).not.toMatch(/"Sync Data"/);
    expect(source).not.toMatch(/"Hide restrictions"/);
    expect(source).not.toMatch(/"View restrictions"/);
    expect(source).not.toMatch(/"Blocked:"/);
    expect(source).not.toMatch(/"Allowed:"/);
  });
});

// --- STG-013: FEFO badge jargon fix ---

describe('STG-013: SellScanScreen FEFO badge i18n', () => {
  const source = readFileSync(join(screensDir, 'SellScanScreen.tsx'), 'utf-8');

  it('should use t() for FEFO toggle label (inactive)', () => {
    expect(source).toContain('t("sell.expiringFirst")');
  });

  it('should use t() for FEFO toggle label (active)', () => {
    expect(source).toContain('t("sell.expiringFirstOn")');
  });

  it('should NOT have hardcoded "FEFO" as display text', () => {
    // Comments containing FEFO are OK, but user-facing strings should use i18n
    // Check that the toggle text no longer uses hardcoded "FEFO" / "FEFO ON"
    expect(source).not.toMatch(/\? "FEFO ON" : "FEFO"/);
  });
});

// --- i18n key presence in en.json and hi.json ---

describe('STG-013 + STG-292: i18n keys in en.json', () => {
  const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));

  it('has sell.expiringFirst key', () => {
    expect(en.sell.expiringFirst).toBe('Expiring Soon');
  });

  it('has sell.expiringFirstOn key', () => {
    expect(en.sell.expiringFirstOn).toBe('Expiring Soon ON');
  });

  it('has all limitedMode keys', () => {
    expect(en.limitedMode).toBeDefined();
    expect(en.limitedMode.badge).toBe('LIMITED MODE');
    expect(en.limitedMode.status).toBe('Status: {{label}}');
    expect(en.limitedMode.hideRestrictions).toBe('Hide restrictions');
    expect(en.limitedMode.viewRestrictions).toBe('View restrictions');
    expect(en.limitedMode.blocked).toBe('Blocked:');
    expect(en.limitedMode.allowed).toBe('Allowed:');
    expect(en.limitedMode.createSales).toBe('Create Sales');
    expect(en.limitedMode.processPayments).toBe('Process Payments');
    expect(en.limitedMode.placeOrders).toBe('Place Orders (BUY)');
    expect(en.limitedMode.runReorders).toBe('Run Reorders');
    expect(en.limitedMode.viewMenu).toBe('View Menu');
    expect(en.limitedMode.viewProducts).toBe('View Products');
    expect(en.limitedMode.syncData).toBe('Sync Data');
  });
});

describe('STG-013 + STG-292: i18n keys in hi.json', () => {
  const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));

  it('has sell.expiringFirst key in Hindi', () => {
    expect(hi.sell.expiringFirst).toBe('जल्द समाप्त');
  });

  it('has sell.expiringFirstOn key in Hindi', () => {
    expect(hi.sell.expiringFirstOn).toBeDefined();
  });

  it('has all limitedMode keys in Hindi', () => {
    expect(hi.limitedMode).toBeDefined();
    expect(hi.limitedMode.badge).toBeDefined();
    expect(hi.limitedMode.status).toContain('{{label}}');
    expect(hi.limitedMode.hideRestrictions).toBeDefined();
    expect(hi.limitedMode.viewRestrictions).toBeDefined();
    expect(hi.limitedMode.blocked).toBeDefined();
    expect(hi.limitedMode.allowed).toBeDefined();
    expect(hi.limitedMode.createSales).toBeDefined();
    expect(hi.limitedMode.processPayments).toBeDefined();
    expect(hi.limitedMode.placeOrders).toBeDefined();
    expect(hi.limitedMode.runReorders).toBeDefined();
    expect(hi.limitedMode.viewMenu).toBeDefined();
    expect(hi.limitedMode.viewProducts).toBeDefined();
    expect(hi.limitedMode.syncData).toBeDefined();
  });
});
