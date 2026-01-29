-- Migration: 073_go_live_iteration2_fixes
-- GO-LIVE Iteration 2: Critical fixes from comprehensive audit
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- GAP-CRIT-003: Add NOT NULL constraint to public.payments.store_id
-- First ensure all existing rows have store_id populated
-- =============================================================================
DO $$
BEGIN
  -- Update any NULL store_ids from related sales
  UPDATE public.payments p
  SET store_id = s.store_id
  FROM public.sales s
  WHERE p.sale_id = s.id
    AND p.store_id IS NULL;

  -- Check if there are still NULLs (orphaned payments)
  IF EXISTS (SELECT 1 FROM public.payments WHERE store_id IS NULL LIMIT 1) THEN
    RAISE NOTICE 'GAP-CRIT-003: Some payments have NULL store_id and no matching sale. Manual cleanup required.';
  END IF;
END $$;

-- Add NOT NULL constraint if not already present
-- Using DO block to handle case where constraint already exists
DO $$
BEGIN
  -- Check if column already has NOT NULL constraint
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'store_id'
      AND is_nullable = 'YES'
  ) THEN
    -- Only add NOT NULL if no NULLs exist
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE store_id IS NULL LIMIT 1) THEN
      ALTER TABLE public.payments ALTER COLUMN store_id SET NOT NULL;
      RAISE NOTICE 'GAP-CRIT-003: Added NOT NULL constraint to payments.store_id';
    ELSE
      RAISE NOTICE 'GAP-CRIT-003: Cannot add NOT NULL - some payments have NULL store_id';
    END IF;
  ELSE
    RAISE NOTICE 'GAP-CRIT-003: payments.store_id already has NOT NULL constraint';
  END IF;
END $$;

-- =============================================================================
-- GAP-HIGH-001: Add Foreign Key on payments.store_id
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_payments_store'
      AND table_schema = 'public'
      AND table_name = 'payments'
  ) THEN
    ALTER TABLE public.payments
    ADD CONSTRAINT fk_payments_store
    FOREIGN KEY (store_id) REFERENCES platform.stores(id);
    RAISE NOTICE 'GAP-HIGH-001: Added FK constraint fk_payments_store';
  ELSE
    RAISE NOTICE 'GAP-HIGH-001: FK constraint fk_payments_store already exists';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'GAP-HIGH-001: Could not add FK constraint: %', SQLERRM;
END $$;

-- =============================================================================
-- GAP-HIGH-004: Add missing indexes for common queries
-- =============================================================================

-- Customer phone lookup for sales
CREATE INDEX IF NOT EXISTS idx_sales_customer_phone
ON public.sales(customer_phone)
WHERE customer_phone IS NOT NULL;

-- Device enrollment code lookup
CREATE INDEX IF NOT EXISTS idx_device_enrollments_code
ON pos_device_enrollments(code);

-- Supplier products by store (if supplier_products table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supplier' AND table_name = 'supplier_products'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_supplier_products_store
    ON supplier.supplier_products(store_id);
    RAISE NOTICE 'GAP-HIGH-004: Created idx_supplier_products_store';
  END IF;
END $$;

-- =============================================================================
-- GAP-MED-003: Add updated_at trigger for tables that need it
-- =============================================================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to public.sales
DROP TRIGGER IF EXISTS trigger_sales_updated_at ON public.sales;
CREATE TRIGGER trigger_sales_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger to payments.customer_dues (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'payments' AND table_name = 'customer_dues'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_customer_dues_updated_at ON payments.customer_dues;
    CREATE TRIGGER trigger_customer_dues_updated_at
      BEFORE UPDATE ON payments.customer_dues
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    RAISE NOTICE 'Added updated_at trigger to payments.customer_dues';
  END IF;
END $$;

-- Add trigger to payments.bnpl_settings (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'payments' AND table_name = 'bnpl_settings'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_bnpl_settings_updated_at ON payments.bnpl_settings;
    CREATE TRIGGER trigger_bnpl_settings_updated_at
      BEFORE UPDATE ON payments.bnpl_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    RAISE NOTICE 'Added updated_at trigger to payments.bnpl_settings';
  END IF;
END $$;

COMMIT;
