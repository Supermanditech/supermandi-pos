/**
 * TEST-041: Search Stress Test
 *
 * Searches across 100K product database with varied query patterns.
 * Target: p95 < 200ms response time.
 *
 * Usage:
 *   k6 run --env BASE_URL=https://staging.supermandi.tech \
 *          --env AUTH_TOKEN=<device-jwt> \
 *          e2e-tests/stress/k6/search-stress.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const searchFailRate = new Rate('search_fail_rate');
const searchDuration = new Trend('search_duration_ms');

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // ramp up
    { duration: '5m', target: 10 },    // sustained
    { duration: '2m', target: 30 },    // peak
    { duration: '2m', target: 10 },    // cool down
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    search_fail_rate: ['rate<0.02'],
    search_duration_ms: ['p(95)<200', 'p(99)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// Realistic search queries for Indian grocery store
const QUERIES = [
  'atta', 'rice', 'dal', 'oil', 'sugar', 'tea', 'coffee',
  'soap', 'shampoo', 'toothpaste', 'biscuit', 'namkeen',
  'maggi', 'amul', 'tata', 'fortune', 'aashirvaad',
  'parle g', 'britannia', 'haldiram', 'surf excel',
  'ghee', 'milk', 'curd', 'paneer', 'butter',
  'chips', 'kurkure', 'lays', 'pepsi', 'coca cola',
  'dettol', 'vim', 'harpic', 'colgate', 'clinic',
  // Partial / typo queries (trigram search)
  'aash', 'fort', 'bri', 'mag', 'par',
  'ric', 'sug', 'mil', 'ghe', 'dal',
  // Barcode-like numbers
  '8991234', '8995678', '8990001',
];

export default function () {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];

  const params = {
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    tags: { name: 'product_search' },
  };

  const res = http.get(
    `${BASE_URL}/api/v1/pos/store-products/search?q=${encodeURIComponent(q)}&limit=30`,
    params
  );

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data || body);
      } catch {
        return false;
      }
    },
  });

  searchFailRate.add(!ok);
  searchDuration.add(res.timings.duration);

  // Simulate user typing/browsing: 1-3s between searches
  sleep(1 + Math.random() * 2);
}
