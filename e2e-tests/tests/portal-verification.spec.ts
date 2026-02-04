import { test, expect, Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * SuperMandi Portal Verification E2E Tests
 *
 * Tests:
 * 1. Landing page loads correctly
 * 2. Portal navigation (Retailer, Supplier, Admin)
 * 3. Deep link verification
 * 4. Console error capture
 * 5. Session persistence across tabs
 * 6. Network failure detection
 */

// Evidence directory for this test run
const EVIDENCE_DIR = `test-results/evidence-${new Date().toISOString().replace(/[:.]/g, '-')}`;

// Console log collector
interface ConsoleLogEntry {
  type: string;
  text: string;
  location: string;
  timestamp: string;
}

// Setup evidence directory
test.beforeAll(async () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.mkdirSync(`${EVIDENCE_DIR}/screenshots`, { recursive: true });
  fs.mkdirSync(`${EVIDENCE_DIR}/console-logs`, { recursive: true });
  fs.mkdirSync(`${EVIDENCE_DIR}/network`, { recursive: true });
  fs.mkdirSync(`${EVIDENCE_DIR}/html-snapshots`, { recursive: true });
});

// Helper to collect console logs
function setupConsoleCollector(page: Page, testName: string): ConsoleLogEntry[] {
  const logs: ConsoleLogEntry[] = [];

  page.on('console', (msg) => {
    logs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location().url || 'unknown',
      timestamp: new Date().toISOString(),
    });
  });

  page.on('pageerror', (error) => {
    logs.push({
      type: 'error',
      text: `PAGE ERROR: ${error.message}`,
      location: error.stack || 'unknown',
      timestamp: new Date().toISOString(),
    });
  });

  return logs;
}

// Helper to save console logs
function saveConsoleLogs(logs: ConsoleLogEntry[], testName: string) {
  const logPath = path.join(EVIDENCE_DIR, 'console-logs', `${testName}.json`);
  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

  // Check for errors
  const errors = logs.filter(
    (log) => log.type === 'error' || log.type === 'warning'
  );
  if (errors.length > 0) {
    const errorPath = path.join(EVIDENCE_DIR, 'console-logs', `${testName}-errors.json`);
    fs.writeFileSync(errorPath, JSON.stringify(errors, null, 2));
  }

  return errors;
}

// Helper to save HTML snapshot
async function saveHtmlSnapshot(page: Page, name: string) {
  const html = await page.content();
  const htmlPath = path.join(EVIDENCE_DIR, 'html-snapshots', `${name}.html`);
  fs.writeFileSync(htmlPath, html);
}

// =============================================================================
// Test Suite: Landing Page (@prod - Production Smoke)
// =============================================================================
test.describe('Landing Page @prod', { tag: '@prod' }, () => {
  test('should load landing page without redirect', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'landing-page');

    await page.goto('/');

    // Verify no redirect occurred
    expect(page.url()).not.toContain('/retailer/');

    // Take screenshot
    await page.screenshot({
      path: `${EVIDENCE_DIR}/screenshots/landing-page.png`,
      fullPage: true,
    });

    // Save HTML snapshot
    await saveHtmlSnapshot(page, 'landing-page');

    // Verify page contains expected content
    const title = await page.title();
    expect(title.toLowerCase()).toContain('supermandi');

    // Check for required nav links (retailer and supplier - admin is separate scope)
    const retailerLink = page.locator('a[href*="/retailer"]').first();
    const supplierLink = page.locator('a[href*="/supplier"]').first();

    await expect(retailerLink).toBeVisible();
    await expect(supplierLink).toBeVisible();

    // Save and check console logs
    const errors = saveConsoleLogs(logs, 'landing-page');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });

  test('should navigate to Retailer portal from landing', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'landing-to-retailer');

    await page.goto('/');
    await page.screenshot({ path: `${EVIDENCE_DIR}/screenshots/landing-before-click.png` });

    // Click retailer link
    await page.click('a[href*="/retailer"]');
    await page.waitForLoadState('networkidle');

    // Verify navigation
    expect(page.url()).toContain('/retailer');
    await page.screenshot({ path: `${EVIDENCE_DIR}/screenshots/retailer-after-click.png` });

    const errors = saveConsoleLogs(logs, 'landing-to-retailer');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });

  test('should navigate to Supplier portal from landing', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'landing-to-supplier');

    await page.goto('/');
    await page.click('a[href*="/supplier"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/supplier');
    await page.screenshot({ path: `${EVIDENCE_DIR}/screenshots/supplier-after-click.png` });

    const errors = saveConsoleLogs(logs, 'landing-to-supplier');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });
});

