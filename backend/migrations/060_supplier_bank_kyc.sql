-- Migration: 060_supplier_bank_kyc
-- GL-WF-008: Bank verification status tracking
-- GL-WF-018: KYC document storage
-- GL-WF-042: Bank verification status indicator
-- GL-WF-034: Email verification

BEGIN;

-- =============================================================================
-- GL-WF-008/042: Add bank verification status to suppliers table
-- =============================================================================
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS bank_verification_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS bank_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bank_verification_ref VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);

-- GL-WF-034: Email verification
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ;

-- =============================================================================
-- GL-WF-018: KYC Documents table
-- =============================================================================
CREATE TABLE IF NOT EXISTS supplier.kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier.suppliers(id) ON DELETE CASCADE,

  -- Document type: pan_card, gstin_certificate, address_proof, cancelled_cheque, business_license
  document_type VARCHAR(50) NOT NULL,

  -- File storage
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100) NOT NULL,

  -- Verification status
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  rejection_reason TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT kyc_documents_unique_type UNIQUE (supplier_id, document_type)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_supplier_kyc_documents_updated_at ON supplier.kyc_documents;
CREATE TRIGGER update_supplier_kyc_documents_updated_at
  BEFORE UPDATE ON supplier.kyc_documents
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kyc_documents_supplier ON supplier.kyc_documents(supplier_id);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_status ON supplier.kyc_documents(status);

-- =============================================================================
-- GL-WF-044: Payout history table
-- =============================================================================
CREATE TABLE IF NOT EXISTS supplier.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier.suppliers(id) ON DELETE CASCADE,

  -- Payout details
  amount_paise BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed

  -- Bank details snapshot (at time of payout)
  bank_account_number VARCHAR(20),
  bank_ifsc VARCHAR(11),
  bank_account_name VARCHAR(100),

  -- Reference
  reference_id VARCHAR(100),
  payment_gateway_ref VARCHAR(100),

  -- Failure info
  failure_reason TEXT,

  -- Timestamps
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_supplier_payouts_updated_at ON supplier.payouts;
CREATE TRIGGER update_supplier_payouts_updated_at
  BEFORE UPDATE ON supplier.payouts
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payouts_supplier ON supplier.payouts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON supplier.payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_initiated ON supplier.payouts(initiated_at DESC);

-- =============================================================================
-- GL-WF-038/039: Order item tracking and shipment
-- =============================================================================
-- Add tracking columns to orders table if exists
DO $$
BEGIN
  -- Check if orders table exists in supplier schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'orders' AND table_name = 'orders') THEN
    -- Add shipment tracking columns
    ALTER TABLE orders.orders
      ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS carrier VARCHAR(50),
      ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS estimated_delivery TIMESTAMPTZ;
  END IF;
END $$;

-- Create order item status table for per-item tracking
CREATE TABLE IF NOT EXISTS supplier.order_item_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,

  -- Item status: pending, packed, shipped, delivered, returned
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  quantity_fulfilled INTEGER,

  -- Notes
  notes TEXT,

  -- Timestamps
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_order_item_status_updated_at ON supplier.order_item_status;
CREATE TRIGGER update_order_item_status_updated_at
  BEFORE UPDATE ON supplier.order_item_status
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_item_status_order ON supplier.order_item_status(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_status_product ON supplier.order_item_status(product_id);

COMMIT;
