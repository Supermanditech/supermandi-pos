-- Migration: 163_wave3b_type_normalization
-- WAVE3B: Production-grade TEXT→UUID normalization + FK constraints
-- Converts all store_id TEXT columns to UUID for FK integrity + RLS compatibility.
-- Converts pos_devices.id and sales.id to UUID.
-- Safe on fresh deploy (empty tables) and on existing data (all values are UUID format).
--
-- Fixes: #372 (FK constraints), #383 (TEXT→UUID, NOT NULL, sales.id)

BEGIN;

-- =============================================================================
-- PRE-STEP: Dynamically find and drop ALL views that depend on columns of
-- tables we're about to ALTER TYPE on. PostgreSQL forbids ALTER TYPE on
-- columns used by views or rules. Instead of guessing which views exist,
-- query pg_depend to discover them all.
-- =============================================================================
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT
      nsp.nspname AS schema_name,
      cls.relname AS view_name,
      nsp.nspname || '.' || cls.relname AS full_name
    FROM pg_depend dep
    JOIN pg_rewrite rw ON dep.objid = rw.oid
    JOIN pg_class cls ON rw.ev_class = cls.oid
    JOIN pg_namespace nsp ON cls.relnamespace = nsp.oid
    JOIN pg_class src ON dep.refobjid = src.oid
    WHERE cls.relkind = 'v'
      AND src.relname IN (
        'pos_devices', 'pos_device_enrollments', 'scan_events', 'pos_events',
        'retailer_variants', 'accounts_receivable', 'failed_sync_events',
        'store_products', 'store_inventory', 'inventory_ledger',
        'sales', 'sale_items', 'collections', 'sync_locks', 'processed_sync_events'
      )
  LOOP
    RAISE NOTICE 'WAVE3B: Dropping dependent view: %', rec.full_name;
    EXECUTE 'DROP VIEW IF EXISTS ' || rec.full_name || ' CASCADE';
  END LOOP;
END $$;

-- =============================================================================
-- PART A: store_id TEXT → UUID (10 tables)
-- All these columns receive UUID-formatted strings from JWT tokens.
-- Converting enables FK constraints to platform.stores(id).
-- =============================================================================

-- A1: pos_devices.store_id TEXT → UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_devices'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE pos_devices ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: pos_devices.store_id → UUID';
  END IF;
END $$;

-- A2: pos_device_enrollments.store_id TEXT → UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_device_enrollments'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE pos_device_enrollments ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: pos_device_enrollments.store_id → UUID';
  END IF;
END $$;

-- A3: scan_events.store_id TEXT → UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scan_events'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE scan_events ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: scan_events.store_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- A4: pos_events.store_id TEXT → UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_events'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE pos_events ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: pos_events.store_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- A5: retailer_variants.store_id TEXT → UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'retailer_variants'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE retailer_variants ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: retailer_variants.store_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- A6: accounts_receivable.store_id TEXT → UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_receivable'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE accounts_receivable ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: accounts_receivable.store_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- A7: failed_sync_events.store_id TEXT → UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'failed_sync_events'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE failed_sync_events ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: failed_sync_events.store_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- A8: public.store_products.store_id TEXT → UUID (M104 global catalog table)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_products'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.store_products ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: public.store_products.store_id → UUID';
  END IF;
END $$;

-- A9: public.store_inventory.store_id TEXT → UUID (M104)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_inventory'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.store_inventory ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: public.store_inventory.store_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- A10: public.inventory_ledger.store_id TEXT → UUID (M106)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_ledger'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.inventory_ledger ALTER COLUMN store_id TYPE UUID USING store_id::uuid;
    RAISE NOTICE 'WAVE3B: public.inventory_ledger.store_id → UUID';
  END IF;
END $$;

-- =============================================================================
-- PART B: pos_devices.id TEXT → UUID (#383 DB-P1-005)
-- Device IDs are always randomUUID(). Converting for type consistency.
-- Also convert all device_id TEXT/VARCHAR references.
-- =============================================================================

-- B1: pos_devices.id TEXT → UUID
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_devices'
    AND column_name = 'id' AND data_type = 'text'
  ) THEN
    ALTER TABLE pos_devices ALTER COLUMN id TYPE UUID USING id::uuid;
    RAISE NOTICE 'WAVE3B: pos_devices.id → UUID';
  END IF;
END $$;

-- B2: Cascade device_id columns (no FK constraints exist — just type alignment)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scan_events'
    AND column_name = 'device_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE scan_events ALTER COLUMN device_id TYPE UUID USING device_id::uuid;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_events'
    AND column_name = 'device_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE pos_events ALTER COLUMN device_id TYPE UUID USING device_id::uuid;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- sales.device_id: VARCHAR(100) → UUID (nullable, no FK)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales'
    AND column_name = 'device_id' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE public.sales ALTER COLUMN device_id TYPE UUID USING device_id::uuid;
    RAISE NOTICE 'WAVE3B: sales.device_id → UUID';
  END IF;
END $$;

-- collections.device_id: VARCHAR(100) → UUID (nullable, no FK)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'collections'
    AND column_name = 'device_id' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE public.collections ALTER COLUMN device_id TYPE UUID USING device_id::uuid;
    RAISE NOTICE 'WAVE3B: collections.device_id → UUID';
  END IF;
END $$;

