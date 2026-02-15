-- Migration: 138_t159_product_image_url
-- T-159: Add image URL columns to product tables
-- Supports product images across supplier catalog, store catalog, and master catalog
-- image_url: full-size product image
-- thumbnail_url: small thumbnail for list views (optimization)
-- card_image_url: medium card image for grid/card views (optimization)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- catalog.supplier_products — supplier's product images
-- =============================================================================
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500) DEFAULT NULL;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS card_image_url VARCHAR(500) DEFAULT NULL;

COMMENT ON COLUMN catalog.supplier_products.image_url IS
  'Full-size product image URL (uploaded by supplier or synced)';
COMMENT ON COLUMN catalog.supplier_products.thumbnail_url IS
  'Small thumbnail URL for list views (~100x100). Generated from image_url.';
COMMENT ON COLUMN catalog.supplier_products.card_image_url IS
  'Medium card image URL for grid/card views (~300x300). Generated from image_url.';

-- =============================================================================
-- catalog.store_products — store-specific product images (can override master)
-- =============================================================================
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL;

ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500) DEFAULT NULL;

ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS card_image_url VARCHAR(500) DEFAULT NULL;

COMMENT ON COLUMN catalog.store_products.image_url IS
  'Store-specific product image URL. Overrides master catalog image if set.';
COMMENT ON COLUMN catalog.store_products.thumbnail_url IS
  'Store-specific thumbnail URL for list views (~100x100).';
COMMENT ON COLUMN catalog.store_products.card_image_url IS
  'Store-specific card image URL for grid/card views (~300x300).';

-- =============================================================================
-- catalog.products — master catalog images
-- =============================================================================
ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL;

ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500) DEFAULT NULL;

ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS card_image_url VARCHAR(500) DEFAULT NULL;

COMMENT ON COLUMN catalog.products.image_url IS
  'Master catalog product image URL. Used as fallback when store/supplier image is not set.';
COMMENT ON COLUMN catalog.products.thumbnail_url IS
  'Master catalog thumbnail URL for list views (~100x100).';
COMMENT ON COLUMN catalog.products.card_image_url IS
  'Master catalog card image URL for grid/card views (~300x300).';

COMMIT;
