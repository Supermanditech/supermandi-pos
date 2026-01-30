-- GO-LIVE-137: Server-side session invalidation for retailer-admin
-- Adds token revocation support similar to supplier.token_revocations

-- =============================================================================
-- TOKEN REVOCATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth.token_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  store_id UUID NOT NULL REFERENCES platform.stores(id),
  jti VARCHAR(128) NOT NULL,           -- JWT ID from the token
  token_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (revoked_by IN ('user', 'admin', 'system')),
  reason TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint on JTI (each token can only be revoked once)
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_token_revocations_jti
  ON auth.token_revocations (jti);

-- Index for cleanup job (delete expired revocations)
CREATE INDEX IF NOT EXISTS idx_auth_token_revocations_expires
  ON auth.token_revocations (token_expires_at);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_auth_token_revocations_user_store
  ON auth.token_revocations (user_id, store_id);

-- =============================================================================
-- BULK REVOCATION SUPPORT
-- Add tokens_revoked_at to auth.users for "logout all devices" functionality
-- =============================================================================

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS tokens_revoked_at TIMESTAMPTZ;

COMMENT ON TABLE auth.token_revocations IS 'GO-LIVE-137: Stores revoked JWT tokens for server-side session invalidation';
COMMENT ON COLUMN auth.users.tokens_revoked_at IS 'GO-LIVE-137: Timestamp for bulk token revocation (logout all devices)';

-- =============================================================================
-- CLEANUP FUNCTION
-- Call periodically to remove expired revocations (tokens that have expired)
-- =============================================================================

CREATE OR REPLACE FUNCTION auth.cleanup_expired_token_revocations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auth.token_revocations
  WHERE token_expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
