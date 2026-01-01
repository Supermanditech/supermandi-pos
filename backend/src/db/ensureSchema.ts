import { getPool } from "./client";

let ensured = false;

export async function ensureCoreSchema(): Promise<void> {
  if (ensured) return;

  const pool = getPool();
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      upi_vpa TEXT NULL,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      address TEXT NULL,
      contact_name TEXT NULL,
      contact_phone TEXT NULL,
      contact_email TEXT NULL,
      location TEXT NULL,
      pos_device_id TEXT NULL,
      kyc_status TEXT NULL,
      upi_vpa_updated_at TIMESTAMPTZ NULL,
      upi_vpa_updated_by TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      barcode TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      retailer_status TEXT NULL,
      enrichment_status TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS retailer_products (
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      selling_price_minor INTEGER NULL,
      digitised_by_retailer BOOLEAN NOT NULL DEFAULT TRUE,
      price_updated_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (store_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS scan_events (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      device_id TEXT NULL,
      scan_value TEXT NOT NULL,
      mode TEXT NOT NULL,
      action TEXT NOT NULL,
      product_id TEXT NULL REFERENCES products(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      device_id TEXT NULL,
      bill_ref TEXT NOT NULL UNIQUE,
      offline_receipt_ref TEXT NULL,
      subtotal_minor INTEGER NOT NULL,
      discount_minor INTEGER NOT NULL DEFAULT 0,
      total_minor INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      price_minor INTEGER NOT NULL,
      line_total_minor INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NULL REFERENCES sales(id) ON DELETE SET NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      provider_ref TEXT NULL,
      confirmed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      device_id TEXT NULL,
      amount_minor INTEGER NOT NULL,
      mode TEXT NOT NULL,
      reference TEXT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pos_events (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pos_devices (
      id TEXT PRIMARY KEY,
      store_id TEXT NULL REFERENCES stores(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      device_token TEXT NULL,
      label TEXT NULL,
      device_type TEXT NULL,
      manufacturer TEXT NULL,
      model TEXT NULL,
      android_version TEXT NULL,
      app_version TEXT NULL,
      printing_mode TEXT NULL,
      last_seen_online TIMESTAMPTZ NULL,
      last_sync_at TIMESTAMPTZ NULL,
      pending_outbox_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pos_device_enrollments (
      code TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT NOT NULL DEFAULT 'superadmin'
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      supplier_name TEXT NULL,
      total_minor INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id TEXT NULL REFERENCES products(id) ON DELETE SET NULL,
      sku TEXT NULL,
      quantity INTEGER NOT NULL,
      unit_cost_minor INTEGER NOT NULL,
      line_total_minor INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consumer_orders (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      payment_mode TEXT NOT NULL,
      total_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consumer_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES consumer_orders(id) ON DELETE CASCADE,
      product_id TEXT NULL REFERENCES products(id) ON DELETE SET NULL,
      sku TEXT NULL,
      quantity INTEGER NOT NULL,
      price_minor INTEGER NOT NULL,
      line_total_minor INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS pos_events_created_at_idx ON pos_events (created_at DESC);
    CREATE INDEX IF NOT EXISTS pos_events_store_id_idx ON pos_events (store_id);
    CREATE INDEX IF NOT EXISTS pos_events_device_id_idx ON pos_events (device_id);
    CREATE INDEX IF NOT EXISTS pos_devices_store_id_idx ON pos_devices (store_id);
    CREATE INDEX IF NOT EXISTS pos_devices_last_seen_idx ON pos_devices (last_seen_online DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS pos_devices_token_uidx ON pos_devices (device_token) WHERE device_token IS NOT NULL;
    CREATE INDEX IF NOT EXISTS pos_device_enrollments_store_idx ON pos_device_enrollments (store_id);
    CREATE INDEX IF NOT EXISTS pos_device_enrollments_expires_idx ON pos_device_enrollments (expires_at);
    CREATE INDEX IF NOT EXISTS processed_events_device_idx ON processed_events (device_id);
    CREATE INDEX IF NOT EXISTS processed_events_received_idx ON processed_events (received_at DESC);
    CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode);
    CREATE INDEX IF NOT EXISTS retailer_products_store_id_idx ON retailer_products (store_id);
    CREATE INDEX IF NOT EXISTS scan_events_created_at_idx ON scan_events (created_at DESC);
    CREATE INDEX IF NOT EXISTS scan_events_store_id_idx ON scan_events (store_id);
    CREATE INDEX IF NOT EXISTS scan_events_dedupe_idx ON scan_events (store_id, mode, scan_value, created_at DESC);
    CREATE INDEX IF NOT EXISTS sales_store_id_idx ON sales (store_id);
    CREATE INDEX IF NOT EXISTS sales_created_at_idx ON sales (created_at DESC);
    CREATE INDEX IF NOT EXISTS sales_device_id_idx ON sales (device_id);
    CREATE INDEX IF NOT EXISTS sales_status_created_at_idx ON sales (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS sales_store_status_created_at_idx ON sales (store_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS sales_offline_receipt_uidx ON sales (store_id, offline_receipt_ref)
      WHERE offline_receipt_ref IS NOT NULL;
    CREATE INDEX IF NOT EXISTS payments_sale_id_idx ON payments (sale_id);
    CREATE INDEX IF NOT EXISTS payments_created_at_idx ON payments (created_at DESC);
    CREATE INDEX IF NOT EXISTS payments_mode_created_at_idx ON payments (mode, created_at DESC);
    CREATE INDEX IF NOT EXISTS collections_store_id_idx ON collections (store_id);
    CREATE INDEX IF NOT EXISTS collections_created_at_idx ON collections (created_at DESC);
    CREATE INDEX IF NOT EXISTS collections_device_id_idx ON collections (device_id);
    CREATE INDEX IF NOT EXISTS purchases_store_id_idx ON purchases (store_id);
    CREATE INDEX IF NOT EXISTS purchases_created_at_idx ON purchases (created_at DESC);
    CREATE INDEX IF NOT EXISTS purchase_items_purchase_id_idx ON purchase_items (purchase_id);
    CREATE INDEX IF NOT EXISTS purchase_items_product_id_idx ON purchase_items (product_id);
    CREATE INDEX IF NOT EXISTS consumer_orders_store_id_idx ON consumer_orders (store_id);
    CREATE INDEX IF NOT EXISTS consumer_orders_created_at_idx ON consumer_orders (created_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_order_items_order_id_idx ON consumer_order_items (order_id);
    CREATE INDEX IF NOT EXISTS consumer_order_items_product_id_idx ON consumer_order_items (product_id);
  `);

  await pool.query(`
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS address TEXT NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS contact_name TEXT NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS contact_phone TEXT NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS contact_email TEXT NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS location TEXT NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS pos_device_id TEXT NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS kyc_status TEXT NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS upi_vpa_updated_at TIMESTAMPTZ NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS upi_vpa_updated_by TEXT NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE products ADD COLUMN IF NOT EXISTS retailer_status TEXT NULL;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS enrichment_status TEXT NULL;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT NULL;

    ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS device_id TEXT NULL;

    ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_receipt_ref TEXT NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id TEXT NULL;
    ALTER TABLE collections ADD COLUMN IF NOT EXISTS device_id TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS device_token TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS label TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS device_type TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS manufacturer TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS model TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS android_version TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS app_version TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS printing_mode TEXT NULL;
    ALTER TABLE pos_devices ALTER COLUMN store_id DROP NOT NULL;
  `);

  const storeCount = await pool.query("SELECT COUNT(*)::int AS count FROM stores");
  if (storeCount.rows[0]?.count === 0) {
    await pool.query(
      `INSERT INTO stores (id, name, upi_vpa, active) VALUES ($1, $2, $3, $4)`,
      ["store-1", "Supermandi Pilot Store", null, false]
    );
  }

  await pool.query(`
    UPDATE stores
    SET upi_vpa = NULL
    WHERE upi_vpa IS NOT NULL
      AND length(trim(upi_vpa)) = 0;

    UPDATE stores
    SET active = TRUE
    WHERE upi_vpa IS NOT NULL
      AND length(trim(upi_vpa)) > 0;

    UPDATE stores
    SET active = FALSE
    WHERE upi_vpa IS NULL
      OR length(trim(upi_vpa)) = 0
  `);

  ensured = true;
}

export async function ensurePosEventsTable(): Promise<void> {
  await ensureCoreSchema();
}
