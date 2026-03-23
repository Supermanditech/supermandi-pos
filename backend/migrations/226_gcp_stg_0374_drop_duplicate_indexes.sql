-- GCP-STG-0374: Remove duplicate indexes on store_products
--
-- store_products_store_id_idx (migration 104) duplicates store_products_store_idx (migration 004)
-- idx_store_products_name_trgm (migration 147) duplicates idx_store_products_display_name_trgm (migration 036)
--
-- The originals (004, 036) are kept; the duplicates (104, 147) are dropped.

DROP INDEX IF EXISTS catalog.store_products_store_id_idx;
DROP INDEX IF EXISTS catalog.idx_store_products_name_trgm;

-- ROLLBACK:
-- CREATE INDEX IF NOT EXISTS store_products_store_id_idx ON catalog.store_products (store_id);
-- CREATE INDEX IF NOT EXISTS idx_store_products_name_trgm ON catalog.store_products USING gin (display_name gin_trgm_ops);
