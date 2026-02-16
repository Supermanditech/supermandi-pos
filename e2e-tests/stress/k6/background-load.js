/**
 * TEST-049 (helper): Background Load Generator
 *
 * Runs continuous background traffic while Playwright E2E tests execute.
 * This script generates realistic API traffic to simulate production conditions.
 *
 * Usage:
 *   k6 run --env BASE_URL=https://staging.supermandi.tech \
 *          --env AUTH_TOKEN=<device-jwt> \
 *          --duration 15m \
 *          e2e-tests/stress/k6/background-load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const bgErrorRate = new Rate('bg_error_rate');

export const options = {
  // Moderate sustained load: 20 VUs generating ~200 req/min
  stages: [
    { duration: '30s', target: 10 },
    { duration: '14m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    bg_error_rate: ['rate<0.15'],  // Allow 15% under load (not primary SUT)
    http_req_duration: ['p(99)<10000'], // p99 < 10s
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

const QUERIES = ['atta', 'rice', 'dal', 'oil', 'sugar', 'tea', 'soap', 'maggi'];
const BARCODES = [];
for (let i = 0; i < 500; i++) {
  BARCODES.push(`899${String(i).padStart(10, '0')}`);
}

export default function () {
  const actions = [
    // Search (40%)
    () => {
      const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
      return http.get(`${BASE_URL}/api/v1/pos/store-products/search?q=${q}&limit=20`, { headers });
    },
    // Scan (30%)
    () => {
      const bc = BARCODES[Math.floor(Math.random() * BARCODES.length)];
      return http.post(`${BASE_URL}/api/v1/pos/scan/resolve`, JSON.stringify({ barcode: bc }), { headers });
    },
    // Bill list (15%)
    () => http.get(`${BASE_URL}/api/v1/pos/bills?limit=10`, { headers }),
    // Daily summary (10%)
    () => http.get(`${BASE_URL}/api/v1/pos/daily-summary`, { headers }),
    // Health (5%)
    () => http.get(`${BASE_URL}/health`),
  ];

  // Weighted selection
  const r = Math.random();
  let action;
  if (r < 0.40) action = actions[0];
  else if (r < 0.70) action = actions[1];
  else if (r < 0.85) action = actions[2];
  else if (r < 0.95) action = actions[3];
  else action = actions[4];

  const res = action();
  const ok = check(res, { 'bg request ok': (r) => r.status === 200 });
  bgErrorRate.add(!ok);

  sleep(0.5 + Math.random() * 2);
}
