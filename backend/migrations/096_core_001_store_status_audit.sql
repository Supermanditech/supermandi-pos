-- Migration: 096_core_001_store_status_audit
-- CORE-001: Canonical Store State Machine - Status Audit Log Table
-- Creates audit trail for all store status changes
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Step 1: Create store status audit log table
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.store_status_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store reference
  store_id UUID NOT NULL REFERENCES platform.stores(id) ON DELETE CASCADE,

  -- Status change details
  old_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  reason TEXT,

  -- Who made the change
  changed_by UUID,  -- admin user ID, NULL for system actions
  changed_by_type VARCHAR(20) DEFAULT 'system', -- 'system', 'admin', 'retailer'

  -- Additional context
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB, -- Additional context (e.g., related document IDs, device IDs)

  -- Timestamp
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

RAISE NOTICE 'CORE-001: Created platform.store_status_audit table';

-- =============================================================================
-- Step 2: Add indexes for efficient querying
-- =============================================================================

-- Index for looking up audit trail by store
CREATE INDEX IF NOT EXISTS idx_store_status_audit_store_id
ON platform.store_status_audit(store_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_store_status_audit_changed_at
ON platform.store_status_audit(changed_at DESC);

-- Index for filtering by new status
CREATE INDEX IF NOT EXISTS idx_store_status_audit_new_status
ON platform.store_status_audit(new_status);

-- Index for admin action tracking
CREATE INDEX IF NOT EXISTS idx_store_status_audit_changed_by
ON platform.store_status_audit(changed_by)
WHERE changed_by IS NOT NULL;

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_store_status_audit_store_time
ON platform.store_status_audit(store_id, changed_at DESC);

RAISE NOTICE 'CORE-001: Created audit log indexes';

-- =============================================================================
-- Step 3: Create trigger function to auto-log status changes
-- =============================================================================

CREATE OR REPLACE FUNCTION platform.log_store_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO platform.store_status_audit (
      store_id,
      old_status,
      new_status,
      reason,
      changed_by,
      changed_by_type,
      metadata
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.status_reason,
      NEW.status_updated_by,
      CASE
        WHEN NEW.status_updated_by IS NOT NULL THEN 'admin'
        ELSE 'system'
      END,
      jsonb_build_object(
        'device_bound', NEW.device_bound,
        'kyc_complete', NEW.kyc_complete,
        'upi_complete', NEW.upi_complete,
        'admin_approved', NEW.admin_approved
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Step 4: Create trigger on platform.stores
-- =============================================================================

DROP TRIGGER IF EXISTS trg_store_status_audit ON platform.stores;

CREATE TRIGGER trg_store_status_audit
AFTER UPDATE OF status ON platform.stores
FOR EACH ROW
EXECUTE FUNCTION platform.log_store_status_change();

RAISE NOTICE 'CORE-001: Created status change audit trigger';

-- =============================================================================
-- Step 5: Seed initial audit records for existing stores
-- =============================================================================

-- Create an initial audit record for stores that don't have any audit history
INSERT INTO platform.store_status_audit (
  store_id,
  old_status,
  new_status,
  reason,
  changed_by_type,
  metadata,
  changed_at
)
SELECT
  s.id,
  NULL,
  s.status,
  'Initial status (migration)',
  'system',
  jsonb_build_object(
    'migration', '096_core_001_store_status_audit',
    'device_bound', s.device_bound,
    'kyc_complete', s.kyc_complete,
    'upi_complete', s.upi_complete
  ),
  COALESCE(s.status_updated_at, s.created_at, NOW())
FROM platform.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM platform.store_status_audit a
  WHERE a.store_id = s.id
);

RAISE NOTICE 'CORE-001: Seeded initial audit records for existing stores';

-- =============================================================================
-- Step 6: Add documentation comments
-- =============================================================================

COMMENT ON TABLE platform.store_status_audit IS 'Audit trail for all store status changes (CORE-001)';
COMMENT ON COLUMN platform.store_status_audit.old_status IS 'Previous status before the change';
COMMENT ON COLUMN platform.store_status_audit.new_status IS 'New status after the change';
COMMENT ON COLUMN platform.store_status_audit.reason IS 'Reason for the status change (especially for rejections/suspensions)';
COMMENT ON COLUMN platform.store_status_audit.changed_by IS 'User ID who made the change (NULL for system actions)';
COMMENT ON COLUMN platform.store_status_audit.changed_by_type IS 'Type of actor: system, admin, or retailer';
COMMENT ON COLUMN platform.store_status_audit.metadata IS 'Additional context as JSON (flags, related entities, etc.)';

COMMIT;