-- sync_locks.device_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_locks'
    AND column_name = 'device_id' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE public.sync_locks ALTER COLUMN device_id TYPE UUID USING device_id::uuid;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- processed_sync_events.device_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'processed_sync_events'
    AND column_name = 'device_id' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE public.processed_sync_events ALTER COLUMN device_id TYPE UUID USING device_id::uuid;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- failed_sync_events.device_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'failed_sync_events'
    AND column_name = 'device_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE failed_sync_events ALTER COLUMN device_id TYPE UUID USING device_id::uuid;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- PART C: sales.id VARCHAR(100) → UUID (#383 DB-P1-012)
-- Sale IDs are always randomUUID(). Drop FK from sale_items first.
-- =============================================================================

-- C1: Drop FK from sale_items.sale_id → sales.id
DO $$ BEGIN
  ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_sale_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- C2: Convert sales.id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales'
    AND column_name = 'id' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE public.sales ALTER COLUMN id TYPE UUID USING id::uuid;
    RAISE NOTICE 'WAVE3B: sales.id → UUID';
  END IF;
END $$;

-- C3: Convert sale_items.sale_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items'
    AND column_name = 'sale_id' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE public.sale_items ALTER COLUMN sale_id TYPE UUID USING sale_id::uuid;
    RAISE NOTICE 'WAVE3B: sale_items.sale_id → UUID';
  END IF;
END $$;

-- C4: Re-add FK
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;

-- C5: Convert collections.id if VARCHAR
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'collections'
    AND column_name = 'id' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE public.collections ALTER COLUMN id TYPE UUID USING id::uuid;
    RAISE NOTICE 'WAVE3B: collections.id → UUID';
  END IF;
END $$;

-- C6: Convert accounts_receivable.sale_id if TEXT
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_receivable'
    AND column_name = 'sale_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE accounts_receivable ALTER COLUMN sale_id TYPE UUID USING sale_id::uuid;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- PART D: FK constraints → platform.stores(id)
-- Now that store_id is UUID, we can add proper FK relationships.
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE pos_devices
    ADD CONSTRAINT fk_pos_devices_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id);
  RAISE NOTICE 'WAVE3B: FK pos_devices.store_id → platform.stores';
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'WAVE3B: FK fk_pos_devices_store already exists';
END $$;

DO $$ BEGIN
  ALTER TABLE pos_device_enrollments
    ADD CONSTRAINT fk_enrollments_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id);
  RAISE NOTICE 'WAVE3B: FK pos_device_enrollments.store_id → platform.stores';
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'WAVE3B: FK fk_enrollments_store already exists';
END $$;

-- =============================================================================
-- PART E: NOT NULL constraint for active devices (#383 DB-P1-011)
-- Active devices must have a store_id. Inactive/orphaned devices may not.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_active_device_store_id'
  ) THEN
    ALTER TABLE pos_devices
      ADD CONSTRAINT chk_active_device_store_id
      CHECK (NOT active OR store_id IS NOT NULL);
    RAISE NOTICE 'WAVE3B: CHECK active devices must have store_id';
  END IF;
END $$;

-- =============================================================================
-- PART F: enrollment_code column on pos_devices (#369)
-- Links device to the enrollment code that created it.
-- Populated during enrollment flow in enroll.ts.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_devices'
    AND column_name = 'enrollment_code'
  ) THEN
    ALTER TABLE pos_devices ADD COLUMN enrollment_code TEXT;
    CREATE INDEX IF NOT EXISTS idx_pos_devices_enrollment_code
      ON pos_devices (enrollment_code) WHERE enrollment_code IS NOT NULL;
    RAISE NOTICE 'WAVE3B: Added enrollment_code column + index to pos_devices';
  END IF;
END $$;

-- =============================================================================
-- POST-STEP: Recreate sync_health_summary view (dropped in PRE-STEP).
-- Now that store_id columns are UUID, casts are redundant but kept for clarity.
-- =============================================================================
CREATE OR REPLACE VIEW sync_health_summary AS
SELECT
  s.id as store_id,
  s.name as store_name,
  COALESCE(pending.count, 0) as pending_sync_events,
  COALESCE(failed.count, 0) as failed_sync_events,
  COALESCE(stale_devices.count, 0) as devices_with_stale_data,
  COALESCE(inv_pending.count, 0) as pending_inventory_syncs
FROM platform.stores s
LEFT JOIN (
  SELECT store_id, COUNT(*) as count
  FROM processed_sync_events
  WHERE processed_at > NOW() - INTERVAL '1 hour'
  GROUP BY store_id
) pending ON pending.store_id = s.id
LEFT JOIN (
  SELECT store_id, COUNT(*) as count
  FROM failed_sync_events
  WHERE resolution_status = 'unresolved'
  GROUP BY store_id
) failed ON failed.store_id = s.id
LEFT JOIN (
  SELECT store_id, COUNT(*) as count
  FROM public.pos_devices
  WHERE last_seen_online < NOW() - INTERVAL '1 hour'
    AND pending_outbox_count > 0
  GROUP BY store_id
) stale_devices ON stale_devices.store_id = s.id
LEFT JOIN (
  SELECT store_id, COUNT(*) as count
  FROM inventory_sync_guarantees
  WHERE sync_status = 'pending'
  GROUP BY store_id
) inv_pending ON inv_pending.store_id = s.id;

COMMENT ON VIEW sync_health_summary IS
'GO-LIVE Batch 7: Dashboard view for monitoring offline sync health across stores.';

COMMIT;