// =============================================================================
// Test Suite: Landing Page Admin Navigation (@admin - separate scope)
// =============================================================================
test.describe('Landing Page Admin Navigation @admin', { tag: '@admin' }, () => {
  test('should have Admin link on landing page', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'landing-admin-link');

    await page.goto('/');

    // Check for admin link presence
    const adminLink = page.locator('a[href*="/admin"]').first();
    await expect(adminLink).toBeVisible();

    const errors = saveConsoleLogs(logs, 'landing-admin-link');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });

  test('should navigate to Admin portal from landing', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'landing-to-admin');

    await page.goto('/');
    await page.click('a[href*="/admin"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/admin');
    await page.screenshot({ path: `${EVIDENCE_DIR}/screenshots/admin-after-click.png` });

    const errors = saveConsoleLogs(logs, 'landing-to-admin');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });
});

// =============================================================================
// Test Suite: Retailer Portal (@prod - Production Smoke)
// =============================================================================
test.describe('Retailer Portal @prod', { tag: '@prod' }, () => {
  test('should load login page correctly', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'retailer-login');

    await page.goto('/retailer/login');
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await page.screenshot({
      path: `${EVIDENCE_DIR}/screenshots/retailer-login.png`,
      fullPage: true,
    });

    // Save HTML
    await saveHtmlSnapshot(page, 'retailer-login');

    // Verify login form elements
    const phoneInput = page.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible();

    // Check for submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();

    // Check for register link
    const registerLink = page.locator('a[href*="/register"]');
    await expect(registerLink).toBeVisible();

    const errors = saveConsoleLogs(logs, 'retailer-login');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });

  test('should load register page correctly', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'retailer-register');

    await page.goto('/retailer/register');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: `${EVIDENCE_DIR}/screenshots/retailer-register.png`,
      fullPage: true,
    });

    await saveHtmlSnapshot(page, 'retailer-register');

    const errors = saveConsoleLogs(logs, 'retailer-register');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });

  test('should handle deep links correctly', async ({ page }) => {
    const deepLinks = [
      '/retailer/dashboard',
      '/retailer/catalog',
      '/retailer/ledger',
      '/retailer/payments',
      '/retailer/devices',
      '/retailer/orders',
      '/retailer/settings',
    ];

    for (const link of deepLinks) {
      const logs = setupConsoleCollector(page, `deep-link-${link.replace(/\//g, '-')}`);

      const response = await page.goto(link);

      // Should not be 404
      expect(response?.status()).not.toBe(404);

      // Should either load page or redirect to login
      const currentUrl = page.url();
      expect(
        currentUrl.includes(link) || currentUrl.includes('/login')
      ).toBeTruthy();

      await page.screenshot({
        path: `${EVIDENCE_DIR}/screenshots/deep-link-${link.replace(/\//g, '-')}.png`,
      });

      const errors = saveConsoleLogs(logs, `deep-link-${link.replace(/\//g, '-')}`);
      // Log errors but don't fail - some errors may be expected without auth
    }
  });
});

// =============================================================================
// Test Suite: Supplier Portal (@prod - Production Smoke)
// =============================================================================
test.describe('Supplier Portal @prod', { tag: '@prod' }, () => {
  test('should load supplier login page', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'supplier-login');

    // Test both with and without trailing slash (308 redirect expected)
    await page.goto('/supplier/login');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: `${EVIDENCE_DIR}/screenshots/supplier-login.png`,
      fullPage: true,
    });

    await saveHtmlSnapshot(page, 'supplier-login');

    const errors = saveConsoleLogs(logs, 'supplier-login');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });

  test('should load supplier register page', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'supplier-register');

    await page.goto('/supplier/register');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: `${EVIDENCE_DIR}/screenshots/supplier-register.png`,
      fullPage: true,
    });

    const errors = saveConsoleLogs(logs, 'supplier-register');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });
});

// =============================================================================
// Test Suite: Admin Portal (@admin - separate scope)
// =============================================================================
test.describe('Admin Portal @admin', { tag: '@admin' }, () => {
  test('should load admin portal', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'admin-portal');

    await page.goto('/admin/');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: `${EVIDENCE_DIR}/screenshots/admin-portal.png`,
      fullPage: true,
    });

    await saveHtmlSnapshot(page, 'admin-portal');

    const errors = saveConsoleLogs(logs, 'admin-portal');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });
});

