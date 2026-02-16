/**
 * TEST-048: Payment Stress Test
 *
 * Simulates 100 UPI QR generations per minute + status polling.
 * Tests payment throughput under sustained load.
 *
 * Usage:
 *   k6 run --env BASE_URL=https://staging.supermandi.tech \
 *          --env AUTH_TOKEN=<device-jwt> \
 *          e2e-tests/stress/k6/payment-stress.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const paymentFailRate = new Rate('payment_fail_rate');
const qrGenDuration = new Trend('qr_gen_duration_ms');
const statusPollDuration = new Trend('status_poll_duration_ms');
const paymentsInitiated = new Counter('payments_initiated');

export const options = {
  // 100/min = ~1.67/sec → 10 VUs with ~6s per iteration
  stages: [
    { duration: '30s', target: 5 },    // warm up
    { duration: '5m', target: 10 },    // sustained 100/min
    { duration: '2m', target: 20 },    // peak burst (200/min)
    { duration: '1m', target: 5 },     // cool down
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    payment_fail_rate: ['rate<0.05'],
    qr_gen_duration_ms: ['p(95)<2000'],
    status_poll_duration_ms: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

export default function () {
  let paymentId = null;
  let success = false;

  group('upi_payment_flow', () => {
    // Step 1: Generate UPI QR / payment intent
    const amountMinor = (Math.floor(Math.random() * 500) + 10) * 100; // ₹10-510
    const genPayload = JSON.stringify({
      amountMinor,
      saleId: `stress-sale-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    });

    const genRes = http.post(
      `${BASE_URL}/api/v1/pos/payments/upi/generate`,
      genPayload,
      { headers, tags: { name: 'payment_qr_gen' } }
    );

    qrGenDuration.add(genRes.timings.duration);

    const created = check(genRes, {
      'QR generated': (r) => r.status === 200 || r.status === 201,
    });

    if (created) {
      paymentsInitiated.add(1);
      try {
        const body = JSON.parse(genRes.body);
        paymentId = body.paymentId || body.id || (body.data && body.data.paymentId);
      } catch {
        // parse error
      }
    }

    // Step 2: Poll payment status (3 polls, simulating real-world polling)
    if (paymentId) {
      for (let poll = 0; poll < 3; poll++) {
        sleep(1); // 1s between polls

        const statusRes = http.get(
          `${BASE_URL}/api/v1/pos/payments/upi/${paymentId}/status`,
          { headers, tags: { name: 'payment_status_poll' } }
        );

        statusPollDuration.add(statusRes.timings.duration);

        check(statusRes, {
          'status poll ok': (r) => r.status === 200,
        });
      }
      success = true;
    }

    // Step 3: Test cash payment fallback
    const cashPayload = JSON.stringify({
      saleId: `stress-cash-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      amountMinor: amountMinor,
    });

    const cashRes = http.post(
      `${BASE_URL}/api/v1/pos/payments/cash`,
      cashPayload,
      { headers, tags: { name: 'payment_cash' } }
    );

    check(cashRes, {
      'cash payment ok': (r) => r.status === 200 || r.status === 201,
    });

    // Step 4: Test split payment
    const splitPayload = JSON.stringify({
      saleId: `stress-split-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      payments: [
        { mode: 'CASH', amountMinor: Math.floor(amountMinor / 2) },
        { mode: 'UPI', amountMinor: amountMinor - Math.floor(amountMinor / 2) },
      ],
    });

    const splitRes = http.post(
      `${BASE_URL}/api/v1/pos/payments/split`,
      splitPayload,
      { headers, tags: { name: 'payment_split' } }
    );

    check(splitRes, {
      'split payment ok': (r) => r.status === 200 || r.status === 201,
    });
  });

  paymentFailRate.add(!success);
  sleep(0.5 + Math.random() * 1);
}
