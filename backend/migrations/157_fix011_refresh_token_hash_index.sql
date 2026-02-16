-- FIX-011: Add index on refresh_tokens.token_hash for fast token lookups
-- findRefreshTokenByHash queries on every token refresh (high frequency)
-- Without index: full table scan. With index: O(log n) lookup.
-- Partial index excludes revoked tokens (matching query's WHERE clause).

BEGIN;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
  ON auth.refresh_tokens(token_hash)
  WHERE revoked_at IS NULL;

COMMIT;
