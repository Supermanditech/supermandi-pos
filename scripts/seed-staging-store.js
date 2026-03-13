// Comprehensive seed for SuperMandi Retailer Test Store on GCP Staging
// Store ID: aedbd94c-1d60-4290-bfbd-6ad099439d91
//
// Prerequisites:
//   1. Cloud SQL proxy running: cloud-sql-proxy.exe --gcloud-auth supermandi-backend:asia-south1:supermandi-staging --port=15432
//   2. Run: node scripts/seed-staging-store.js
//
// What this seeds:
//   - 30 realistic Indian FMCG products (catalog.products + catalog.store_products)
//   - Barcodes (catalog.product_barcodes + catalog.store_product_barcodes)
//   - Opening stock + inventory ledger entries (inventory.stock_balances + inventory.inventory_ledger)
//   - Public mirror tables (global_products, store_products, store_inventory, barcodes)
//   - 8 customers (public.customers)
//   - 2 additional staff: 1 CASHIER + 1 STOCK_MANAGER (platform.store_staff)
//   - 10 completed sales with sale_items + payments (public.sales, sale_items, payments)
//   - Bill sequence initialisation (public.bill_sequences)

const path = require('path');
const { Pool } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'pg'));
const crypto = require('crypto');
const bcryptjs = require(path.join(__dirname, '..', 'backend', 'node_modules', 'bcryptjs'));

const STORE_ID = 'aedbd94c-1d60-4290-bfbd-6ad099439d91';
const DEVICE_ID = '5c62f50a-06d7-46db-969c-392f2aa8c51f';
const STAFF_ID = '07fb3d91-f91d-4e55-bd46-ef5af7723f49'; // existing kbcretailer MANAGER

const uuid = () => crypto.randomUUID();

