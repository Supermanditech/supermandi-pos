-- Migration: 101_dedup_001_duplicate_prevention
-- DEDUP-001: Duplicate Prevention Rules (Phone/GSTIN/UPI)
-- Adds unique constraints and duplicate flags table
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Step 1: Create duplicate flags table for soft duplicate tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.duplicate_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What entity was flagged
  entity_type VARCHAR(20) NOT NULL,  -- 'store', 'supplier'
  entity_id UUID NOT NULL,

  -- What type of duplicate was detected
  duplicate_type VARCHAR(20) NOT NULL,  -- 'phone', 'gstin', 'upi'
  duplicate_value VARCHAR(255) NOT NULL,

  -- Which existing entity matches
  matching_entity_id UUID,

  -- Resolution status
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'resolved', 'merged', 'different'
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying pending duplicates
CREATE INDEX IF NOT EXISTS idx_duplicate_flags_status
ON platform.duplicate_flags(status)
WHERE status = 'pending';

-- Index for finding duplicates by entity
CREATE INDEX IF NOT EXISTS idx_duplicate_flags_entity
ON platform.duplicate_flags(entity_type, entity_id);

-- Created platform.duplicate_flags table

-- =============================================================================
-- Step 2: Add unique constraint on phone for stores
-- DEDUP-001: Same phone cannot spawn multiple stores
-- =============================================================================

-- First, check if constraint already exists to avoid error
DO $$
BEGIN
  -- Add unique constraint only if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uk_stores_phone'
    AND conrelid = 'platform.stores'::regclass
  ) THEN
    -- Before adding constraint, handle any existing duplicates
    -- by setting phone to NULL for older duplicates
    WITH duplicates AS (
      SELECT id, phone,
        ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at DESC) as rn
      FROM platform.stores
      WHERE phone IS NOT NULL
    )
    UPDATE platform.stores s
    SET phone = NULL
    FROM duplicates d
    WHERE s.id = d.id AND d.rn > 1;

    -- Now add the constraint (allowing NULL)
    ALTER TABLE platform.stores
    ADD CONSTRAINT uk_stores_phone UNIQUE (phone);
  END IF;
END;
$$;

-- Added unique constraint on stores.phone

-- =============================================================================
-- Step 3: Add unique constraint on phone for suppliers
-- =============================================================================

DO $$
BEGIN
  -- Check if suppliers table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supplier' AND table_name = 'suppliers'
  ) THEN
    -- Check if constraint already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'uk_suppliers_phone'
      AND conrelid = 'supplier.suppliers'::regclass
    ) THEN
      -- Handle existing duplicates
      WITH duplicates AS (
        SELECT id, phone,
          ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at DESC) as rn
        FROM supplier.suppliers
        WHERE phone IS NOT NULL
      )
      UPDATE supplier.suppliers s
      SET phone = NULL
      FROM duplicates d
      WHERE s.id = d.id AND d.rn > 1;

      -- Add constraint
      ALTER TABLE supplier.suppliers
      ADD CONSTRAINT uk_suppliers_phone UNIQUE (phone);
    END IF;
  END IF;
END;
$$;

-- Added unique constraint on suppliers.phone (if table exists)

-- =============================================================================
-- Step 4: Add indexes for faster duplicate checking
-- =============================================================================

-- Index for GSTIN lookup
CREATE INDEX IF NOT EXISTS idx_stores_gstin
ON platform.stores(gst_number)
WHERE gst_number IS NOT NULL;

-- Index for UPI lookup
CREATE INDEX IF NOT EXISTS idx_stores_upi_vpa
ON platform.stores(upi_vpa)
WHERE upi_vpa IS NOT NULL;

-- Created dedup indexes

-- =============================================================================
-- Step 5: Add documentation comments
-- =============================================================================

COMMENT ON TABLE platform.duplicate_flags IS 'Tracks potential duplicate entries for admin review (DEDUP-001)';
COMMENT ON COLUMN platform.duplicate_flags.entity_type IS 'Type of entity flagged: store, supplier';
COMMENT ON COLUMN platform.duplicate_flags.duplicate_type IS 'Type of duplicate: phone, gstin, upi';
COMMENT ON COLUMN platform.duplicate_flags.status IS 'Resolution status: pending, resolved, merged, different';

COMMIT;
