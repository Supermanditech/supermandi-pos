-- Migration: 131_t063_supplier_product_barcode_unique
-- T-063: Add unique constraint on (supplier_id, barcode) for supplier_products
-- Enables CSV upload dedup: same barcode from same supplier = update, not duplicate
-- Only applies where barcode IS NOT NULL (multiple products without barcode are allowed)
-- Safe to run multiple times (idempotent)

BEGIN;

-- Create unique partial index (only where barcode is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_products_supplier_barcode_unique
  ON catalog.supplier_products (supplier_id, barcode)
  WHERE barcode IS NOT NULL;

COMMIT;
