-- Migration: 147_t132_trgm_search_index
-- T-132: Add GIN trigram indexes for fuzzy/typo-tolerant product search
-- pg_trgm extension is already enabled in 000_extensions.sql
-- These indexes dramatically speed up similarity() and ILIKE '%...%' queries

BEGIN;

-- GIN trigram index on store_products.display_name for fuzzy POS search
CREATE INDEX IF NOT EXISTS idx_store_products_name_trgm
  ON catalog.store_products USING gin (display_name gin_trgm_ops);

-- GIN trigram index on products.name for fuzzy search across catalog
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON catalog.products USING gin (name gin_trgm_ops);

-- GIN trigram index on products.brand for fuzzy brand search
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON catalog.products USING gin (brand gin_trgm_ops);

COMMIT;
