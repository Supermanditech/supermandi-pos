/**
 * TEST-038: Production-Scale Data Seeder
 *
 * Seeds the database with production-representative volumes:
 * - 100K products (catalog.products)
 * - 10K customers (platform.customer_profiles)
 * - 50K sales + ~150K sale_items (public.sales + public.sale_items)
 * - 1M inventory ledger entries (inventory.inventory_ledger)
 *
 * Usage:
 *   PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=supermandi \
 *     npx tsx e2e-tests/stress/seed-production-data.ts
 *
 * Requires: pg (npm install pg)
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const BATCH_SIZE = 1000; // rows per INSERT
const PRODUCTS_COUNT = 100_000;
const CUSTOMERS_COUNT = 10_000;
const SALES_COUNT = 50_000;
const AVG_ITEMS_PER_SALE = 3;
const LEDGER_ENTRIES_TARGET = 1_000_000;

// Demo store (must exist before seeding)
const STORE_ID = process.env.STORE_ID || 'a0000000-0000-0000-0000-000000000001';
const STAFF_USER_ID = process.env.STAFF_USER_ID || '00000000-0000-0000-0000-000000000099';

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function padNum(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

const CATEGORIES = [
  'Atta & Flour', 'Rice', 'Dal & Pulses', 'Cooking Oil', 'Spices',
  'Sugar & Salt', 'Tea & Coffee', 'Biscuits', 'Snacks', 'Namkeen',
  'Soap & Detergent', 'Shampoo & Hair', 'Toothpaste', 'Dairy',
  'Beverages', 'Noodles & Pasta', 'Ghee', 'Pickles & Chutneys',
  'Baby Care', 'Personal Hygiene', 'Cleaning Supplies', 'Stationery',
  'Dry Fruits', 'Frozen Foods', 'Confectionery',
];

const BRANDS = [
  'Aashirvaad', 'Fortune', 'Tata', 'MDH', 'Everest', 'Surf Excel',
  'Amul', 'Parle', 'Britannia', 'Haldiram', 'Bisleri', 'Patanjali',
  'Dabur', 'Godrej', 'ITC', 'Nestle', 'HUL', 'Marico', 'Emami',
  'Paper Boat', 'Raw Pressery', 'Mother Dairy', 'Lays', 'Kurkure',
  'Maggi', 'Sunfeast', 'Clinic Plus', 'Colgate', 'Dettol', 'Vim',
];

const UNITS = ['kg', 'g', 'L', 'ml', 'piece', 'pack', 'dozen', 'box'];

const PAYMENT_MODES = ['CASH', 'UPI', 'DUE'] as const;
const TXN_TYPES = ['sale', 'purchase_received', 'adjustment', 'sale_return'] as const;

// ---------------------------------------------------------------------------
// SEEDER FUNCTIONS
// ---------------------------------------------------------------------------

async function seedProducts(pool: Pool): Promise<string[]> {
  console.log(`Seeding ${PRODUCTS_COUNT.toLocaleString()} products...`);
  const productIds: string[] = [];
  let inserted = 0;

  while (inserted < PRODUCTS_COUNT) {
    const batchEnd = Math.min(inserted + BATCH_SIZE, PRODUCTS_COUNT);
    const values: string[] = [];

    for (let i = inserted; i < batchEnd; i++) {
      const id = randomUUID();
      productIds.push(id);
      const barcode = `899${padNum(i, 10)}`;
      const name = `${randomChoice(BRANDS)} ${randomChoice(CATEGORIES)} ${i}`;
      const brand = randomChoice(BRANDS);
      const category = randomChoice(CATEGORIES);
      const unit = randomChoice(UNITS);
      const packSize = randomInt(1, 12);
      const gstRate = randomChoice([0, 5, 12, 18, 28]);
      values.push(
        `('${id}', '${name.replace(/'/g, "''")}', '${brand}', '${category}', '${unit}', ${packSize}, '${barcode}', ${gstRate}, true)`
      );
    }

    await pool.query(`
      INSERT INTO catalog.products (id, name, brand, category, unit, pack_size, primary_barcode, default_gst_rate, is_active)
      VALUES ${values.join(',\n')}
      ON CONFLICT (id) DO NOTHING
    `);

    inserted = batchEnd;
    if (inserted % 10000 === 0) console.log(`  products: ${inserted.toLocaleString()} / ${PRODUCTS_COUNT.toLocaleString()}`);
  }

  console.log(`  DONE: ${productIds.length.toLocaleString()} products seeded`);
  return productIds;
}

async function seedCustomers(pool: Pool): Promise<string[]> {
  console.log(`Seeding ${CUSTOMERS_COUNT.toLocaleString()} customers...`);
  const customerIds: string[] = [];
  let inserted = 0;

  while (inserted < CUSTOMERS_COUNT) {
    const batchEnd = Math.min(inserted + BATCH_SIZE, CUSTOMERS_COUNT);
    const values: string[] = [];

    for (let i = inserted; i < batchEnd; i++) {
      const id = randomUUID();
      customerIds.push(id);
      const name = `Customer ${padNum(i, 6)}`;
      const phone = `+91${padNum(7000000000 + i, 10)}`;
      const creditLimit = randomInt(0, 100) * 10000; // 0 to 10L paise
      values.push(
        `('${id}', '${STORE_ID}', '${name}', '${phone}', ${creditLimit}, 0, 0)`
      );
    }

    await pool.query(`
      INSERT INTO platform.customer_profiles (id, store_id, name, phone, credit_limit_minor, total_purchases_minor, visit_count)
      VALUES ${values.join(',\n')}
      ON CONFLICT (id) DO NOTHING
    `);

    inserted = batchEnd;
    if (inserted % 5000 === 0) console.log(`  customers: ${inserted.toLocaleString()} / ${CUSTOMERS_COUNT.toLocaleString()}`);
  }

  console.log(`  DONE: ${customerIds.length.toLocaleString()} customers seeded`);
  return customerIds;
}

async function seedSales(pool: Pool, productIds: string[]): Promise<void> {
  console.log(`Seeding ${SALES_COUNT.toLocaleString()} sales with ~${(SALES_COUNT * AVG_ITEMS_PER_SALE).toLocaleString()} line items...`);
  let insertedSales = 0;
  let insertedItems = 0;

  while (insertedSales < SALES_COUNT) {
    const batchEnd = Math.min(insertedSales + BATCH_SIZE, SALES_COUNT);
    const saleValues: string[] = [];
    const itemValues: string[] = [];

    for (let i = insertedSales; i < batchEnd; i++) {
      const saleId = randomUUID();
      const billRef = `BILL-${padNum(i, 8)}`;
      const itemCount = randomInt(1, 6);
      let totalMinor = 0;

      for (let j = 0; j < itemCount; j++) {
        const productId = randomChoice(productIds);
        const qty = randomInt(1, 5);
        const priceMinor = randomInt(500, 50000); // ₹5 to ₹500
        const lineTotalMinor = qty * priceMinor;
        totalMinor += lineTotalMinor;

        itemValues.push(
          `('${randomUUID()}', '${saleId}', '${productId}', 'Product ${productId.slice(0, 8)}', ${qty}, ${priceMinor}, 0, ${lineTotalMinor})`
        );
        insertedItems++;
      }

      const discountMinor = randomInt(0, Math.floor(totalMinor * 0.1));
      const paymentMode = randomChoice(PAYMENT_MODES);
      // Spread sales over 90 days
      const daysAgo = randomInt(0, 90);
      const hoursAgo = randomInt(0, 14) + 8; // 08:00-22:00
      const createdAt = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000).toISOString();

      saleValues.push(
        `('${saleId}', '${STORE_ID}', '${billRef}', ${totalMinor - discountMinor}, ${discountMinor}, ${totalMinor - discountMinor}, 'INR', 'completed', '${paymentMode}', 'paid', '${createdAt}')`
      );
    }

    // Insert sales batch
    await pool.query(`
      INSERT INTO public.sales (id, store_id, bill_ref, subtotal_minor, discount_minor, total_minor, currency, status, payment_mode, payment_status, created_at)
      VALUES ${saleValues.join(',\n')}
      ON CONFLICT (id) DO NOTHING
    `);

    // Insert sale items batch
    if (itemValues.length > 0) {
      // Split large item batches into sub-batches of 2000
      for (let k = 0; k < itemValues.length; k += 2000) {
        const chunk = itemValues.slice(k, k + 2000);
        await pool.query(`
          INSERT INTO public.sale_items (id, sale_id, product_id, name, quantity, price_minor, discount_minor, line_total_minor)
          VALUES ${chunk.join(',\n')}
          ON CONFLICT (id) DO NOTHING
        `);
      }
    }

    insertedSales = batchEnd;
    if (insertedSales % 5000 === 0) console.log(`  sales: ${insertedSales.toLocaleString()} / ${SALES_COUNT.toLocaleString()} (items: ${insertedItems.toLocaleString()})`);
  }

  console.log(`  DONE: ${insertedSales.toLocaleString()} sales, ${insertedItems.toLocaleString()} items`);
}

async function seedLedger(pool: Pool, productIds: string[]): Promise<void> {
  console.log(`Seeding ${LEDGER_ENTRIES_TARGET.toLocaleString()} inventory ledger entries...`);
  let inserted = 0;

  // Track stock per product for realistic stock_before/stock_after
  const stockMap = new Map<string, number>();

  while (inserted < LEDGER_ENTRIES_TARGET) {
    const batchEnd = Math.min(inserted + BATCH_SIZE, LEDGER_ENTRIES_TARGET);
    const values: string[] = [];

    for (let i = inserted; i < batchEnd; i++) {
      const productId = randomChoice(productIds);
      const txnType = randomChoice(TXN_TYPES);

      const currentStock = stockMap.get(productId) ?? randomInt(50, 500);
      let deltaQty: number;

      switch (txnType) {
        case 'sale':
          deltaQty = -randomInt(1, Math.min(5, Math.max(1, currentStock)));
          break;
        case 'purchase_received':
          deltaQty = randomInt(10, 200);
          break;
        case 'adjustment':
          deltaQty = randomInt(-5, 5);
          break;
        case 'sale_return':
          deltaQty = randomInt(1, 3);
          break;
      }

      const stockBefore = currentStock;
      const stockAfter = currentStock + deltaQty;
      stockMap.set(productId, Math.max(0, stockAfter));

      const daysAgo = randomInt(0, 180);
      const createdAt = new Date(Date.now() - daysAgo * 86400000 - randomInt(0, 86400) * 1000).toISOString();

      values.push(
        `('${randomUUID()}', '${STORE_ID}', '${productId}', ${deltaQty}, '${txnType}', '${txnType === 'sale' ? 'sale' : txnType === 'purchase_received' ? 'po' : 'manual'}', ${stockBefore}, ${Math.max(0, stockAfter)}, '${createdAt}')`
      );
    }

    await pool.query(`
      INSERT INTO inventory.inventory_ledger (id, store_id, product_id, delta_qty, transaction_type, reference_type, stock_before, stock_after, created_at)
      VALUES ${values.join(',\n')}
      ON CONFLICT (id) DO NOTHING
    `);

    inserted = batchEnd;
    if (inserted % 100000 === 0) console.log(`  ledger: ${inserted.toLocaleString()} / ${LEDGER_ENTRIES_TARGET.toLocaleString()}`);
  }

  // Update stock_balances from final stockMap state
  console.log(`  Updating stock_balances for ${stockMap.size.toLocaleString()} products...`);
  let balanceInserted = 0;
  const entries = Array.from(stockMap.entries());

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const values = chunk.map(([pid, qty]) =>
      `('${STORE_ID}', '${pid}', ${Math.max(0, qty)})`
    );

    await pool.query(`
      INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
      VALUES ${values.join(',\n')}
      ON CONFLICT (store_id, product_id)
      DO UPDATE SET current_qty = EXCLUDED.current_qty, updated_at = NOW()
    `);

    balanceInserted += chunk.length;
  }

  console.log(`  DONE: ${inserted.toLocaleString()} ledger entries, ${balanceInserted.toLocaleString()} balances updated`);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const pool = new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'supermandi',
    password: process.env.PGPASSWORD || 'supermandi',
    database: process.env.PGDATABASE || 'supermandi',
    max: 10,
  });

  const startTime = Date.now();
  console.log('=== TEST-038: Production-Scale Data Seeder ===\n');
  console.log(`Target: ${PRODUCTS_COUNT.toLocaleString()} products, ${CUSTOMERS_COUNT.toLocaleString()} customers, ${SALES_COUNT.toLocaleString()} sales, ${LEDGER_ENTRIES_TARGET.toLocaleString()} ledger entries`);
  console.log(`Store: ${STORE_ID}\n`);

  try {
    // Verify connection
    const { rows } = await pool.query('SELECT current_database(), current_user');
    console.log(`Connected: ${rows[0].current_database} as ${rows[0].current_user}\n`);

    // Seed in dependency order
    const productIds = await seedProducts(pool);
    await seedCustomers(pool);
    await seedSales(pool, productIds);
    await seedLedger(pool, productIds);

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== SEEDING COMPLETE in ${elapsed}s ===`);

    // Verify counts
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM catalog.products) AS products,
        (SELECT COUNT(*) FROM platform.customer_profiles WHERE store_id = $1) AS customers,
        (SELECT COUNT(*) FROM public.sales WHERE store_id = $1) AS sales,
        (SELECT COUNT(*) FROM public.sale_items si JOIN public.sales s ON si.sale_id = s.id WHERE s.store_id = $1) AS sale_items,
        (SELECT COUNT(*) FROM inventory.inventory_ledger WHERE store_id = $1) AS ledger_entries,
        (SELECT COUNT(*) FROM inventory.stock_balances WHERE store_id = $1) AS stock_balances
    `, [STORE_ID]);

    const c = counts.rows[0];
    console.log(`\nVerification:`);
    console.log(`  Products:       ${parseInt(c.products).toLocaleString()}`);
    console.log(`  Customers:      ${parseInt(c.customers).toLocaleString()}`);
    console.log(`  Sales:          ${parseInt(c.sales).toLocaleString()}`);
    console.log(`  Sale Items:     ${parseInt(c.sale_items).toLocaleString()}`);
    console.log(`  Ledger Entries: ${parseInt(c.ledger_entries).toLocaleString()}`);
    console.log(`  Stock Balances: ${parseInt(c.stock_balances).toLocaleString()}`);
  } catch (err) {
    console.error('Seeder FAILED:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
