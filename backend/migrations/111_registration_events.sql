-- Migration: 111_registration_events
-- RO-001: Registration events table for tracking all registration attempts
-- Records source, device metadata, IP, and outcome for every registration.

BEGIN;

-- =============================================================================
-- TABLE: auth.registration_events
-- One row per registration attempt (success or failure)
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.registration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was registered
  store_id UUID REFERENCES platform.stores(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Registration source
  source VARCHAR(20) NOT NULL,
  CONSTRAINT chk_reg_events_source CHECK (
    source IN ('PORTAL', 'POS_DEVICE', 'POS_MOBILE', 'ADMIN')
  ),

  -- Outcome
  outcome VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
  CONSTRAINT chk_reg_events_outcome CHECK (
    outcome IN ('SUCCESS', 'IDEMPOTENT', 'BLOCKED', 'ERROR')
  ),
  error_code VARCHAR(50),

  -- Request metadata
  ip_address INET,
  user_agent TEXT,

  -- Device metadata (POS registrations)
  device_meta JSONB,

  -- Registration input snapshot (for audit, no passwords/tokens)
  phone VARCHAR(20),
  business_name VARCHAR(255),
  gstin VARCHAR(15),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for store lookup
CREATE INDEX IF NOT EXISTS idx_reg_events_store
  ON auth.registration_events (store_id)
  WHERE store_id IS NOT NULL;

-- Index for recent events (SuperAdmin dashboard)
CREATE INDEX IF NOT EXISTS idx_reg_events_created
  ON auth.registration_events (created_at DESC);

-- Index for source filtering
CREATE INDEX IF NOT EXISTS idx_reg_events_source
  ON auth.registration_events (source, created_at DESC);

COMMIT;
