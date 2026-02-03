import { test, expect } from '@playwright/test';
import * as fs from 'fs';

/**
 * Token Refresh Flow E2E Tests
 *
 * Tests the complete token refresh lifecycle:
 * 1. Mint a short-lived test token
 * 2. Verify token is valid
 * 3. Wait for expiry
 * 4. Refresh the token
 * 5. Verify new token works
 *
 * PREREQUISITES:
 * - Test endpoints must be enabled (NODE_ENV !== 'production')
 * - Target: /api/test/mint-token, /api/test/verify-token, /api/test/refresh-token
 */

const EVIDENCE_DIR = 'test-results/token-refresh';

interface MintResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: string;
}

interface VerifyResponse {
  valid: boolean;
  payload?: Record<string, unknown>;
  remainingSeconds?: number;
  isExpired?: boolean;
  error?: string;
}

interface RefreshResponse {
  success: boolean;
  accessToken?: string;
  expiresIn?: number;
  error?: { code: string; message: string };
}

test.describe('Token Refresh Flow', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  test('should check if test endpoints are available', async ({ request }) => {
    const response = await request.get('/api/test/config');

    if (response.status() === 404) {
      test.skip(true, 'Test endpoints not available (production mode)');
      return;
    }

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.testMode).toBe(true);

    fs.writeFileSync(
      `${EVIDENCE_DIR}/test-config.json`,
      JSON.stringify(body, null, 2)
    );
  });

  test('should mint a short-lived test token', async ({ request }) => {
    // Check if test endpoints are available
    const configResponse = await request.get('/api/test/config');
    if (configResponse.status() === 404) {
      test.skip(true, 'Test endpoints not available');
      return;
    }

    // Mint token with 30-second TTL
    const response = await request.post('/api/test/mint-token', {
      data: {
        ttl: 30,
        userId: 'e2e-test-user',
        storeId: 'e2e-test-store',
      },
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as MintResponse;
    expect(body.success).toBe(true);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.expiresIn).toBe(30);

    fs.writeFileSync(
      `${EVIDENCE_DIR}/mint-response.json`,
      JSON.stringify(body, null, 2)
    );
  });

  test('should verify a minted token', async ({ request }) => {
    // Check if test endpoints are available
    const configResponse = await request.get('/api/test/config');
    if (configResponse.status() === 404) {
      test.skip(true, 'Test endpoints not available');
      return;
    }

    // First mint a token
    const mintResponse = await request.post('/api/test/mint-token', {
      data: { ttl: 60 },
    });
    const mintBody = (await mintResponse.json()) as MintResponse;

    // Verify the token
    const verifyResponse = await request.get('/api/test/verify-token', {
      headers: {
        Authorization: `Bearer ${mintBody.accessToken}`,
      },
    });

    expect(verifyResponse.status()).toBe(200);

    const verifyBody = (await verifyResponse.json()) as VerifyResponse;
    expect(verifyBody.valid).toBe(true);
    expect(verifyBody.payload).toBeTruthy();
    expect(verifyBody.remainingSeconds).toBeGreaterThan(0);
    expect(verifyBody.isExpired).toBe(false);

    fs.writeFileSync(
      `${EVIDENCE_DIR}/verify-response.json`,
      JSON.stringify(verifyBody, null, 2)
    );
  });

  test('should detect expired token', async ({ request }) => {
    // Check if test endpoints are available
    const configResponse = await request.get('/api/test/config');
    if (configResponse.status() === 404) {
      test.skip(true, 'Test endpoints not available');
      return;
    }

    // Mint token with very short TTL (minimum 1 second)
    const mintResponse = await request.post('/api/test/mint-token', {
      data: { ttl: 1 },
    });
    const mintBody = (await mintResponse.json()) as MintResponse;

    // Wait for token to expire
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify should report expired
    const verifyResponse = await request.get('/api/test/verify-token', {
      headers: {
        Authorization: `Bearer ${mintBody.accessToken}`,
      },
    });

    expect(verifyResponse.status()).toBe(200);

    const verifyBody = (await verifyResponse.json()) as VerifyResponse;
    expect(verifyBody.valid).toBe(false);
    expect(verifyBody.error).toBe('TOKEN_EXPIRED');

    fs.writeFileSync(
      `${EVIDENCE_DIR}/expired-token-response.json`,
      JSON.stringify(verifyBody, null, 2)
    );
  });

  test('should refresh an expired access token', async ({ request }) => {
    // Check if test endpoints are available
    const configResponse = await request.get('/api/test/config');
    if (configResponse.status() === 404) {
      test.skip(true, 'Test endpoints not available');
      return;
    }

    // Mint token with short TTL
    const mintResponse = await request.post('/api/test/mint-token', {
      data: { ttl: 2 },
    });
    const mintBody = (await mintResponse.json()) as MintResponse;

    // Verify initial token is valid
    const verifyResponse1 = await request.get('/api/test/verify-token', {
      headers: {
        Authorization: `Bearer ${mintBody.accessToken}`,
      },
    });
    const verify1 = (await verifyResponse1.json()) as VerifyResponse;
    expect(verify1.valid).toBe(true);

    // Wait for access token to expire
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify original token is now expired
    const verifyResponse2 = await request.get('/api/test/verify-token', {
      headers: {
        Authorization: `Bearer ${mintBody.accessToken}`,
      },
    });
    const verify2 = (await verifyResponse2.json()) as VerifyResponse;
    expect(verify2.valid).toBe(false);

    // Refresh using the refresh token
    const refreshResponse = await request.post('/api/test/refresh-token', {
      data: {
        refreshToken: mintBody.refreshToken,
      },
    });

    expect(refreshResponse.status()).toBe(200);

    const refreshBody = (await refreshResponse.json()) as RefreshResponse;
    expect(refreshBody.success).toBe(true);
    expect(refreshBody.accessToken).toBeTruthy();

    // Verify new token is valid
    const verifyResponse3 = await request.get('/api/test/verify-token', {
      headers: {
        Authorization: `Bearer ${refreshBody.accessToken}`,
      },
    });
    const verify3 = (await verifyResponse3.json()) as VerifyResponse;
    expect(verify3.valid).toBe(true);

    fs.writeFileSync(
      `${EVIDENCE_DIR}/refresh-flow.json`,
      JSON.stringify(
        {
          initial: { mint: mintBody, verify: verify1 },
          afterExpiry: { verify: verify2 },
          afterRefresh: { refresh: refreshBody, verify: verify3 },
        },
        null,
        2
      )
    );
  });

  test('should reject invalid refresh token', async ({ request }) => {
    // Check if test endpoints are available
    const configResponse = await request.get('/api/test/config');
    if (configResponse.status() === 404) {
      test.skip(true, 'Test endpoints not available');
      return;
    }

    const refreshResponse = await request.post('/api/test/refresh-token', {
      data: {
        refreshToken: 'invalid-token',
      },
    });

    expect(refreshResponse.status()).toBe(401);

    const body = (await refreshResponse.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('full token lifecycle with browser simulation', async ({ page, request }) => {
    // Check if test endpoints are available
    const configResponse = await request.get('/api/test/config');
    if (configResponse.status() === 404) {
      test.skip(true, 'Test endpoints not available');
      return;
    }

    // This test simulates how the browser would handle token refresh

    // 1. Mint initial tokens
    const mintResponse = await request.post('/api/test/mint-token', {
      data: { ttl: 5, userId: 'browser-test', storeId: 'browser-store' },
    });
    const { accessToken, refreshToken } = (await mintResponse.json()) as MintResponse;

    // 2. Navigate to retailer login (simulating authenticated state)
    await page.goto('/retailer/login');

    // 3. Inject tokens into localStorage (simulating what the app does after login)
    await page.evaluate(
      ({ token, refresh }) => {
        localStorage.setItem('retailer_test_token', token);
        localStorage.setItem('retailer_test_refresh', refresh);
      },
      { token: accessToken, refresh: refreshToken }
    );

    // 4. Verify tokens are stored
    const storedTokens = await page.evaluate(() => ({
      token: localStorage.getItem('retailer_test_token'),
      refresh: localStorage.getItem('retailer_test_refresh'),
    }));

    expect(storedTokens.token).toBe(accessToken);
    expect(storedTokens.refresh).toBe(refreshToken);

    // 5. Wait for token expiry
    await page.waitForTimeout(6000);

    // 6. Simulate app detecting expired token and refreshing
    const newTokenResponse = await request.post('/api/test/refresh-token', {
      data: { refreshToken },
    });
    const { accessToken: newToken } = (await newTokenResponse.json()) as RefreshResponse;

    // 7. Update stored token
    await page.evaluate(
      ({ token }) => {
        localStorage.setItem('retailer_test_token', token!);
      },
      { token: newToken }
    );

    // 8. Verify new token is stored
    const newStoredToken = await page.evaluate(() =>
      localStorage.getItem('retailer_test_token')
    );
    expect(newStoredToken).toBe(newToken);

    // Take screenshot of final state
    await page.screenshot({
      path: `${EVIDENCE_DIR}/browser-simulation-final.png`,
    });

    // Cleanup
    await page.evaluate(() => {
      localStorage.removeItem('retailer_test_token');
      localStorage.removeItem('retailer_test_refresh');
    });
  });
});
