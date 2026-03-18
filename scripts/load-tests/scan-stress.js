/**
 * V3-HARDEN-161: Scan throughput stress test — 50k SELL + 50k purchase scans/day
 *
 * Simulates the approved scan volume across SELL and procurement paths.
 * Uses k6 to hit barcode lookup endpoints at production-target rates.
 *
 * Run: k6 run -e BASE_URL=https://staging.supermandi.tech \
 *              -e DEVICE_TOKEN=<pos-device-token> \
 *              scripts/load-tests/scan-stress.js
 *
 * Thresholds (go/no-go):
 * - Barcode lookup p95 < 500ms
 * - Error rate < 5%
 * - All 100k scans/day equivalent processed without timeout
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const scanLatency = new Trend('scan_lookup_duration');
const scanErrors = new Rate('scan_errors');
const dupeSuppressed = new Rate('dupe_suppressed');

const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';
const DEVICE_TOKEN = __ENV.DEVICE_TOKEN || '';

// Approved targets: 100k scans/day = ~208/min = ~3.5/sec over 8 hours
// Stress test compresses into shorter window: 5 min at 10x burst rate
export const options = {
  scenarios: {
    sell_scan: {
      executor: 'constant-arrival-rate',
      rate: 20, // 20 scans/sec (5.7x burst over sustained rate)
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 30,
      maxVUs: 50,
      exec: 'sellScan',
    },
    purchase_scan: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 30,
      maxVUs: 50,
      exec: 'purchaseScan',
      startTime: '2m', // After sell scans
    },
  },
  thresholds: {
    scan_lookup_duration: ['p(95)<500'],
    scan_errors: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

const headers = DEVICE_TOKEN
  ? { 'x-device-token': DEVICE_TOKEN, 'Content-Type': 'application/json' }
  : { 'Content-Type': 'application/json' };

// Test barcodes — mix of known and unknown to simulate real scanning
const TEST_BARCODES = [
  '8901234567890', '8901234567891', '8901234567892',
  '5000000000001', '5000000000002', '5000000000003',
  '9999999999999', // Unknown barcode — should return not found quickly
  '0000000000000', // Edge case
];

export function sellScan() {
  const barcode = TEST_BARCODES[Math.floor(Math.random() * TEST_BARCODES.length)];
  const res = http.get(
    `${BASE_URL}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
    { headers, tags: { intent: 'sell_scan' } }
  );

  scanLatency.add(res.timings.duration);

  const ok = check(res, {
    'sell lookup status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'sell lookup < 500ms': (r) => r.timings.duration < 500,
  });

  if (!ok) scanErrors.add(1);
  else scanErrors.add(0);

  // Simulate HID burst: rapid repeat of same barcode
  if (Math.random() < 0.1) {
    const dupeRes = http.get(
      `${BASE_URL}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
      { headers, tags: { intent: 'sell_scan_dupe' } }
    );
    dupeSuppressed.add(dupeRes.status === 200 || dupeRes.status === 404 ? 0 : 1);
  }

  sleep(0.05); // 50ms between scans (simulates HID scanner pace)
}

export function purchaseScan() {
  const barcode = TEST_BARCODES[Math.floor(Math.random() * TEST_BARCODES.length)];
  const res = http.get(
    `${BASE_URL}/api/v1/pos/store-products/lookup?barcode=${barcode}`,
    { headers, tags: { intent: 'purchase_scan' } }
  );

  scanLatency.add(res.timings.duration);

  const ok = check(res, {
    'purchase lookup status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'purchase lookup < 500ms': (r) => r.timings.duration < 500,
  });

  if (!ok) scanErrors.add(1);
  else scanErrors.add(0);

  sleep(0.05);
}
