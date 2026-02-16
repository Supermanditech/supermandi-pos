// TEST-001: Store Isolation Integration Test (Testcontainers)
// Verifies that store_id isolation works correctly with a real PostgreSQL database.
// This test runs against a real PostgreSQL container — no mocks.

import {
  testPool,
  TEST_IDS,
  withTestTransaction,
  createIsolatedStore,
} from './setup';

describe('Store Isolation (real DB)', () => {
  it('store_products are isolated per store_id', async () => {
    await withTestTransaction(async (client) => {
      // Create a second store
      const otherStoreId = await createIsolatedStore(client, '99');

      // Insert a product for the other store
      await client.query(`
        INSERT INTO global_products (id, global_name, category)
        VALUES ('00000000-0000-0000-0000-000000000999', 'Other Product', 'Test Category')
        ON CONFLICT (id) DO NOTHING
      `);
      await client.query(`
        INSERT INTO store_products (id, store_id, global_product_id, store_display_name, unit, sell_price_minor)
        VALUES ('00000000-0000-0000-0000-000000000999', $1, '00000000-0000-0000-0000-000000000999', 'Other Product', 'pcs', 20000)
        ON CONFLICT (id) DO NOTHING
      `, [otherStoreId]);

      // Query products for the original test store
      const result = await client.query(
        'SELECT id FROM store_products WHERE store_id = $1',
        [TEST_IDS.storeId]
      );

      // Should NOT include the other store's product
      const ids = result.rows.map((r: any) => r.id);
      expect(ids).not.toContain('00000000-0000-0000-0000-000000000999');

      // Query products for the other store
      const otherResult = await client.query(
        'SELECT id FROM store_products WHERE store_id = $1',
        [otherStoreId]
      );
      expect(otherResult.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('platform.stores exist and have correct status', async () => {
    const result = await testPool.query(
      'SELECT id, name, status FROM platform.stores WHERE id = $1',
      [TEST_IDS.storeId]
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe('Test Store');
    expect(result.rows[0].status).toBe('ACTIVE');
  });

  it('auth.users are scoped to store via actor_id', async () => {
    const result = await testPool.query(
      'SELECT id, actor_type, actor_id FROM auth.users WHERE id = $1',
      [TEST_IDS.staffUserId]
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].actor_type).toBe('store');
    expect(result.rows[0].actor_id).toBe(TEST_IDS.storeId);
  });

  it('pos_devices are scoped to store_id', async () => {
    await withTestTransaction(async (client) => {
      const otherStoreId = await createIsolatedStore(client, '88');

      // Devices for original store
      const result = await client.query(
        'SELECT id FROM pos_devices WHERE store_id = $1',
        [TEST_IDS.storeId]
      );
      expect(result.rows.length).toBeGreaterThanOrEqual(1);

      // No devices for other store (hasn't been seeded)
      const otherResult = await client.query(
        'SELECT id FROM pos_devices WHERE store_id = $1',
        [otherStoreId]
      );
      expect(otherResult.rows.length).toBe(0);
    });
  });
});

describe('Transaction Safety (real DB)', () => {
  it('withTestTransaction rolls back automatically', async () => {
    const tempId = '00000000-0000-0000-0000-0000000fff01';

    // Insert inside a test transaction (auto-rollback)
    await withTestTransaction(async (client) => {
      await client.query(`
        INSERT INTO platform.stores (id, name, code, address_line1, phone, status)
        VALUES ($1, 'Temp Store', 'TEMP01', '789 Temp St', '+919999900077', 'ACTIVE')
      `, [tempId]);

      // Verify it exists within the transaction
      const result = await client.query(
        'SELECT id FROM platform.stores WHERE id = $1',
        [tempId]
      );
      expect(result.rows.length).toBe(1);
    });

    // After withTestTransaction, the row should NOT exist (rolled back)
    const result = await testPool.query(
      'SELECT id FROM platform.stores WHERE id = $1',
      [tempId]
    );
    expect(result.rows.length).toBe(0);
  });
});

describe('Schema Integrity (real DB)', () => {
  it('all expected schemas exist', async () => {
    const result = await testPool.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name IN ('platform', 'auth', 'supplier', 'catalog', 'inventory', 'orders', 'reorder', 'payments')
      ORDER BY schema_name
    `);

    const schemas = result.rows.map((r: any) => r.schema_name);
    expect(schemas).toContain('platform');
    expect(schemas).toContain('auth');
    expect(schemas).toContain('catalog');
    expect(schemas).toContain('inventory');
    expect(schemas).toContain('orders');
  });

  it('_migrations table tracks applied migrations', async () => {
    const result = await testPool.query('SELECT COUNT(*) as count FROM _migrations');
    const count = parseInt(result.rows[0].count, 10);
    // Should have at least the core migrations (000-010)
    expect(count).toBeGreaterThan(10);
  });

  it('critical tables exist with expected columns', async () => {
    // Check platform.stores has the expected columns
    const storeColumns = await testPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'platform' AND table_name = 'stores'
      ORDER BY ordinal_position
    `);
    const colNames = storeColumns.rows.map((r: any) => r.column_name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('status');

    // Check auth.users exists
    const userColumns = await testPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
    `);
    expect(userColumns.rows.length).toBeGreaterThan(0);
  });
});
