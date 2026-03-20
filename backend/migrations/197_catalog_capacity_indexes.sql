-- V3-HARDEN-152: Capacity indexes for 10k-SKU stores, 5k-SKU suppliers, 1000-supplier catalog
-- ROLLBACK: DROP INDEX IF EXISTS idx_sp_store_active_product; DROP INDEX IF EXISTS idx_sp_supplier_active; DROP INDEX IF EXISTS idx_sp_approval_status; DROP INDEX IF EXISTS idx_ssl_store_active; DROP INDEX IF EXISTS idx_spb_store_barcode; DROP INDEX IF EXISTS idx_sb_store_product;

-- 1. Store products: fast lookup for 10k+ SKUs per store
-- Used by: SELL search, store product list, tile grid
CREATE INDEX IF NOT EXISTS idx_sp_store_active_product
  ON catalog.store_products (store_id, is_active, product_id)
  WHERE is_active = true;

-- 2. Supplier products: fast lookup for 5k+ SKUs per supplier
-- Used by: supplier portal product list, admin review queue
CREATE INDEX IF NOT EXISTS idx_sp_supplier_active
  ON catalog.supplier_products (supplier_id, is_active)
  WHERE is_active = true;

-- 3. Supplier products: fast approval queue for admin review
-- Used by: SuperAdmin catalog review (pending/approved/rejected filter)
CREATE INDEX IF NOT EXISTS idx_sp_approval_status
  ON catalog.supplier_products (approval_status)
  WHERE is_active = true;

-- 4. Supplier-store links: fast store-scoped supplier lookup
-- Used by: BUY catalog (join condition), supplier list for store
CREATE INDEX IF NOT EXISTS idx_ssl_store_active
  ON supplier.supplier_store_links (store_id, status)
  WHERE status = 'active';

-- 5. Store product barcodes: fast barcode lookup per store
-- Used by: SELL barcode scan, search exact match
CREATE INDEX IF NOT EXISTS idx_spb_store_barcode
  ON catalog.store_product_barcodes (store_id, barcode);

-- 6. Stock balances: fast stock lookup per store+product
-- Used by: SELL search stock filter, inventory queries
CREATE INDEX IF NOT EXISTS idx_sb_store_product
  ON inventory.stock_balances (store_id, product_id);
