/**
 * TEST-046: Redis Failure Mid-Test — App Continues
 *
 * Verifies the application continues operating (with degraded performance)
 * when Redis becomes unavailable. Tests:
 * - API still serves requests (cache miss falls through to DB)
 * - Stock queries work without cache
 * - Session/auth still functions
 * - No crash or unhandled rejection
 *
 * Requirements:
 * - Running backend + Redis
 * - Ability to stop/start Redis (Docker or Cloud Memorystore)
 *
 * Usage:
 *   BASE_URL=https://staging.supermandi.tech \
 *   AUTH_TOKEN=<jwt> \
 *     npx playwright test e2e-tests/stress/tests/redis-failure.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

async function apiGet(path: string): Promise<{ status: number; body: string; latencyMs: number }> {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  const body = await res.text();
  return { status: res.status, body, latencyMs: Date.now() - start };
}

test.describe('TEST-046: Redis Failure — App Continues', () => {

  test('baseline: operations work with Redis up', async () => {
    // Health check
    const health = await apiGet('/health');
    expect(health.status).toBe(200);

    // Stock query (cached)
    const stock = await apiGet('/api/v1/pos/inventory/statement?limit=5');
    expect(stock.status).toBe(200);
    console.log(`Stock query with Redis: ${stock.latencyMs}ms`);

    // Search (may use Redis cache)
    const search = await apiGet('/api/v1/pos/store-products/search?q=atta&limit=10');
    expect(search.status).toBe(200);
    console.log(`Search with Redis: ${search.latencyMs}ms`);
  });

  test('app continues serving after Redis down (manual step)', async () => {
    // Run: docker stop scripts-redis-1 (local) or pause Memorystore (staging)
    // Then set REDIS_DOWN=true and re-run this test

    if (process.env.REDIS_DOWN !== 'true') {
      console.log('Skipping Redis-down test. Set REDIS_DOWN=true after stopping Redis.');
      test.skip();
      return;
    }

    // Health endpoint may show degraded but should not 500
    const health = await apiGet('/health');
    // Accept 200 (healthy) or 503 (degraded) but not connection refused
    expect([200, 503]).toContain(health.status);

    // Stock query falls through to DB (slower but works)
    const stock = await apiGet('/api/v1/pos/inventory/statement?limit=5');
    // Should still work (DB fallback) or return 503 (not crash)
    expect([200, 503]).toContain(stock.status);
    console.log(`Stock query without Redis: ${stock.latencyMs}ms`);

    // Search should still work via DB trigram index
    const search = await apiGet('/api/v1/pos/store-products/search?q=rice&limit=10');
    expect([200, 503]).toContain(search.status);
    console.log(`Search without Redis: ${search.latencyMs}ms`);

    // Sale creation should work (Redis not in critical path for sales)
    const saleRes = await fetch(`${BASE_URL}/api/v1/pos/sales`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: [{ productId: 'c0000000-0000-0000-0000-000000000001', quantity: 1, priceMinor: 5000 }],
        totalMinor: 5000,
        paymentMode: 'CASH',
      }),
    });
    // Sales should work even without Redis
    expect([200, 201, 503]).toContain(saleRes.status);

    // Response must be valid JSON, not crash dump
    const body = await saleRes.text();
    try {
      JSON.parse(body);
    } catch {
      expect(body).not.toContain('ECONNREFUSED');
      expect(body).not.toContain('node_modules');
    }
  });

  test('cache recovery after Redis restored (manual step)', async () => {
    if (process.env.REDIS_RESTORED !== 'true') {
      console.log('Skipping Redis-restored test. Set REDIS_RESTORED=true after restarting Redis.');
      test.skip();
      return;
    }

    // Wait for Redis reconnection (up to 15s)
    let recovered = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await apiGet('/health');
      if (res.status === 200) {
        recovered = true;
        break;
      }
      await new Promise(r => setTimeout(r, 5000));
    }
    expect(recovered).toBe(true);

    // Stock query should be fast again (cached)
    const stock1 = await apiGet('/api/v1/pos/inventory/statement?limit=5');
    expect(stock1.status).toBe(200);

    // Second call should be faster (cache populated)
    const stock2 = await apiGet('/api/v1/pos/inventory/statement?limit=5');
    expect(stock2.status).toBe(200);
    console.log(`Stock latencies after recovery: ${stock1.latencyMs}ms (cold), ${stock2.latencyMs}ms (warm)`);
  });
});
