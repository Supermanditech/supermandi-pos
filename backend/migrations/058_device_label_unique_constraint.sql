-- Migration 058: GL-RJ-006 Device Label Unique Constraint
-- Adds unique constraint on (store_id, label) for active devices
-- Prevents duplicate device labels within the same store

BEGIN;

-- =============================================================================
-- GL-RJ-006: Add unique constraint for device labels within a store
-- Only applies to active devices (active = true)
-- =============================================================================

-- First, handle any existing duplicates by appending a suffix
-- This UPDATE finds duplicates and adds a suffix to all but the most recent
DO $$
DECLARE
  dup RECORD;
  suffix_num INTEGER;
BEGIN
  -- Find stores with duplicate active device labels
  FOR dup IN
    SELECT store_id, lower(label) as lower_label, COUNT(*) as cnt
    FROM pos_devices
    WHERE active = true AND label IS NOT NULL AND label != ''
    GROUP BY store_id, lower(label)
    HAVING COUNT(*) > 1
  LOOP
    -- For each duplicate group, update all but the most recent
    suffix_num := 1;
    UPDATE pos_devices
    SET label = label || '-' || suffix_num
    WHERE id IN (
      SELECT id FROM pos_devices
      WHERE store_id = dup.store_id
        AND lower(label) = dup.lower_label
        AND active = true
      ORDER BY created_at DESC
      OFFSET 1  -- Skip the most recent
    );
  END LOOP;
END $$;

-- Create partial unique index for active devices only (case-insensitive)
-- This allows multiple inactive devices to have the same label
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_devices_store_label_unique
  ON pos_devices (store_id, lower(label))
  WHERE active = true AND label IS NOT NULL AND label != '';

-- Comment for documentation
COMMENT ON INDEX idx_pos_devices_store_label_unique IS 'GL-RJ-006: Prevents duplicate device labels within a store for active devices';

COMMIT;
