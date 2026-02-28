-- STG-046: Add missing columns to credit_applications
-- STG-047: Expand status CHECK constraint to include kyc_verified and pending

-- Add updated_at column (used by approve/reject endpoints)
ALTER TABLE payments.credit_applications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add rejection_reason column (used by reject endpoint)
ALTER TABLE payments.credit_applications
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Expand status constraint to include kyc_verified and pending
ALTER TABLE payments.credit_applications
  DROP CONSTRAINT IF EXISTS chk_credit_app_status;

ALTER TABLE payments.credit_applications
  ADD CONSTRAINT chk_credit_app_status CHECK (
    status IN ('submitted', 'processing', 'approved', 'disbursed', 'rejected', 'kyc_verified', 'pending')
  );
