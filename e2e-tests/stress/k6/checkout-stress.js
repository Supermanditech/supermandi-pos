/**
 * TEST-042: Checkout Stress Test
 *
 * Simulates 500 checkouts/min (sale creation + confirmation).
 * Target: p95 < 3s for full checkout flow.
 *
 * Usage:
 *   k6 run --env BASE_URL=https://staging.supermandi.tech \
 *          --env AUTH_TOKEN=<device-jwt> \
 *          e2e-tests/stress/k6/checkout-stress.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const checkoutFailRate = new Rate('checkout_fail_rate');
const checkoutDuration = new Trend('checkout_duration_ms');
const salesCreated = new Counter('sales_created');

export const options = {
  // 500/min = ~8.3/sec → 50 VUs with ~6s per iteration
  stages: [
    { duration: '1m', target: 20 },    // warm up
    { duration: '3m', target: 50 },    // ramp to target
    { duration: '5m', target: 50 },    // sustained 500/min
    { duration: '2m', target: 80 },    // peak burst
    { duration: '1m', target: 0 },     // ramp down
  ],
  thresholds: {
    checkout_duration_ms: ['p(95)<3000'], // p95 < 3s
    checkout_fail_rate: ['rate<0.05'],    // <5% failure
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

// Pre-built product IDs (first 1000 from seeder)
function randomProductId() {
  // Using deterministic UUIDs is not possible; use barcode-based scan instead
  return `899${String(Math.floor(Math.random() * 100000)).padStart(10, '0')}`;
}

export default function () {
  const startTime = Date.now();
  let saleId = null;

  group('full_checkout', () => {
    // Step 1: Scan products (1-4 items)
    const itemCount = Math.floor(Math.random() * 4) + 1;
    const items = [];

    for (let i = 0; i < itemCount; i++) {
      const barcode = randomProductId();
      const scanRes = http.post(
        `${BASE_URL}/api/v1/pos/scan/resolve`,
        JSON.stringify({ barcode }),
        { headers, tags: { name: 'checkout_scan' } }
      );

      if (scanRes.status === 200) {
        try {
          const body = JSON.parse(scanRes.body);
          const product = body.product || body.data;
          if (product) {
            items.push({
              productId: product.id || product.productId,
              quantity: Math.floor(Math.random() * 3) + 1,
              priceMinor: product.priceMinor || product.mrpMinor || 5000,
            });
          }
        } catch {
          // scan result parse error
        }
      }
    }

    if (items.length === 0) {
      // Fallback: create sale with synthetic data
      items.push({
        productId: 'c0000000-0000-0000-0000-000000000001',
        quantity: 1,
        priceMinor: 5000,
      });
    }

    // Step 2: Create sale (PENDING)
    const totalMinor = items.reduce((sum, i) => sum + i.quantity * i.priceMinor, 0);
    const salePayload = JSON.stringify({
      items: items.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        priceMinor: i.priceMinor,
      })),
      totalMinor,
      paymentMode: ['CASH', 'UPI', 'DUE'][Math.floor(Math.random() * 3)],
    });

    const createRes = http.post(
      `${BASE_URL}/api/v1/pos/sales`,
      salePayload,
      { headers, tags: { name: 'checkout_create' } }
    );

    check(createRes, {
      'sale created': (r) => r.status === 200 || r.status === 201,
    });

    if (createRes.status === 200 || createRes.status === 201) {
      try {
        const body = JSON.parse(createRes.body);
        saleId = body.id || body.saleId || (body.data && body.data.id);
      } catch {
        // parse error
      }
    }

    // Step 3: Confirm sale
    if (saleId) {
      const confirmRes = http.post(
        `${BASE_URL}/api/v1/pos/sales/${saleId}/confirm`,
        '{}',
        { headers, tags: { name: 'checkout_confirm' } }
      );

      const confirmed = check(confirmRes, {
        'sale confirmed': (r) => r.status === 200,
      });

      if (confirmed) salesCreated.add(1);
    }
  });

  const elapsed = Date.now() - startTime;
  checkoutDuration.add(elapsed);
  checkoutFailRate.add(saleId === null);

  // Brief pause between checkouts
  sleep(0.5 + Math.random() * 1);
}
