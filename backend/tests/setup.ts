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
 * Seed test database with required data.
 */
export async function seedTestDatabase(): Promise<void> {
  const client = await testPool.connect();

  try {
    await client.query('BEGIN');

    // Clean existing test data
    await cleanTestData(client);

    // 1. Create platform
    await client.query(`
      INSERT INTO platforms (id, name, slug, settings, status)
      VALUES ($1, 'Test Platform', 'test-platform', '{}', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.platformId]);

    // 2. Create store
    await client.query(`
      INSERT INTO stores (id, platform_id, name, code, address, phone, settings, status)
      VALUES ($1, $2, 'Test Store', 'TEST001', '123 Test St', '+919999900000', '{}', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.storeId, TEST_IDS.platformId]);

    // 3. Create staff user
    const hashedPin = await hashPin(TEST_CREDENTIALS.staffPin);
    await client.query(`
      INSERT INTO users (id, platform_id, phone, pin_hash, name, role, status)
      VALUES ($1, $2, $3, $4, 'Test Staff', 'staff', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.staffUserId, TEST_IDS.platformId, TEST_CREDENTIALS.staffPhone, hashedPin]);

    // 4. Link staff to store
    await client.query(`
      INSERT INTO store_staff (store_id, user_id, role, is_active)
      VALUES ($1, $2, 'cashier', true)
      ON CONFLICT (store_id, user_id) DO NOTHING
    `, [TEST_IDS.storeId, TEST_IDS.staffUserId]);

    // 5. Create and enroll device
    await client.query(`
      INSERT INTO devices (id, store_id, fingerprint, name, status, enrolled_at)
      VALUES ($1, $2, $3, 'Test POS Device', 'active', NOW())
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.deviceId, TEST_IDS.storeId, TEST_CREDENTIALS.deviceFingerprint]);

    // 6. Create supplier
    await client.query(`
      INSERT INTO suppliers (id, platform_id, name, code, phone, email, status)
      VALUES ($1, $2, 'Test Supplier', 'SUP001', '+919999900002', 'supplier@test.com', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.supplierId, TEST_IDS.platformId]);

    // 7. Link supplier to store
    await client.query(`
      INSERT INTO supplier_store_links (supplier_id, store_id, min_order_value, lead_days, is_active)
      VALUES ($1, $2, 500, 2, true)
      ON CONFLICT (supplier_id, store_id) DO NOTHING
    `, [TEST_IDS.supplierId, TEST_IDS.storeId]);

    // 8. Create category
    await client.query(`
      INSERT INTO categories (id, platform_id, name, slug, sort_order, is_active)
      VALUES ($1, $2, 'Test Category', 'test-category', 1, true)
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.categoryId, TEST_IDS.platformId]);

    // 9. Create products
    await client.query(`
      INSERT INTO products (id, platform_id, category_id, name, barcode, unit, mrp, status)
      VALUES
        ($1, $2, $3, 'Test Product 1', '8901234567890', 'pcs', 100.00, 'active'),
        ($4, $2, $3, 'Test Product 2', '8901234567891', 'kg', 50.00, 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.productId1, TEST_IDS.platformId, TEST_IDS.categoryId, TEST_IDS.productId2]);

    // 10. Create supplier products
    await client.query(`
      INSERT INTO supplier_products (id, supplier_id, product_id, sku, unit_price, moq, is_available)
      VALUES
        ($1, $2, $3, 'SKU001', 80.00, 10, true),
        ($4, $2, $5, 'SKU002', 40.00, 5, true)
      ON CONFLICT (id) DO NOTHING
    `, [
      TEST_IDS.supplierProductId1, TEST_IDS.supplierId, TEST_IDS.productId1,
      TEST_IDS.supplierProductId2, TEST_IDS.productId2
    ]);

    // 11. Initialize inventory
    await client.query(`
      INSERT INTO inventory (store_id, product_id, quantity, reserved_quantity, version)
      VALUES
        ($1, $2, 100, 0, 1),
        ($1, $3, 50, 0, 1)
      ON CONFLICT (store_id, product_id) DO NOTHING
    `, [TEST_IDS.storeId, TEST_IDS.productId1, TEST_IDS.productId2]);

    // 12. Create reorder settings
    await client.query(`
      INSERT INTO reorder_settings (store_id, reorder_enabled, require_approval, auto_approve_threshold, default_lead_days)
      VALUES ($1, true, true, 10000, 2)
      ON CONFLICT (store_id) DO NOTHING
    `, [TEST_IDS.storeId]);

    await client.query('COMMIT');
    console.log('✓ Test database seeded successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('✗ Failed to seed test database:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean test data from database.
 */
async function cleanTestData(client: any): Promise<void> {
  // Delete in reverse dependency order
  const tables = [
    'inventory_ledger',
    'inventory',
    'grn_items',
    'grns',
    'purchase_order_items',
    'purchase_orders',
    'pending_reorders',
    'reorder_policies',
    'reorder_settings',
    'supplier_products',
    'supplier_store_links',
    'suppliers',
    'products',
    'categories',
    'outbox_events',
    'devices',
    'store_staff',
    'stores',
    'users',
    'platforms'
  ];

  for (const table of tables) {
    try {
      await client.query(`DELETE FROM ${table} WHERE id LIKE '00000000-0000-0000-0000-%' OR store_id LIKE '00000000-0000-0000-0000-%' OR platform_id LIKE '00000000-0000-0000-0000-%'`);
    } catch {
      // Table might not exist or column might not exist, continue
    }
  }
}

/**
 * Hash PIN for test user.
 */
async function hashPin(pin: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(pin, 10);
}

/**
 * Clean up after all tests.
 */
export async function teardownTestDatabase(): Promise<void> {
  const client = await testPool.connect();
  try {
    await cleanTestData(client);
    console.log('✓ Test data cleaned up');
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
