-- =============================================================================
-- Migration: 022_seed_prelive_store
-- ROLLBACK: DELETE FROM platform.stores WHERE code = 'PRELIVE001'; (seed data only)
-- Seeds the prelive store with isolated sample data
-- Does NOT touch demo store data (complete isolation)
--
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- PRELIVE STORE IDs (defined in 021_prelive_store_isolation)
-- =============================================================================
-- Store ID: a0000000-0000-0000-0000-000000000002
-- Supplier ID: b0000000-0000-0000-0000-000000000002 (separate from demo supplier)

-- =============================================================================
-- 1. PRELIVE SUPPLIER (separate from demo supplier)
-- =============================================================================

INSERT INTO supplier.suppliers (id, gstin, business_name, trade_name, primary_phone, primary_email, status, created_at)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  '29AABCT5678E2Z6',
  'Prelive Wholesale Pvt Ltd',
  'Prelive Wholesale',
  '+91-9876543288',
  'prelive-wholesale@supermandi.in',
  'active',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Link supplier to prelive store
INSERT INTO supplier.supplier_store_links (store_id, supplier_id, is_preferred, status, created_at)
VALUES (
  'a0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000002',
  true,
  'active',
  NOW()
) ON CONFLICT (store_id, supplier_id) DO NOTHING;

-- =============================================================================
-- 2. PRELIVE STORE PRODUCTS (using shared catalog.products)
-- Link existing master products to prelive store with DIFFERENT pricing
-- =============================================================================

INSERT INTO catalog.store_products (id, store_id, product_id, sell_price, mrp, current_stock, is_active, created_at)
SELECT
  gen_random_uuid(),
  'a0000000-0000-0000-0000-000000000002',  -- Prelive store
  id,
  -- Different pricing from demo store (10% higher base)
  CASE category
    WHEN 'Grocery' THEN 2750 + (RANDOM() * 5500)::INTEGER
    WHEN 'Beverages' THEN 3850 + (RANDOM() * 1100)::INTEGER
    WHEN 'Snacks' THEN 2200 + (RANDOM() * 3300)::INTEGER
    WHEN 'Dairy' THEN 5500 + (RANDOM() * 11000)::INTEGER
    WHEN 'Personal Care' THEN 8800 + (RANDOM() * 16500)::INTEGER
    WHEN 'Household' THEN 5500 + (RANDOM() * 11000)::INTEGER
    ELSE 10890
  END,
  CASE category
    WHEN 'Grocery' THEN 3300 + (RANDOM() * 6600)::INTEGER
    WHEN 'Beverages' THEN 4400 + (RANDOM() * 1650)::INTEGER
    WHEN 'Snacks' THEN 2750 + (RANDOM() * 4400)::INTEGER
    WHEN 'Dairy' THEN 6600 + (RANDOM() * 13200)::INTEGER
    WHEN 'Personal Care' THEN 11000 + (RANDOM() * 22000)::INTEGER
    WHEN 'Household' THEN 6600 + (RANDOM() * 13200)::INTEGER
    ELSE 13200
  END,
  -- Different stock levels (lower than demo)
  20 + (RANDOM() * 50)::INTEGER,
  true,
  NOW()
FROM catalog.products
WHERE id::text LIKE 'c0000000%'
ON CONFLICT (store_id, product_id) DO UPDATE SET
  current_stock = EXCLUDED.current_stock,
  updated_at = NOW();

-- =============================================================================
-- 3. PRELIVE SUPPLIER PRODUCT MAP
-- NOTE: Skipped - catalog.supplier_product_map schema has changed
-- The table now maps supplier_products to catalog products, not suppliers directly
-- =============================================================================

-- Legacy INSERT removed as schema has diverged

-- =============================================================================
-- 4. PRELIVE REORDER POLICIES (separate from demo)
-- =============================================================================

INSERT INTO reorder.reorder_policies (store_id, product_id, min_stock, target_stock, preferred_supplier_id, is_enabled)
SELECT
  'a0000000-0000-0000-0000-000000000002',  -- Prelive store
  id,
  -- Lower thresholds for prelive
  3,
  20,
  'b0000000-0000-0000-0000-000000000002',  -- Prelive supplier
  true
FROM catalog.products
WHERE id::text LIKE 'c0000000%'
  AND id IN (
    'c0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000003'
  )
ON CONFLICT (store_id, product_id) DO NOTHING;

-- =============================================================================
-- 5. PRELIVE STOCK BALANCES (initialize from store_products)
-- =============================================================================

INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, updated_at)
SELECT
  store_id,
  product_id,
  current_stock,
  NOW()
FROM catalog.store_products
WHERE store_id = 'a0000000-0000-0000-0000-000000000002'
ON CONFLICT (store_id, product_id) DO UPDATE SET
  current_qty = EXCLUDED.current_qty,
  updated_at = NOW();

-- =============================================================================
-- 6. PRELIVE ORDER SEQUENCE
-- =============================================================================

INSERT INTO orders.order_sequences (store_id, store_code, current_year, current_seq, updated_at)
VALUES (
  'a0000000-0000-0000-0000-000000000002',
  'PRELIVE001',
  EXTRACT(YEAR FROM NOW())::INTEGER,
  0,
  NOW()
) ON CONFLICT (store_id) DO NOTHING;

-- =============================================================================
-- VERIFICATION: Show isolation summary
-- =============================================================================

DO $$
DECLARE
  demo_products INTEGER;
  prelive_products INTEGER;
  demo_stock INTEGER;
  prelive_stock INTEGER;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(current_stock), 0)
  INTO demo_products, demo_stock
  FROM catalog.store_products
  WHERE store_id = 'a0000000-0000-0000-0000-000000000001';

  SELECT COUNT(*), COALESCE(SUM(current_stock), 0)
  INTO prelive_products, prelive_stock
  FROM catalog.store_products
  WHERE store_id = 'a0000000-0000-0000-0000-000000000002';

  RAISE NOTICE 'Migration 022 complete - Store Isolation Verified:';
  RAISE NOTICE '  Demo Store:';
  RAISE NOTICE '    - Products: %', demo_products;
  RAISE NOTICE '    - Total Stock: %', demo_stock;
  RAISE NOTICE '  Prelive Store:';
  RAISE NOTICE '    - Products: %', prelive_products;
  RAISE NOTICE '    - Total Stock: %', prelive_stock;
  RAISE NOTICE '  Isolation: Demo and Prelive have INDEPENDENT data';
END $$;

COMMIT;
