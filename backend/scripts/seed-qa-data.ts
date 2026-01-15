#!/usr/bin/env npx ts-node
/**
 * Seed QA Data Script - DEV-068
 *
 * Creates demo data for QA/testing purposes.
 * HARD BLOCKED IN PRODUCTION.
 *
 * Usage:
 *   cd backend
 *   npx ts-node scripts/seed-qa-data.ts --confirm
 *
 * Required:
 *   - NODE_ENV must be 'development', 'staging', 'test', or 'local'
 *   - Must pass --confirm flag
 */

import { assertNotProductionWithConfirm } from '../src/middleware/devOnly.js';
import { query, getClient } from '@supermandi/common';
import { isDemoStoreCode, DEMO_PREFIXES } from '../src/services/storeCodeService.js';

// =============================================================================
// GUARD: BLOCK PRODUCTION
// =============================================================================

const confirmed = process.argv.includes('--confirm');
assertNotProductionWithConfirm('seed-qa-data', confirmed);

// =============================================================================
// SEED DATA
// =============================================================================

const DEMO_STORES = [
  {
    code: 'QA001',
    name: 'QA Demo Store - North',
    address: '123 Test Street, Demo City',
    phone: '+911234567890',
    status: 'active',
  },
  {
    code: 'QA002',
    name: 'QA Demo Store - South',
    address: '456 Sample Avenue, Test Town',
    phone: '+911234567891',
    status: 'active',
  },
];

const DEMO_PRODUCTS = [
  { name: 'QA Test Product 1', barcode: 'QA0000000001', price: 10000 },
  { name: 'QA Test Product 2', barcode: 'QA0000000002', price: 25000 },
  { name: 'QA Test Product 3', barcode: 'QA0000000003', price: 5000 },
];

// =============================================================================
// MAIN
// =============================================================================

async function seedQAData() {
  console.log('\n=== QA Data Seed Script ===\n');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('');

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check if QA data already exists
    const existingStores = await client.query(
      "SELECT id FROM platform.stores WHERE code LIKE 'QA%'"
    );

    if (existingStores.rows.length > 0) {
      console.log('QA data already exists. Skipping seed.');
      console.log(`Found ${existingStores.rows.length} QA stores.`);
      await client.query('ROLLBACK');
      return;
    }

    // Create demo stores
    console.log('Creating demo stores...');
    const storeIds: string[] = [];

    for (const store of DEMO_STORES) {
      // STORECODE-004: Verify store code is a demo prefix
      if (!isDemoStoreCode(store.code)) {
        throw new Error(
          `[BLOCKED] Store code "${store.code}" is not a demo store. ` +
          `Demo stores must use prefixes: ${DEMO_PREFIXES.join(', ')}`
        );
      }

      const result = await client.query(
        `INSERT INTO platform.stores (code, name, address, phone, status, settings)
         VALUES ($1, $2, $3, $4, $5, '{}')
         RETURNING id`,
        [store.code, store.name, store.address, store.phone, store.status]
      );
      storeIds.push(result.rows[0].id);
      console.log(`  Created store: ${store.name} (${store.code})`);
    }

    // Create enrollment codes for each store
    console.log('\nCreating enrollment codes...');

    for (let i = 0; i < storeIds.length; i++) {
      const code = `QA${String(i + 1).padStart(4, '0')}`;
      await client.query(
        `INSERT INTO platform.device_enrollments (store_id, code, expires_at, label)
         VALUES ($1, $2, NOW() + INTERVAL '30 days', $3)`,
        [storeIds[i], code, `QA Enrollment ${i + 1}`]
      );
      console.log(`  Created enrollment: ${code} for store ${DEMO_STORES[i].code}`);
    }

    // Create demo products
    console.log('\nCreating demo products...');

    for (const product of DEMO_PRODUCTS) {
      await client.query(
        `INSERT INTO catalog.global_products (name, barcode, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (barcode) DO NOTHING`,
        [product.name, product.barcode]
      );
      console.log(`  Created product: ${product.name}`);
    }

    await client.query('COMMIT');

    console.log('\n=== QA Data Seed Complete ===');
    console.log(`Created ${DEMO_STORES.length} stores`);
    console.log(`Created ${DEMO_STORES.length} enrollment codes`);
    console.log(`Created ${DEMO_PRODUCTS.length} products`);
    console.log('\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n[ERROR] Seed failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Run
seedQAData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
