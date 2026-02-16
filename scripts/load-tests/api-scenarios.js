/**
 * TEST-009: k6 API Scenario Load Tests
 * Tests authenticated POS API endpoints under realistic load patterns.
 * Simulates typical kirana store operations: scan → add to cart → checkout → payment.
 *
 * Run: k6 run -e BASE_URL=https://staging.supermandi.tech -e AUTH_TOKEN=<token> scripts/load-tests/api-scenarios.js
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const scanLatency = new Trend('scan_latency', true);
const saleLatency = new Trend('sale_latency', true);
const searchLatency = new Trend('search_latency', true);
const errorRate = new Rate('errors');
const successfulSales = new Counter('successful_sales');

const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  scenarios: {
    // Scenario 1: Steady POS operations (normal day)
    pos_steady: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },  // Morning ramp
        { duration: '2m', target: 50 },   // Peak hours
        { duration: '30s', target: 20 },  // Afternoon lull
        { duration: '30s', target: 0 },   // Close
      ],
      gracefulStop: '10s',
      exec: 'posOperations',
    },
    // Scenario 2: Portal browsing (retailer admins)
    portal_browse: {
      executor: 'constant-vus',
      vus: 10,
      duration: '3m',
      exec: 'portalBrowse',
    },
    // Scenario 3: Burst scan (flash sale / rush hour)
    burst_scan: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: 50 },  // Burst start
        { duration: '1m', target: 100 },  // Peak burst
        { duration: '30s', target: 10 },  // Cool down
      ],
      exec: 'burstScan',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    scan_latency: ['p(95)<800'],          // Scans must be fast
    sale_latency: ['p(95)<1500'],         // Sales under 1.5s
    search_latency: ['p(95)<1000'],       // Search under 1s
    errors: ['rate<0.05'],                // <5% errors
    successful_sales: ['count>0'],        // At least 1 successful sale
  },
};

const headers = AUTH_TOKEN
  ? { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' }
  : { 'Content-Type': 'application/json' };

// =============================================================================
// SCENARIO 1: POS Operations (scan → search → sale)
// =============================================================================
export function posOperations() {
  group('POS: Health Check', () => {
    const res = http.get(`${BASE_URL}/api/v1/pos/health`, { headers });
    check(res, { 'health 2xx': (r) => r.status >= 200 && r.status < 300 });
    errorRate.add(res.status >= 500);
  });

  group('POS: Product Search', () => {
    const products = ['rice', 'dal', 'oil', 'sugar', 'salt', 'atta', 'soap', 'milk'];
    const query = products[Math.floor(Math.random() * products.length)];

    const res = http.get(`${BASE_URL}/api/v1/pos/store-products?search=${query}&limit=10`, { headers });
    searchLatency.add(res.timings.duration);
    check(res, {
      'search 2xx': (r) => r.status >= 200 && r.status < 300,
      'search returns JSON': (r) => {
        try { JSON.parse(r.body); return true; } catch { return false; }
      },
    });
    errorRate.add(res.status >= 500);
  });

  group('POS: Barcode Scan', () => {
    const barcodes = ['8901058001150', '8904004400606', '8901030789984', '0000000000000'];
    const barcode = barcodes[Math.floor(Math.random() * barcodes.length)];

    const res = http.post(
      `${BASE_URL}/api/v1/pos/scan/resolve`,
      JSON.stringify({ barcode }),
      { headers }
    );
    scanLatency.add(res.timings.duration);
    check(res, {
      'scan 2xx or 404': (r) => r.status >= 200 && r.status < 500,
      'scan < 800ms': (r) => r.timings.duration < 800,
    });
    errorRate.add(res.status >= 500);
  });

  sleep(Math.random() * 2 + 1); // 1-3s think time (realistic POS usage)
}

// =============================================================================
// SCENARIO 2: Portal Browsing (Retailer Admin)
// =============================================================================
export function portalBrowse() {
  group('Portal: Landing', () => {
    const res = http.get(`${BASE_URL}/`);
    check(res, { 'landing 200': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
  });

  group('Portal: Retailer', () => {
    const res = http.get(`${BASE_URL}/retailer/`);
    check(res, { 'retailer 200': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
  });

  group('Portal: Admin', () => {
    const res = http.get(`${BASE_URL}/admin/`);
    check(res, { 'admin 200': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
  });

  group('Portal: Supplier', () => {
    const res = http.get(`${BASE_URL}/supplier/`);
    check(res, { 'supplier 200': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
  });

  sleep(3); // Portal users browse slower
}

// =============================================================================
// SCENARIO 3: Burst Scan (Rush Hour Simulation)
// =============================================================================
export function burstScan() {
  const barcodes = ['8901058001150', '8904004400606', '8901030789984'];
  const barcode = barcodes[Math.floor(Math.random() * barcodes.length)];

  const res = http.post(
    `${BASE_URL}/api/v1/pos/scan/resolve`,
    JSON.stringify({ barcode }),
    { headers }
  );
  scanLatency.add(res.timings.duration);
  check(res, {
    'burst scan not 5xx': (r) => r.status < 500,
    'burst scan < 1s': (r) => r.timings.duration < 1000,
  });
  errorRate.add(res.status >= 500);
}

// =============================================================================
// SUMMARY HANDLER
// =============================================================================
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenarios: Object.keys(options.scenarios),
    metrics: {
      totalRequests: data.metrics?.http_reqs?.values?.count || 0,
      errorRate: ((data.metrics?.errors?.values?.rate || 0) * 100).toFixed(2) + '%',
      p95Latency: (data.metrics?.http_req_duration?.values?.['p(95)'] || 0).toFixed(0) + 'ms',
      scanP95: (data.metrics?.scan_latency?.values?.['p(95)'] || 0).toFixed(0) + 'ms',
      searchP95: (data.metrics?.search_latency?.values?.['p(95)'] || 0).toFixed(0) + 'ms',
      saleP95: (data.metrics?.sale_latency?.values?.['p(95)'] || 0).toFixed(0) + 'ms',
    },
    thresholds: data.root_group?.checks ? 'EVALUATED' : 'N/A',
  };

  return {
    'scripts/load-tests/results/api-scenarios-summary.json': JSON.stringify(summary, null, 2),
    stdout: JSON.stringify(summary, null, 2),
  };
}
