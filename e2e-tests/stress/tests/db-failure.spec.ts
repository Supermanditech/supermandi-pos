/**
 * TEST-045 / TQ-018: Database Failure — Graceful Degradation
 *
 * Actually stops and restarts the PostgreSQL container to verify:
 * - API returns 5xx (not crash/hang) when DB is down
 * - Connection pool recovers after DB restart
 * - No stack traces leaked to client
 *
 * Requires: Docker running with `scripts-postgres-1` container (local-prod).
 * Run: BASE_URL=http://127.0.0.1:3000 AUTH_TOKEN=<jwt> npx playwright test db-failure.spec.ts
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const POSTGRES_CONTAINER = process.env.POSTGRES_CONTAINER || 'scripts-postgres-1';

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

async function apiGet(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  const body = await res.text();
  return { status: res.status, body };
}

async function apiPost(path: string, data: object): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function waitForHealth(maxAttempts = 12, intervalMs = 5000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await apiGet('/health');
      if (res.status === 200) return true;
    } catch {
      // connection refused — DB still down
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

test.describe('TEST-045: DB Failure Graceful Degradation', () => {
  const hasDocker = dockerAvailable();

  test.beforeAll(() => {
    if (!hasDocker) {
      console.log('Docker not available — skipping DB failure tests.');
    }
  });

  // Always-on: verify baseline without Docker
  test('health endpoint returns OK when DB is up', async () => {
    const res = await apiGet('/health');
    expect(res.status).toBe(200);
  });

  test('API operations work before failure', async () => {
    const search = await apiGet('/api/v1/pos/store-products/search?q=atta&limit=5');
    expect(search.status).toBe(200);
  });

  // Docker-dependent: actual failure simulation
  test('API returns 5xx during DB outage (real container stop)', async () => {
    test.skip(!hasDocker, 'Docker required for DB failure simulation');
    test.skip(!containerRunning(POSTGRES_CONTAINER), `Container ${POSTGRES_CONTAINER} not running`);

    // Stop PostgreSQL
    stopContainer(POSTGRES_CONTAINER);

    try {
      // Wait a moment for connections to fail
      await new Promise((r) => setTimeout(r, 3000));

      // API should return error status, not hang or crash
      const search = await apiGet('/api/v1/pos/store-products/search?q=atta&limit=5');
      expect([500, 502, 503]).toContain(search.status);

      // Sale creation should fail gracefully
      const sale = await apiPost('/api/v1/pos/sales', {
        items: [{ productId: 'c0000000-0000-0000-0000-000000000001', quantity: 1, priceMinor: 5000 }],
        totalMinor: 5000,
        paymentMode: 'CASH',
      });
      expect([500, 502, 503]).toContain(sale.status);

      // No stack traces in response
      expect(sale.body).not.toContain('at Object.');
      expect(sale.body).not.toContain('node_modules');
    } finally {
      // ALWAYS restore DB — even if test fails
      startContainer(POSTGRES_CONTAINER);
    }
  });

  test('API recovers after DB restart', async () => {
    test.skip(!hasDocker, 'Docker required for recovery test');

    // Ensure container is running (may have been restarted by previous test)
    if (!containerRunning(POSTGRES_CONTAINER)) {
      startContainer(POSTGRES_CONTAINER);
    }

    // Wait for connection pool recovery (up to 60s)
    const recovered = await waitForHealth();
    expect(recovered).toBe(true);

    // Operations should work again
    const search = await apiGet('/api/v1/pos/store-products/search?q=rice&limit=5');
    expect(search.status).toBe(200);
  });
});
