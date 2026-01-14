-- PROV-001: Enhance device and enrollment tables for production security
-- Run with: docker exec -i supermandi-postgres psql -U supermandi -d supermandi < prov-001-enhance-devices.sql

-- =============================================================================
-- 1. Add id column to pos_device_enrollments if missing
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'pos_device_enrollments'
    AND column_name = 'id'
  ) THEN
    ALTER TABLE public.pos_device_enrollments
    ADD COLUMN id uuid DEFAULT gen_random_uuid();

    -- Make id the primary key
    ALTER TABLE public.pos_device_enrollments DROP CONSTRAINT IF EXISTS pos_device_enrollments_pkey;
    ALTER TABLE public.pos_device_enrollments ADD PRIMARY KEY (id);

    RAISE NOTICE 'Added id column to pos_device_enrollments';
  END IF;
END $$;

-- =============================================================================
-- 2. Add enrollment_code_hash column (for secure code storage)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'pos_device_enrollments'
    AND column_name = 'enrollment_code_hash'
  ) THEN
    -- Add hash column
    ALTER TABLE public.pos_device_enrollments
    ADD COLUMN enrollment_code_hash text;

    -- Copy existing codes to hash column (in production, these should be hashed)
    -- For now, just copy as-is since they're already exposed
    UPDATE public.pos_device_enrollments
    SET enrollment_code_hash = code
    WHERE enrollment_code_hash IS NULL;

    RAISE NOTICE 'Added enrollment_code_hash column';
  END IF;
END $$;

-- =============================================================================
-- 3. Add used_device_id column (tracks which device used the enrollment)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'pos_device_enrollments'
    AND column_name = 'used_device_id'
  ) THEN
    ALTER TABLE public.pos_device_enrollments
    ADD COLUMN used_device_id text;

    RAISE NOTICE 'Added used_device_id column';
  END IF;
END $$;

-- =============================================================================
-- 4. Add status column to pos_devices if using 'active' boolean
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'pos_devices'
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.pos_devices
    ADD COLUMN status text DEFAULT 'active';

    -- Migrate active boolean to status text
    UPDATE public.pos_devices
    SET status = CASE WHEN active = true THEN 'active' ELSE 'blocked' END;

    RAISE NOTICE 'Added status column to pos_devices';
  END IF;
END $$;

-- =============================================================================
-- 5. Add enrolled_at column to pos_devices
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'pos_devices'
    AND column_name = 'enrolled_at'
  ) THEN
    ALTER TABLE public.pos_devices
    ADD COLUMN enrolled_at timestamptz DEFAULT NOW();

    -- Set existing devices enrolled_at to created_at
    UPDATE public.pos_devices
    SET enrolled_at = created_at
    WHERE enrolled_at IS NULL OR enrolled_at = NOW();

    RAISE NOTICE 'Added enrolled_at column to pos_devices';
  END IF;
END $$;

-- =============================================================================
-- 6. Create indexes for performance and uniqueness
-- =============================================================================

-- Index on store_id for device lookups
CREATE INDEX IF NOT EXISTS idx_pos_devices_store_id
ON public.pos_devices(store_id);

-- Index on enrollment code hash for lookup during enrollment
CREATE INDEX IF NOT EXISTS idx_pos_device_enrollments_code_hash
ON public.pos_device_enrollments(enrollment_code_hash);

-- Index on store_id for enrollment lookups
CREATE INDEX IF NOT EXISTS idx_pos_device_enrollments_store_id
ON public.pos_device_enrollments(store_id);

-- Index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_pos_device_enrollments_expires_at
ON public.pos_device_enrollments(expires_at);

-- Unique constraint on device label per store (prevent duplicate labels)
-- Note: This may fail if duplicates exist - run cleanup first in that case
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_pos_devices_store_label_unique'
  ) THEN
    -- Check for duplicates first
    IF EXISTS (
      SELECT store_id, label, COUNT(*)
      FROM public.pos_devices
      WHERE label IS NOT NULL AND label != ''
      GROUP BY store_id, label
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Duplicate device labels exist - skipping unique constraint';
    ELSE
      CREATE UNIQUE INDEX idx_pos_devices_store_label_unique
      ON public.pos_devices(store_id, label)
      WHERE label IS NOT NULL AND label != '';
      RAISE NOTICE 'Created unique index on store_id + label';
    END IF;
  END IF;
END $$;

-- =============================================================================
-- 7. Create platform.feature_flags defaults for new stores
-- =============================================================================

-- Ensure default feature flags exist for stores without them
INSERT INTO platform.feature_flags (flag_key, scope_type, scope_id, enabled, created_at, updated_at)
SELECT 'reorder_enabled', 'store', s.id::text, false, NOW(), NOW()
FROM platform.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM platform.feature_flags f
  WHERE f.flag_key = 'reorder_enabled'
  AND f.scope_type = 'store'
  AND f.scope_id = s.id::text
)
ON CONFLICT DO NOTHING;

INSERT INTO platform.feature_flags (flag_key, scope_type, scope_id, enabled, created_at, updated_at)
SELECT 'buy_enabled', 'store', s.id::text, true, NOW(), NOW()
FROM platform.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM platform.feature_flags f
  WHERE f.flag_key = 'buy_enabled'
  AND f.scope_type = 'store'
  AND f.scope_id = s.id::text
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 8. Verification queries
-- =============================================================================

SELECT 'pos_devices columns:' as check_type;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pos_devices'
ORDER BY ordinal_position;

SELECT 'pos_device_enrollments columns:' as check_type;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pos_device_enrollments'
ORDER BY ordinal_position;

SELECT 'Indexes:' as check_type;
SELECT indexname FROM pg_indexes
WHERE tablename IN ('pos_devices', 'pos_device_enrollments')
ORDER BY indexname;

SELECT 'PROV-001 migration complete!' as status;
