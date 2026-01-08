import { getPool } from "./client";

let ensured = false;

export async function ensureCoreSchema(): Promise<void> {
  if (ensured) return;

  const pool = getPool();
  if (!pool) return;

  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.variants') IS NULL AND to_regclass('public.products') IS NOT NULL THEN
        ALTER TABLE products RENAME TO variants;
      END IF;
      IF to_regclass('public.retailer_variants') IS NULL AND to_regclass('public.retailer_products') IS NOT NULL THEN
        ALTER TABLE retailer_products RENAME TO retailer_variants;
      END IF;
    END $$;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'retailer_variants' AND column_name = 'product_id'
      ) THEN
        ALTER TABLE retailer_variants RENAME COLUMN product_id TO variant_id;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scan_events' AND column_name = 'product_id'
      ) THEN
        ALTER TABLE scan_events RENAME COLUMN product_id TO variant_id;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'product_id'
      ) THEN
        ALTER TABLE sale_items RENAME COLUMN product_id TO variant_id;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'consumer_order_items' AND column_name = 'product_id'
      ) THEN
        ALTER TABLE consumer_order_items RENAME COLUMN product_id TO variant_id;
      END IF;
    END $$;

    -- Idempotent purchase_items rename/backfill to avoid 42701 when variant_id already exists.
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='purchase_items' AND column_name='product_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='purchase_items' AND column_name='variant_id'
      ) THEN
        ALTER TABLE purchase_items RENAME COLUMN product_id TO variant_id;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='purchase_items' AND column_name='product_id'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='purchase_items' AND column_name='variant_id'
      ) THEN
        UPDATE purchase_items
          SET variant_id = COALESCE(variant_id, product_id)
        WHERE variant_id IS NULL AND product_id IS NOT NULL;
      END IF;
    END $$;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'variants' AND column_name = 'barcode' AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE variants ALTER COLUMN barcode DROP NOT NULL;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      upi_vpa TEXT NULL,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      scan_lookup_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
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

    CREATE TABLE IF NOT EXISTS global_products (
      id TEXT PRIMARY KEY,
      global_name TEXT NOT NULL,
      category TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS global_product_identifiers (
      id TEXT PRIMARY KEY,
      global_product_id TEXT NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
      code_type TEXT NOT NULL,
      raw_value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS store_products (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      global_product_id TEXT NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
      store_display_name TEXT NULL,
      sell_price_minor INTEGER NULL,
      purchase_price_minor INTEGER NULL,
      unit TEXT NULL,
      variant TEXT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (store_id, global_product_id)
    );

    CREATE TABLE IF NOT EXISTS store_inventory (
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      global_product_id TEXT NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
      available_qty INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (store_id, global_product_id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NULL,
      retailer_status TEXT NULL,
      enrichment_status TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      unit_base TEXT NULL,
      size_base INTEGER NULL,
      retailer_status TEXT NULL,
      enrichment_status TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS barcodes (
      barcode TEXT PRIMARY KEY,
      variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
      barcode_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS retailer_variants (
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
      selling_price_minor INTEGER NULL,
      digitised_by_retailer BOOLEAN NOT NULL DEFAULT TRUE,
      price_updated_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (store_id, variant_id)
    );

    CREATE TABLE IF NOT EXISTS bulk_inventory (
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      base_unit TEXT NOT NULL,
      quantity_base INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (store_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS scan_events (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      device_id TEXT NULL,
      scan_value TEXT NOT NULL,
      mode TEXT NOT NULL,
      action TEXT NOT NULL,
      variant_id TEXT NULL REFERENCES variants(id) ON DELETE SET NULL,
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
      variant_id TEXT NOT NULL REFERENCES variants(id),
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
      scan_lookup_v2_enabled BOOLEAN NULL,
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
      variant_id TEXT NULL REFERENCES variants(id) ON DELETE SET NULL,
      sku TEXT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NULL,
      quantity_base INTEGER NULL,
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
      variant_id TEXT NULL REFERENCES variants(id) ON DELETE SET NULL,
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
    CREATE INDEX IF NOT EXISTS global_products_name_idx ON global_products (global_name);
    CREATE INDEX IF NOT EXISTS global_product_identifiers_product_id_idx ON global_product_identifiers (global_product_id);
    CREATE INDEX IF NOT EXISTS global_product_identifiers_code_type_idx ON global_product_identifiers (code_type);
    CREATE UNIQUE INDEX IF NOT EXISTS global_product_identifiers_code_norm_uidx
      ON global_product_identifiers (code_type, normalized_value);
    CREATE INDEX IF NOT EXISTS store_products_store_id_idx ON store_products (store_id);
    CREATE INDEX IF NOT EXISTS store_products_global_product_id_idx ON store_products (global_product_id);
    CREATE INDEX IF NOT EXISTS store_inventory_store_id_idx ON store_inventory (store_id);
    CREATE INDEX IF NOT EXISTS store_inventory_global_product_id_idx ON store_inventory (global_product_id);
    CREATE INDEX IF NOT EXISTS pos_devices_store_id_idx ON pos_devices (store_id);
    CREATE INDEX IF NOT EXISTS pos_devices_last_seen_idx ON pos_devices (last_seen_online DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS pos_devices_token_uidx ON pos_devices (device_token) WHERE device_token IS NOT NULL;
    CREATE INDEX IF NOT EXISTS pos_device_enrollments_store_idx ON pos_device_enrollments (store_id);
    CREATE INDEX IF NOT EXISTS pos_device_enrollments_expires_idx ON pos_device_enrollments (expires_at);
    CREATE INDEX IF NOT EXISTS processed_events_device_idx ON processed_events (device_id);
    CREATE INDEX IF NOT EXISTS processed_events_received_idx ON processed_events (received_at DESC);
    CREATE INDEX IF NOT EXISTS barcodes_variant_id_idx ON barcodes (variant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS barcodes_variant_type_uidx ON barcodes (variant_id, barcode_type);
    CREATE INDEX IF NOT EXISTS retailer_products_store_id_idx ON retailer_variants (store_id);
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
    CREATE INDEX IF NOT EXISTS purchase_items_variant_id_idx ON purchase_items (variant_id);
    CREATE INDEX IF NOT EXISTS consumer_orders_store_id_idx ON consumer_orders (store_id);
    CREATE INDEX IF NOT EXISTS consumer_orders_created_at_idx ON consumer_orders (created_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_order_items_order_id_idx ON consumer_order_items (order_id);
    CREATE INDEX IF NOT EXISTS consumer_order_items_product_id_idx ON consumer_order_items (variant_id);
  `);

  // Keep purchase_items rename idempotent to avoid 42701 in prod when variant_id already exists.
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
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS scan_lookup_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE products ADD COLUMN IF NOT EXISTS retailer_status TEXT NULL;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS enrichment_status TEXT NULL;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT NULL;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE variants ADD COLUMN IF NOT EXISTS product_id TEXT NULL;
    ALTER TABLE variants ADD COLUMN IF NOT EXISTS name TEXT NULL;
    ALTER TABLE variants ADD COLUMN IF NOT EXISTS category TEXT NULL;
    ALTER TABLE variants ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
    ALTER TABLE variants ADD COLUMN IF NOT EXISTS unit_base TEXT NULL;
    ALTER TABLE variants ADD COLUMN IF NOT EXISTS size_base INTEGER NULL;
    ALTER TABLE variants ADD COLUMN IF NOT EXISTS retailer_status TEXT NULL;
    ALTER TABLE variants ADD COLUMN IF NOT EXISTS enrichment_status TEXT NULL;
    ALTER TABLE variants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE variants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS product_id TEXT NULL;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS unit TEXT NULL;
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS quantity_base INTEGER NULL;

    ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS device_id TEXT NULL;

    ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_receipt_ref TEXT NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id TEXT NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS item_name TEXT NULL;
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS barcode TEXT NULL;
    ALTER TABLE collections ADD COLUMN IF NOT EXISTS device_id TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS device_token TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS label TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS device_type TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS manufacturer TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS model TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS android_version TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS app_version TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS printing_mode TEXT NULL;
    ALTER TABLE pos_devices ADD COLUMN IF NOT EXISTS scan_lookup_v2_enabled BOOLEAN NULL;
    ALTER TABLE pos_devices ALTER COLUMN store_id DROP NOT NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'purchase_items'
          AND column_name = 'product_id'
      ) THEN
        CREATE INDEX IF NOT EXISTS purchase_items_product_id_idx ON purchase_items (product_id);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'variants'
          AND column_name = 'product_id'
      ) THEN
        CREATE INDEX IF NOT EXISTS variants_product_id_idx ON variants (product_id);
      END IF;
    END $$;
  `);

  await pool.query(`
    UPDATE variants
    SET product_id = id
    WHERE product_id IS NULL;

    INSERT INTO products (id, name, category, retailer_status, enrichment_status, created_at, updated_at)
    SELECT v.product_id, v.name, v.category, v.retailer_status, v.enrichment_status, v.created_at, v.updated_at
    FROM variants v
    LEFT JOIN products p ON p.id = v.product_id
    WHERE v.product_id IS NOT NULL AND p.id IS NULL;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'variants' AND column_name = 'barcode'
      ) THEN
        INSERT INTO barcodes (barcode, variant_id, barcode_type, created_at)
        SELECT v.barcode, v.id, 'supermandi', COALESCE(v.created_at, NOW())
        FROM variants v
        WHERE v.barcode IS NOT NULL
        ON CONFLICT (barcode) DO NOTHING;
      END IF;
    END $$;

    UPDATE purchase_items pi
    SET product_id = v.product_id
    FROM variants v
    WHERE pi.product_id IS NULL
      AND pi.variant_id IS NOT NULL
      AND v.id = pi.variant_id;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'variants'
          AND constraint_name = 'variants_product_id_fkey'
      ) THEN
        ALTER TABLE variants
          ADD CONSTRAINT variants_product_id_fkey
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
      END IF;
    END $$;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'variants' AND column_name = 'product_id' AND is_nullable = 'YES'
      ) THEN
        ALTER TABLE variants ALTER COLUMN product_id SET NOT NULL;
      END IF;
    END $$;
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
