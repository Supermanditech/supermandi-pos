-- GCP-STG-0369: Partial index on supplier_products(category) WHERE is_active = true
-- Eliminates full table scan on /admin/catalog/categories GROUP BY at 1M rows
-- ROLLBACK: DROP INDEX IF EXISTS catalog.idx_sp_active_category;

CREATE INDEX IF NOT EXISTS idx_sp_active_category
  ON catalog.supplier_products (category)
  WHERE is_active = true;
