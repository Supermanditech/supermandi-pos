-- Migration: 194_supplier_sku_capacity
-- SYS-001: Add max SKU capacity per supplier to prevent unbounded catalogue growth
-- Default 3000 SKUs per supplier, configurable by SuperAdmin
-- Safe to run multiple times (idempotent)
-- ROLLBACK: ALTER TABLE supplier.suppliers DROP COLUMN IF EXISTS max_sku_capacity;

BEGIN;

ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS max_sku_capacity INTEGER NOT NULL DEFAULT 3000;

COMMENT ON COLUMN supplier.suppliers.max_sku_capacity IS 'Maximum number of SKUs this supplier can register. Default 3000. SuperAdmin can adjust.';

COMMIT;
