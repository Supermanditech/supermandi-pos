import { defineConfig, devices } from '@playwright/test';

/**
 * SuperMandi E2E Test Configuration
 *
 * Features:
 * - Screenshot capture on every page
 * - Console log collection
 * - Network trace (HAR) recording
 * - Multi-browser support
 * - Evidence output for go-live verification
 *
 * Test Suites (use --grep flag):
 * - @prod     : Production smoke tests - MUST pass 100% for go-live
 * - @testonly : Tests requiring test-only endpoints (skipped in production)
 * - @admin    : Admin portal tests (separate from retailer/supplier scope)
 *
 * Usage:
 *   npx playwright test --grep @prod          # Production gate (must be 0 failures)
 *   npx playwright test --grep @testonly      # Test-only endpoint tests
 *   npx playwright test --grep @admin         # Admin portal tests
 *   npx playwright test                       # All tests
 */

const BASE_URL = process.env.BASE_URL || 'https://supermandi.tech';

// Environment flag for test-only endpoints
export const TEST_ENDPOINTS_ENABLED = process.env.TEST_ENDPOINTS_ENABLED === 'true';

export default defineConfig({
  testDir: './tests',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for all tests
    baseURL: BASE_URL,

    // Capture screenshot on failure and success for evidence
    screenshot: 'on',

    // Capture trace on failure for debugging
    trace: 'on-first-retry',

    // Capture video on failure
    video: 'on-first-retry',

    // Collect console logs
    browserName: 'chromium',

    // Timeout for actions
    actionTimeout: 10000,

    // Navigation timeout
    navigationTimeout: 30000,
  },

  // Global timeout
  timeout: 60000,

  // Output directory for test artifacts
  outputDir: 'test-results',

  // Projects for cross-browser testing
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Web server configuration (optional - for local testing)
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  // },
});
