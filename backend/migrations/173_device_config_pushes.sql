-- SA-P2-002: Remote Config Push — pending config commands table
-- Devices pick up pending commands on next poll if FCM is not available.

CREATE TABLE IF NOT EXISTS device_config_pushes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  device_id VARCHAR(200),               -- NULL for broadcast pushes
  store_id UUID,                        -- NULL for global broadcasts

  config_key VARCHAR(200) NOT NULL,
  config_value TEXT NOT NULL,
  message TEXT,                         -- optional human-readable message

  method VARCHAR(20) NOT NULL DEFAULT 'poll',  -- 'fcm' or 'poll'
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'delivered', 'failed'

  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_config_push_method CHECK (method IN ('fcm', 'poll')),
  CONSTRAINT chk_config_push_status CHECK (status IN ('pending', 'delivered', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_config_pushes_device_pending
  ON device_config_pushes (device_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_config_pushes_created
  ON device_config_pushes (created_at DESC);
