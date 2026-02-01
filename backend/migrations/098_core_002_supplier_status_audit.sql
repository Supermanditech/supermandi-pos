-- Migration: 098_core_002_supplier_status_audit
-- CORE-002: Supplier State Machine - Status Audit Log Table
-- Creates audit trail for all supplier verification_status changes
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Step 1: Create supplier status audit log table
-- =============================================================================

CREATE TABLE IF NOT EXISTS supplier.supplier_status_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Supplier reference
  supplier_id UUID NOT NULL REFERENCES supplier.suppliers(id) ON DELETE CASCADE,

  -- Status change details
  old_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  reason TEXT,

  -- Who made the change
  changed_by UUID,  -- admin user ID, NULL for system actions
  changed_by_type VARCHAR(20) DEFAULT 'system', -- 'system', 'admin', 'supplier'

  -- Additional context
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB, -- Additional context (e.g., related document IDs)

  -- Timestamp
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Created supplier.supplier_status_audit table

-- =============================================================================
-- Step 2: Add indexes for efficient querying
-- =============================================================================

-- Index for looking up audit trail by supplier
CREATE INDEX IF NOT EXISTS idx_supplier_status_audit_supplier_id
ON supplier.supplier_status_audit(supplier_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_supplier_status_audit_changed_at
ON supplier.supplier_status_audit(changed_at DESC);

-- Index for filtering by new status
CREATE INDEX IF NOT EXISTS idx_supplier_status_audit_new_status
ON supplier.supplier_status_audit(new_status);

-- Index for admin action tracking
CREATE INDEX IF NOT EXISTS idx_supplier_status_audit_changed_by
ON supplier.supplier_status_audit(changed_by)
WHERE changed_by IS NOT NULL;

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_supplier_status_audit_supplier_time
ON supplier.supplier_status_audit(supplier_id, changed_at DESC);

-- Created audit log indexes

-- =============================================================================
-- Step 3: Create trigger function to auto-log status changes
-- =============================================================================

CREATE OR REPLACE FUNCTION supplier.log_supplier_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if verification_status actually changed
  IF OLD.verification_status IS DISTINCT FROM NEW.verification_status THEN
    INSERT INTO supplier.supplier_status_audit (
      supplier_id,
      old_status,
      new_status,
      reason,
      changed_by,
      changed_by_type,
      metadata
    ) VALUES (
      NEW.id,
      OLD.verification_status,
      NEW.verification_status,
      NEW.rejection_reason,
      NEW.status_updated_by,
      CASE
        WHEN NEW.status_updated_by IS NOT NULL THEN 'admin'
        ELSE 'system'
      END,
      jsonb_build_object(
        'business_name', NEW.business_name,
        'gstin', NEW.gstin
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Step 4: Create trigger on supplier.suppliers
-- =============================================================================

DROP TRIGGER IF EXISTS trg_supplier_status_audit ON supplier.suppliers;

CREATE TRIGGER trg_supplier_status_audit
AFTER UPDATE OF verification_status ON supplier.suppliers
FOR EACH ROW
EXECUTE FUNCTION supplier.log_supplier_status_change();

-- Created supplier status change audit trigger

-- =============================================================================
-- Step 5: Seed initial audit records for existing suppliers
-- =============================================================================

-- Create an initial audit record for suppliers that don't have any audit history
INSERT INTO supplier.supplier_status_audit (
  supplier_id,
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
  s.verification_status,
  'Initial status (migration)',
  'system',
  jsonb_build_object(
    'migration', '098_core_002_supplier_status_audit',
    'business_name', s.business_name,
    'gstin', s.gstin
  ),
  COALESCE(s.status_updated_at, s.verified_at, s.created_at, NOW())
FROM supplier.suppliers s
WHERE NOT EXISTS (
  SELECT 1 FROM supplier.supplier_status_audit a
  WHERE a.supplier_id = s.id
);

-- Seeded initial audit records for existing suppliers

-- =============================================================================
-- Step 6: Add documentation comments
-- =============================================================================

COMMENT ON TABLE supplier.supplier_status_audit IS 'Audit trail for all supplier verification_status changes (CORE-002)';
COMMENT ON COLUMN supplier.supplier_status_audit.old_status IS 'Previous verification_status before the change';
COMMENT ON COLUMN supplier.supplier_status_audit.new_status IS 'New verification_status after the change';
COMMENT ON COLUMN supplier.supplier_status_audit.reason IS 'Reason for the status change (especially for rejections/suspensions)';
COMMENT ON COLUMN supplier.supplier_status_audit.changed_by IS 'User ID who made the change (NULL for system actions)';
COMMENT ON COLUMN supplier.supplier_status_audit.changed_by_type IS 'Type of actor: system, admin, or supplier';
COMMENT ON COLUMN supplier.supplier_status_audit.metadata IS 'Additional context as JSON (business info, related entities, etc.)';

COMMIT;
