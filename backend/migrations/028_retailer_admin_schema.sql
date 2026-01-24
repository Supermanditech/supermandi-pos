-- Migration: 028_retailer_admin_schema.sql
-- Retailer Admin Portal: Store users, compliance documents, CSV imports, impersonation logs
-- Safe to run multiple times (idempotent with IF NOT EXISTS / ON CONFLICT)

BEGIN;

-- =============================================================================
-- 1. Store Users (multi-user per store ready)
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.store_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES platform.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'RETAILER_ADMIN',  -- store-scoped: RETAILER_ADMIN, RETAILER_STAFF
  is_owner BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT store_users_store_user_unique UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS store_users_store_idx ON auth.store_users (store_id);
CREATE INDEX IF NOT EXISTS store_users_user_idx ON auth.store_users (user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_auth_store_users_updated_at ON auth.store_users;
CREATE TRIGGER update_auth_store_users_updated_at
  BEFORE UPDATE ON auth.store_users
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- =============================================================================
-- 2. Compliance Documents (GCS-backed)
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.compliance_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES platform.stores(id) ON DELETE CASCADE,

  -- Document metadata
  document_type VARCHAR(50) NOT NULL,  -- 'gstin', 'fssai', 'shop_license', 'pan', 'trade_license'
  file_name VARCHAR(255) NOT NULL,

  -- GCS storage
  gcs_bucket VARCHAR(100) NOT NULL,
  gcs_object_key VARCHAR(500) NOT NULL,  -- {storeId}/{docId}_{filename}
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  file_sha256 VARCHAR(64) NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'uploaded', 'verified', 'rejected'
  rejection_reason TEXT,
  uploaded_at TIMESTAMPTZ,  -- Set when confirm endpoint called

  -- Audit
  uploaded_by_user_id UUID REFERENCES auth.users(id),
  verified_by_user_id UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_document_type CHECK (
    document_type IN ('gstin', 'fssai', 'shop_license', 'pan', 'trade_license', 'other')
  ),
  CONSTRAINT chk_document_status CHECK (
    status IN ('pending', 'uploaded', 'verified', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS compliance_docs_store_idx ON platform.compliance_documents (store_id);
CREATE INDEX IF NOT EXISTS compliance_docs_status_idx ON platform.compliance_documents (store_id, status);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_compliance_documents_updated_at ON platform.compliance_documents;
CREATE TRIGGER update_compliance_documents_updated_at
  BEFORE UPDATE ON platform.compliance_documents
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- =============================================================================
-- 3. CSV Imports (job-based)
-- NOTE: file_sha256 is indexed for duplicate warning, NOT a hard UNIQUE constraint
-- Allows re-import with force=true or mode=replace after corrections
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.csv_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES platform.stores(id) ON DELETE CASCADE,

  -- File tracking
  file_name VARCHAR(255) NOT NULL,
  file_sha256 VARCHAR(64) NOT NULL,
  gcs_bucket VARCHAR(100),
  gcs_object_key VARCHAR(500),

  -- Import mode
  import_mode VARCHAR(20) NOT NULL DEFAULT 'merge',  -- 'replace', 'merge', 'skipExisting'

  -- Job status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'validating', 'validated', 'committing', 'committed', 'failed'

  -- Counts
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  products_created INTEGER NOT NULL DEFAULT 0,
  products_updated INTEGER NOT NULL DEFAULT 0,
  suppliers_created INTEGER NOT NULL DEFAULT 0,

  -- Errors
  validation_errors JSONB,  -- [{row: 5, field: 'sell_price', error: 'required'}]

  -- Audit
  uploaded_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  validated_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_import_mode CHECK (
    import_mode IN ('replace', 'merge', 'skipExisting')
  ),
  CONSTRAINT chk_import_status CHECK (
    status IN ('pending', 'validating', 'validated', 'committing', 'committed', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS csv_imports_store_idx ON platform.csv_imports (store_id);
CREATE INDEX IF NOT EXISTS csv_imports_status_idx ON platform.csv_imports (status);
CREATE INDEX IF NOT EXISTS csv_imports_hash_idx ON platform.csv_imports (store_id, file_sha256);  -- For duplicate warning

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_csv_imports_updated_at ON platform.csv_imports;
CREATE TRIGGER update_csv_imports_updated_at
  BEFORE UPDATE ON platform.csv_imports
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- =============================================================================
-- 4. Inventory Movements Source Tracking (for idempotent CSV commits)
-- NOTE: inventory.inventory_ledger uses `product_id` (UUID) column
-- Ensures commit is safely retryable: UNIQUE (store_id, product_id, source, source_id)
-- =============================================================================
-- Add columns to inventory.inventory_ledger if not exists
ALTER TABLE inventory.inventory_ledger
  ADD COLUMN IF NOT EXISTS source VARCHAR(50),       -- 'CSV_IMPORT', 'POS_SALE', 'MANUAL', etc.
  ADD COLUMN IF NOT EXISTS source_id UUID;           -- References csv_imports.id, etc.

-- Idempotency index: prevents double-add on commit retry
-- Column: product_id (UUID) - verified from 005_inventory_schema.sql
CREATE UNIQUE INDEX IF NOT EXISTS inventory_ledger_source_idempotency_idx
  ON inventory.inventory_ledger (store_id, product_id, source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL;

-- =============================================================================
-- 5. SuperAdmin Impersonation Audit Log
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.impersonation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  target_store_id UUID NOT NULL REFERENCES platform.stores(id),
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS impersonation_logs_admin_idx ON platform.impersonation_logs (admin_user_id);
CREATE INDEX IF NOT EXISTS impersonation_logs_store_idx ON platform.impersonation_logs (target_store_id);
CREATE INDEX IF NOT EXISTS impersonation_logs_created_idx ON platform.impersonation_logs (created_at DESC);

-- =============================================================================
-- 6. New Roles
-- =============================================================================
INSERT INTO auth.roles (name, description, permissions) VALUES (
  'RETAILER_ADMIN',
  'Retailer store administrator with web portal access',
  '["store.catalog.read","store.catalog.write","store.inventory.read","store.inventory.write",
    "store.suppliers.read","store.suppliers.write","store.compliance.read","store.compliance.write",
    "store.settings.read","store.settings.write"]'::jsonb
) ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

INSERT INTO auth.roles (name, description, permissions) VALUES (
  'RETAILER_STAFF',
  'Retailer store staff with limited access',
  '["store.catalog.read","store.inventory.read"]'::jsonb
) ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

-- =============================================================================
-- 7. Extend stores table for retailer portal
-- =============================================================================
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS retailer_portal_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS retailer_portal_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS retailer_portal_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retailer_portal_enabled_by UUID REFERENCES auth.users(id);

-- Index for portal-enabled stores
CREATE INDEX IF NOT EXISTS stores_portal_enabled_idx
  ON platform.stores (retailer_portal_enabled)
  WHERE retailer_portal_enabled = true;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES (run manually after migration)
-- =============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'store_users';
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'platform' AND table_name IN ('compliance_documents', 'csv_imports', 'impersonation_logs');
-- SELECT column_name FROM information_schema.columns WHERE table_schema = 'inventory' AND table_name = 'inventory_ledger' AND column_name IN ('source', 'source_id');
-- SELECT name, permissions FROM auth.roles WHERE name IN ('RETAILER_ADMIN', 'RETAILER_STAFF');
-- SELECT column_name FROM information_schema.columns WHERE table_schema = 'platform' AND table_name = 'stores' AND column_name LIKE 'retailer_%';
