-- SM-021: Add KYC columns to credit_applications

-- Add KYC fields
ALTER TABLE payments.credit_applications
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10);

ALTER TABLE payments.credit_applications
  ADD COLUMN IF NOT EXISTS aadhaar_last4 VARCHAR(4);

ALTER TABLE payments.credit_applications
  ADD COLUMN IF NOT EXISTS approved_amount_minor INTEGER;

-- Index for PAN lookup (for duplicate detection)
CREATE INDEX IF NOT EXISTS idx_credit_app_pan
  ON payments.credit_applications(pan_number)
  WHERE pan_number IS NOT NULL;
