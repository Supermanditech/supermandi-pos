-- Migration: 001_platform_schema
-- V3.0.9 Foundation: Platform schema with stores and feature flags
-- Safe to run multiple times (idempotent)

BEGIN;

-- Create platform schema
CREATE SCHEMA IF NOT EXISTS platform;

-- =============================================================================
-- TRIGGER FUNCTION: Auto-update updated_at column
-- =============================================================================
CREATE OR REPLACE FUNCTION platform.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TABLE: platform.stores
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,

  -- Contact
  phone VARCHAR(20),
  email VARCHAR(255),

  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),

  -- Settings
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT stores_code_unique UNIQUE (code),
  CONSTRAINT stores_status_check CHECK (status IN ('active', 'inactive', 'suspended'))
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_platform_stores_updated_at ON platform.stores;
CREATE TRIGGER update_platform_stores_updated_at
  BEFORE UPDATE ON platform.stores
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS stores_status_idx ON platform.stores (status);
CREATE INDEX IF NOT EXISTS stores_city_idx ON platform.stores (city);

-- =============================================================================
-- TABLE: platform.feature_flags
-- Feature flags with global and scoped (store/supplier) support
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Flag identification
  flag_key VARCHAR(100) NOT NULL,

  -- Scope: 'global', 'store', or 'supplier'
  scope_type VARCHAR(20) NOT NULL DEFAULT 'global',
  scope_id UUID,  -- NULL for global, store_id or supplier_id for scoped

  -- Value
  enabled BOOLEAN NOT NULL DEFAULT false,
  payload_json JSONB,

  -- Metadata
  description VARCHAR(500),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_flags_scope CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type IN ('store', 'supplier') AND scope_id IS NOT NULL)
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_platform_feature_flags_updated_at ON platform.feature_flags;
CREATE TRIGGER update_platform_feature_flags_updated_at
  BEFORE UPDATE ON platform.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Partial unique index for global flags (only one per flag_key where scope_type = 'global')
CREATE UNIQUE INDEX IF NOT EXISTS ux_flags_global
  ON platform.feature_flags (flag_key)
  WHERE scope_type = 'global';

-- Partial unique index for scoped flags (one per flag_key + scope_type + scope_id)
CREATE UNIQUE INDEX IF NOT EXISTS ux_flags_scoped
  ON platform.feature_flags (flag_key, scope_type, scope_id)
  WHERE scope_type != 'global';

-- Index for looking up all flags for a scope
CREATE INDEX IF NOT EXISTS feature_flags_scope_idx
  ON platform.feature_flags (scope_type, scope_id);

-- Index for looking up by flag_key
CREATE INDEX IF NOT EXISTS feature_flags_key_idx
  ON platform.feature_flags (flag_key);

-- =============================================================================
-- SEED: Sample store for development
-- =============================================================================
INSERT INTO platform.stores (
  id,
  name,
  code,
  phone,
  email,
  address_line1,
  city,
  state,
  pincode,
  status
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'SuperMandi Demo Store',
  'DEMO001',
  '+91-9876543210',
  'demo@supermandi.in',
  '123 Market Street',
  'Bengaluru',
  'Karnataka',
  '560001',
  'active'
) ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SEED: Default feature flags
-- =============================================================================
INSERT INTO platform.feature_flags (flag_key, scope_type, enabled, description) VALUES
  ('scan_lookup_v2', 'global', true, 'Enable V2 barcode lookup with fuzzy matching'),
  ('reorder_system', 'global', true, 'Enable automated reorder suggestions'),
  ('multi_supplier', 'global', true, 'Allow stores to link multiple suppliers'),
  ('offline_mode', 'global', true, 'Enable offline POS operations')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- BACKWARD COMPATIBILITY: View for legacy code referencing public.stores
-- =============================================================================
-- Note: Existing code may reference 'stores' without schema prefix
-- This view provides backward compatibility during migration
CREATE OR REPLACE VIEW public.stores AS
  SELECT
    id::TEXT as id,  -- Legacy code uses TEXT ids
    name,
    code,
    phone,
    email,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    timezone,
    currency,
    status,
    created_at,
    updated_at
  FROM platform.stores;

COMMIT;
