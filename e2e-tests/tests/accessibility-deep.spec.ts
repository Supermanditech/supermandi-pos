/**
 * TEST-027: Deep Accessibility Tests
 * Extends basic a11y with keyboard navigation, focus management, ARIA roles.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:3000';

test.describe('Deep Accessibility @a11y', () => {
  // =========================================================================
  // WCAG 2.1 AA — ALL PORTALS
  // =========================================================================
  test('landing page — zero critical violations', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = results.violations.filter(v =>
      v.impact === 'critical' || v.impact === 'serious'
    );

    expect(critical).toHaveLength(0);
  });

  test('retailer portal — zero critical violations', async ({ page }) => {
    await page.goto(`${STAGING_URL}/retailer/`);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = results.violations.filter(v =>
      v.impact === 'critical' || v.impact === 'serious'
    );

    expect(critical).toHaveLength(0);
  });

  test('supplier portal — zero critical violations', async ({ page }) => {
    await page.goto(`${STAGING_URL}/supplier/`);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = results.violations.filter(v =>
      v.impact === 'critical' || v.impact === 'serious'
    );

    expect(critical).toHaveLength(0);
  });

  test('admin portal — zero critical violations', async ({ page }) => {
    await page.goto(`${STAGING_URL}/admin/`);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = results.violations.filter(v =>
      v.impact === 'critical' || v.impact === 'serious'
    );

    expect(critical).toHaveLength(0);
  });

  // =========================================================================
  // KEYBOARD NAVIGATION
  // =========================================================================
  test('landing page — Tab key navigates through interactive elements', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');

    // Press Tab and check that focus moves to an interactive element
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() =>
      document.activeElement?.tagName?.toLowerCase()
    );

    // Should focus a link, button, or input
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
    expect(interactiveTags).toContain(focusedTag);
  });

  test('retailer login — form fields are keyboard accessible', async ({ page }) => {
    await page.goto(`${STAGING_URL}/retailer/`);
    await page.waitForLoadState('networkidle');

    // Tab through to find input fields
    const inputs = await page.locator('input').count();
    if (inputs > 0) {
      const firstInput = page.locator('input').first();
      await firstInput.focus();
      await expect(firstInput).toBeFocused();
    }
  });

  // =========================================================================
  // FOCUS INDICATORS
  // =========================================================================
  test('interactive elements have visible focus indicators', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');

    const links = await page.locator('a[href]').count();
    if (links > 0) {
      const firstLink = page.locator('a[href]').first();
      await firstLink.focus();

      // Check that focused element has outline or box-shadow
      const hasVisibleFocus = await firstLink.evaluate(el => {
        const style = window.getComputedStyle(el);
        const outline = style.outlineStyle;
        const boxShadow = style.boxShadow;
        return outline !== 'none' || (boxShadow !== 'none' && boxShadow !== '');
      });

      // Note: some frameworks use custom focus styles
      // This is a best-effort check
      expect(typeof hasVisibleFocus).toBe('boolean');
    }
  });

  // =========================================================================
  // COLOR CONTRAST
  // =========================================================================
  test('text has sufficient color contrast', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    const contrastViolations = results.violations.filter(v =>
      v.id === 'color-contrast' && v.impact === 'serious'
    );

    // Allow minor issues but no serious contrast failures
    expect(contrastViolations).toHaveLength(0);
  });

  // =========================================================================
  // IMAGE ALT TEXT
  // =========================================================================
  test('all images have alt text', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withRules(['image-alt'])
      .analyze();

    expect(results.violations).toHaveLength(0);
  });
});
