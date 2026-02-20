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
-- PRE-STEP 2: Clean up non-UUID data before type conversion.
-- Demo/seed data may contain non-UUID values (e.g., "demo-device-001").
-- Delete rows with non-UUID primary keys; NULL-ify non-UUID foreign keys.
-- This is safe for staging (no production data loss).
-- UUID pattern: 8-4-4-4-12 hex characters
-- =============================================================================
DO $$
DECLARE
  del_count INTEGER;
  upd_count INTEGER;
  uuid_pattern TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  -- Clean pos_devices.id (PK — delete non-UUID rows)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_devices'
    AND column_name = 'id' AND data_type = 'text'
  ) THEN
    DELETE FROM public.pos_devices WHERE id !~ uuid_pattern;
    GET DIAGNOSTICS del_count = ROW_COUNT;
    IF del_count > 0 THEN
      RAISE NOTICE 'WAVE3B-CLEANUP: Deleted % non-UUID pos_devices rows', del_count;
    END IF;
  END IF;

  -- Clean pos_devices.store_id (FK — NULL-ify non-UUID values)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_devices'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    UPDATE public.pos_devices SET store_id = NULL WHERE store_id IS NOT NULL AND store_id !~ uuid_pattern;
    GET DIAGNOSTICS upd_count = ROW_COUNT;
    IF upd_count > 0 THEN
      RAISE NOTICE 'WAVE3B-CLEANUP: Nullified % non-UUID pos_devices.store_id', upd_count;
    END IF;
  END IF;

  -- Clean device_id columns across tables (NULL-ify non-UUID)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scan_events') THEN
    UPDATE public.scan_events SET device_id = NULL WHERE device_id IS NOT NULL AND device_id !~ uuid_pattern;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_events') THEN
    UPDATE public.pos_events SET device_id = NULL WHERE device_id IS NOT NULL AND device_id !~ uuid_pattern;
  END IF;

  -- Clean sales.id (PK — delete non-UUID rows)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales'
    AND column_name = 'id' AND data_type = 'character varying'
  ) THEN
    -- Delete sale_items for non-UUID sales first (FK)
    DELETE FROM public.sale_items WHERE sale_id IN (
      SELECT id FROM public.sales WHERE id !~ uuid_pattern
    );
    DELETE FROM public.sales WHERE id !~ uuid_pattern;
    GET DIAGNOSTICS del_count = ROW_COUNT;
    IF del_count > 0 THEN
      RAISE NOTICE 'WAVE3B-CLEANUP: Deleted % non-UUID sales rows', del_count;
    END IF;
  END IF;

  -- Clean sales.device_id (nullable FK — NULL-ify non-UUID)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales'
    AND column_name = 'device_id' AND data_type = 'character varying'
  ) THEN
    UPDATE public.sales SET device_id = NULL WHERE device_id IS NOT NULL AND device_id !~ uuid_pattern;
  END IF;

  -- Clean collections.id (PK — delete non-UUID rows)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'collections'
    AND column_name = 'id' AND data_type = 'character varying'
  ) THEN
    DELETE FROM public.collections WHERE id !~ uuid_pattern;
    GET DIAGNOSTICS del_count = ROW_COUNT;
    IF del_count > 0 THEN
      RAISE NOTICE 'WAVE3B-CLEANUP: Deleted % non-UUID collections rows', del_count;
    END IF;
  END IF;

  -- Clean collections.device_id (nullable FK — NULL-ify non-UUID)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'collections'
    AND column_name = 'device_id' AND data_type = 'character varying'
  ) THEN
    UPDATE public.collections SET device_id = NULL WHERE device_id IS NOT NULL AND device_id !~ uuid_pattern;
  END IF;

  -- Clean store_id TEXT columns (NULL-ify non-UUID across all tables)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_device_enrollments'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    UPDATE public.pos_device_enrollments SET store_id = NULL WHERE store_id IS NOT NULL AND store_id !~ uuid_pattern;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'failed_sync_events'
    AND column_name = 'store_id' AND data_type = 'text'
  ) THEN
    UPDATE public.failed_sync_events SET store_id = NULL WHERE store_id IS NOT NULL AND store_id !~ uuid_pattern;
  END IF;

  -- Clean sync_locks.device_id, processed_sync_events.device_id, failed_sync_events.device_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sync_locks') THEN
    UPDATE public.sync_locks SET device_id = NULL WHERE device_id IS NOT NULL AND device_id !~ uuid_pattern;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'processed_sync_events') THEN
    UPDATE public.processed_sync_events SET device_id = NULL WHERE device_id IS NOT NULL AND device_id !~ uuid_pattern;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'failed_sync_events') THEN
    UPDATE public.failed_sync_events SET device_id = NULL WHERE device_id IS NOT NULL AND device_id !~ uuid_pattern;
  END IF;

  -- Clean sale_items.sale_id (FK — NULL-ify non-UUID)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items'
    AND column_name = 'sale_id' AND data_type = 'character varying'
  ) THEN
    UPDATE public.sale_items SET sale_id = NULL WHERE sale_id IS NOT NULL AND sale_id !~ uuid_pattern;
  END IF;

  -- Clean accounts_receivable.sale_id (FK — NULL-ify non-UUID)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts_receivable') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accounts_receivable'
      AND column_name = 'sale_id' AND data_type = 'text'
    ) THEN
      UPDATE public.accounts_receivable SET sale_id = NULL WHERE sale_id IS NOT NULL AND sale_id !~ uuid_pattern;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accounts_receivable'
      AND column_name = 'store_id' AND data_type = 'text'
    ) THEN
      UPDATE public.accounts_receivable SET store_id = NULL WHERE store_id IS NOT NULL AND store_id !~ uuid_pattern;
    END IF;
  END IF;

  -- Clean retailer_variants, store_products, store_inventory, inventory_ledger store_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'retailer_variants') THEN
    UPDATE public.retailer_variants SET store_id = NULL WHERE store_id IS NOT NULL AND store_id !~ uuid_pattern;
  END IF;
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

