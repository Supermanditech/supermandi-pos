-- =============================================================================
-- Migration: 021_prelive_store_isolation
-- TICKET 6: Prelive Store Isolation Rules
--
-- PURPOSE: Add store classification and create isolated prelive store
--
-- ISOLATION RULES (Already enforced by schema design):
-- 1. ALL store-specific tables are keyed by store_id
-- 2. Creating a new store automatically isolates its data
-- 3. Shared data (catalog.products, product_barcodes) is READ-ONLY for stores
--
-- Store Types:
-- - production: Real retailer stores (10,000+ planned)
-- - demo: Demo store for sales demos and testing (ID: a0000000...0001)
-- - prelive: Prelive testing store (ID: a0000000...0002)
--
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Add store_type column to platform.stores
-- =============================================================================

ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS store_type VARCHAR(20) NOT NULL DEFAULT 'production';

-- Add constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_store_type' AND conrelid = 'platform.stores'::regclass
  ) THEN
    ALTER TABLE platform.stores ADD CONSTRAINT chk_store_type
      CHECK (store_type IN ('production', 'demo', 'prelive'));
  END IF;
END $$;

-- Index for store type queries
CREATE INDEX IF NOT EXISTS stores_type_idx ON platform.stores (store_type);

-- =============================================================================
-- 2. Update existing demo store
-- =============================================================================

UPDATE platform.stores
SET store_type = 'demo'
WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- =============================================================================
-- 3. Create prelive store (isolated from demo store)
-- =============================================================================

INSERT INTO platform.stores (
  id,
  name,
  code,
  phone,
  email,
  address_line1,
  city,
  state,
  pincode,
  status,
  store_type
) VALUES (
  'a0000000-0000-0000-0000-000000000002',
  'SuperMandi Prelive Store',
  'PRELIVE001',
  '+91-9876543299',
  'prelive@supermandi.in',
  '456 Test Lane',
  'Bengaluru',
  'Karnataka',
  '560002',
  'active',
  'prelive'
) ON CONFLICT (code) DO UPDATE SET
  store_type = 'prelive',
  name = 'SuperMandi Prelive Store';

-- =============================================================================
-- 4. Add prelive reorder settings (independent from demo)
-- =============================================================================

INSERT INTO reorder.store_reorder_settings (store_id, reorder_enabled, require_approval, notify_on_low_stock)
VALUES ('a0000000-0000-0000-0000-000000000002', true, false, true)
ON CONFLICT (store_id) DO NOTHING;

-- =============================================================================
-- 5. Add prelive feature flag for beta features
-- =============================================================================

INSERT INTO platform.feature_flags (flag_key, scope_type, scope_id, enabled, description)
VALUES
  ('prelive_beta_features', 'store', 'a0000000-0000-0000-0000-000000000002', true, 'Enable beta features for prelive testing')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 6. Update backward-compatibility view
-- NOTE: Must DROP first to change column types (id UUID -> TEXT)
-- =============================================================================

DROP VIEW IF EXISTS public.stores;
CREATE VIEW public.stores AS
  SELECT
    id::TEXT as id,
    name,
    code,
    store_code,
    phone,
    email,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    timezone,
    currency,
    status,
    store_type,
    COALESCE(active, status = 'active') as active,
    upi_vpa,
    scan_lookup_v2_enabled,
    created_at,
    updated_at
  FROM platform.stores;

-- =============================================================================
-- DOCUMENTATION: Store Isolation Rules
-- =============================================================================
--
-- The following tables are ISOLATED per store (keyed by store_id):
--
-- CATALOG:
--   - catalog.store_products (store-specific pricing and stock cache)
--
-- INVENTORY:
--   - inventory.inventory_ledger (append-only stock movements)
--   - inventory.stock_balances (current stock levels)
--
-- ORDERS:
--   - orders.order_sequences (PO number generation)
--   - orders.purchase_orders (purchase orders)
--   - orders.purchase_order_items (order line items)
--   - orders.order_events (audit trail)
--
-- REORDER:
--   - reorder.store_reorder_settings (store settings)
--   - reorder.reorder_policies (per-product thresholds)
--   - reorder.pending_reorders (suggestions)
--   - reorder.reorder_runs (evaluation logs)
--
-- SHARED (READ-ONLY for stores):
--   - catalog.products (master product catalog)
--   - catalog.product_barcodes (barcode lookup)
--   - catalog.supplier_products (supplier catalog)
--   - catalog.supplier_product_map (buyability mappings)
--
-- =============================================================================

-- Log migration
DO $$
DECLARE
  demo_count INTEGER;
  prelive_count INTEGER;
  prod_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO demo_count FROM platform.stores WHERE store_type = 'demo';
  SELECT COUNT(*) INTO prelive_count FROM platform.stores WHERE store_type = 'prelive';
  SELECT COUNT(*) INTO prod_count FROM platform.stores WHERE store_type = 'production';

  RAISE NOTICE 'Migration 021 complete:';
  RAISE NOTICE '  Demo stores: %', demo_count;
  RAISE NOTICE '  Prelive stores: %', prelive_count;
  RAISE NOTICE '  Production stores: %', prod_count;
END $$;

COMMIT;
