-- GL-CRIT-0010: Add soft delete columns to key tables
-- Enables "mark as deleted" instead of hard delete for recovery/audit
-- Defensive: checks if tables exist before adding columns

-- ============================================================================
-- Add deleted_at column to key tables
-- ============================================================================

-- platform.stores
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'stores'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'stores' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE platform.stores ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_stores_active ON platform.stores(id) WHERE deleted_at IS NULL;
    RAISE NOTICE 'Added deleted_at to platform.stores';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped platform.stores: %', SQLERRM;
END $$;

-- auth.users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE auth.users ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_active ON auth.users(id) WHERE deleted_at IS NULL;
    RAISE NOTICE 'Added deleted_at to auth.users';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped auth.users: %', SQLERRM;
END $$;

-- platform.pos_devices
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform' AND table_name = 'pos_devices'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'pos_devices' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE platform.pos_devices ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_devices_active ON platform.pos_devices(id) WHERE deleted_at IS NULL;
    RAISE NOTICE 'Added deleted_at to platform.pos_devices';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped platform.pos_devices: %', SQLERRM;
END $$;

-- catalog.products
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'catalog' AND table_name = 'products'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'products' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE catalog.products ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_cat_products_active ON catalog.products(id) WHERE deleted_at IS NULL;
    RAISE NOTICE 'Added deleted_at to catalog.products';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped catalog.products: %', SQLERRM;
END $$;

-- public.products (if exists separately)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.products ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_pub_products_active ON public.products(id) WHERE deleted_at IS NULL;
    RAISE NOTICE 'Added deleted_at to public.products';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped public.products: %', SQLERRM;
END $$;

-- catalog.categories
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'catalog' AND table_name = 'categories'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'categories' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE catalog.categories ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_categories_active ON catalog.categories(id) WHERE deleted_at IS NULL;
    RAISE NOTICE 'Added deleted_at to catalog.categories';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped catalog.categories: %', SQLERRM;
END $$;

-- supplier.suppliers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'supplier' AND table_name = 'suppliers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supplier' AND table_name = 'suppliers' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE supplier.suppliers ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_suppliers_active ON supplier.suppliers(id) WHERE deleted_at IS NULL;
    RAISE NOTICE 'Added deleted_at to supplier.suppliers';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped supplier.suppliers: %', SQLERRM;
END $$;

-- ============================================================================
-- Create soft_delete helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  NEW.deleted_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Log completion
DO $$ BEGIN RAISE NOTICE 'GL-CRIT-0010: Soft delete migration complete'; END $$;
