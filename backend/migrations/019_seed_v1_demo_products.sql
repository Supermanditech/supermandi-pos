-- =============================================================================
-- Migration: 019_seed_v1_demo_products
-- Seeds demo products into V1 schema tables (public.products, variants, barcodes, retailer_variants)
-- Required for V1 scan/resolve and products/lookup endpoints
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. SEED PRODUCTS (public.products)
-- =============================================================================
INSERT INTO products (id, name, category, retailer_status, enrichment_status, created_at, updated_at)
VALUES
  -- Standard grocery items
  ('p0000000-0000-0000-0000-000000000001', 'Tata Salt 1kg', 'Grocery', 'active', 'complete', NOW(), NOW()),
  ('p0000000-0000-0000-0000-000000000002', 'Fortune Sunflower Oil 1L', 'Grocery', 'active', 'complete', NOW(), NOW()),
  ('p0000000-0000-0000-0000-000000000003', 'Aashirvaad Atta 5kg', 'Grocery', 'active', 'complete', NOW(), NOW()),
  ('p0000000-0000-0000-0000-000000000004', 'Coca Cola 750ml', 'Beverages', 'active', 'complete', NOW(), NOW()),
  ('p0000000-0000-0000-0000-000000000005', 'Lays Classic Salted 52g', 'Snacks', 'active', 'complete', NOW(), NOW()),
  -- Test product with # character in barcode
  ('p0000000-0000-0000-0000-000000000031', 'Test Product 5004', 'Test', 'active', 'complete', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. SEED VARIANTS (public.variants)
-- =============================================================================
INSERT INTO variants (id, product_id, name, currency, created_at, updated_at)
VALUES
  ('v0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'Tata Salt 1kg', 'INR', NOW(), NOW()),
  ('v0000000-0000-0000-0000-000000000002', 'p0000000-0000-0000-0000-000000000002', 'Fortune Sunflower Oil 1L', 'INR', NOW(), NOW()),
  ('v0000000-0000-0000-0000-000000000003', 'p0000000-0000-0000-0000-000000000003', 'Aashirvaad Atta 5kg', 'INR', NOW(), NOW()),
  ('v0000000-0000-0000-0000-000000000004', 'p0000000-0000-0000-0000-000000000004', 'Coca Cola 750ml', 'INR', NOW(), NOW()),
  ('v0000000-0000-0000-0000-000000000005', 'p0000000-0000-0000-0000-000000000005', 'Lays Classic Salted 52g', 'INR', NOW(), NOW()),
  -- Test variant with # character barcode
  ('v0000000-0000-0000-0000-000000000031', 'p0000000-0000-0000-0000-000000000031', 'Test Product 5004', 'INR', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 3. SEED BARCODES (public.barcodes)
-- Exact-match barcodes - no normalization applied
-- =============================================================================
INSERT INTO barcodes (barcode, variant_id, barcode_type, created_at)
VALUES
  -- Standard EAN barcodes
  ('8901725115159', 'v0000000-0000-0000-0000-000000000001', 'ean13', NOW()),
  ('8901396312017', 'v0000000-0000-0000-0000-000000000002', 'ean13', NOW()),
  ('8901725181086', 'v0000000-0000-0000-0000-000000000003', 'ean13', NOW()),
  ('5449000000996', 'v0000000-0000-0000-0000-000000000004', 'ean13', NOW()),
  ('8901491101615', 'v0000000-0000-0000-0000-000000000005', 'ean13', NOW()),
  -- CRITICAL: Barcode with # character - stored EXACTLY as-is
  ('5004#001000', 'v0000000-0000-0000-0000-000000000031', 'internal', NOW())
ON CONFLICT (barcode) DO NOTHING;

-- =============================================================================
-- 4. SEED RETAILER_VARIANTS (public.retailer_variants)
-- Links variants to demo store with pricing
-- Demo store ID: a0000000-0000-0000-0000-000000000001
-- =============================================================================
INSERT INTO retailer_variants (store_id, variant_id, selling_price_minor, digitised_by_retailer, created_at)
VALUES
  -- Link all variants to demo store with prices (in paise/minor units)
  ('a0000000-0000-0000-0000-000000000001', 'v0000000-0000-0000-0000-000000000001', 2700, true, NOW()),  -- Rs 27
  ('a0000000-0000-0000-0000-000000000001', 'v0000000-0000-0000-0000-000000000002', 16500, true, NOW()), -- Rs 165
  ('a0000000-0000-0000-0000-000000000001', 'v0000000-0000-0000-0000-000000000003', 35000, true, NOW()), -- Rs 350
  ('a0000000-0000-0000-0000-000000000001', 'v0000000-0000-0000-0000-000000000004', 4500, true, NOW()),  -- Rs 45
  ('a0000000-0000-0000-0000-000000000001', 'v0000000-0000-0000-0000-000000000005', 2000, true, NOW()),  -- Rs 20
  -- Test product with # barcode - Rs 99
  ('a0000000-0000-0000-0000-000000000001', 'v0000000-0000-0000-0000-000000000031', 9900, true, NOW())
ON CONFLICT (store_id, variant_id) DO NOTHING;

-- =============================================================================
-- 5. VERIFICATION: Show seeded data
-- =============================================================================
DO $$
DECLARE
  product_count INTEGER;
  variant_count INTEGER;
  barcode_count INTEGER;
  retailer_variant_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO product_count FROM products WHERE id LIKE 'p0000000%';
  SELECT COUNT(*) INTO variant_count FROM variants WHERE id LIKE 'v0000000%';
  SELECT COUNT(*) INTO barcode_count FROM barcodes WHERE variant_id LIKE 'v0000000%';
  SELECT COUNT(*) INTO retailer_variant_count FROM retailer_variants
    WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
    AND variant_id LIKE 'v0000000%';

  RAISE NOTICE 'V1 Demo Seed Complete: % products, % variants, % barcodes, % retailer_variants',
    product_count, variant_count, barcode_count, retailer_variant_count;
END $$;

COMMIT;