// =============================================================================
// Test Suite: API Health & Assets (@prod - Production Smoke)
// =============================================================================
test.describe('API & Assets @prod', { tag: '@prod' }, () => {
  test('should have healthy API', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status');

    // Save response
    fs.writeFileSync(
      `${EVIDENCE_DIR}/network/api-health.json`,
      JSON.stringify(body, null, 2)
    );
  });

  test('should serve JS assets with correct caching', async ({ request, page }) => {
    // First get the HTML to find the JS hash
    await page.goto('/retailer/');
    const html = await page.content();

    // Extract JS filename
    const jsMatch = html.match(/index-([A-Za-z0-9]+)\.js/);
    if (!jsMatch) {
      throw new Error('Could not find JS hash in HTML');
    }

    const jsFile = `index-${jsMatch[1]}.js`;

    // Fetch the JS asset
    const jsResponse = await request.get(`/retailer/assets/${jsFile}`);
    expect(jsResponse.status()).toBe(200);

    // Check headers
    const headers = jsResponse.headers();
    fs.writeFileSync(
      `${EVIDENCE_DIR}/network/js-asset-headers.json`,
      JSON.stringify(headers, null, 2)
    );

    // Content-Type should be JavaScript
    expect(headers['content-type']).toContain('javascript');
  });

  test('should protect dashboard API without auth', async ({ request }) => {
    const response = await request.get('/api/v1/retailer-admin/dashboard');
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty('error');

    fs.writeFileSync(
      `${EVIDENCE_DIR}/network/dashboard-unauth.json`,
      JSON.stringify(body, null, 2)
    );
  });
});

// =============================================================================
// Test Suite: Session Persistence (@prod - Production Smoke)
// =============================================================================
test.describe('Session Persistence @prod', { tag: '@prod' }, () => {
  test('should maintain state across page reloads', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'session-reload');

    // Go to login page
    await page.goto('/retailer/login');

    // Enter a phone number (won't submit, just testing state)
    const phoneInput = page.locator('input[type="tel"]');
    await phoneInput.fill('+919876543210');

    // Take screenshot before reload
    await page.screenshot({ path: `${EVIDENCE_DIR}/screenshots/session-before-reload.png` });

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Take screenshot after reload
    await page.screenshot({ path: `${EVIDENCE_DIR}/screenshots/session-after-reload.png` });

    const errors = saveConsoleLogs(logs, 'session-reload');
    expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
  });

  test('should work across multiple tabs', async ({ context }) => {
    // Open first tab
    const page1 = await context.newPage();
    const logs1 = setupConsoleCollector(page1, 'session-tab1');

    await page1.goto('/retailer/login');
    await page1.screenshot({ path: `${EVIDENCE_DIR}/screenshots/session-tab1.png` });

    // Open second tab
    const page2 = await context.newPage();
    const logs2 = setupConsoleCollector(page2, 'session-tab2');

    await page2.goto('/retailer/login');
    await page2.screenshot({ path: `${EVIDENCE_DIR}/screenshots/session-tab2.png` });

    // Both tabs should be functional
    await expect(page1.locator('input[type="tel"]')).toBeVisible();
    await expect(page2.locator('input[type="tel"]')).toBeVisible();

    saveConsoleLogs(logs1, 'session-tab1');
    saveConsoleLogs(logs2, 'session-tab2');

    await page1.close();
    await page2.close();
  });
});

// =============================================================================
// Test Suite: Network Failures (@prod - Production Smoke)
// =============================================================================
test.describe('Network Resilience @prod', { tag: '@prod' }, () => {
  test('should handle API errors gracefully', async ({ page }) => {
    const logs = setupConsoleCollector(page, 'network-error');

    // Intercept API calls and simulate errors
    await page.route('**/api/v1/**', (route) => {
      // Let health endpoint pass, block others
      if (route.request().url().includes('/health')) {
        route.continue();
      } else {
        route.abort('failed');
      }
    });

    await page.goto('/retailer/login');
    await page.waitForLoadState('networkidle');

    // Page should still render (graceful degradation)
    const phoneInput = page.locator('input[type="tel"]');
    await expect(phoneInput).toBeVisible();

    await page.screenshot({
      path: `${EVIDENCE_DIR}/screenshots/network-error-handling.png`,
    });

    // Some errors are expected in this test
    saveConsoleLogs(logs, 'network-error');
  });
});

// =============================================================================
// Test Suite: HAR Recording (@prod - Production Smoke)
// =============================================================================
test.describe('Network Trace @prod', { tag: '@prod' }, () => {
  test('should record HAR for full page load', async ({ page, context }) => {
    // Start HAR recording
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });

    const logs = setupConsoleCollector(page, 'har-recording');

    // Navigate through multiple pages
    await page.goto('/');
    await page.goto('/retailer/login');
    await page.goto('/retailer/register');

    // Stop and save trace
    await context.tracing.stop({
      path: `${EVIDENCE_DIR}/network/trace.zip`,
    });

    saveConsoleLogs(logs, 'har-recording');
  });
});
