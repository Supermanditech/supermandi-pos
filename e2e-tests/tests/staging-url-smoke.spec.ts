import { test, expect, Page } from '@playwright/test';

/**
 * Staging URL Smoke Tests — @prod gate
 *
 * Verifies every portal URL reachable from the Landing UI:
 * 1. Header navigation: Landing → Supplier/Retailer/Admin login
 * 2. Registration links: Supplier + Retailer show register; Admin is login-only
 * 3. Direct route smoke: /supplier/, /retailer/, /admin/ → app loads (200)
 * 4. API health: /health and /version respond 200 with JSON
 * 5. Console.error assertion on every test
 *
 * Run:
 *   $env:STAGING="true"; node .\node_modules\@playwright\test\cli.js test --grep "@prod"
 */

// =============================================================================
// Helper: console.error collector — attaches to page, asserted at end of each test
// =============================================================================
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out expected network errors from unauthenticated API calls.
      // When a portal loads without a session, API requests return 401/400/403.
      // The browser logs these as "Failed to load resource" — not a JS bug.
      if (text.startsWith('Failed to load resource:')) return;
      errors.push(text);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`UNCAUGHT: ${err.message}`);
  });
  return errors;
}

// =============================================================================
// 1. Landing → Portal Navigation (@prod)
// =============================================================================
test.describe('Landing Header Navigation @prod', { tag: '@prod' }, () => {
  test('click header Supplier → navigates to /supplier/login', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click the Supplier header link (exact href from landing HTML)
    await page.click('.nav-right a[href="/supplier/login"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/supplier/login');

    // Take evidence screenshot
    await page.screenshot({ path: 'test-results/staging-supplier-nav.png', fullPage: true });

    expect(errors, 'No console.error expected on supplier navigation').toHaveLength(0);
  });

  test('click header Retailer → navigates to /retailer/login', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.click('.nav-right a[href="/retailer/login"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/retailer/login');

    await page.screenshot({ path: 'test-results/staging-retailer-nav.png', fullPage: true });

    expect(errors, 'No console.error expected on retailer navigation').toHaveLength(0);
  });

  test('click header Admin → navigates to /admin/', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.click('.nav-right a[href="/admin/"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/admin');

    await page.screenshot({ path: 'test-results/staging-admin-nav.png', fullPage: true });

    expect(errors, 'No console.error expected on admin navigation').toHaveLength(0);
  });
});

// =============================================================================
// 2. Registration Links (@prod)
// =============================================================================
test.describe('Registration Links @prod', { tag: '@prod' }, () => {
  test('Supplier login shows registration link', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/supplier/login');
    await page.waitForLoadState('networkidle');

    // Supplier login must show a "Register" link
    const registerLink = page.locator('a[href*="/register"]');
    await expect(registerLink.first()).toBeVisible();

    await page.screenshot({ path: 'test-results/staging-supplier-register-link.png', fullPage: true });

    expect(errors, 'No console.error expected on supplier login').toHaveLength(0);
  });

  test('Retailer login shows registration link', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/retailer/login');
    await page.waitForLoadState('networkidle');

    // Retailer login must show a "Register" link
    const registerLink = page.locator('a[href*="/register"]');
    await expect(registerLink.first()).toBeVisible();

    await page.screenshot({ path: 'test-results/staging-retailer-register-link.png', fullPage: true });

    expect(errors, 'No console.error expected on retailer login').toHaveLength(0);
  });

  test('Admin login is login-only — no registration link', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/admin/');
    await page.waitForLoadState('networkidle');

    // Admin must NOT have any registration link
    const registerLinks = page.locator('a[href*="/register"]');
    await expect(registerLinks).toHaveCount(0);

    await page.screenshot({ path: 'test-results/staging-admin-no-register.png', fullPage: true });

    expect(errors, 'No console.error expected on admin login').toHaveLength(0);
  });
});

// =============================================================================
// 3. Direct Route Smoke (@prod)
// =============================================================================
test.describe('Direct Route Smoke @prod', { tag: '@prod' }, () => {
  test('GET /supplier/ → loads app (200)', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    const response = await page.goto('/supplier/');
    expect(response?.status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle');

    // Should land on a page within the supplier portal
    expect(page.url()).toContain('/supplier');

    await page.screenshot({ path: 'test-results/staging-supplier-direct.png', fullPage: true });

    expect(errors, 'No console.error on /supplier/ direct route').toHaveLength(0);
  });

  test('GET /retailer/ → loads app (200)', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    const response = await page.goto('/retailer/');
    expect(response?.status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/retailer');

    // Verify the SPA shell loaded (Vite app renders the root div)
    const rootDiv = page.locator('#root');
    await expect(rootDiv).toBeAttached();

    await page.screenshot({ path: 'test-results/staging-retailer-direct.png', fullPage: true });

    expect(errors, 'No console.error on /retailer/ direct route').toHaveLength(0);
  });

  test('GET /admin/ → loads app (200)', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    const response = await page.goto('/admin/');
    expect(response?.status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/admin');

    // Verify the SPA shell loaded
    const rootDiv = page.locator('#root');
    await expect(rootDiv).toBeAttached();

    await page.screenshot({ path: 'test-results/staging-admin-direct.png', fullPage: true });

    expect(errors, 'No console.error on /admin/ direct route').toHaveLength(0);
  });
});

// =============================================================================
// 4. API Health via Load Balancer (@prod)
// =============================================================================
test.describe('API Health @prod', { tag: '@prod' }, () => {
  test('GET /health → 200 JSON', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status');
  });

  test('GET /version → 200 JSON with sha', async ({ request }) => {
    const response = await request.get('/version');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('sha');
    expect(body).toHaveProperty('service');
  });

  test('GET /api/v1/health → 200 JSON (via LB /api/* rule)', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status');
  });
});
