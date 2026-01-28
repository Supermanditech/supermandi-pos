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

    // 1. Create store (platform.stores - no separate platforms table in v3)
    await client.query(`
      INSERT INTO platform.stores (id, name, code, address_line1, phone, status)
      VALUES ($1, 'Test Store', 'TEST001', '123 Test St', '+919999900000', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.storeId]);

    // 2. Create and enroll device (pos_devices table)
    await client.query(`
      INSERT INTO pos_devices (id, store_id, device_token, device_label, active, created_at)
      VALUES ($1, $2, $3, 'Test POS Device', true, NOW())
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.deviceId, TEST_IDS.storeId, TEST_CREDENTIALS.deviceFingerprint]);

    // 3. Create supplier (supplier.suppliers table)
    await client.query(`
      INSERT INTO supplier.suppliers (id, business_name, primary_email, primary_phone, status)
      VALUES ($1, 'Test Supplier', 'supplier@test.com', '+919999900002', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.supplierId]);

    // 4. Create category (catalog.categories)
    await client.query(`
      INSERT INTO catalog.categories (id, name, slug, sort_order, status)
      VALUES ($1, 'Test Category', 'test-category', 1, 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.categoryId]);

    // 5. Create store products (store_products table)
    await client.query(`
      INSERT INTO store_products (id, store_id, name, barcode, category_id, unit, mrp, status)
      VALUES
        ($1, $2, 'Test Product 1', '8901234567890', $3, 'pcs', 100.00, 'active'),
        ($4, $2, 'Test Product 2', '8901234567891', $3, 'kg', 50.00, 'active')
      ON CONFLICT (id) DO NOTHING
    `, [TEST_IDS.productId1, TEST_IDS.storeId, TEST_IDS.categoryId, TEST_IDS.productId2]);

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
  // Delete in reverse dependency order - using actual schema tables
  const tables = [
    'inventory.inventory_ledger',
    'store_products',
    'catalog.categories',
    'pos_devices',
    'supplier.suppliers',
    'platform.stores'
  ];

  for (const table of tables) {
    try {
      await client.query(`DELETE FROM ${table} WHERE id::text LIKE '00000000-0000-0000-0000-%' OR store_id::text LIKE '00000000-0000-0000-0000-%'`);
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
