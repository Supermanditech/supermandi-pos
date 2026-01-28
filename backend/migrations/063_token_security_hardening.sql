-- GL-WF-045-A: Token Security Hardening for Go-Live
-- Adds token revocation, audit logging, and rate limiting support

BEGIN;

-- =============================================================================
-- TABLE: Token Revocations (server-side instant revocation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS pos_token_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) NOT NULL,
  store_id UUID NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by VARCHAR(100), -- 'admin', 'system', 'user'
  reason VARCHAR(500),
  old_token_hash VARCHAR(64), -- SHA-256 hash of revoked token (for audit)
  CONSTRAINT fk_revocation_store FOREIGN KEY (store_id) REFERENCES platform.stores(id)
);

CREATE INDEX IF NOT EXISTS idx_token_revocations_device
  ON pos_token_revocations(device_id);

CREATE INDEX IF NOT EXISTS idx_token_revocations_store
  ON pos_token_revocations(store_id);

-- =============================================================================
-- TABLE: Token Audit Log (comprehensive token usage tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS pos_token_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) NOT NULL,
  store_id UUID,
  event_type VARCHAR(50) NOT NULL, -- 'issued', 'refreshed', 'revoked', 'expired', 'invalid_attempt', 'rate_limited'
  ip_address VARCHAR(45),
  user_agent TEXT,
  endpoint VARCHAR(255),
  success BOOLEAN NOT NULL DEFAULT true,
  error_code VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_audit_device
  ON pos_token_audit_log(device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_audit_store
  ON pos_token_audit_log(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_audit_event
  ON pos_token_audit_log(event_type, created_at DESC);

-- Partition-friendly index for time-based cleanup
CREATE INDEX IF NOT EXISTS idx_token_audit_created
  ON pos_token_audit_log(created_at);

-- =============================================================================
-- TABLE: API Rate Limit Tracking (per-device rate limiting)
-- =============================================================================
CREATE TABLE IF NOT EXISTS pos_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) NOT NULL,
  store_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  endpoint_group VARCHAR(50) NOT NULL DEFAULT 'general', -- 'general', 'write', 'scan'
  UNIQUE(device_id, window_start, endpoint_group)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_device_window
  ON pos_rate_limits(device_id, window_start DESC);

-- Add revocation check columns to pos_devices if not exists
ALTER TABLE pos_devices
  ADD COLUMN IF NOT EXISTS token_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_revoke_reason VARCHAR(500);

-- Index for quick revocation lookup
CREATE INDEX IF NOT EXISTS idx_pos_devices_token_revoked
  ON pos_devices(token_revoked_at)
  WHERE token_revoked_at IS NOT NULL;

COMMIT;
