/**
 * k6 Stress Test — 10K Store Readiness
 * Simulates 200+ concurrent users hitting authenticated endpoints
 *
 * Run: k6 run -e BASE_URL=https://staging.supermandi.tech -e AUTH_TOKEN=<token> scripts/load-tests/stress.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const BASE_URL = __ENV.BASE_URL || 'https://staging.supermandi.tech';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 200 },
    { duration: '3m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    errors: ['rate<0.10'],
  },
};

const headers = AUTH_TOKEN
  ? { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' }
  : { 'Content-Type': 'application/json' };

export default function () {
  // Authenticated API calls
  const endpoints = [
    '/api/v1/pos/health',
    '/api/v1/pos/config',
  ];

  endpoints.forEach((ep) => {
    const res = http.get(`${BASE_URL}${ep}`, { headers });
    check(res, {
      [`${ep} not 5xx`]: (r) => r.status < 500,
      [`${ep} < 3s`]: (r) => r.timings.duration < 3000,
    });
    errorRate.add(res.status >= 500);
  });

  sleep(0.5);
}
