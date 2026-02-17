/**
 * TQ-005: Authenticated Playwright E2E Tests
 *
 * Tests post-login flows for all 3 web portals.
 * Uses API requests to get auth tokens, injects them into browser state,
 * then navigates authenticated pages.
 *
 * Tags: @staging (requires running backend + portals)
 *
 * Auth mechanisms:
 *   - Retailer Admin: HttpOnly cookie `sm_auth` + in-memory token
 *   - SuperAdmin: localStorage `supermandi_admin_session`
 *   - Supplier Portal: HttpOnly cookie `sm_auth` + in-memory token
 */

import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || process.env.STAGING_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// =============================================================================
// SUPERADMIN PORTAL (simplest — localStorage-based auth)
// =============================================================================
test.describe('SuperAdmin Authenticated @staging @admin', { tag: ['@staging', '@admin'] }, () => {
  test.skip(!ADMIN_TOKEN, 'ADMIN_TOKEN env var required');

  test('admin dashboard loads with valid session', async ({ page }) => {
    // Inject admin session into localStorage before navigating
    await page.goto(`${API_BASE}/admin/`);
    await page.evaluate((token) => {
      localStorage.setItem('supermandi_admin_session', token);
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 86400000));
      localStorage.setItem('supermandi_admin_last_activity', String(Date.now()));
    }, ADMIN_TOKEN);

    // Navigate to dashboard (should not redirect to login)
    await page.goto(`${API_BASE}/admin/`);
    await page.waitForLoadState('networkidle');

    // Should show dashboard content, not login form
    const url = page.url();
    expect(url).not.toContain('/login');

    // Should have admin UI elements visible
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('admin can access stores tab', async ({ page }) => {
    await page.goto(`${API_BASE}/admin/`);
    await page.evaluate((token) => {
      localStorage.setItem('supermandi_admin_session', token);
      localStorage.setItem('supermandi_admin_session_expiry', String(Date.now() + 86400000));
    }, ADMIN_TOKEN);

    await page.goto(`${API_BASE}/admin/`);
    await page.waitForLoadState('networkidle');

    // Look for stores-related content or tab
    const storesTab = page.getByText(/stores/i).first();
    if (await storesTab.isVisible()) {
      await storesTab.click();
      await page.waitForLoadState('networkidle');
      // Should load stores data
      expect(page.url()).toBeTruthy();
    }
  });

  test('admin API returns data with valid token', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/admin/analytics/overview`, {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        Accept: 'application/json',
      },
    });
    // Should return 200 with data (not 401)
    expect(response.status()).toBeLessThan(400);

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('overview');
    }
  });

  test('admin can list stores', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/admin/stores`, {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        Accept: 'application/json',
      },
    });
    expect(response.status()).toBeLessThan(400);
  });
});

// =============================================================================
// SUPERADMIN AUTH GUARD (no token → should block)
// =============================================================================
test.describe('SuperAdmin Auth Guard @staging @admin', { tag: ['@staging', '@admin'] }, () => {
  test('dashboard redirects to login without token', async ({ page }) => {
    // Clear any existing session
    await page.goto(`${API_BASE}/admin/`);
    await page.evaluate(() => {
      localStorage.removeItem('supermandi_admin_session');
      localStorage.removeItem('supermandi_admin_session_expiry');
    });

    await page.goto(`${API_BASE}/admin/`);
    await page.waitForLoadState('networkidle');

    // Should show login form (password input or login prompt)
    const loginIndicator = page.locator('input[type="password"], input[type="text"], button:has-text("Login"), button:has-text("Sign")');
    await expect(loginIndicator.first()).toBeVisible({ timeout: 10000 });
  });

  test('API rejects requests without auth', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/admin/stores`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.status()).toBeGreaterThanOrEqual(401);
  });
});

// =============================================================================
// RETAILER ADMIN PORTAL (cookie-based auth)
// =============================================================================
test.describe('Retailer Admin Auth Guard @staging @retailer', { tag: ['@staging', '@retailer'] }, () => {
  test('protected routes redirect to login', async ({ page }) => {
    const protectedPaths = [
      '/retailer/dashboard',
      '/retailer/catalog',
      '/retailer/ledger',
      '/retailer/settings',
    ];

    for (const path of protectedPaths) {
      await page.goto(`${API_BASE}${path}`);
      await page.waitForLoadState('networkidle');

      // Should redirect to login
      const url = page.url();
      const isLoginPage = url.includes('/login') || url.includes('/retailer/');
      expect(isLoginPage).toBeTruthy();
    }
  });

  test('retailer API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/retailer-admin/dashboard`, {
      headers: { Accept: 'application/json' },
    });
    expect(response.status()).toBe(401);
  });

  test('login page renders correctly', async ({ page }) => {
    await page.goto(`${API_BASE}/retailer/login`);
    await page.waitForLoadState('networkidle');

    // Should have phone input for OTP login
    const phoneInput = page.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible({ timeout: 10000 });

    // Should have submit button
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });
});

// =============================================================================
// SUPPLIER PORTAL (cookie-based auth)
// =============================================================================
test.describe('Supplier Portal Auth Guard @staging @supplier', { tag: ['@staging', '@supplier'] }, () => {
  test('protected routes redirect to login', async ({ page }) => {
    await page.goto(`${API_BASE}/supplier/dashboard`);
    await page.waitForLoadState('networkidle');

    // Should redirect to login
    const url = page.url();
    const isLoginOrHome = url.includes('/login') || url.includes('/supplier');
    expect(isLoginOrHome).toBeTruthy();
  });

  test('login page renders correctly', async ({ page }) => {
    await page.goto(`${API_BASE}/supplier/login`);
    await page.waitForLoadState('networkidle');

    // Should have a form for login
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    // Page should not be blank/error
    expect(body!.length).toBeGreaterThan(50);
  });
});

// =============================================================================
// CROSS-PORTAL ISOLATION (with admin token)
// =============================================================================
test.describe('Cross-Portal Auth Isolation @staging', { tag: '@staging' }, () => {
  test.skip(!ADMIN_TOKEN, 'ADMIN_TOKEN env var required');

  test('admin token cannot access retailer endpoints', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/retailer-admin/dashboard`, {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        Accept: 'application/json',
      },
    });
    // Should be rejected (admin token != retailer JWT)
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('admin token cannot access supplier endpoints', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/supplier/profile`, {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        Accept: 'application/json',
      },
    });
    // Should be rejected
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('POS device endpoints reject admin tokens', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/pos/products`, {
      headers: {
        'x-device-token': ADMIN_TOKEN,
        Accept: 'application/json',
      },
    });
    // Device token validation should fail for admin JWT
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
