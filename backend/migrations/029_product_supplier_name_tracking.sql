-- Migration: 029_product_supplier_name_tracking
-- 10K Store Scale: Track unverified supplier names on products
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- ALTER catalog.store_products: Add supplier name tracking for unverified path
-- =============================================================================

-- supplier_name_raw: Raw supplier name text from retailer (for pending enrollments)
-- This is used when retailer specifies a supplier name but no verified supplier match
ALTER TABLE catalog.store_products ADD COLUMN IF NOT EXISTS supplier_name_raw VARCHAR(255);

-- supplier_id: FK to verified supplier (only set when supplier is verified)
ALTER TABLE catalog.store_products ADD COLUMN IF NOT EXISTS supplier_id UUID;

-- pending_supplier_request_id: FK to supplier_requests (for tracking enrollment)
ALTER TABLE catalog.store_products ADD COLUMN IF NOT EXISTS pending_supplier_request_id UUID;

-- purchase_price: Add if not exists (needed for cost tracking)
ALTER TABLE catalog.store_products ADD COLUMN IF NOT EXISTS purchase_price INTEGER;

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for supplier lookup
CREATE INDEX IF NOT EXISTS store_products_supplier_idx
  ON catalog.store_products (supplier_id)
  WHERE supplier_id IS NOT NULL;

-- Index for pending supplier requests
CREATE INDEX IF NOT EXISTS store_products_pending_supplier_idx
  ON catalog.store_products (pending_supplier_request_id)
  WHERE pending_supplier_request_id IS NOT NULL;

-- =============================================================================
-- CONSTRAINTS
-- =============================================================================

-- If supplier_id is set, supplier_name_raw should be NULL (verified path)
-- If supplier_name_raw is set, supplier_id may be NULL (unverified path)
-- Both can be NULL (no supplier specified)

COMMIT;
