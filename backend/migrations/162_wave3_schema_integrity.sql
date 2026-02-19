-- Migration: 162_wave3_schema_integrity
-- WAVE3: Schema integrity fixes for pre-deploy audit
-- Safe to run multiple times (idempotent)
--
-- Fixes:
--   #373: Add store_id to sale_items + backfill + RLS policy
--   #383-003: Add updated_at trigger on pos_device_enrollments
--   #383-008: Add CHECK constraint uses_count <= max_uses on pos_device_enrollments

BEGIN;

-- =============================================================================
-- 1. sale_items: Add store_id column (#373)
-- sale_items has no store_id, making RLS impossible. Add + backfill from sales.
-- =============================================================================

-- Step 1a: Add nullable store_id column (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.sale_items ADD COLUMN store_id UUID;
    RAISE NOTICE 'WAVE3-373: Added store_id column to sale_items';
  ELSE
    RAISE NOTICE 'WAVE3-373: store_id column already exists on sale_items';
  END IF;
END;
$$;

-- Step 1b: Backfill store_id from parent sales table
UPDATE public.sale_items si
SET store_id = s.store_id
FROM public.sales s
WHERE si.sale_id = s.id
  AND si.store_id IS NULL;

-- Step 1c: Set NOT NULL (only if all rows have store_id)
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.sale_items WHERE store_id IS NULL;
  IF null_count = 0 THEN
    -- Safe to add NOT NULL — all rows have store_id
    ALTER TABLE public.sale_items ALTER COLUMN store_id SET NOT NULL;
    RAISE NOTICE 'WAVE3-373: Set store_id NOT NULL on sale_items';
  ELSE
    RAISE NOTICE 'WAVE3-373: WARNING — % sale_items rows have NULL store_id, skipping NOT NULL', null_count;
  END IF;
END;
$$;

-- Step 1d: Add index for RLS performance
CREATE INDEX IF NOT EXISTS idx_sale_items_store_id
  ON public.sale_items (store_id);

-- Step 1e: Enable RLS on sale_items
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;

-- Step 1f: Create RLS policy (uses same rls_store_check from migration 149)
DROP POLICY IF EXISTS rls_sale_items_store ON public.sale_items;
CREATE POLICY rls_sale_items_store ON public.sale_items
  FOR ALL USING (rls_store_check(store_id));

-- =============================================================================
-- 2. pos_device_enrollments: Add updated_at trigger (#383-003)
-- Table has updated_at column but no auto-update trigger.
-- Stale timestamps affect enrollment TTL checks.
-- =============================================================================

-- Create the generic trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_pos_device_enrollments_updated_at ON pos_device_enrollments;
CREATE TRIGGER trg_pos_device_enrollments_updated_at
  BEFORE UPDATE ON pos_device_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3. pos_device_enrollments: CHECK uses_count <= max_uses (#383-008)
-- Prevents over-enrollment at the DB level.
-- max_uses can be NULL (treated as 1 by application), so CHECK handles NULL.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_enrollment_uses_count'
  ) THEN
    ALTER TABLE pos_device_enrollments
      ADD CONSTRAINT chk_enrollment_uses_count
      CHECK (uses_count <= COALESCE(max_uses, 1));
    RAISE NOTICE 'WAVE3-383: Added CHECK uses_count <= max_uses on pos_device_enrollments';
  ELSE
    RAISE NOTICE 'WAVE3-383: chk_enrollment_uses_count already exists';
  END IF;
END;
$$;

COMMIT;
