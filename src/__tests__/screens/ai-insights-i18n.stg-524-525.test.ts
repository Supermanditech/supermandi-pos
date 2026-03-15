/**
 * STG-524 + STG-525: AIInsightsScreen i18n
 *
 * STG-524: Tab labels use i18n t() instead of hardcoded English
 * STG-525: Retry/empty/error text uses i18n keys
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const screenPath = path.resolve(__dirname, "../../screens/AIInsightsScreen.tsx");
const enPath = path.resolve(__dirname, "../../i18n/locales/en.json");
const hiPath = path.resolve(__dirname, "../../i18n/locales/hi.json");

describe("STG-524: AIInsightsScreen tab labels use i18n", () => {
  const content = fs.readFileSync(screenPath, "utf-8");
  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
  const hi = JSON.parse(fs.readFileSync(hiPath, "utf-8"));

  test("no hardcoded tab labels in tabs array", () => {
    // Should NOT have: label: 'Alerts' etc
    expect(content).not.toMatch(/label:\s*['"]Alerts['"]/);
    expect(content).not.toMatch(/label:\s*['"]Forecast['"]/);
    expect(content).not.toMatch(/label:\s*['"]Slow Moving['"]/);
    expect(content).not.toMatch(/label:\s*['"]Expiry['"]/);
    expect(content).not.toMatch(/label:\s*['"]Prices['"]/);
  });

  test("tab labels use t() function", () => {
    expect(content).toContain("t('aiInsights.tabs.alerts')");
    expect(content).toContain("t('aiInsights.tabs.forecast')");
    expect(content).toContain("t('aiInsights.tabs.slowMoving')");
    expect(content).toContain("t('aiInsights.tabs.expiry')");
    expect(content).toContain("t('aiInsights.tabs.prices')");
  });

  test("en.json has all tab keys", () => {
    expect(en.aiInsights.tabs.alerts).toBe("Alerts");
    expect(en.aiInsights.tabs.forecast).toBe("Forecast");
    expect(en.aiInsights.tabs.slowMoving).toBe("Slow Moving");
    expect(en.aiInsights.tabs.expiry).toBe("Expiry");
    expect(en.aiInsights.tabs.prices).toBe("Prices");
  });

  test("hi.json has all tab keys", () => {
    expect(hi.aiInsights.tabs.alerts).toBeDefined();
    expect(hi.aiInsights.tabs.forecast).toBeDefined();
    expect(hi.aiInsights.tabs.slowMoving).toBeDefined();
    expect(hi.aiInsights.tabs.expiry).toBeDefined();
    expect(hi.aiInsights.tabs.prices).toBeDefined();
  });
});

describe("STG-525: AIInsightsScreen retry/empty/error text uses i18n", () => {
  const content = fs.readFileSync(screenPath, "utf-8");
  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));

  test("error messages use t() not hardcoded strings", () => {
    expect(content).toContain("t('aiInsights.error.notAvailable')");
    expect(content).toContain("t('aiInsights.error.serverError')");
    expect(content).toContain("t('aiInsights.error.networkError')");
  });

  test("'Tap to retry' uses i18n", () => {
    expect(content).not.toMatch(/>Tap to retry</);
    expect(content).toContain("t('aiInsights.tapToRetry')");
  });

  test("empty state uses i18n", () => {
    expect(content).not.toMatch(/AI insights will be available once/);
    expect(content).toContain("t('aiInsights.emptyState')");
  });

  test("header title uses i18n", () => {
    expect(content).not.toMatch(/>AI Insights</);
    expect(content).toContain("t('menu.aiInsights')");
  });

  test("en.json has error/retry/empty keys", () => {
    expect(en.aiInsights.error.notAvailable).toBeDefined();
    expect(en.aiInsights.error.serverError).toBeDefined();
    expect(en.aiInsights.error.networkError).toBeDefined();
    expect(en.aiInsights.tapToRetry).toBeDefined();
    expect(en.aiInsights.emptyState).toBeDefined();
  });
});
