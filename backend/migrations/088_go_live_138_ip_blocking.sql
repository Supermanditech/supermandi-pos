-- GO-LIVE-138: IP-based blocking after authentication failures
-- Tracks blocked IPs for monitoring and persistence across restarts

CREATE TABLE IF NOT EXISTS auth.ip_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address VARCHAR(45) NOT NULL,
  failure_type VARCHAR(30) NOT NULL,
  failure_count INT NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint on IP address
CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_blocks_ip_address
  ON auth.ip_blocks (ip_address);

-- Index for finding active blocks
CREATE INDEX IF NOT EXISTS idx_ip_blocks_blocked_until
  ON auth.ip_blocks (blocked_until)
  WHERE blocked_until IS NOT NULL;

-- Cleanup function
CREATE OR REPLACE FUNCTION auth.cleanup_expired_ip_blocks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auth.ip_blocks
  WHERE blocked_until < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE auth.ip_blocks IS 'GO-LIVE-138: Tracks IPs blocked due to auth failures';
