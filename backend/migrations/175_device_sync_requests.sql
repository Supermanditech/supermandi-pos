-- SA-P2-005: Device sync requests table for force-sync commands
-- SuperAdmin can queue a force-sync command; POS picks it up on next sync tick.

CREATE TABLE IF NOT EXISTS device_sync_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     TEXT NOT NULL REFERENCES pos_devices(id) ON DELETE CASCADE,
  store_id      TEXT,
  reason        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for POS polling: find pending requests by device
CREATE INDEX IF NOT EXISTS idx_device_sync_requests_device_pending
  ON device_sync_requests (device_id, status)
  WHERE status = 'pending';

-- Index for admin: recent requests per device
CREATE INDEX IF NOT EXISTS idx_device_sync_requests_device_recent
  ON device_sync_requests (device_id, requested_at DESC);

-- Partial unique index to enforce at most one pending request per device (for upsert)
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sync_requests_device_pending_unique
  ON device_sync_requests (device_id)
  WHERE status = 'pending';
