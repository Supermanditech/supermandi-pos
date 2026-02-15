-- Migration: 132_t065_catalog_scalability_indexes
-- T-065: Scalability indexes for 10K suppliers × 1M SKUs
-- Addresses: approval_status scans, supplier search, N+1 query patterns
-- Safe to run multiple times (idempotent via IF NOT EXISTS)

BEGIN;

-- 1. Approval status index on supplier_products (used by admin pending products query)
-- Without this, every pending products query does a full table scan of 1M+ rows
CREATE INDEX IF NOT EXISTS idx_supplier_products_approval_created
  ON catalog.supplier_products (approval_status, created_at DESC);

-- 2. Composite index for supplier catalog discovery (retailer browsing approved products)
-- Query: WHERE approval_status = 'approved' AND supplier_id = $x
CREATE INDEX IF NOT EXISTS idx_supplier_products_approved_supplier
  ON catalog.supplier_products (supplier_id, approval_status)
  WHERE approval_status = 'approved' AND is_active = true;

-- 3. Trigram index on supplier business_name for ILIKE search
-- Used by both admin and retailer supplier search endpoints
CREATE INDEX IF NOT EXISTS idx_suppliers_business_name_trgm
  ON supplier.suppliers USING gin (business_name gin_trgm_ops);

-- 4. GSTIN index on suppliers (exact match lookups)
CREATE INDEX IF NOT EXISTS idx_suppliers_gstin
  ON supplier.suppliers (gstin)
  WHERE gstin IS NOT NULL;

-- 5. Verification status index on suppliers (admin queries filter by this)
CREATE INDEX IF NOT EXISTS idx_suppliers_verification_status
  ON supplier.suppliers (verification_status, created_at DESC);

-- 6. Store-supplier link composite index (retailer supplier list)
-- Existing: supplier_store_links has store_id, but no composite with status
CREATE INDEX IF NOT EXISTS idx_store_supplier_links_store_status
  ON supplier.supplier_store_links (store_id, status)
  WHERE status = 'active';

-- 7. Supplier product map: product_id index with verified flag
-- Used during retailer "add to catalog" flow
CREATE INDEX IF NOT EXISTS idx_supplier_product_map_product_verified
  ON catalog.supplier_product_map (product_id, is_verified);

COMMIT;
