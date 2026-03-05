-- Migration 172: Change approved_by and actor_id from UUID to TEXT
-- ISSUE-023: adminId is email/string (not UUID), casting fails with
-- "invalid input syntax for type uuid"

-- Change approved_by on supplier_products to TEXT (stores admin email or token identifier)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog' AND table_name = 'supplier_products'
    AND column_name = 'approved_by' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE catalog.supplier_products ALTER COLUMN approved_by TYPE TEXT USING approved_by::text;
    RAISE NOTICE 'M172: catalog.supplier_products.approved_by UUID → TEXT';
  END IF;
END $$;

-- Change actor_id on approval_logs to TEXT (stores admin email or token identifier)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supplier' AND table_name = 'approval_logs'
    AND column_name = 'actor_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE supplier.approval_logs ALTER COLUMN actor_id TYPE TEXT USING actor_id::text;
    RAISE NOTICE 'M172: supplier.approval_logs.actor_id UUID → TEXT';
  END IF;
END $$;
