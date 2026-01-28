-- GL-CRIT-0010: Add soft delete columns to key tables
-- Adds deleted_at timestamp column to enable soft deletes instead of permanent deletion

-- ============================================================================
-- PLATFORM TABLES
-- ============================================================================

-- platform.stores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'stores' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE platform.stores ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_stores_deleted_at ON platform.stores(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- platform.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'users' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE platform.users ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON platform.users(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- platform.devices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'devices' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE platform.devices ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_devices_deleted_at ON platform.devices(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- ============================================================================
-- CATALOG TABLES
-- ============================================================================

-- catalog.products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'products' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE catalog.products ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON catalog.products(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- catalog.categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'categories' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE catalog.categories ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON catalog.categories(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- catalog.store_products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'store_products' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE catalog.store_products ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_store_products_deleted_at ON catalog.store_products(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- ============================================================================
-- SUPPLIER TABLES
-- ============================================================================

-- supplier.suppliers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supplier' AND table_name = 'suppliers' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE supplier.suppliers ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_suppliers_deleted_at ON supplier.suppliers(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- supplier.supplier_products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supplier' AND table_name = 'supplier_products' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE supplier.supplier_products ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_supplier_products_deleted_at ON supplier.supplier_products(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- ============================================================================
-- ORDERS TABLES (Note: orders should NOT be soft-deleted for audit purposes)
-- ============================================================================

-- orders.purchase_orders - cancelled status instead of delete
-- No deleted_at needed - use status = 'cancelled'

-- ============================================================================
-- HELPER FUNCTION FOR SOFT DELETE
-- ============================================================================

CREATE OR REPLACE FUNCTION soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Instead of deleting, set deleted_at timestamp
  NEW.deleted_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION METADATA
-- ============================================================================
INSERT INTO platform.migrations (name, description)
VALUES (
  '069_gl_crit_0010_soft_delete',
  'GL-CRIT-0010: Add soft delete columns (deleted_at) to enable data recovery. Orders use status instead.'
)
ON CONFLICT (name) DO NOTHING;
