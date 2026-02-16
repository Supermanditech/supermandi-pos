// TEST-001: Testcontainers Test Setup
// This replaces the default setup.ts when running with containers.
// Reads the connection URL written by globalSetup and seeds the database.

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const STATE_FILE = path.join(__dirname, '.container-state.json');

// Read container state (written by globalSetup)
function getConnectionUri(): string {
  // Prefer env var (set by globalSetup for forked workers)
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  // Fallback: read from state file
  if (fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    return state.connectionUri;
  }

  throw new Error('No testcontainer state found. Did globalSetup run?');
}

// =============================================================================
// EXPORTS (re-export compatible interface with original setup.ts)
// =============================================================================

const connectionUri = getConnectionUri();

export const testPool = new Pool({
  connectionString: connectionUri,
  max: 5,
  connectionTimeoutMillis: 5000,
});

export const TEST_IDS = {
  platformId: '00000000-0000-0000-0000-000000000001',
  storeId: '00000000-0000-0000-0000-000000000010',
  staffUserId: '00000000-0000-0000-0000-000000000100',
  deviceId: '00000000-0000-0000-0000-000000000200',
  supplierId: '00000000-0000-0000-0000-000000000300',
  categoryId: '00000000-0000-0000-0000-000000000400',
  productId1: '00000000-0000-0000-0000-000000000500',
  productId2: '00000000-0000-0000-0000-000000000501',
  supplierProductId1: '00000000-0000-0000-0000-000000000600',
  supplierProductId2: '00000000-0000-0000-0000-000000000601',
} as const;

export const TEST_CREDENTIALS = {
  staffPhone: '+919999900001',
  staffPin: '1234',
  deviceFingerprint: 'test-device-fingerprint-001',
} as const;

// =============================================================================
// DATABASE SEEDING (same as original setup.ts)
// =============================================================================

async function hashPin(pin: string): Promise<string> {
  const bcrypt = require('bcryptjs');
  return bcrypt.hash(pin, 10);
}

async function cleanTestData(client: any): Promise<void> {
  const tables = [
    'inventory.inventory_ledger',
    'store_products',
    'global_products',
    'catalog.supplier_products',
    'catalog.fmcg_taxonomy',
    'auth.user_roles',
    'auth.refresh_tokens',
    'pos_devices',
    'auth.users',
    'supplier.suppliers',
    'platform.stores',
  ];

  for (const table of tables) {
    const sp = `clean_${table.replace('.', '_')}`;
    try {
      await client.query(`SAVEPOINT ${sp}`);
      await client.query(
        `DELETE FROM ${table} WHERE id::text LIKE '00000000-0000-0000-0000-%' OR store_id::text LIKE '00000000-0000-0000-0000-%'`
      );
      await client.query(`RELEASE SAVEPOINT ${sp}`);
    } catch {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    }
  }
}

