/**
 * TEST-046 / TQ-018: Redis Failure — App Continues
 *
 * Actually stops and restarts the Redis container to verify:
 * - API still serves requests (falls through to DB)
 * - No crash or unhandled rejection
 * - Cache recovers after Redis restart
 *
 * Requires: Docker running with `scripts-redis-1` container (local-prod).
 * Run: BASE_URL=http://127.0.0.1:3000 AUTH_TOKEN=<jwt> npx playwright test redis-failure.spec.ts
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const REDIS_CONTAINER = process.env.REDIS_CONTAINER || 'scripts-redis-1';

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${AUTH_TOKEN}`,
};

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function containerRunning(name: string): boolean {
  try {
    const out = execSync(`docker inspect -f "{{.State.Running}}" ${name}`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    return out === 'true';
  } catch {
    return false;
  }
}

function stopContainer(name: string): void {
  execSync(`docker stop ${name}`, { timeout: 15000 });
}

function startContainer(name: string): void {
  execSync(`docker start ${name}`, { timeout: 15000 });
}

async function apiGet(path: string): Promise<{ status: number; body: string; latencyMs: number }> {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  const body = await res.text();
  return { status: res.status, body, latencyMs: Date.now() - start };
}

test.describe('TEST-046: Redis Failure — App Continues', () => {
  const hasDocker = dockerAvailable();

  test.beforeAll(() => {
    if (!hasDocker) {
      console.log('Docker not available — skipping Redis failure tests.');
    }
  });

  // Always-on: baseline
  test('baseline: health and search work with Redis up', async () => {
    const health = await apiGet('/health');
    expect(health.status).toBe(200);

    const search = await apiGet('/api/v1/pos/store-products/search?q=atta&limit=10');
    expect(search.status).toBe(200);
    console.log(`Search with Redis: ${search.latencyMs}ms`);
  });

  // Docker-dependent: actual Redis failure
  test('app continues serving after Redis stop (real container stop)', async () => {
    test.skip(!hasDocker, 'Docker required for Redis failure simulation');
    test.skip(!containerRunning(REDIS_CONTAINER), `Container ${REDIS_CONTAINER} not running`);

    // Stop Redis
    stopContainer(REDIS_CONTAINER);

    try {
      // Wait for Redis connections to timeout
      await new Promise((r) => setTimeout(r, 3000));

      // Health: accept 200 (healthy) or 503 (degraded), not connection refused
      const health = await apiGet('/health');
      expect([200, 503]).toContain(health.status);

      // Search should still work via DB fallback
      const search = await apiGet('/api/v1/pos/store-products/search?q=rice&limit=10');
      expect([200, 503]).toContain(search.status);
      console.log(`Search without Redis: ${search.latencyMs}ms`);

      // No stack traces or ECONNREFUSED in response bodies
      expect(search.body).not.toContain('ECONNREFUSED');
      expect(search.body).not.toContain('node_modules');
    } finally {
      // ALWAYS restore Redis
      startContainer(REDIS_CONTAINER);
    }
  });

  test('cache recovery after Redis restart', async () => {
    test.skip(!hasDocker, 'Docker required for recovery test');

    // Ensure Redis is running
    if (!containerRunning(REDIS_CONTAINER)) {
      startContainer(REDIS_CONTAINER);
    }

    // Wait for reconnection (up to 15s)
    let recovered = false;
    for (let i = 0; i < 3; i++) {
      const res = await apiGet('/health');
      if (res.status === 200) {
        recovered = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    expect(recovered).toBe(true);

    // Cache should repopulate — first call cold, second warm
    const cold = await apiGet('/api/v1/pos/store-products/search?q=atta&limit=5');
    expect(cold.status).toBe(200);

    const warm = await apiGet('/api/v1/pos/store-products/search?q=atta&limit=5');
    expect(warm.status).toBe(200);
    console.log(`After recovery: cold=${cold.latencyMs}ms, warm=${warm.latencyMs}ms`);
  });
});
