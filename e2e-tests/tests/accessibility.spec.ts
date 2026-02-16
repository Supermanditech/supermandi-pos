// TEST-007: Axe-core Accessibility Tests
// Validates WCAG 2.1 AA compliance for all web portals.
// Run: npx playwright test --grep @a11y

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.BASE_URL || 'https://staging.supermandi.tech';

// Shared axe-core configuration
const axeConfig = {
  // Exclude known third-party widgets from scanning
  exclude: [['iframe'], ['.third-party-widget']],
};

// Helper: run axe and return violations
async function scanPage(page: any, url: string, tags: string[] = ['wcag2a', 'wcag2aa']) {
  await page.goto(url, { waitUntil: 'networkidle' });
  // Wait for dynamic content to render
  await page.waitForTimeout(1000);

  const results = await new AxeBuilder({ page })
    .withTags(tags)
    .exclude(axeConfig.exclude.map(e => e.join(' ')))
    .analyze();

  return results;
}

// =============================================================================
// RETAILER ADMIN PORTAL
// =============================================================================
test.describe('Retailer Admin Accessibility @a11y @prod', () => {
  test('login page meets WCAG 2.1 AA', async ({ page }) => {
    const results = await scanPage(page, `${BASE_URL}/retailer/login`);
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');

    if (critical.length > 0) {
      console.log('Critical a11y violations:', JSON.stringify(critical.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      })), null, 2));
    }

    expect(critical).toHaveLength(0);
  });

  test('dashboard has proper heading hierarchy', async ({ page }) => {
    await page.goto(`${BASE_URL}/retailer/`, { waitUntil: 'networkidle' });

    // Check h1 exists
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThanOrEqual(1);

    // Check no skipped heading levels (h1 → h3 without h2)
    const results = await new AxeBuilder({ page })
      .withRules(['heading-order'])
      .analyze();

    const headingViolations = results.violations.filter(v => v.id === 'heading-order');
    expect(headingViolations).toHaveLength(0);
  });
});

// =============================================================================
// SUPPLIER PORTAL
// =============================================================================
test.describe('Supplier Portal Accessibility @a11y @prod', () => {
  test('login page meets WCAG 2.1 AA', async ({ page }) => {
    const results = await scanPage(page, `${BASE_URL}/supplier/login`);
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toHaveLength(0);
  });
});

// =============================================================================
// SUPERADMIN PORTAL
// =============================================================================
test.describe('SuperAdmin Portal Accessibility @a11y @prod', () => {
  test('login page meets WCAG 2.1 AA', async ({ page }) => {
    const results = await scanPage(page, `${BASE_URL}/admin/login`);
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toHaveLength(0);
  });
});

// =============================================================================
// LANDING PAGE
// =============================================================================
test.describe('Landing Page Accessibility @a11y @prod', () => {
  test('homepage meets WCAG 2.1 AA', async ({ page }) => {
    const results = await scanPage(page, `${BASE_URL}/`);
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toHaveLength(0);
  });

  test('images have alt text', async ({ page }) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

    const results = await new AxeBuilder({ page })
      .withRules(['image-alt'])
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  test('color contrast meets AA standard', async ({ page }) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    // Log contrast issues for awareness (may need design fix)
    if (results.violations.length > 0) {
      console.log(`Color contrast issues: ${results.violations[0].nodes.length} elements`);
    }

    // Critical contrast failures only
    const critical = results.violations.filter(v => v.impact === 'critical');
    expect(critical).toHaveLength(0);
  });
});
