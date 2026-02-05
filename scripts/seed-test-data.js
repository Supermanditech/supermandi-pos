// Seed test data for local production testing
// Run: docker cp scripts/seed-test-data.js scripts-main-backend-1:/tmp/ && docker exec scripts-main-backend-1 node /tmp/seed-test-data.js

const bcryptjs = require('bcryptjs');
const { Pool } = require('pg');

async function seed() {
  const hash = bcryptjs.hashSync('020789', 12);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/supermandi' });

  try {
    // 1. Create test retailer user (phone: 9999999999, pass: 020789)
    await pool.query(
      `INSERT INTO auth.users (id, phone, password_hash, actor_type, actor_id, name, status)
       VALUES ($1, $2, $3, 'store', $4, 'Test Retailer', 'active')
       ON CONFLICT (id) DO UPDATE SET password_hash = $3`,
      ['b0000000-0000-0000-0000-000000000099', '+919999999999', hash, 'a0000000-0000-0000-0000-000000000001']
    );
    console.log('[1/6] Test retailer user created');

    // 2. Link to DEMO001 store
    await pool.query(
      `INSERT INTO auth.store_users (id, store_id, user_id, role, is_owner, is_active, created_by)
       VALUES ($1, $2, $3, 'owner', true, true, $3)
       ON CONFLICT (id) DO NOTHING`,
      ['c0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000099']
    );
    console.log('[2/6] Store user link created');

    // 3. Update supplier with password
    const sup = await pool.query(
      `UPDATE supplier.suppliers SET password_hash = $1, primary_phone = '+919999999999' WHERE primary_email = 'supplier@demo.in'`,
      [hash]
    );
    console.log('[3/6] Supplier password set:', sup.rowCount, 'updated');

    // 4. Seed global_products from catalog
    const gp = await pool.query(
      `INSERT INTO global_products (id, global_name, created_at, updated_at)
       SELECT p.id::text, p.name, NOW(), NOW() FROM catalog.products p
       ON CONFLICT (id) DO NOTHING`
    );
    console.log('[4/6] Global products seeded:', gp.rowCount, 'inserted');

    // 5. Seed store_inventory
    const si = await pool.query(
      `INSERT INTO store_inventory (store_id, global_product_id, available_qty, updated_at)
       SELECT sp.store_id::text, sp.product_id::text, COALESCE(sp.current_stock, 100), NOW()
       FROM catalog.store_products sp
       WHERE sp.store_id = 'a0000000-0000-0000-0000-000000000001'
       ON CONFLICT DO NOTHING`
    );
    console.log('[5/6] Store inventory seeded:', si.rowCount, 'inserted');

    // 6. Seed stock_balances
    const sb = await pool.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, updated_at)
       SELECT sp.store_id, sp.product_id, COALESCE(sp.current_stock, 100), NOW()
       FROM catalog.store_products sp
       WHERE sp.store_id = 'a0000000-0000-0000-0000-000000000001'
       ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = EXCLUDED.current_qty`
    );
    console.log('[6/6] Stock balances seeded:', sb.rowCount, 'upserted');

    console.log('\nAll test data seeded successfully.');
    console.log('  Retailer: phone=9999999999 pass=020789 store=DEMO001');
    console.log('  Supplier: email=supplier@demo.in pass=020789');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
