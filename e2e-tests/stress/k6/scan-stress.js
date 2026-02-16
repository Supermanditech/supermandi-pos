/**
 * TEST-040: Scan Stress Test
 *
 * Simulates sustained barcode scanning at 35 scans/min for 30 minutes.
 * Target: p95 < 200ms response time.
 *
 * Usage:
 *   k6 run --env BASE_URL=https://staging.supermandi.tech \
 *          --env AUTH_TOKEN=<device-jwt> \
 *          e2e-tests/stress/k6/scan-stress.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const scanFailRate = new Rate('scan_fail_rate');
const scanDuration = new Trend('scan_duration_ms');

export const options = {
  // 35 scans/min = ~0.58/sec → 1 VU with ~1.7s think time
  // Use 5 VUs for realistic multi-device simulation
  stages: [
    { duration: '1m', target: 5 },   // ramp up
    { duration: '28m', target: 5 },  // sustained load
    { duration: '1m', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // p95 < 200ms
    scan_fail_rate: ['rate<0.01'],     // <1% failure
    scan_duration_ms: ['p(95)<200'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// Pre-generate 10K barcodes for variety
const BARCODES = [];
for (let i = 0; i < 10000; i++) {
  BARCODES.push(`899${String(i).padStart(10, '0')}`);
}

export default function () {
  const barcode = BARCODES[Math.floor(Math.random() * BARCODES.length)];

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    tags: { name: 'scan_resolve' },
  };

  const payload = JSON.stringify({ barcode });

  const res = http.post(`${BASE_URL}/api/v1/pos/scan/resolve`, payload, params);

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'has product data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.product !== undefined || body.data !== undefined;
      } catch {
        return false;
      }
    },
  });

  scanFailRate.add(!ok);
  scanDuration.add(res.timings.duration);

  // ~35 scans/min per VU = sleep ~1.7s between scans
  // With 5 VUs → ~175 scans/min total (5x per-device rate)
  sleep(1.7 + Math.random() * 0.6);
}
