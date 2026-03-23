-- GCP-STG-0492: Landing page analytics events
-- ROLLBACK: DROP TABLE IF EXISTS platform.analytics_events;
CREATE TABLE IF NOT EXISTS platform.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON platform.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON platform.analytics_events(created_at DESC);