// ── 30 realistic Indian FMCG products ──────────────────────────────────────────
// Prices in paise (1 INR = 100 paise). E.g., ₹25 = 2500
const PRODUCTS = [
  // ── Staples / Grocery ──
  { name: 'Tata Salt 1kg',           brand: 'Tata',         barcode: '8901725181130', category: 'Grocery',    unit: 'PCS', packSize: 1, packUnit: 'kg',  hsn: '25010020', gst: 0,    mrp: 2800,  sell: 2500,  purchase: 2000,  stock: 50 },
  { name: 'Fortune Sunflower Oil 1L', brand: 'Fortune',      barcode: '8901058851885', category: 'Edible Oil', unit: 'PCS', packSize: 1, packUnit: 'L',   hsn: '15121190', gst: 5,    mrp: 18000, sell: 16500, purchase: 14000, stock: 30 },
  { name: 'Aashirvaad Atta 5kg',     brand: 'Aashirvaad',   barcode: '8901063083547', category: 'Grocery',    unit: 'PCS', packSize: 5, packUnit: 'kg',  hsn: '11010000', gst: 0,    mrp: 27500, sell: 25000, purchase: 22000, stock: 25 },
  { name: 'India Gate Basmati Rice 5kg', brand: 'India Gate', barcode: '8901401045155', category: 'Grocery',  unit: 'PCS', packSize: 5, packUnit: 'kg',  hsn: '10063090', gst: 0,    mrp: 62000, sell: 58000, purchase: 50000, stock: 20 },
  { name: 'Toor Dal (Arhar) 1kg',    brand: 'Tata Sampann', barcode: '8901725183745', category: 'Pulses',     unit: 'PCS', packSize: 1, packUnit: 'kg',  hsn: '07139090', gst: 0,    mrp: 16000, sell: 14500, purchase: 12000, stock: 40 },
  { name: 'MDH Chana Masala 100g',   brand: 'MDH',          barcode: '8901063002210', category: 'Spices',     unit: 'PCS', packSize: 100, packUnit: 'g', hsn: '09109100', gst: 5,    mrp: 7200,  sell: 6500,  purchase: 5000,  stock: 60 },
  { name: 'Saffola Gold Oil 1L',     brand: 'Saffola',      barcode: '8904004400040', category: 'Edible Oil', unit: 'PCS', packSize: 1, packUnit: 'L',   hsn: '15121190', gst: 5,    mrp: 21000, sell: 19500, purchase: 17000, stock: 20 },
  { name: 'Rajma (Kidney Beans) 1kg', brand: 'Tata Sampann', barcode: '8901725183820', category: 'Pulses',   unit: 'PCS', packSize: 1, packUnit: 'kg',  hsn: '07139090', gst: 0,    mrp: 18000, sell: 16000, purchase: 13500, stock: 35 },

  // ── Beverages ──
  { name: 'Parle Frooti 600ml',      brand: 'Parle',        barcode: '8901764010302', category: 'Beverages',  unit: 'PCS', packSize: 600, packUnit: 'ml', hsn: '22029030', gst: 12,  mrp: 3500,  sell: 3500,  purchase: 2800,  stock: 48 },
  { name: 'Coca-Cola 750ml',         brand: 'Coca-Cola',    barcode: '5449000000996', category: 'Beverages',  unit: 'PCS', packSize: 750, packUnit: 'ml', hsn: '22021010', gst: 28,  mrp: 4000,  sell: 4000,  purchase: 3200,  stock: 36 },
  { name: 'Tata Tea Gold 500g',      brand: 'Tata',         barcode: '8901725111489', category: 'Beverages',  unit: 'PCS', packSize: 500, packUnit: 'g',  hsn: '09024010', gst: 5,   mrp: 28000, sell: 26000, purchase: 22000, stock: 25 },
  { name: 'Nescafe Classic 50g',     brand: 'Nescafe',      barcode: '8901058852073', category: 'Beverages',  unit: 'PCS', packSize: 50, packUnit: 'g',   hsn: '09012100', gst: 5,   mrp: 16500, sell: 15000, purchase: 12500, stock: 30 },

  // ── Snacks & Biscuits ──
  { name: 'Parle-G Biscuits 800g',   brand: 'Parle',        barcode: '8901725133702', category: 'Biscuits',   unit: 'PCS', packSize: 800, packUnit: 'g',  hsn: '19053100', gst: 18,  mrp: 5500,  sell: 5000,  purchase: 4000,  stock: 60 },
  { name: 'Britannia Good Day 600g', brand: 'Britannia',    barcode: '8901063010116', category: 'Biscuits',   unit: 'PCS', packSize: 600, packUnit: 'g',  hsn: '19053100', gst: 18,  mrp: 11000, sell: 10000, purchase: 8500,  stock: 40 },
  { name: 'Lays Classic Salted 52g', brand: 'Lays',         barcode: '8901491101769', category: 'Snacks',     unit: 'PCS', packSize: 52, packUnit: 'g',   hsn: '20052000', gst: 12,  mrp: 2000,  sell: 2000,  purchase: 1500,  stock: 100 },
  { name: 'Kurkure Masala Munch 90g', brand: 'Kurkure',     barcode: '8901491502139', category: 'Snacks',    unit: 'PCS', packSize: 90, packUnit: 'g',   hsn: '19041090', gst: 12,  mrp: 2000,  sell: 2000,  purchase: 1500,  stock: 80 },
  { name: 'Haldiram Bhujia 400g',    brand: 'Haldirams',    barcode: '8904004401344', category: 'Snacks',     unit: 'PCS', packSize: 400, packUnit: 'g',  hsn: '20058000', gst: 12,  mrp: 13000, sell: 12000, purchase: 10000, stock: 30 },

  // ── Dairy ──
  { name: 'Amul Butter 500g',        brand: 'Amul',         barcode: '8901262150309', category: 'Dairy',      unit: 'PCS', packSize: 500, packUnit: 'g',  hsn: '04051000', gst: 12,  mrp: 28000, sell: 27000, purchase: 24000, stock: 15 },
  { name: 'Amul Taaza Milk 1L',      brand: 'Amul',         barcode: '8901262011563', category: 'Dairy',      unit: 'PCS', packSize: 1, packUnit: 'L',    hsn: '04012000', gst: 0,   mrp: 6600,  sell: 6600,  purchase: 5800,  stock: 20 },
  { name: 'Mother Dairy Dahi 400g',  brand: 'Mother Dairy', barcode: '8901150101152', category: 'Dairy',      unit: 'PCS', packSize: 400, packUnit: 'g',  hsn: '04031000', gst: 0,   mrp: 4200,  sell: 4200,  purchase: 3500,  stock: 25 },

  // ── Personal Care ──
  { name: 'Dove Soap 100g',          brand: 'Dove',         barcode: '8901030649974', category: 'Personal Care', unit: 'PCS', packSize: 100, packUnit: 'g', hsn: '34011990', gst: 18, mrp: 6200,  sell: 5500,  purchase: 4500,  stock: 50 },
  { name: 'Colgate MaxFresh 150g',   brand: 'Colgate',      barcode: '8901314301123', category: 'Personal Care', unit: 'PCS', packSize: 150, packUnit: 'g', hsn: '33061020', gst: 18, mrp: 9500,  sell: 8500,  purchase: 7000,  stock: 40 },
  { name: 'Head & Shoulders 340ml',  brand: 'H&S',          barcode: '4902430715874', category: 'Personal Care', unit: 'PCS', packSize: 340, packUnit: 'ml', hsn: '33051090', gst: 18, mrp: 39900, sell: 36000, purchase: 30000, stock: 20 },
  { name: 'Dettol Handwash 200ml',   brand: 'Dettol',       barcode: '8901396371229', category: 'Personal Care', unit: 'PCS', packSize: 200, packUnit: 'ml', hsn: '34012090', gst: 18, mrp: 9900,  sell: 8500,  purchase: 7000,  stock: 35 },

  // ── Household ──
  { name: 'Vim Dishwash Bar 300g',   brand: 'Vim',          barcode: '8901030574085', category: 'Household',  unit: 'PCS', packSize: 300, packUnit: 'g',  hsn: '34022090', gst: 18,  mrp: 3200,  sell: 3000,  purchase: 2400,  stock: 45 },
  { name: 'Surf Excel Quick Wash 1kg', brand: 'Surf Excel', barcode: '8901030595462', category: 'Household', unit: 'PCS', packSize: 1, packUnit: 'kg',   hsn: '34022090', gst: 18,  mrp: 12000, sell: 11000, purchase: 9000,  stock: 30 },
  { name: 'Lizol Floor Cleaner 500ml', brand: 'Lizol',      barcode: '8901396339199', category: 'Household', unit: 'PCS', packSize: 500, packUnit: 'ml', hsn: '34022090', gst: 18,  mrp: 14500, sell: 13000, purchase: 11000, stock: 20 },

  // ── Loose / Bulk items ──
  { name: 'Loose Sugar',             brand: null,            barcode: null,            category: 'Grocery',    unit: 'KG',  packSize: 1, packUnit: 'kg',   hsn: '17019910', gst: 0,    mrp: 4500,  sell: 4200,  purchase: 3800,  stock: 100, mode: 'LOOSE_BULK', soldBy: 'WEIGHT', rateUnit: 'KG' },
  { name: 'Loose Moong Dal',         brand: null,            barcode: null,            category: 'Pulses',     unit: 'KG',  packSize: 1, packUnit: 'kg',   hsn: '07139090', gst: 0,    mrp: 12000, sell: 11000, purchase: 9500,  stock: 50,  mode: 'LOOSE_BULK', soldBy: 'WEIGHT', rateUnit: 'KG' },
  { name: 'Loose Peanuts (Moongfali)', brand: null,          barcode: null,            category: 'Dry Fruits', unit: 'KG',  packSize: 1, packUnit: 'kg',   hsn: '12024200', gst: 5,    mrp: 16000, sell: 15000, purchase: 12000, stock: 30,  mode: 'LOOSE_BULK', soldBy: 'WEIGHT', rateUnit: 'KG' },
];

