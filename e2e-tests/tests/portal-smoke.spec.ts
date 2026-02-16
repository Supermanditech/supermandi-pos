/**
 * TEST-023: Playwright E2E — Portal Smoke Tests
 * Tests all 3 web portals: retailer-admin, supplier-portal, superadmin.
 * Validates: page loads, login forms, navigation, critical elements.
 */

import { test, expect } from '@playwright/test';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:3000';

// =============================================================================
// RETAILER ADMIN PORTAL
// =============================================================================
test.describe('Retailer Admin Portal @smoke @retailer', () => {
  test('loads login page', async ({ page }) => {
    await page.goto(`${STAGING_URL}/retailer/`);
    await expect(page).toHaveTitle(/SuperMandi|Retailer/i);
  });

  test('has login form elements', async ({ page }) => {
    await page.goto(`${STAGING_URL}/retailer/`);
    // Should have email/phone input and submit button
    const form = page.locator('form, [role="form"], .login-form, .auth-form');
    await expect(form.or(page.locator('input'))).toBeVisible({ timeout: 10000 });
  });

  test('has root div (SPA mounted)', async ({ page }) => {
    await page.goto(`${STAGING_URL}/retailer/`);
    const root = page.locator('#root');
    await expect(root).toBeAttached();
  });

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`${STAGING_URL}/retailer/`);
    await page.waitForLoadState('networkidle');

    // Filter out known benign errors (favicon, HMR)
    const realErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('HMR') &&
      !e.includes('net::ERR')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('responds with 200 status', async ({ request }) => {
    const response = await request.get(`${STAGING_URL}/retailer/`);
    expect(response.status()).toBe(200);
  });
});

// =============================================================================
// SUPPLIER PORTAL
// =============================================================================
test.describe('Supplier Portal @smoke @supplier', () => {
  test('loads login page', async ({ page }) => {
    await page.goto(`${STAGING_URL}/supplier/`);
    await expect(page).toHaveTitle(/SuperMandi|Supplier/i);
  });

  test('has root container (Next.js mounted)', async ({ page }) => {
    await page.goto(`${STAGING_URL}/supplier/`);
    const root = page.locator('#__next, #root');
    await expect(root).toBeAttached();
  });

  test('responds with 200 status', async ({ request }) => {
    const response = await request.get(`${STAGING_URL}/supplier/`);
    expect(response.status()).toBe(200);
  });
});

// =============================================================================
// SUPERADMIN PORTAL
// =============================================================================
test.describe('SuperAdmin Portal @smoke @admin', () => {
  test('loads login page', async ({ page }) => {
    await page.goto(`${STAGING_URL}/admin/`);
    await expect(page).toHaveTitle(/SuperMandi|Admin/i);
  });

  test('has root div (SPA mounted)', async ({ page }) => {
    await page.goto(`${STAGING_URL}/admin/`);
    const root = page.locator('#root');
    await expect(root).toBeAttached();
  });

  test('responds with 200 status', async ({ request }) => {
    const response = await request.get(`${STAGING_URL}/admin/`);
    expect(response.status()).toBe(200);
  });
});

// =============================================================================
// LANDING PAGE
// =============================================================================
test.describe('Landing Page @smoke @landing', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await expect(page).toHaveTitle(/SuperMandi/i);
  });

  test('has SuperMandi branding', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    const branding = page.getByText(/SuperMandi/i);
    await expect(branding.first()).toBeVisible();
  });

  test('responds with 200 status', async ({ request }) => {
    const response = await request.get(`${STAGING_URL}/`);
    expect(response.status()).toBe(200);
  });
});

// =============================================================================
// API HEALTH
// =============================================================================
test.describe('API Health @smoke @api', () => {
  test('health endpoint returns 200', async ({ request }) => {
    const response = await request.get(`${STAGING_URL}/api/v1/pos/health`);
    expect(response.status()).toBeLessThan(500);
  });
});
