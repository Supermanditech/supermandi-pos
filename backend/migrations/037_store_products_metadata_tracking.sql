-- Migration 037: SYNC-PRD-001 - Add metadata tracking to store_products
-- Enables last-write-wins conflict resolution for product name/metadata sync
-- between POS and Dashboard. Server timestamps ensure correct ordering.
-- Safe for 10k+ stores: idempotent, no cross-store bleed.

BEGIN;

-- Add metadata_updated_at column (defaults to NOW() for all existing rows)
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add metadata_updated_by column for audit trail (POS_APP or RETAILER_DASHBOARD)
ALTER TABLE catalog.store_products
  ADD COLUMN IF NOT EXISTS metadata_updated_by VARCHAR(50);

-- Backfill: set display_name = products.name for rows that have NULL display_name
-- This ensures every store_product has an explicit authoritative name (spec: recommended for go-live)
UPDATE catalog.store_products sp
  SET display_name = p.name
  FROM catalog.products p
  WHERE sp.product_id = p.id
    AND sp.display_name IS NULL
    AND p.name IS NOT NULL;

-- Backfill: set metadata_updated_at = updated_at for all rows
UPDATE catalog.store_products
  SET metadata_updated_at = COALESCE(updated_at, created_at)
  WHERE metadata_updated_at IS NULL OR display_name IS NOT NULL;

COMMIT;

-- Index for freshness check queries (must be outside transaction due to pending trigger events)
CREATE INDEX IF NOT EXISTS idx_store_products_metadata_updated
  ON catalog.store_products (store_id, metadata_updated_at DESC)
  WHERE is_active = true;
