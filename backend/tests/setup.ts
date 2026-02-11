// Test Setup - V3.0.9 compliant
// Database seeding and test utilities

import { Pool } from 'pg';

// =============================================================================
// TEST DATABASE CONNECTION
// =============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/supermandi_test';

export const testPool = new Pool({
  connectionString: TEST_DATABASE_URL,
  max: 5
});

// =============================================================================
// TEST DATA CONSTANTS
// =============================================================================

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
  supplierProductId2: '00000000-0000-0000-0000-000000000601'
} as const;

export const TEST_CREDENTIALS = {
  staffPhone: '+919999900001',
  staffPin: '1234',
  deviceFingerprint: 'test-device-fingerprint-001'
} as const;

// =============================================================================
// DATABASE SEEDING
// =============================================================================

/**
 * Best-effort seed: each INSERT is wrapped in its own SAVEPOINT so schema
 * mismatches (missing table, wrong column) don't abort the entire seed.
 * Integration tests that depend on specific seed data will fail individually.
 */
export async function seedTestDatabase(): Promise<void> {
  const client = await testPool.connect();

  try {
    await client.query('BEGIN');

    // Clean existing test data
    await cleanTestData(client);

    // Helper: run an INSERT inside a SAVEPOINT so one failure doesn't abort all
    const safeSeed = async (label: string, sql: string, params: any[]) => {
      const sp = `seed_${label}`;
      try {
        await client.query(`SAVEPOINT ${sp}`);
        await client.query(sql, params);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
      } catch (err: any) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        console.warn(`⚠ Seed "${label}" skipped: ${err.message}`);
      }
    };

    // 1. Create store (platform.stores — status must be uppercase per migration 094)
    await safeSeed('store', `
      INSERT INTO platform.stores (id, name, code, address_line1, phone, status)
      VALUES ($1, 'Test Store', 'TEST001', '123 Test St', '+919999900000', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.storeId]);

    // 2. Create staff user (auth.users — actor_type='store' requires actor_id per constraint)
    const pinHash = await hashPin(TEST_CREDENTIALS.staffPin);
    await safeSeed('user', `
      INSERT INTO auth.users (id, phone, password_hash, actor_type, actor_id, name, status)
      VALUES ($1, $2, $3, 'store', $4, 'Test Staff', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.staffUserId, TEST_CREDENTIALS.staffPhone, pinHash, TEST_IDS.storeId]);

    // 3. Assign STORE_STAFF role to user (auth.user_roles)
    await safeSeed('user_role', `
      INSERT INTO auth.user_roles (user_id, role_id, scope_type, scope_id)
      SELECT $1, r.id, 'store', $2
      FROM auth.roles r WHERE r.name = 'STORE_STAFF'
      ON CONFLICT DO NOTHING
    `, [TEST_IDS.staffUserId, TEST_IDS.storeId]);

    // 4. Create and enroll device (pos_devices — column is "label" not "device_label")
    await safeSeed('device', `
      INSERT INTO pos_devices (id, store_id, device_token, label, active, created_at)
      VALUES ($1, $2, $3, 'Test POS Device', true, NOW())
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.deviceId, TEST_IDS.storeId, TEST_CREDENTIALS.deviceFingerprint]);

    // 5. Create supplier (supplier.suppliers — gstin NOT NULL, verification_status per migration 032)
    await safeSeed('supplier', `
      INSERT INTO supplier.suppliers (id, gstin, business_name, primary_email, primary_phone, status, verification_status)
      VALUES ($1, '29AABCT1332L1ZM', 'Test Supplier', 'supplier@test.com', '+919999900002', 'active', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.supplierId]);

    // 6. Create category (catalog.fmcg_taxonomy — not catalog.categories which doesn't exist)
    await safeSeed('category', `
      INSERT INTO catalog.fmcg_taxonomy (id, label_en, icon_key, sort_order, is_active)
      VALUES ($1, 'Test Category', 'package-variant', 1, true)
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.categoryId]);

    // 7. Create global products (required FK for store_products.global_product_id)
    await safeSeed('global_products', `
      INSERT INTO global_products (id, global_name, category)
      VALUES
        ($1, 'Test Product 1', 'Test Category'),
        ($2, 'Test Product 2', 'Test Category')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.productId1, TEST_IDS.productId2]);

    // 8. Create store products (public.store_products schema per migration 104)
    await safeSeed('store_products', `
      INSERT INTO store_products (id, store_id, global_product_id, store_display_name, unit, sell_price_minor)
      VALUES
        ($1, $2, $1, 'Test Product 1', 'pcs', 10000),
        ($3, $2, $3, 'Test Product 2', 'kg', 5000)
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.productId1, TEST_IDS.storeId, TEST_IDS.productId2]);

    // 9. Create supplier products (catalog.supplier_products — for supplier catalog tests)
    await safeSeed('supplier_products', `
      INSERT INTO catalog.supplier_products (id, supplier_id, name, purchase_price, moq, supplier_sku, unit, barcode)
      VALUES
        ($1, $2, 'Test Product 1', 8000, 10, 'SKU-001', 'pcs', '8901234567890'),
        ($3, $2, 'Test Product 2', 4000, 5, 'SKU-002', 'kg', '8901234567891')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.supplierProductId1, TEST_IDS.supplierId, TEST_IDS.supplierProductId2]);

    await client.query('COMMIT');
    console.log('✓ Test database seeded (best-effort)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('✗ Failed to seed test database:', error);
    // Do NOT throw — let individual tests fail on their own terms
  } finally {
    client.release();
  }
}

/**
 * Clean test data from database.
 */
async function cleanTestData(client: any): Promise<void> {
  // Delete in reverse dependency order — deepest FK dependents first
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
    'platform.stores'
  ];

  for (const table of tables) {
    try {
      await client.query(`SAVEPOINT clean_${table.replace('.', '_')}`);
      await client.query(`DELETE FROM ${table} WHERE id::text LIKE '00000000-0000-0000-0000-%' OR store_id::text LIKE '00000000-0000-0000-0000-%'`);
      await client.query(`RELEASE SAVEPOINT clean_${table.replace('.', '_')}`);
    } catch {
      // Table might not exist or column might not exist — rollback to savepoint and continue
      await client.query(`ROLLBACK TO SAVEPOINT clean_${table.replace('.', '_')}`);
    }
  }
}

/**
 * Hash PIN for test user.
 */
async function hashPin(pin: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bcrypt = require('bcryptjs');
  return bcrypt.hash(pin, 10);
}

/**
 * Clean up after all tests.
 */
export async function teardownTestDatabase(): Promise<void> {
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    await cleanTestData(client);
    await client.query('COMMIT');
    console.log('✓ Test data cleaned up');
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

/**
 * Generate idempotency key for testing.
 */
export function generateIdempotencyKey(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Wait for async event processing.
 */
export async function waitForEvent(ms: number = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get test auth token (mock implementation for tests).
 */
export function getTestAuthHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Device-Id': TEST_IDS.deviceId,
    'X-Store-Id': TEST_IDS.storeId
  };
}

// =============================================================================
// JEST SETUP HOOKS
// =============================================================================

beforeAll(async () => {
  console.log('\n🧪 Setting up test environment...');
  await seedTestDatabase();
});

afterAll(async () => {
  console.log('\n🧹 Cleaning up test environment...');
  await teardownTestDatabase();
});
