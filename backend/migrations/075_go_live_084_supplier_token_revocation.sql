-- GO-LIVE-084: Supplier JWT Token Revocation
-- Adds blacklist table for revoked supplier tokens
-- Uses JTI (JWT ID) claim to identify tokens for revocation

-- Add tokens_revoked_at column for bulk revocation (logout all sessions)
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS tokens_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN supplier.suppliers.tokens_revoked_at IS
  'GO-LIVE-084: Timestamp when all tokens were revoked. Tokens issued before this are invalid.';

-- Create token revocations table in supplier schema
CREATE TABLE IF NOT EXISTS supplier.token_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier.suppliers(id) ON DELETE CASCADE,
  -- JTI (JWT ID) is a unique identifier for each token
  jti VARCHAR(64) NOT NULL,
  -- When the token was revoked
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When the token would have expired (for cleanup purposes)
  token_expires_at TIMESTAMPTZ NOT NULL,
  -- Who/what revoked the token
  revoked_by VARCHAR(50) NOT NULL DEFAULT 'user',
  -- Reason for revocation
  reason VARCHAR(255),
  -- IP address from which revocation was requested
  ip_address INET,
  -- User agent of the revoking request
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup during auth check
CREATE INDEX IF NOT EXISTS idx_supplier_token_revocations_jti
  ON supplier.token_revocations(jti);

-- Index for cleanup of expired revocations
CREATE INDEX IF NOT EXISTS idx_supplier_token_revocations_expires
  ON supplier.token_revocations(token_expires_at);

-- Index for supplier lookup (for listing revoked sessions)
CREATE INDEX IF NOT EXISTS idx_supplier_token_revocations_supplier
  ON supplier.token_revocations(supplier_id, revoked_at DESC);

-- Unique constraint to prevent duplicate revocations
ALTER TABLE supplier.token_revocations
  DROP CONSTRAINT IF EXISTS unique_supplier_token_jti;
ALTER TABLE supplier.token_revocations
  ADD CONSTRAINT unique_supplier_token_jti UNIQUE (jti);

-- Add comment
COMMENT ON TABLE supplier.token_revocations IS
  'GO-LIVE-084: Blacklist for revoked supplier JWT tokens. Checked on each authenticated request.';

-- Cleanup function for expired revocations (tokens that would have expired anyway)
CREATE OR REPLACE FUNCTION supplier.cleanup_expired_token_revocations()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM supplier.token_revocations
  WHERE token_expires_at < NOW() - INTERVAL '1 day';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION supplier.cleanup_expired_token_revocations() IS
  'Removes token revocation records for tokens that have already expired. Run periodically.';
