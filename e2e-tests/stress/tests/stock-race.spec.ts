/**
 * TEST-044: Multi-Device Stock Race Condition Test
 *
 * Simulates 10 POS devices in the same store attempting to sell the same
 * low-stock product simultaneously. Validates zero oversell invariant.
 *
 * Requirements:
 * - Running backend with seeded data
 * - A product with known low stock (e.g., qty=5)
 * - 10 concurrent API clients
 *
 * Usage:
 *   STAGING=true BASE_URL=https://staging.supermandi.tech \
 *     npx playwright test e2e-tests/stress/tests/stock-race.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKENS = (process.env.AUTH_TOKENS || '').split(',').filter(Boolean);

// If no auth tokens provided, generate numbered placeholder tokens
const DEVICE_COUNT = 10;
const tokens = AUTH_TOKENS.length >= DEVICE_COUNT
  ? AUTH_TOKENS.slice(0, DEVICE_COUNT)
  : Array.from({ length: DEVICE_COUNT }, (_, i) => process.env.AUTH_TOKEN || `device-token-${i}`);

interface StockResponse {
  currentQty?: number;
  quantity?: number;
  stock?: number;
}

interface SaleResponse {
  id?: string;
  saleId?: string;
  status?: string;
  error?: string;
  message?: string;
}

async function apiPost(url: string, token: string, body: object): Promise<{ status: number; data: SaleResponse }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as SaleResponse;
  return { status: res.status, data };
}

async function apiGet(url: string, token: string): Promise<{ status: number; data: StockResponse }> {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json() as StockResponse;
  return { status: res.status, data };
}

test.describe('TEST-044: Multi-Device Stock Race', () => {
  // Known test product with low stock
  const TEST_PRODUCT_ID = process.env.TEST_PRODUCT_ID || 'c0000000-0000-0000-0000-000000000001';
  const INITIAL_STOCK = 5;

  test('10 devices selling same low-stock product — zero oversell', async () => {
    const primaryToken = tokens[0];

    // Step 1: Check initial stock
    const stockBefore = await apiGet(
      `${BASE_URL}/api/v1/pos/inventory/stock/${TEST_PRODUCT_ID}`,
      primaryToken
    );
    console.log(`Initial stock: ${JSON.stringify(stockBefore.data)}`);

    // Step 2: All 10 devices attempt to buy qty=2 concurrently
    // With initial stock=5, only 2 should succeed (5/2=2.5, floor=2)
    const salePromises = tokens.map((token, i) =>
      apiPost(`${BASE_URL}/api/v1/pos/sales`, token, {
        items: [{
          productId: TEST_PRODUCT_ID,
          quantity: 2,
          priceMinor: 5000,
        }],
        totalMinor: 10000,
        paymentMode: 'CASH',
      }).then(res => ({
        device: i,
        status: res.status,
        saleId: res.data.id || res.data.saleId,
        error: res.data.error || res.data.message,
        success: res.status === 200 || res.status === 201,
      }))
    );

    const results = await Promise.all(salePromises);

    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`Succeeded: ${succeeded.length}, Failed: ${failed.length}`);
    console.log('Results:', JSON.stringify(results, null, 2));

    // Step 3: Check final stock — must be >= 0 (ZERO OVERSELL)
    const stockAfter = await apiGet(
      `${BASE_URL}/api/v1/pos/inventory/stock/${TEST_PRODUCT_ID}`,
      primaryToken
    );
    const finalQty = stockAfter.data.currentQty ?? stockAfter.data.quantity ?? stockAfter.data.stock ?? 0;

    console.log(`Final stock: ${finalQty}`);

    // INVARIANT: Stock must never go below zero
    expect(finalQty).toBeGreaterThanOrEqual(0);

    // INVARIANT: Total sold quantity must not exceed initial stock
    const totalSold = succeeded.length * 2;
    const initialQty = stockBefore.data.currentQty ?? stockBefore.data.quantity ?? stockBefore.data.stock ?? INITIAL_STOCK;
    expect(totalSold).toBeLessThanOrEqual(initialQty);

    // Confirm sales to finalize stock deductions
    for (const sale of succeeded) {
      if (sale.saleId) {
        await apiPost(
          `${BASE_URL}/api/v1/pos/sales/${sale.saleId}/confirm`,
          tokens[sale.device],
          {}
        );
      }
    }

    // Final verification after confirms
    const stockFinal = await apiGet(
      `${BASE_URL}/api/v1/pos/inventory/stock/${TEST_PRODUCT_ID}`,
      primaryToken
    );
    const confirmedQty = stockFinal.data.currentQty ?? stockFinal.data.quantity ?? stockFinal.data.stock ?? 0;
    console.log(`Stock after confirms: ${confirmedQty}`);
    expect(confirmedQty).toBeGreaterThanOrEqual(0);
  });

  test('rapid sequential sales drain stock correctly', async () => {
    const token = tokens[0];

    // Sell 1 unit at a time, 20 rapid requests
    const results: Array<{ attempt: number; success: boolean; status: number }> = [];

    for (let i = 0; i < 20; i++) {
      const res = await apiPost(`${BASE_URL}/api/v1/pos/sales`, token, {
        items: [{
          productId: TEST_PRODUCT_ID,
          quantity: 1,
          priceMinor: 3000,
        }],
        totalMinor: 3000,
        paymentMode: 'CASH',
      });

      results.push({
        attempt: i,
        success: res.status === 200 || res.status === 201,
        status: res.status,
      });
    }

    const succeeded = results.filter(r => r.success);
    console.log(`Sequential: ${succeeded.length}/20 succeeded`);

    // Stock check
    const finalStock = await apiGet(
      `${BASE_URL}/api/v1/pos/inventory/stock/${TEST_PRODUCT_ID}`,
      token
    );
    const qty = finalStock.data.currentQty ?? finalStock.data.quantity ?? finalStock.data.stock ?? 0;
    expect(qty).toBeGreaterThanOrEqual(0);
  });
});