// ── 8 Customers ────────────────────────────────────────────────────────────────
const CUSTOMERS = [
  { name: 'Ramesh Sharma',    phone: '9876543210', address: '12 MG Road, Jodhpur',           city: 'Jodhpur', pincode: '342001', creditLimit: 500000 },
  { name: 'Sunita Devi',      phone: '9876543211', address: '45 Station Road, Jodhpur',      city: 'Jodhpur', pincode: '342003', creditLimit: 300000 },
  { name: 'Mohan Lal Gupta',  phone: '9876543212', address: '78 Nai Sarak, Jodhpur',         city: 'Jodhpur', pincode: '342001', creditLimit: 1000000 },
  { name: 'Priya Rathore',    phone: '9876543213', address: 'B-22 Shastri Nagar, Jodhpur',   city: 'Jodhpur', pincode: '342003', creditLimit: 200000 },
  { name: 'Kishan Chand',     phone: '9876543214', address: '99 Sardarpura, Jodhpur',        city: 'Jodhpur', pincode: '342003', creditLimit: 0 },
  { name: 'Geeta Bai',        phone: '9876543215', address: '3 Paota, Jodhpur',              city: 'Jodhpur', pincode: '342006', creditLimit: 150000 },
  { name: 'Arjun Singh',      phone: '9876543216', address: '67 Ratanada, Jodhpur',          city: 'Jodhpur', pincode: '342011', creditLimit: 800000 },
  { name: 'Kavita Meena',     phone: '9876543217', address: 'C-5 Pratap Nagar, Jodhpur',     city: 'Jodhpur', pincode: '342003', creditLimit: 500000 },
];

