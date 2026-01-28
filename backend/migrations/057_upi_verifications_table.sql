-- Migration 057: GL-RJ-004 UPI Verifications Table
-- Creates payments.upi_verifications for UTR verification tracking
-- Used by /api/v1/pos/payments/upi/verify-utr endpoint

BEGIN;

-- =============================================================================
-- TABLE: payments.upi_verifications
-- Tracks UPI UTR (Unique Transaction Reference) verifications
-- Prevents double-spending by ensuring each UTR is used only once per store
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments.upi_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store reference
  store_id UUID NOT NULL,

  -- UTR (Unique Transaction Reference from UPI)
  utr VARCHAR(50) NOT NULL,

  -- Amount in minor units (paise)
  amount_minor INTEGER NOT NULL,

  -- Verification status
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,

  -- Link to related payment (optional)
  payment_id UUID,

  -- Gateway response for audit
  gateway_response JSONB,

  -- Audit timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: each UTR can only be used once per store
  CONSTRAINT upi_verifications_store_utr_unique UNIQUE (store_id, utr)
);

-- Index for UTR lookups (case-sensitive)
CREATE INDEX IF NOT EXISTS idx_upi_verifications_utr
  ON payments.upi_verifications(utr);

-- Index for store lookups
CREATE INDEX IF NOT EXISTS idx_upi_verifications_store
  ON payments.upi_verifications(store_id, created_at DESC);

-- Index for payment lookups
CREATE INDEX IF NOT EXISTS idx_upi_verifications_payment
  ON payments.upi_verifications(payment_id)
  WHERE payment_id IS NOT NULL;

-- Comment for documentation
COMMENT ON TABLE payments.upi_verifications IS 'GL-RJ-004: UTR verification tracking for UPI payments';
COMMENT ON COLUMN payments.upi_verifications.utr IS 'Unique Transaction Reference from UPI payment';
COMMENT ON COLUMN payments.upi_verifications.verified IS 'Whether the UTR has been verified with payment gateway';

COMMIT;
