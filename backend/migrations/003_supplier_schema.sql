-- Migration: 003_supplier_schema
-- ROLLBACK: DROP SCHEMA IF EXISTS supplier CASCADE;
-- V3.0.9 Foundation: Supplier schema with suppliers, links, requests
-- Safe to run multiple times (idempotent)

BEGIN;

-- Create supplier schema
CREATE SCHEMA IF NOT EXISTS supplier;

-- =============================================================================
-- TABLE: supplier.suppliers
-- Supplier entities with GSTIN verification
-- =============================================================================
CREATE TABLE IF NOT EXISTS supplier.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tax identification (GSTIN is unique identifier for Indian businesses)
  gstin VARCHAR(15) NOT NULL,
  pan VARCHAR(10),

  -- Business details
  business_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255),
  business_type VARCHAR(50),

  -- Primary contact
  primary_contact_name VARCHAR(255),
  primary_phone VARCHAR(20),
  primary_email VARCHAR(255),

  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),

  -- Verification
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  verified_by_user_id UUID,  -- FK to auth.users
  verified_at TIMESTAMPTZ,

  -- Rating (1.0 to 5.0, default 3.0)
  rating DECIMAL(2,1) NOT NULL DEFAULT 3.0,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT suppliers_gstin_unique UNIQUE (gstin),
  CONSTRAINT chk_suppliers_verification_status CHECK (
    verification_status IN ('pending', 'verified', 'rejected')
  ),
  CONSTRAINT chk_suppliers_status CHECK (
    status IN ('active', 'inactive', 'suspended')
  ),
  CONSTRAINT chk_suppliers_rating CHECK (
    rating >= 1.0 AND rating <= 5.0
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_supplier_suppliers_updated_at ON supplier.suppliers;
CREATE TRIGGER update_supplier_suppliers_updated_at
  BEFORE UPDATE ON supplier.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS suppliers_status_idx
  ON supplier.suppliers (status);

CREATE INDEX IF NOT EXISTS suppliers_verification_idx
  ON supplier.suppliers (verification_status);

CREATE INDEX IF NOT EXISTS suppliers_city_idx
  ON supplier.suppliers (city);

-- Trigram index for fuzzy business name search
CREATE INDEX IF NOT EXISTS suppliers_business_name_trgm_idx
  ON supplier.suppliers USING gin (business_name gin_trgm_ops);

-- =============================================================================
-- TABLE: supplier.supplier_store_links
-- Links between suppliers and stores with commercial terms
-- =============================================================================
CREATE TABLE IF NOT EXISTS supplier.supplier_store_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  supplier_id UUID NOT NULL REFERENCES supplier.suppliers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL,  -- FK to platform.stores (enforced at app level for cross-schema)

  -- Commercial terms
  credit_days INTEGER NOT NULL DEFAULT 0,
  min_order_value INTEGER NOT NULL DEFAULT 0,  -- In minor units (paise)
  expected_delivery_days INTEGER NOT NULL DEFAULT 2,

  -- Priority (lower = higher priority, used for supplier selection)
  priority INTEGER NOT NULL DEFAULT 100,
  is_preferred BOOLEAN NOT NULL DEFAULT false,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Audit
  linked_by_user_id UUID,  -- FK to auth.users

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT supplier_store_links_unique UNIQUE (supplier_id, store_id),
  CONSTRAINT chk_store_link_bounds CHECK (
    credit_days >= 0 AND
    credit_days <= 365 AND
    min_order_value >= 0 AND
    expected_delivery_days >= 0 AND
    expected_delivery_days <= 30 AND
    priority >= 0
  ),
  CONSTRAINT chk_store_link_status CHECK (
    status IN ('active', 'inactive')
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_supplier_store_links_updated_at ON supplier.supplier_store_links;
CREATE TRIGGER update_supplier_store_links_updated_at
  BEFORE UPDATE ON supplier.supplier_store_links
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS supplier_store_links_store_idx
  ON supplier.supplier_store_links (store_id);

CREATE INDEX IF NOT EXISTS supplier_store_links_supplier_idx
  ON supplier.supplier_store_links (supplier_id);

CREATE INDEX IF NOT EXISTS supplier_store_links_status_idx
  ON supplier.supplier_store_links (store_id, status);

-- Index for preferred suppliers
CREATE INDEX IF NOT EXISTS supplier_store_links_preferred_idx
  ON supplier.supplier_store_links (store_id, is_preferred)
  WHERE is_preferred = true;

-- =============================================================================
-- TABLE: supplier.supplier_requests
-- Store requests to add new suppliers
-- =============================================================================
CREATE TABLE IF NOT EXISTS supplier.supplier_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id UUID NOT NULL,  -- FK to platform.stores

  -- Requested supplier info
  requested_gstin VARCHAR(15),
  requested_name VARCHAR(255),
  requested_phone VARCHAR(20),
  requested_email VARCHAR(255),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Audit
  created_by_user_id UUID,  -- FK to auth.users
  reviewed_by_user_id UUID,  -- FK to auth.users
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- If approved, link to created supplier
  approved_supplier_id UUID REFERENCES supplier.suppliers(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_supplier_request_status CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT chk_supplier_request_identifier CHECK (
    requested_gstin IS NOT NULL OR requested_name IS NOT NULL OR requested_phone IS NOT NULL
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_supplier_requests_updated_at ON supplier.supplier_requests;
CREATE TRIGGER update_supplier_requests_updated_at
  BEFORE UPDATE ON supplier.supplier_requests
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS supplier_requests_store_idx
  ON supplier.supplier_requests (store_id);

CREATE INDEX IF NOT EXISTS supplier_requests_status_idx
  ON supplier.supplier_requests (status);

CREATE INDEX IF NOT EXISTS supplier_requests_pending_idx
  ON supplier.supplier_requests (created_at)
  WHERE status = 'pending';

-- =============================================================================
-- TABLE: supplier.event_outbox
-- Transactional outbox for supplier domain events
-- =============================================================================
CREATE TABLE IF NOT EXISTS supplier.event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,

  -- Event payload
  payload JSONB NOT NULL,

  -- Processing status
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_event_outbox_retry CHECK (retry_count >= 0)
);

-- Index for unprocessed events (FIFO order)
CREATE INDEX IF NOT EXISTS event_outbox_unprocessed_idx
  ON supplier.event_outbox (created_at)
  WHERE processed_at IS NULL;

-- Index for aggregate lookup
CREATE INDEX IF NOT EXISTS event_outbox_aggregate_idx
  ON supplier.event_outbox (aggregate_type, aggregate_id);

-- =============================================================================
-- SEED: Sample supplier for development
-- =============================================================================
INSERT INTO supplier.suppliers (
  id,
  gstin,
  business_name,
  trade_name,
  primary_contact_name,
  primary_phone,
  primary_email,
  city,
  state,
  pincode,
  verification_status,
  status
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  '29AABCU9603R1ZM',
  'Demo Wholesale Supplier Pvt Ltd',
  'Demo Supplier',
  'Ravi Kumar',
  '+91-9876543211',
  'supplier@demo.in',
  'Bengaluru',
  'Karnataka',
  '560001',
  'verified',
  'active'
) ON CONFLICT (gstin) DO NOTHING;

-- Link demo supplier to demo store
INSERT INTO supplier.supplier_store_links (
  supplier_id,
  store_id,
  credit_days,
  min_order_value,
  expected_delivery_days,
  priority,
  is_preferred,
  status
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',  -- Demo store from platform schema
  7,
  100000,  -- ₹1000 minimum order
  2,
  1,
  true,
  'active'
) ON CONFLICT (supplier_id, store_id) DO NOTHING;

COMMIT;
