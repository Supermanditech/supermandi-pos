-- Migration: 034_store_category_overrides
-- RCAT-CAT-002: Store-level category overrides (rename/hide)
-- Categories are auto-derived from FMCG taxonomy, but stores can:
--   1. Rename categories (display_name_en, display_name_hi)
--   2. Hide categories (is_hidden = true)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Store Category Overrides table
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.store_category_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  category_id UUID NOT NULL,
  display_name_en TEXT,
  display_name_hi TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, category_id)
);

COMMENT ON TABLE catalog.store_category_overrides IS
  'Store-level overrides for FMCG taxonomy categories. Allows rename and hide per store.';

-- Index for fast lookup by store_id
CREATE INDEX IF NOT EXISTS idx_store_category_overrides_store
  ON catalog.store_category_overrides (store_id);

COMMIT;
