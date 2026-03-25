-- Migration: 004_catalog_schema
-- ROLLBACK: DROP SCHEMA IF EXISTS catalog CASCADE;
-- V3.0.9 Foundation: Catalog schema with products, barcodes, mappings
-- Safe to run multiple times (idempotent)

BEGIN;

-- Create catalog schema
CREATE SCHEMA IF NOT EXISTS catalog;

-- =============================================================================
-- TABLE: catalog.products
-- Unified master catalog - single source of truth for products
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Product info
  name VARCHAR(500) NOT NULL,
  description TEXT,
  brand VARCHAR(255),
  category VARCHAR(255),
  unit VARCHAR(50),
  pack_size INTEGER,

  -- Primary barcode (cache - canonical source is product_barcodes)
  primary_barcode VARCHAR(100),

  -- Tax info
  hsn_code VARCHAR(20),
  default_gst_rate DECIMAL(5,2),

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_catalog_products_updated_at ON catalog.products;
CREATE TRIGGER update_catalog_products_updated_at
  BEFORE UPDATE ON catalog.products
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Trigram indexes for fuzzy search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON catalog.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON catalog.products USING gin (brand gin_trgm_ops);

-- Category index
CREATE INDEX IF NOT EXISTS products_category_idx
  ON catalog.products (category);

-- Primary barcode partial unique (only if not null)
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_primary_barcode
  ON catalog.products (primary_barcode)
  WHERE primary_barcode IS NOT NULL;

-- Active products index
CREATE INDEX IF NOT EXISTS products_active_idx
  ON catalog.products (is_active)
  WHERE is_active = true;

-- =============================================================================
-- TABLE: catalog.product_barcodes
-- Normalized barcode table - V3.0.9 canonical source for barcodes
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.product_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product_id UUID NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,

  -- Barcode data
  barcode VARCHAR(100) NOT NULL,
  barcode_type VARCHAR(20) NOT NULL DEFAULT 'ean13',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source VARCHAR(50) NOT NULL DEFAULT 'manual',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_barcode_type CHECK (
    barcode_type IN ('ean13', 'upc', 'internal', 'supplier')
  ),
  CONSTRAINT chk_barcode_source CHECK (
    source IN ('manual', 'supplier_sync', 'grn_scan')
  )
);

-- Global unique barcode (a barcode can only belong to one product)
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_barcodes_barcode
  ON catalog.product_barcodes (barcode);

-- Product lookup
CREATE INDEX IF NOT EXISTS product_barcodes_product_idx
  ON catalog.product_barcodes (product_id);

-- Primary barcode lookup
CREATE INDEX IF NOT EXISTS product_barcodes_primary_idx
  ON catalog.product_barcodes (product_id)
  WHERE is_primary = true;

