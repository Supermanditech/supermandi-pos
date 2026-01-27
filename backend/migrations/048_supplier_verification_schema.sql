-- Migration: 048_supplier_verification_schema
-- SM-001: Supplier Verification Schema Migration
-- Adds supplier status, product approval_status, SuperMandi margin, BNPL eligibility columns
-- Foundation for all supplier verification and product approval flows
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- ALTER supplier.suppliers: Add verification and payment columns
-- =============================================================================

-- Rejection reason for when supplier is rejected
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Bank account details for payouts
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(20);

ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(11);

ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(100);

-- UPI VPA for payouts
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS upi_vpa VARCHAR(100);

-- Razorpay integration IDs
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS razorpay_contact_id VARCHAR(50);

ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS razorpay_fund_account_id VARCHAR(50);

-- Update verification_status constraint to include 'suspended' state
DO $$ BEGIN
  ALTER TABLE supplier.suppliers DROP CONSTRAINT IF EXISTS chk_suppliers_verification_status;
  ALTER TABLE supplier.suppliers ADD CONSTRAINT chk_suppliers_verification_status
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'unverified', 'suspended'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- ALTER catalog.supplier_products: Add approval and margin columns
-- =============================================================================

-- Approval status (pending, approved, rejected)
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending';

-- Add constraint for approval_status
DO $$ BEGIN
  ALTER TABLE catalog.supplier_products
    ADD CONSTRAINT chk_supplier_products_approval_status
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Approval audit fields
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS approved_by UUID;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- SuperAdmin can edit product name/category before approval
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS edited_name VARCHAR(200);

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS edited_category VARCHAR(100);

-- SuperMandi margin (added by SuperAdmin)
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS supermandi_margin_minor INTEGER DEFAULT 0;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS margin_percent DECIMAL(5,2);

-- BNPL eligibility (set by SuperAdmin)
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS bnpl_eligible BOOLEAN DEFAULT FALSE;

ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS bnpl_max_days INTEGER DEFAULT 7;

-- =============================================================================
-- TABLE: supplier.approval_logs
-- Immutable audit log for all status transitions (supplier and product)
-- =============================================================================
CREATE TABLE IF NOT EXISTS supplier.approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity being approved/rejected
  entity_type VARCHAR(20) NOT NULL,  -- 'supplier' or 'product'
  entity_id UUID NOT NULL,

  -- Action taken
  action VARCHAR(20) NOT NULL,  -- 'approve', 'reject', 'suspend', 'reactivate', 'edit'

  -- Status transition
  from_status VARCHAR(20),
  to_status VARCHAR(20),

  -- Changes made (for edit actions)
  changes JSONB,

  -- Reason for action
  reason TEXT,

  -- Actor who performed the action
  actor_id UUID NOT NULL,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_approval_logs_entity_type
    CHECK (entity_type IN ('supplier', 'product')),
  CONSTRAINT chk_approval_logs_action
    CHECK (action IN ('approve', 'reject', 'suspend', 'reactivate', 'edit', 'submit'))
);

-- Indexes for approval_logs
CREATE INDEX IF NOT EXISTS idx_approval_logs_entity
  ON supplier.approval_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_approval_logs_actor
  ON supplier.approval_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_approval_logs_created
  ON supplier.approval_logs(created_at DESC);

-- =============================================================================
-- INDEX: Visibility index for approved products
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_sp_visibility
  ON catalog.supplier_products(supplier_id)
  WHERE approval_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_sp_approval_status
  ON catalog.supplier_products(approval_status);

-- =============================================================================
-- BACKFILL: Existing data as verified/approved
-- Ensures backward compatibility - existing suppliers and products remain visible
-- =============================================================================

-- Backfill existing suppliers: set verification_status to 'verified' if NULL or 'pending'
-- Only if they have business_name (real suppliers)
UPDATE supplier.suppliers
  SET verification_status = 'verified'
  WHERE verification_status IS NULL
    OR verification_status = 'pending'
    AND business_name IS NOT NULL;

-- Backfill existing supplier_products: set approval_status to 'approved' if NULL or 'pending'
UPDATE catalog.supplier_products
  SET approval_status = 'approved',
      approved_at = created_at
  WHERE approval_status IS NULL
    OR approval_status = 'pending';

-- =============================================================================
-- GRANTS: Ensure service accounts have access
-- =============================================================================
-- Note: Grants are handled by the service account setup, not migrations

COMMIT;