export async function seedTestDatabase(): Promise<void> {
  const client = await testPool.connect();

  try {
    await client.query('BEGIN');
    await cleanTestData(client);

    const safeSeed = async (label: string, sql: string, params: any[]) => {
      const sp = `seed_${label}`;
      try {
        await client.query(`SAVEPOINT ${sp}`);
        await client.query(sql, params);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
      } catch (err: any) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        console.warn(`  ⚠ Seed "${label}" skipped: ${err.message}`);
      }
    };

    await safeSeed('store', `
      INSERT INTO platform.stores (id, name, code, address_line1, phone, status)
      VALUES ($1, 'Test Store', 'TEST001', '123 Test St', '+919999900000', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.storeId]);

    const pinHash = await hashPin(TEST_CREDENTIALS.staffPin);
    await safeSeed('user', `
      INSERT INTO auth.users (id, phone, password_hash, actor_type, actor_id, name, status)
      VALUES ($1, $2, $3, 'store', $4, 'Test Staff', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.staffUserId, TEST_CREDENTIALS.staffPhone, pinHash, TEST_IDS.storeId]);

    await safeSeed('user_role', `
      INSERT INTO auth.user_roles (user_id, role_id, scope_type, scope_id)
      SELECT $1, r.id, 'store', $2
      FROM auth.roles r WHERE r.name = 'STORE_STAFF'
      ON CONFLICT DO NOTHING
    `, [TEST_IDS.staffUserId, TEST_IDS.storeId]);

    await safeSeed('device', `
      INSERT INTO pos_devices (id, store_id, device_token, label, active, created_at)
      VALUES ($1, $2, $3, 'Test POS Device', true, NOW())
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.deviceId, TEST_IDS.storeId, TEST_CREDENTIALS.deviceFingerprint]);

    await safeSeed('supplier', `
      INSERT INTO supplier.suppliers (id, gstin, business_name, primary_email, primary_phone, status, verification_status)
      VALUES ($1, '29AABCT1332L1ZM', 'Test Supplier', 'supplier@test.com', '+919999900002', 'active', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.supplierId]);

    await safeSeed('category', `
      INSERT INTO catalog.fmcg_taxonomy (id, label_en, icon_key, sort_order, is_active)
      VALUES ($1, 'Test Category', 'package-variant', 1, true)
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.categoryId]);

    await safeSeed('global_products', `
      INSERT INTO global_products (id, global_name, category)
      VALUES ($1, 'Test Product 1', 'Test Category'), ($2, 'Test Product 2', 'Test Category')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.productId1, TEST_IDS.productId2]);

    await safeSeed('store_products', `
      INSERT INTO store_products (id, store_id, global_product_id, store_display_name, unit, sell_price_minor)
      VALUES ($1, $2, $1, 'Test Product 1', 'pcs', 10000), ($3, $2, $3, 'Test Product 2', 'kg', 5000)
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.productId1, TEST_IDS.storeId, TEST_IDS.productId2]);

    await safeSeed('supplier_products', `
      INSERT INTO catalog.supplier_products (id, supplier_id, name, purchase_price, moq, supplier_sku, unit, barcode)
      VALUES ($1, $2, 'Test Product 1', 8000, 10, 'SKU-001', 'pcs', '8901234567890'),
             ($3, $2, 'Test Product 2', 4000, 5, 'SKU-002', 'kg', '8901234567891')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.supplierProductId1, TEST_IDS.supplierId, TEST_IDS.supplierProductId2]);

    await client.query('COMMIT');
    console.log('  ✓ Test database seeded (testcontainer)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('  ✗ Failed to seed test database:', error);
  } finally {
    client.release();
  }
}

export async function teardownTestDatabase(): Promise<void> {
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    await cleanTestData(client);
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
    await testPool.end();
  }
}

// =============================================================================
// TEST HELPERS
// =============================================================================

export function generateIdempotencyKey(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function waitForEvent(ms: number = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getTestAuthHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Device-Id': TEST_IDS.deviceId,
    'X-Store-Id': TEST_IDS.storeId,
  };
}

/**
 * Create an isolated test transaction that auto-rolls back.
 * Useful for tests that modify data without polluting other tests.
 */
export async function withTestTransaction<T>(
  fn: (client: any) => Promise<T>
): Promise<T> {
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('ROLLBACK'); // Always rollback — test isolation
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Create a second test store for store-isolation testing.
 * Returns the store ID. Cleaned up automatically via test data prefix.
 */
export async function createIsolatedStore(
  client: any,
  suffix: string = '99'
): Promise<string> {
  const storeId = `00000000-0000-0000-0000-0000000000${suffix}`;
  await client.query(`
    INSERT INTO platform.stores (id, name, code, address_line1, phone, status)
    VALUES ($1, $2, $3, '456 Other St', '+919999900099', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `, [storeId, `Isolated Store ${suffix}`, `ISO${suffix}`]);
  return storeId;
}

// =============================================================================
// JEST HOOKS
// =============================================================================

beforeAll(async () => {
  console.log('\n🧪 Testcontainer setup: seeding database...');
  await seedTestDatabase();
});

afterAll(async () => {
  console.log('\n🧹 Testcontainer teardown...');
  await teardownTestDatabase();
});