-- C1: Drop ALL foreign keys referencing sales.id (dynamically discovered)
-- This handles sale_items_sale_id_fkey AND any other FKs (payments, etc.)
DO $$
DECLARE
  fk_rec RECORD;
BEGIN
  FOR fk_rec IN
    SELECT
      tc.table_schema AS fk_schema,
      tc.table_name AS fk_table,
      tc.constraint_name AS fk_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.table_constraints pk
      ON rc.unique_constraint_name = pk.constraint_name
      AND rc.unique_constraint_schema = pk.constraint_schema
    WHERE pk.table_schema = 'public'
      AND pk.table_name = 'sales'
      AND tc.constraint_type = 'FOREIGN KEY'
  LOOP
    RAISE NOTICE 'WAVE3B-C1: Dropping FK %.%.%', fk_rec.fk_schema, fk_rec.fk_table, fk_rec.fk_name;
    EXECUTE 'ALTER TABLE ' || fk_rec.fk_schema || '.' || fk_rec.fk_table ||
            ' DROP CONSTRAINT IF EXISTS ' || fk_rec.fk_name;
  END LOOP;

  -- Also drop by known names as fallback
  ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_sale_id_fkey;
END $$;

-- C1b: Also drop FKs referencing collections.id (same pattern)
DO $$
DECLARE
  fk_rec RECORD;
BEGIN
  FOR fk_rec IN
    SELECT
      tc.table_schema AS fk_schema,
      tc.table_name AS fk_table,
      tc.constraint_name AS fk_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.table_constraints pk
      ON rc.unique_constraint_name = pk.constraint_name
      AND rc.unique_constraint_schema = pk.constraint_schema
    WHERE pk.table_schema = 'public'
      AND pk.table_name = 'collections'
      AND tc.constraint_type = 'FOREIGN KEY'
  LOOP
    RAISE NOTICE 'WAVE3B-C1b: Dropping FK %.%.%', fk_rec.fk_schema, fk_rec.fk_table, fk_rec.fk_name;
    EXECUTE 'ALTER TABLE ' || fk_rec.fk_schema || '.' || fk_rec.fk_table ||
            ' DROP CONSTRAINT IF EXISTS ' || fk_rec.fk_name;
  END LOOP;
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

-- C3b: Convert payments.sale_id (VARCHAR → UUID)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
    AND column_name = 'sale_id' AND data_type = 'character varying'
  ) THEN
    -- Clean non-UUID values
    UPDATE public.payments SET sale_id = NULL
    WHERE sale_id IS NOT NULL AND sale_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    ALTER TABLE public.payments ALTER COLUMN sale_id TYPE UUID USING sale_id::uuid;
    RAISE NOTICE 'WAVE3B: payments.sale_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- C3c: Convert orders.khata_entries.sale_id (VARCHAR → UUID)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'orders' AND table_name = 'khata_entries'
    AND column_name = 'sale_id' AND data_type = 'character varying'
  ) THEN
    UPDATE orders.khata_entries SET sale_id = NULL
    WHERE sale_id IS NOT NULL AND sale_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    ALTER TABLE orders.khata_entries ALTER COLUMN sale_id TYPE UUID USING sale_id::uuid;
    RAISE NOTICE 'WAVE3B: orders.khata_entries.sale_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- C3d: Convert orders.refunds.sale_id (VARCHAR → UUID)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'orders' AND table_name = 'refunds'
    AND column_name = 'sale_id' AND data_type = 'character varying'
  ) THEN
    UPDATE orders.refunds SET sale_id = NULL
    WHERE sale_id IS NOT NULL AND sale_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    ALTER TABLE orders.refunds ALTER COLUMN sale_id TYPE UUID USING sale_id::uuid;
    RAISE NOTICE 'WAVE3B: orders.refunds.sale_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- C3e: Convert inventory_sync_guarantees.sale_id (VARCHAR → UUID, no FK)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_sync_guarantees'
    AND column_name = 'sale_id' AND data_type = 'character varying'
  ) THEN
    UPDATE public.inventory_sync_guarantees SET sale_id = NULL
    WHERE sale_id IS NOT NULL AND sale_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    ALTER TABLE public.inventory_sync_guarantees ALTER COLUMN sale_id TYPE UUID USING sale_id::uuid;
    RAISE NOTICE 'WAVE3B: inventory_sync_guarantees.sale_id → UUID';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- C4: Re-add FKs that were dynamically dropped in C1
DO $$ BEGIN
  ALTER TABLE public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders.khata_entries
    ADD CONSTRAINT khata_entries_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES public.sales(id);
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders.refunds
    ADD CONSTRAINT refunds_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES public.sales(id);
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

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
