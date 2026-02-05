-- =============================================================================
-- AUTH-IDLE-001: Server-side idle timeout tracking
-- Adds last_activity_at column to refresh_tokens for server-side idle enforcement
-- =============================================================================

-- Add last_activity_at column (defaults to created_at for existing rows)
ALTER TABLE auth.refresh_tokens
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill existing tokens: set last_activity_at = created_at
UPDATE auth.refresh_tokens
  SET last_activity_at = created_at
  WHERE last_activity_at = created_at; -- safe no-op after backfill

-- Index for idle timeout queries (only active tokens)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_idle
  ON auth.refresh_tokens (user_id, last_activity_at)
  WHERE revoked_at IS NULL;
