/**
 * k6 Load Test — Baseline Performance
 * Tests API endpoints under normal load (50 concurrent users)
 *
 * Install: https://k6.io/docs/get-started/installation/
 * Run: k6 run scripts/load-tests/baseline.js
 * Run against staging: k6 run -e BASE_URL=https://staging.supermandi.tech scripts/load-tests/baseline.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const healthLatency = new Trend('health_latency');

const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up
    { duration: '1m', target: 50 },   // Steady state
    { duration: '30s', target: 100 }, // Peak load
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // p95 < 2s
    errors: ['rate<0.05'],             // <5% error rate
    health_latency: ['p(95)<500'],     // Health check < 500ms
  },
};

// Health check endpoint
export default function () {
  // 1. Health check
  const healthRes = http.get(`${BASE_URL}/api/v1/pos/health`);
  healthLatency.add(healthRes.timings.duration);
  check(healthRes, {
    'health status 2xx': (r) => r.status >= 200 && r.status < 300,
    'health response time < 500ms': (r) => r.timings.duration < 500,
  });
  errorRate.add(healthRes.status >= 500);

  // 2. Landing page
  const landingRes = http.get(`${BASE_URL}/`);
  check(landingRes, {
    'landing 200': (r) => r.status === 200,
    'landing < 2s': (r) => r.timings.duration < 2000,
  });
  errorRate.add(landingRes.status >= 500);

  // 3. Retailer portal
  const retailerRes = http.get(`${BASE_URL}/retailer/`);
  check(retailerRes, {
    'retailer 200': (r) => r.status === 200,
    'retailer contains root div': (r) => r.body && r.body.includes('<div id="root">'),
  });
  errorRate.add(retailerRes.status >= 500);

  // 4. Supplier portal
  const supplierRes = http.get(`${BASE_URL}/supplier/`);
  check(supplierRes, {
    'supplier 200': (r) => r.status === 200,
  });
  errorRate.add(supplierRes.status >= 500);

  // 5. Admin portal
  const adminRes = http.get(`${BASE_URL}/admin/`);
  check(adminRes, {
    'admin 200': (r) => r.status === 200,
    'admin contains root div': (r) => r.body && r.body.includes('<div id="root">'),
  });
  errorRate.add(adminRes.status >= 500);

  sleep(1);
}

export function handleSummary(data) {
  return {
    'scripts/load-tests/results/baseline-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}

function textSummary(data, opts) {
  const { metrics } = data;
  const lines = [
    '=== k6 Load Test Summary ===',
    `Total requests: ${metrics.http_reqs?.values?.count || 0}`,
    `Error rate: ${((metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `p95 latency: ${(metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(0)}ms`,
    `Health p95: ${(metrics.health_latency?.values?.['p(95)'] || 0).toFixed(0)}ms`,
  ];
  return lines.join('\n');
}