// ── Additional Staff ───────────────────────────────────────────────────────────
const NEW_STAFF = [
  { name: 'Sonu Cashier',    phone: '8888800001', pin: '1234', role: 'CASHIER' },
  { name: 'Deepak Stock',    phone: '8888800002', pin: '5678', role: 'STOCK_MANAGER' },
];

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sm-staging-2026!@127.0.0.1:15432/supermandi',
    ssl: false,
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ════════════════════════════════════════════════════════════════════════════
    // 1. PRODUCTS — catalog.products + catalog.store_products + barcodes
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n[1/8] Creating 30 products...');
    const productIds = [];
    const storeProductIds = [];

    for (const p of PRODUCTS) {
      const productId = uuid();
      const storeProductId = uuid();
      productIds.push(productId);
      storeProductIds.push(storeProductId);

      // catalog.products (global product)
      await client.query(
        `INSERT INTO catalog.products (id, name, brand, category, unit, pack_size, primary_barcode, hsn_code, default_gst_rate, pack_unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [productId, p.name, p.brand, p.category, p.unit, p.packSize, p.barcode, p.hsn, p.gst, p.packUnit]
      );

      // catalog.store_products (store-specific pricing + stock)
      await client.query(
        `INSERT INTO catalog.store_products
           (id, store_id, product_id, display_name, sell_price, mrp, purchase_price, current_stock, is_active, product_mode, sold_by, rate_unit, brand, low_stock_alert_qty)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          storeProductId, STORE_ID, productId, p.name,
          p.sell, p.mrp, p.purchase, p.stock,
          p.mode || 'PACKAGED', p.soldBy || null, p.rateUnit || null,
          p.brand, Math.max(3, Math.floor(p.stock * 0.1))
        ]
      );

      // catalog.product_barcodes (only for packaged items with barcodes)
      if (p.barcode) {
        await client.query(
          `INSERT INTO catalog.product_barcodes (id, product_id, barcode, barcode_type, is_primary, source, created_at, created_by_store_id)
           VALUES ($1, $2, $3, 'ean13', true, 'manual', NOW(), $4)
           ON CONFLICT (id) DO NOTHING`,
          [uuid(), productId, p.barcode, STORE_ID]
        );

        // catalog.store_product_barcodes
        await client.query(
          `INSERT INTO catalog.store_product_barcodes (id, store_id, store_product_id, barcode, source, created_at)
           VALUES ($1, $2, $3, $4, 'manual', NOW())
           ON CONFLICT (id) DO NOTHING`,
          [uuid(), STORE_ID, storeProductId, p.barcode]
        );
      }
    }
    console.log(`  ✓ 30 catalog.products created`);
    console.log(`  ✓ 30 catalog.store_products created`);
    console.log(`  ✓ Barcodes created for packaged items`);

    // ════════════════════════════════════════════════════════════════════════════
    // 2. INVENTORY — stock_balances + inventory_ledger (opening stock)
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n[2/8] Seeding inventory (stock_balances + ledger)...');
    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i];
      const productId = productIds[i];
      const ledgerId = uuid();

      // inventory.stock_balances
      await client.query(
        `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at, avg_unit_cost_minor)
         VALUES ($1, $2, $3, $4, NOW(), $5)
         ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = $3, last_ledger_id = $4, updated_at = NOW()`,
        [STORE_ID, productId, p.stock, ledgerId, p.purchase]
      );

      // inventory.inventory_ledger — opening stock entry
      await client.query(
        `INSERT INTO inventory.inventory_ledger
           (id, store_id, product_id, delta_qty, transaction_type, reference_type, stock_before, stock_after, unit_cost, source, created_at)
         VALUES ($1, $2, $3, $4, 'opening_stock', 'manual', 0, $4, $5, 'SEED_SCRIPT', NOW())`,
        [ledgerId, STORE_ID, productId, p.stock, p.purchase]
      );
    }
    console.log(`  ✓ 30 stock_balances upserted`);
    console.log(`  ✓ 30 inventory_ledger (opening_stock) entries created`);

    // ════════════════════════════════════════════════════════════════════════════
    // 3. PUBLIC MIRROR TABLES — global_products, store_products, store_inventory, barcodes
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n[3/8] Syncing public mirror tables...');
    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i];
      const productId = productIds[i];
      const variantId = storeProductIds[i]; // reuse storeProductId as variant id

      // public.global_products
      await client.query(
        `INSERT INTO global_products (id, global_name, category, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [productId, p.name, p.category]
      );

      // public.products (legacy)
      await client.query(
        `INSERT INTO products (id, name, category, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [productId, p.name, p.category]
      );

      // public.variants (needed for barcodes FK)
      await client.query(
        `INSERT INTO variants (id, product_id, name, category, currency, unit_base, size_base, retailer_status, enrichment_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'INR', $5, $6, 'active', 'enriched', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [variantId, productId, p.name, p.category, p.packUnit, p.packSize]
      );

      // public.store_products
      await client.query(
        `INSERT INTO store_products (id, store_id, global_product_id, store_display_name, sell_price_minor, purchase_price_minor, unit, variant, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'INR', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [storeProductIds[i], STORE_ID, productId, p.name, p.sell, p.purchase, p.unit]
      );

      // public.store_inventory
      await client.query(
        `INSERT INTO store_inventory (store_id, global_product_id, available_qty, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (store_id, global_product_id) DO UPDATE SET available_qty = $3, updated_at = NOW()`,
        [STORE_ID, productId, p.stock]
      );

      // public.barcodes (only for items with barcodes — FK to variants)
      if (p.barcode) {
        await client.query(
          `INSERT INTO barcodes (barcode, variant_id, barcode_type, created_at)
           VALUES ($1, $2, 'ean13', NOW())
           ON CONFLICT (barcode) DO NOTHING`,
          [p.barcode, variantId]
        );
      }
    }
    console.log(`  ✓ global_products, products, variants, store_products, store_inventory, barcodes synced`);

    // ════════════════════════════════════════════════════════════════════════════
    // 4. CUSTOMERS
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n[4/8] Creating 8 customers...');
    const customerIds = [];
    for (const c of CUSTOMERS) {
      const cid = uuid();
      customerIds.push(cid);
      await client.query(
        `INSERT INTO customers (id, store_id, name, phone, address, city, pincode, credit_limit_minor, outstanding_balance_minor, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [cid, STORE_ID, c.name, c.phone, c.address, c.city, c.pincode, c.creditLimit]
      );
    }
    console.log(`  ✓ 8 customers created`);

    // ════════════════════════════════════════════════════════════════════════════
    // 5. ADDITIONAL STAFF (CASHIER + STOCK_MANAGER)
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n[5/8] Creating 2 additional staff...');
    const newStaffIds = [];
    for (const s of NEW_STAFF) {
      const sid = uuid();
      newStaffIds.push(sid);
      const pinHash = bcryptjs.hashSync(s.pin, 10);
      await client.query(
        `INSERT INTO platform.store_staff (id, store_id, name, phone, pin_hash, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [sid, STORE_ID, s.name, s.phone, pinHash, s.role]
      );
    }
    console.log(`  ✓ Staff: Sonu Cashier (pin:1234), Deepak Stock (pin:5678)`);

    // ════════════════════════════════════════════════════════════════════════════
    // 6. BILL SEQUENCE
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n[6/8] Initialising bill sequence...');
    await client.query(
      `INSERT INTO bill_sequences (store_id, last_number, prefix, updated_at)
       VALUES ($1, 1, 'SM-001', NOW())
       ON CONFLICT (store_id) DO NOTHING`,
      [STORE_ID]
    );
    console.log(`  ✓ Bill sequence initialised (prefix=SM-001, last_number=1)`);

    // ════════════════════════════════════════════════════════════════════════════
    // 7. SALES — 10 completed sales over the past 7 days
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n[7/8] Creating 10 completed sales with items & payments...');

    const paymentModes = ['CASH', 'CASH', 'CASH', 'UPI', 'UPI', 'CASH', 'DUE', 'CASH', 'UPI', 'CASH'];
    const now = new Date();

    for (let s = 0; s < 10; s++) {
      const saleId = uuid();
      const saleDate = new Date(now.getTime() - (9 - s) * 24 * 60 * 60 * 1000 + s * 3600000); // spread over 10 days
      const billRef = `SU260308-001-2026-${String(s + 2).padStart(4, '0')}`;

      // Pick 2-4 random products for each sale
      const itemCount = 2 + Math.floor(Math.random() * 3);
      const pickedIndices = new Set();
      while (pickedIndices.size < itemCount) {
        pickedIndices.add(Math.floor(Math.random() * PRODUCTS.length));
      }

      let subtotal = 0;
      const saleItems = [];
      for (const idx of pickedIndices) {
        const p = PRODUCTS[idx];
        const qty = 1 + Math.floor(Math.random() * 3);
        const lineTotal = p.sell * qty;
        subtotal += lineTotal;
        saleItems.push({
          id: uuid(),
          productId: productIds[idx],
          name: p.name,
          barcode: p.barcode || null,
          quantity: qty,
          priceMinor: p.sell,
          lineTotal: lineTotal,
          storeProductId: storeProductIds[idx],
        });
      }

      const discount = Math.floor(subtotal * 0.05); // 5% discount
      const total = subtotal - discount;
      const customerId = customerIds[s % customerIds.length];
      const customerName = CUSTOMERS[s % CUSTOMERS.length].name;
      const customerPhone = CUSTOMERS[s % CUSTOMERS.length].phone;
      const paymentMode = paymentModes[s];

      // public.sales
      await client.query(
        `INSERT INTO sales (id, store_id, device_id, bill_ref, subtotal_minor, discount_minor, total_minor, currency, status, payment_mode, payment_status, customer_name, customer_phone, customer_id, staff_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'INR', 'completed', $8, 'paid', $9, $10, $11, $12, $13, $13)`,
        [saleId, STORE_ID, DEVICE_ID, billRef, subtotal, discount, total, paymentMode, customerName, customerPhone, customerId, STAFF_ID, saleDate]
      );

      // public.sale_items
      for (const item of saleItems) {
        await client.query(
          `INSERT INTO sale_items (id, sale_id, product_id, name, barcode, quantity, price_minor, discount_minor, line_total_minor, item_name, store_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $4, $9, $10, $10)`,
          [item.id, saleId, item.storeProductId, item.name, item.barcode, item.quantity, item.priceMinor, item.lineTotal, STORE_ID, saleDate]
        );
      }

      // public.payments — DROP conflicting constraint then insert
      // payments_status_check (lowercase) conflicts with chk_payment_status (UPPERCASE)
      // Drop the old lowercase one so we can use the newer UPPERCASE convention
      if (s === 0) {
        await client.query(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check`);
      }
      await client.query(
        `INSERT INTO payments (id, sale_id, store_id, amount_minor, mode, status, confirmed_at, created_at)
         VALUES ($1, $2, $3::text, $4, $5, 'PAID', $6, $6)`,
        [uuid(), saleId, STORE_ID, total, paymentMode, saleDate]
      );

      // Update bill sequence
      await client.query(
        `UPDATE bill_sequences SET last_number = $1, updated_at = NOW() WHERE store_id = $2`,
        [s + 2, STORE_ID]
      );
    }
    console.log(`  ✓ 10 sales (COMPLETED) with items + payments`);
    console.log(`  ✓ Payment modes: 6 CASH, 3 UPI, 1 DUE`);

    // ════════════════════════════════════════════════════════════════════════════
    // 8. UPDATE EXISTING PENDING SALE → COMPLETED
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n[8/8] Completing existing pending sale...');
    const pendingRes = await client.query(
      `UPDATE sales SET status = 'completed', payment_mode = 'CASH', payment_status = 'paid', updated_at = NOW()
       WHERE store_id = $1 AND status IN ('PENDING', 'pending')
       RETURNING id`,
      [STORE_ID]
    );
    if (pendingRes.rowCount > 0) {
      for (const row of pendingRes.rows) {
        await client.query(
          `INSERT INTO payments (id, sale_id, store_id, amount_minor, mode, status, confirmed_at, created_at)
           SELECT $1, s.id, s.store_id::text, s.total_minor, 'CASH', 'PAID', NOW(), NOW()
           FROM sales s WHERE s.id = $2
           ON CONFLICT DO NOTHING`,
          [uuid(), row.id]
        );
      }
      console.log(`  ✓ ${pendingRes.rowCount} pending sale(s) completed`);
    } else {
      console.log(`  - No pending sales to complete`);
    }

    await client.query('COMMIT');

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  SEED COMPLETE — SuperMandi Retailer Test Store');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  Store: ${STORE_ID}`);
    console.log(`  Products: 30 (27 packaged + 3 loose/bulk)`);
    console.log(`  Categories: Grocery, Edible Oil, Pulses, Spices, Beverages,`);
    console.log(`              Biscuits, Snacks, Dairy, Personal Care, Household, Dry Fruits`);
    console.log(`  Stock: All products have opening stock (15-100 units)`);
    console.log(`  Customers: 8 (with credit limits ₹0 to ₹10,000)`);
    console.log(`  Staff: 3 total (1 MANAGER + 1 CASHIER + 1 STOCK_MANAGER)`);
    console.log(`    - kbcretailer (MANAGER) — existing`);
    console.log(`    - Sonu Cashier (CASHIER) — pin: 1234`);
    console.log(`    - Deepak Stock (STOCK_MANAGER) — pin: 5678`);
    console.log(`  Sales: 11 completed (10 new + 1 existing)`);
    console.log(`  Payments: CASH / UPI / DUE`);
    console.log('══════════════════════════════════════════════════════════\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nSEED FAILED — rolled back:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
