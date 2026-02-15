-- Migration: 133_t066_supplier_auto_approval
-- T-066: Supplier auto-approval queue
-- Trusted/verified suppliers can have their products auto-approved
-- SuperAdmin toggles auto_approve_products per supplier
-- Safe to run multiple times (idempotent)

BEGIN;

-- Add auto_approve_products flag to suppliers table
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS auto_approve_products BOOLEAN NOT NULL DEFAULT false;

-- Add auto_approved_by to supplier_products for audit trail
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN supplier.suppliers.auto_approve_products IS
  'When true, products from this supplier are auto-approved on creation (no manual review needed). Only for verified/trusted suppliers.';

COMMENT ON COLUMN catalog.supplier_products.auto_approved IS
  'Whether this product was auto-approved (vs manual approval). For audit trail.';

COMMIT;
