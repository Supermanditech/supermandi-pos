/**
 * TEST-026: Visual Regression Tests
 * Screenshot comparison for key pages across portals.
 * Uses Playwright's built-in screenshot comparison.
 */

import { test, expect } from '@playwright/test';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:3000';

test.describe('Visual Regression @visual', () => {
  // =========================================================================
  // LANDING PAGE
  // =========================================================================
  test('landing page screenshot', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('landing-page.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05, // Allow 5% pixel difference
    });
  });

  // =========================================================================
  // RETAILER ADMIN LOGIN
  // =========================================================================
  test('retailer login screenshot', async ({ page }) => {
    await page.goto(`${STAGING_URL}/retailer/`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('retailer-login.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  // =========================================================================
  // SUPPLIER PORTAL LOGIN
  // =========================================================================
  test('supplier login screenshot', async ({ page }) => {
    await page.goto(`${STAGING_URL}/supplier/`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('supplier-login.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  // =========================================================================
  // SUPERADMIN LOGIN
  // =========================================================================
  test('admin login screenshot', async ({ page }) => {
    await page.goto(`${STAGING_URL}/admin/`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('admin-login.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});
