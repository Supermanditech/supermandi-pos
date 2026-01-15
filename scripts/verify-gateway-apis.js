#!/usr/bin/env node
/**
 * Gateway API Verification Script
 * Tests all POS app API endpoints against the gateway
 *
 * Usage:
 *   node verify-gateway-apis.js [gateway-url] [device-token]
 *
 * Environment:
 *   GATEWAY_URL  - Gateway base URL (default: http://localhost:3000)
 *   DEVICE_TOKEN - Device token header (default: tok_glt4vk4ermcmke1x6jj)
 *   STORE_ID     - Store ID (auto-detected from ui-status if not set)
 */

const https = require('https');
const http = require('http');

// =============================================================================
// Configuration
// =============================================================================

const GATEWAY_URL = process.argv[2] || process.env.GATEWAY_URL || 'http://localhost:3000';
const DEVICE_TOKEN = process.argv[3] || process.env.DEVICE_TOKEN || 'tok_glt4vk4ermcmke1x6jj';
let STORE_ID = process.env.STORE_ID || '';

// =============================================================================
// Helpers
// =============================================================================

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

let passed = 0;
let failed = 0;
let skipped = 0;

function log(type, msg) {
  const prefix = {
    pass: `${colors.green}[PASS]${colors.reset}`,
    fail: `${colors.red}[FAIL]${colors.reset}`,
    skip: `${colors.yellow}[SKIP]${colors.reset}`,
    info: `${colors.blue}[INFO]${colors.reset}`,
    header: `${colors.blue}---${colors.reset}`
  };
  console.log(`${prefix[type] || ''} ${msg}`);
}

function parseUrl(urlString) {
  const url = new URL(urlString);
  return {
    protocol: url.protocol === 'https:' ? https : http,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search
  };
}

async function request(method, path, body = null) {
  const url = GATEWAY_URL + path;
  const parsed = parseUrl(url);

  const options = {
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.path,
    method: method,
    headers: {
      'x-device-token': DEVICE_TOKEN,
      'Content-Type': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = parsed.protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          // Not JSON
        }
        resolve({
          status: res.statusCode,
          data: json,
          raw: data
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function testEndpoint(name, method, path, expectedStatus = 200) {
  try {
    const res = await request(method, path);

    if (res.status === expectedStatus) {
      log('pass', `${name} (HTTP ${res.status})`);
      passed++;
      return res;
    } else {
      log('fail', `${name} (HTTP ${res.status}, expected ${expectedStatus})`);
      if (res.data) {
        console.log(`       Response: ${JSON.stringify(res.data).substring(0, 150)}...`);
      }
      failed++;
      return null;
    }
  } catch (err) {
    log('fail', `${name} (Error: ${err.message})`);
    failed++;
    return null;
  }
}

// =============================================================================
// Test Suites
// =============================================================================

async function testCoreApis() {
  log('header', 'Phase 1: Core POS APIs ---');

  // UI Status
  const uiStatus = await testEndpoint('UI Status', 'GET', '/api/v1/pos/ui-status');
  if (uiStatus?.data?.storeId && !STORE_ID) {
    STORE_ID = uiStatus.data.storeId;
    log('info', `Extracted Store ID: ${STORE_ID}`);
  }

  // Bills
  await testEndpoint('List Bills', 'GET', '/api/v1/pos/bills');
}

async function testCatalogApis() {
  log('header', 'Phase 2: Catalog APIs ---');

  if (!STORE_ID) {
    log('skip', 'Catalog APIs (no store ID)');
    skipped += 3;
    return;
  }

  await testEndpoint('Catalog List', 'GET', `/api/v1/catalog/stores/${STORE_ID}/catalog`);
  await testEndpoint('Catalog Categories', 'GET', `/api/v1/catalog/stores/${STORE_ID}/catalog/categories`);
  await testEndpoint('Catalog Search', 'GET', `/api/v1/catalog/stores/${STORE_ID}/catalog?q=test`);
}

async function testOrdersApis() {
  log('header', 'Phase 3: Orders APIs ---');

  if (!STORE_ID) {
    log('skip', 'Orders APIs (no store ID)');
    skipped += 2;
    return;
  }

  await testEndpoint('Orders List', 'GET', `/api/v1/orders/stores/${STORE_ID}/orders`);
  await testEndpoint('Orders Filtered', 'GET', `/api/v1/orders/stores/${STORE_ID}/orders?status=submitted,confirmed`);
}

async function testReorderApis() {
  log('header', 'Phase 4: Reorder APIs ---');

  if (!STORE_ID) {
    log('skip', 'Reorder APIs (no store ID)');
    skipped += 3;
    return;
  }

  await testEndpoint('Reorder Pending', 'GET', `/api/v1/reorder/stores/${STORE_ID}/reorder/pending`);
  await testEndpoint('Reorder Settings', 'GET', `/api/v1/reorder/stores/${STORE_ID}/settings`);
  await testEndpoint('Reorder Policies', 'GET', `/api/v1/reorder/stores/${STORE_ID}/policies`);
}

async function testInventoryApis() {
  log('header', 'Phase 5: Inventory APIs ---');

  if (!STORE_ID) {
    log('skip', 'Inventory APIs (no store ID)');
    skipped += 2;
    return;
  }

  await testEndpoint('Stock Balances', 'GET', `/api/v1/inventory/stores/${STORE_ID}/inventory`);
  await testEndpoint('Recent Activity', 'GET', `/api/v1/inventory/stores/${STORE_ID}/inventory/recent`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('========================================');
  console.log('Gateway API Verification');
  console.log('========================================');
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Device Token: ${DEVICE_TOKEN}`);
  console.log('');

  try {
    await testCoreApis();
    console.log('');
    await testCatalogApis();
    console.log('');
    await testOrdersApis();
    console.log('');
    await testReorderApis();
    console.log('');
    await testInventoryApis();
  } catch (err) {
    console.error(`\nFatal error: ${err.message}`);
    process.exit(2);
  }

  // Summary
  console.log('');
  console.log('========================================');
  console.log('Summary');
  console.log('========================================');
  console.log(`${colors.green}Passed:${colors.reset} ${passed}`);
  console.log(`${colors.red}Failed:${colors.reset} ${failed}`);
  console.log(`${colors.yellow}Skipped:${colors.reset} ${skipped}`);

  const total = passed + failed;
  if (total > 0) {
    const percent = Math.round((passed / total) * 100);
    console.log(`\nSuccess Rate: ${percent}%`);
  }

  if (failed > 0) {
    console.log(`\n${colors.red}Some tests failed. Check the output above.${colors.reset}`);
    process.exit(1);
  }

  console.log(`\n${colors.green}All tests passed!${colors.reset}`);
  process.exit(0);
}

main();
