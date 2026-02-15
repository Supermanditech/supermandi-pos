import { test, expect } from '@playwright/test';

/**
 * Visual Regression Tests
 * Captures screenshots of all portal roots and compares against baselines.
 * Run: npx playwright test tests/visual-regression/
 * Update baselines: npx playwright test tests/visual-regression/ --update-snapshots
 */

const STAGING_URL = process.env.STAGING_URL || 'https://staging.supermandi.tech';

test.describe('Portal Visual Regression @visual', () => {
  test('Landing page matches baseline', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('landing-root.png', {
      maxDiffPixelRatio: 0.05,
      fullPage: true,
    });
  });

  test('Retailer login page matches baseline', async ({ page }) => {
    await page.goto(`${STAGING_URL}/retailer/`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('retailer-login.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('Supplier login page matches baseline', async ({ page }) => {
    await page.goto(`${STAGING_URL}/supplier/`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('supplier-login.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('Admin login page matches baseline', async ({ page }) => {
    await page.goto(`${STAGING_URL}/admin/`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('admin-login.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});
