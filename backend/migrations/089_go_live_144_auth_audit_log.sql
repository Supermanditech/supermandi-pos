-- GO-LIVE-144: Authentication audit log table
-- Tracks all login success/failure, logout, password changes, etc.

CREATE TABLE IF NOT EXISTS auth.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event type
  event_type VARCHAR(50) NOT NULL,  -- login_success, login_failed, logout, password_change, etc.

  -- Who
  actor_type VARCHAR(20) NOT NULL,  -- supplier, retailer, admin, platform
  actor_id UUID,                    -- User/supplier ID if known
  email VARCHAR(255),               -- Email if applicable
  phone VARCHAR(20),                -- Phone if applicable
  store_id UUID,                    -- Store context if applicable

  -- Request info
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Result
  success BOOLEAN NOT NULL DEFAULT true,
  error_code VARCHAR(50),

  -- Additional context
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at
  ON auth.audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_event_type
  ON auth.audit_log (event_type);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_actor
  ON auth.audit_log (actor_type, actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_email
  ON auth.audit_log (email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_ip
  ON auth.audit_log (ip_address)
  WHERE ip_address IS NOT NULL;

-- Partial index for failed logins (security monitoring)
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_failed
  ON auth.audit_log (ip_address, created_at)
  WHERE success = false;

COMMENT ON TABLE auth.audit_log IS 'GO-LIVE-144: Tracks all authentication events for security monitoring';
