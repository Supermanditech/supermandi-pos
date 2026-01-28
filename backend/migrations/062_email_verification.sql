-- GL-WF-034: Email Verification for Supplier Portal
-- Adds email verification status and token columns

BEGIN;

-- Add email verification columns to suppliers table
ALTER TABLE supplier.suppliers
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(6),
ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ;

-- Index for token lookup
CREATE INDEX IF NOT EXISTS idx_suppliers_email_verification_token
ON supplier.suppliers (email_verification_token)
WHERE email_verification_token IS NOT NULL;

COMMIT;
