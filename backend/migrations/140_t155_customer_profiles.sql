-- Migration: 140_t155_customer_profiles
-- T-155: Customer profiles table
-- Store-level customer profiles with contact info, credit limits, and visit tracking
-- Each store maintains its own customer database (store isolation)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: platform.customer_profiles
-- Per-store customer profiles for CRM and credit management
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform.customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store isolation
  store_id UUID NOT NULL REFERENCES platform.stores(id),

  -- Customer info
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  address TEXT,

  -- Credit management (in paise)
  credit_limit_minor BIGINT NOT NULL DEFAULT 0,

  -- Aggregated stats (updated by app logic)
  total_purchases_minor BIGINT NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints: one customer phone per store
  CONSTRAINT ux_customer_profiles_store_phone UNIQUE (store_id, phone),
  CONSTRAINT chk_customer_credit_limit CHECK (credit_limit_minor >= 0),
  CONSTRAINT chk_customer_purchases CHECK (total_purchases_minor >= 0),
  CONSTRAINT chk_customer_visits CHECK (visit_count >= 0)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_customer_profiles_updated_at ON platform.customer_profiles;
CREATE TRIGGER update_customer_profiles_updated_at
  BEFORE UPDATE ON platform.customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Store lookup (all customers for a store)
CREATE INDEX IF NOT EXISTS idx_customer_profiles_store
  ON platform.customer_profiles (store_id, name);

-- Phone search across stores (for admin)
CREATE INDEX IF NOT EXISTS idx_customer_profiles_phone
  ON platform.customer_profiles (phone);

-- Recent visitors
CREATE INDEX IF NOT EXISTS idx_customer_profiles_last_visit
  ON platform.customer_profiles (store_id, last_visit_at DESC NULLS LAST)
  WHERE last_visit_at IS NOT NULL;

COMMENT ON TABLE platform.customer_profiles IS
  'Per-store customer profiles for CRM, credit management, and visit tracking. One phone per store (store-isolated).';

COMMIT;