-- =============================================================================
-- TABLE: catalog.store_products
-- Store-specific product data (pricing, stock cache)
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.store_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id UUID NOT NULL,  -- FK to platform.stores
  product_id UUID NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,

  -- Pricing (sell_price NULLABLE for buy-first scenarios)
  sell_price INTEGER,  -- Minor units (paise)
  mrp INTEGER,  -- Minor units (paise)

  -- Display
  display_name VARCHAR(500),

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Stock read-model (updated via events)
  current_stock INTEGER NOT NULL DEFAULT 0,
  stock_last_event_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT store_products_unique UNIQUE (store_id, product_id),
  CONSTRAINT chk_store_products_prices CHECK (
    (sell_price IS NULL OR sell_price >= 0) AND
    (mrp IS NULL OR mrp >= 0)
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_catalog_store_products_updated_at ON catalog.store_products;
CREATE TRIGGER update_catalog_store_products_updated_at
  BEFORE UPDATE ON catalog.store_products
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Store lookup
CREATE INDEX IF NOT EXISTS store_products_store_idx
  ON catalog.store_products (store_id);

-- Product lookup
CREATE INDEX IF NOT EXISTS store_products_product_idx
  ON catalog.store_products (product_id);

-- Active products for a store
CREATE INDEX IF NOT EXISTS store_products_active_idx
  ON catalog.store_products (store_id, is_active)
  WHERE is_active = true;

-- Low stock alert (stock <= 10)
CREATE INDEX IF NOT EXISTS store_products_low_stock_idx
  ON catalog.store_products (store_id, current_stock)
  WHERE current_stock <= 10 AND is_active = true;

-- =============================================================================
-- TABLE: catalog.supplier_products
-- Supplier's catalog (products they sell)
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  supplier_id UUID NOT NULL,  -- FK to supplier.suppliers

  -- Supplier's product identifiers
  supplier_sku VARCHAR(100),
  barcode VARCHAR(100),

  -- Product info
  name VARCHAR(500) NOT NULL,
  category VARCHAR(255),
  brand VARCHAR(255),
  unit VARCHAR(50),
  pack_size INTEGER,

  -- Pricing (minor units)
  mrp INTEGER,
  purchase_price INTEGER NOT NULL,  -- Price to buy from supplier

  -- Stock info
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  stock_status VARCHAR(20) NOT NULL DEFAULT 'available',

  -- Order constraints
  moq INTEGER NOT NULL DEFAULT 1,  -- Minimum order quantity
  max_qty INTEGER,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_supplier_products_prices CHECK (
    purchase_price >= 0 AND
    (mrp IS NULL OR mrp >= 0)
  ),
  CONSTRAINT chk_supplier_products_stock CHECK (
    stock_quantity >= 0 AND
    stock_status IN ('available', 'low', 'out_of_stock')
  ),
  CONSTRAINT chk_supplier_products_moq CHECK (
    moq >= 1 AND
    (max_qty IS NULL OR max_qty >= moq)
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_catalog_supplier_products_updated_at ON catalog.supplier_products;
CREATE TRIGGER update_catalog_supplier_products_updated_at
  BEFORE UPDATE ON catalog.supplier_products
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Supplier lookup
CREATE INDEX IF NOT EXISTS supplier_products_supplier_idx
  ON catalog.supplier_products (supplier_id);

-- Barcode lookup
CREATE INDEX IF NOT EXISTS idx_supplier_products_barcode
  ON catalog.supplier_products (barcode)
  WHERE barcode IS NOT NULL;

-- Supplier SKU lookup
CREATE INDEX IF NOT EXISTS supplier_products_sku_idx
  ON catalog.supplier_products (supplier_id, supplier_sku)
  WHERE supplier_sku IS NOT NULL;

-- Trigram index for name search
CREATE INDEX IF NOT EXISTS idx_supplier_products_name_trgm
  ON catalog.supplier_products USING gin (name gin_trgm_ops);

-- Active products for supplier
CREATE INDEX IF NOT EXISTS supplier_products_active_idx
  ON catalog.supplier_products (supplier_id, is_active)
  WHERE is_active = true;

-- =============================================================================
-- TABLE: catalog.supplier_product_map
-- BUYABILITY GATE: Links supplier products to master products
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.supplier_product_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  supplier_product_id UUID NOT NULL REFERENCES catalog.supplier_products(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,

  -- Mapping metadata
  mapping_type VARCHAR(20) NOT NULL DEFAULT 'manual',
  confidence DECIMAL(5,4),  -- 0.0000 to 1.0000 for auto-mappings

  -- Audit
  mapped_by_user_id UUID,  -- FK to auth.users
  mapped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Verification
  is_verified BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT supplier_product_map_unique UNIQUE (supplier_product_id, product_id),
  CONSTRAINT chk_mapping_type CHECK (
    mapping_type IN ('auto', 'manual')
  ),
  CONSTRAINT chk_mapping_confidence CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_catalog_supplier_product_map_updated_at ON catalog.supplier_product_map;
CREATE TRIGGER update_catalog_supplier_product_map_updated_at
  BEFORE UPDATE ON catalog.supplier_product_map
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Supplier product lookup (find master product)
CREATE INDEX IF NOT EXISTS supplier_product_map_sp_idx
  ON catalog.supplier_product_map (supplier_product_id);

-- Master product lookup (find all supplier products)
CREATE INDEX IF NOT EXISTS supplier_product_map_product_idx
  ON catalog.supplier_product_map (product_id);

-- Verified mappings
CREATE INDEX IF NOT EXISTS supplier_product_map_verified_idx
  ON catalog.supplier_product_map (supplier_product_id)
  WHERE is_verified = true;

-- =============================================================================
-- TABLE: catalog.catalog_mapping_log
-- Audit log for catalog mapping changes
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.catalog_mapping_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id UUID NOT NULL,  -- FK to platform.stores
  supplier_id UUID NOT NULL,  -- FK to supplier.suppliers
  supplier_product_id UUID NOT NULL,  -- FK to catalog.supplier_products
  product_id UUID NOT NULL,  -- FK to catalog.products

  -- Action
  action VARCHAR(20) NOT NULL,

  -- Metadata
  confidence DECIMAL(5,4),
  actor_user_id UUID,  -- FK to auth.users

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_mapping_log_action CHECK (
    action IN ('auto_map', 'manual_map', 'unmap')
  )
);

-- Store mapping history
CREATE INDEX IF NOT EXISTS catalog_mapping_log_store_idx
  ON catalog.catalog_mapping_log (store_id, created_at DESC);

-- Supplier product history
CREATE INDEX IF NOT EXISTS catalog_mapping_log_sp_idx
  ON catalog.catalog_mapping_log (supplier_product_id, created_at DESC);

-- =============================================================================
-- TABLE: catalog.event_inbox
-- Inbox for processing catalog events from other services
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.event_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  event_id UUID NOT NULL,  -- Original event ID (for deduplication)
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,

  -- Event payload
  payload JSONB NOT NULL,

  -- Processing status
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT event_inbox_event_id_unique UNIQUE (event_id),
  CONSTRAINT chk_event_inbox_retry CHECK (retry_count >= 0)
);

-- Index for unprocessed events
CREATE INDEX IF NOT EXISTS event_inbox_unprocessed_idx
  ON catalog.event_inbox (received_at)
  WHERE processed_at IS NULL;

-- Index for aggregate lookup
CREATE INDEX IF NOT EXISTS event_inbox_aggregate_idx
  ON catalog.event_inbox (aggregate_type, aggregate_id);

-- =============================================================================
-- SEED: Sample products for development
-- =============================================================================

-- Sample master products
INSERT INTO catalog.products (id, name, brand, category, unit, pack_size, primary_barcode, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Tata Salt 1kg', 'Tata', 'Grocery', 'kg', 1, '8901030000000', true),
  ('c0000000-0000-0000-0000-000000000002', 'Aashirvaad Atta 5kg', 'Aashirvaad', 'Grocery', 'kg', 5, '8901058000000', true),
  ('c0000000-0000-0000-0000-000000000003', 'Fortune Sunflower Oil 1L', 'Fortune', 'Grocery', 'L', 1, '8901044000000', true)
ON CONFLICT DO NOTHING;

-- Sample barcodes
INSERT INTO catalog.product_barcodes (product_id, barcode, barcode_type, is_primary, source)
VALUES
  ('c0000000-0000-0000-0000-000000000001', '8901030000000', 'ean13', true, 'manual'),
  ('c0000000-0000-0000-0000-000000000002', '8901058000000', 'ean13', true, 'manual'),
  ('c0000000-0000-0000-0000-000000000003', '8901044000000', 'ean13', true, 'manual')
ON CONFLICT DO NOTHING;

-- Sample supplier products (linked to demo supplier)
INSERT INTO catalog.supplier_products (id, supplier_id, barcode, name, category, brand, unit, pack_size, mrp, purchase_price, stock_quantity, stock_status, moq, is_active)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '8901030000000', 'Tata Salt 1kg', 'Grocery', 'Tata', 'kg', 1, 2700, 2300, 100, 'available', 10, true),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '8901058000000', 'Aashirvaad Atta 5kg', 'Grocery', 'Aashirvaad', 'kg', 5, 35000, 31000, 50, 'available', 5, true),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '8901044000000', 'Fortune Sunflower Oil 1L', 'Grocery', 'Fortune', 'L', 1, 16500, 14500, 80, 'available', 6, true)
ON CONFLICT DO NOTHING;

-- Sample mappings (verified)
INSERT INTO catalog.supplier_product_map (supplier_product_id, product_id, mapping_type, confidence, is_verified)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'auto', 1.0, true),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'auto', 1.0, true),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'auto', 1.0, true)
ON CONFLICT DO NOTHING;

-- Sample store products (linked to demo store)
INSERT INTO catalog.store_products (store_id, product_id, sell_price, mrp, is_active, current_stock)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 2700, 2700, true, 25),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 35000, 35000, true, 10),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 16500, 16500, true, 15)
ON CONFLICT (store_id, product_id) DO NOTHING;

COMMIT;
