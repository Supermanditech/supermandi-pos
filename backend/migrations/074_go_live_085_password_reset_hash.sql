-- Migration: 074_go_live_085_password_reset_hash
-- GO-LIVE-085 & GO-LIVE-086: Strengthen password reset token security
-- Expands password_reset_token column from VARCHAR(10) to VARCHAR(64)
-- to accommodate SHA-256 hash of secure reset tokens
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- ALTER supplier.suppliers: Expand password_reset_token column
-- =============================================================================

-- The password reset token is now stored as a SHA-256 hash (64 hex characters)
-- instead of the plain 6-digit code. This provides:
-- 1. 256 bits of entropy vs ~20 bits for 6-digit codes
-- 2. Tokens are hashed so DB leak doesn't expose actual tokens
-- 3. Timing-safe comparison prevents timing attacks

ALTER TABLE supplier.suppliers
  ALTER COLUMN password_reset_token TYPE VARCHAR(64);

-- Clear any existing tokens since they're in the old format
-- This forces users to request a new reset token
UPDATE supplier.suppliers
  SET password_reset_token = NULL, password_reset_expires = NULL
  WHERE password_reset_token IS NOT NULL;

COMMIT;
