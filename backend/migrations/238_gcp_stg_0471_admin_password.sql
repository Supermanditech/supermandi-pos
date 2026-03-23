-- GCP-STG-0471: Password fallback for SuperAdmin login
-- ROLLBACK: ALTER TABLE admin_totp DROP COLUMN IF EXISTS password_hash;
ALTER TABLE admin_totp ADD COLUMN IF NOT EXISTS password_hash TEXT;
