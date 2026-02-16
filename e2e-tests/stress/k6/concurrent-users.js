/**
 * TEST-043: 10K Concurrent Users Stress Test
 *
 * Simulates 10,000 concurrent users hitting all major endpoints.
 * Target: <10% error rate across all endpoints.
 *
 * Usage:
 *   k6 run --env BASE_URL=https://staging.supermandi.tech \
 *          --env AUTH_TOKEN=<device-jwt> \
 *          e2e-tests/stress/k6/concurrent-users.js
 *
 * Note: Requires k6 cloud or distributed execution for 10K VUs.
 * For local testing, use --vus 100 --duration 5m as a scaled-down test.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '2m', target: 100 },     // warm up
    { duration: '3m', target: 1000 },    // ramp up
    { duration: '5m', target: 5000 },    // half load
    { duration: '5m', target: 10000 },   // full load
    { duration: '5m', target: 10000 },   // sustained peak
    { duration: '3m', target: 1000 },    // cool down
    { duration: '2m', target: 0 },       // ramp down
  ],
  thresholds: {
    error_rate: ['rate<0.10'],  // <10% overall errors
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'], // p95 < 5s under extreme load
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

const QUERIES = ['atta', 'rice', 'dal', 'oil', 'sugar', 'tea', 'maggi', 'amul', 'soap'];
const BARCODES = [];
for (let i = 0; i < 1000; i++) {
  BARCODES.push(`899${String(i).padStart(10, '0')}`);
}

// Weighted random scenario selection
function pickScenario() {
  const r = Math.random();
  if (r < 0.30) return 'search';       // 30% search
  if (r < 0.55) return 'scan';         // 25% scan
  if (r < 0.70) return 'list';         // 15% product list
  if (r < 0.80) return 'bills';        // 10% bill history
  if (r < 0.88) return 'stock';        // 8% stock check
  if (r < 0.94) return 'daily';        // 6% daily summary
  if (r < 0.98) return 'notifications';// 4% notifications
  return 'health';                      // 2% health check
}

export default function () {
  const scenario = pickScenario();
  let success = false;

  switch (scenario) {
    case 'search': {
      const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
      const res = http.get(
        `${BASE_URL}/api/v1/pos/store-products/search?q=${q}&limit=20`,
        { headers, tags: { name: 'concurrent_search' } }
      );
      success = check(res, { 'search ok': (r) => r.status === 200 });
      break;
    }

    case 'scan': {
      const barcode = BARCODES[Math.floor(Math.random() * BARCODES.length)];
      const res = http.post(
        `${BASE_URL}/api/v1/pos/scan/resolve`,
        JSON.stringify({ barcode }),
        { headers, tags: { name: 'concurrent_scan' } }
      );
      success = check(res, { 'scan ok': (r) => r.status === 200 });
      break;
    }

    case 'list': {
      const res = http.get(
        `${BASE_URL}/api/v1/pos/store-products/list?limit=30`,
        { headers, tags: { name: 'concurrent_list' } }
      );
      success = check(res, { 'list ok': (r) => r.status === 200 });
      break;
    }

    case 'bills': {
      const res = http.get(
        `${BASE_URL}/api/v1/pos/bills?limit=20`,
        { headers, tags: { name: 'concurrent_bills' } }
      );
      success = check(res, { 'bills ok': (r) => r.status === 200 });
      break;
    }

    case 'stock': {
      const res = http.get(
        `${BASE_URL}/api/v1/pos/inventory/statement?limit=50`,
        { headers, tags: { name: 'concurrent_stock' } }
      );
      success = check(res, { 'stock ok': (r) => r.status === 200 });
      break;
    }

    case 'daily': {
      const res = http.get(
        `${BASE_URL}/api/v1/pos/daily-summary`,
        { headers, tags: { name: 'concurrent_daily' } }
      );
      success = check(res, { 'daily ok': (r) => r.status === 200 });
      break;
    }

    case 'notifications': {
      const res = http.get(
        `${BASE_URL}/api/v1/pos/notifications?limit=10&offset=0`,
        { headers, tags: { name: 'concurrent_notifications' } }
      );
      success = check(res, { 'notifications ok': (r) => r.status === 200 });
      break;
    }

    case 'health': {
      const res = http.get(
        `${BASE_URL}/health`,
        { tags: { name: 'concurrent_health' } }
      );
      success = check(res, { 'health ok': (r) => r.status === 200 });
      break;
    }
  }

  errorRate.add(!success);

  // Simulate user think time (0.5-3s)
  sleep(0.5 + Math.random() * 2.5);
}
