-- GCP-STG-0489: Auth event audit trail for security compliance
-- ROLLBACK: DROP TABLE IF EXISTS auth.auth_events;
CREATE TABLE IF NOT EXISTS auth.auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'retailer', 'supplier', 'pos_device')),
  actor_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('login_success', 'login_failed', 'logout', 'password_changed', 'otp_sent', 'otp_verified', 'device_enrolled', 'device_revoked', 'totp_enabled', 'totp_disabled')),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_events_actor ON auth.auth_events(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_type ON auth.auth_events(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth.auth_events(created_at DESC);
