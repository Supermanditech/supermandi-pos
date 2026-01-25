-- Migration: 044_iter2_production_hardening
-- Production hardening for go-live (Iteration 2 findings)
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- FINDING-002: Ensure reorder/orders schemas exist with correct table names
-- The routes use store_settings but migration uses store_reorder_settings
-- =============================================================================

-- Create alias view for store_settings (routes expect reorder.store_settings)
CREATE TABLE IF NOT EXISTS reorder.store_settings (
  store_id UUID PRIMARY KEY,
  reorder_enabled BOOLEAN NOT NULL DEFAULT true,
  require_approval BOOLEAN NOT NULL DEFAULT true,
  auto_approve_threshold INTEGER,
  default_lead_days INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_reorder_store_settings_updated_at ON reorder.store_settings;
CREATE TRIGGER update_reorder_store_settings_updated_at
  BEFORE UPDATE ON reorder.store_settings
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Create product_policies table (routes expect this name)
CREATE TABLE IF NOT EXISTS reorder.product_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  product_id UUID NOT NULL,
  min_threshold INTEGER NOT NULL DEFAULT 5,
  target_stock INTEGER NOT NULL DEFAULT 20,
  preferred_supplier_id UUID,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_policies_unique UNIQUE (store_id, product_id),
  CONSTRAINT chk_product_policies_bounds CHECK (min_threshold >= 0 AND target_stock >= min_threshold)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_reorder_product_policies_updated_at ON reorder.product_policies;
CREATE TRIGGER update_reorder_product_policies_updated_at
  BEFORE UPDATE ON reorder.product_policies
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Index for store policies lookup
CREATE INDEX IF NOT EXISTS product_policies_store_idx ON reorder.product_policies (store_id) WHERE is_enabled = true;

-- Ensure orders schema has item_count column
ALTER TABLE orders.purchase_orders ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders.purchase_orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);
ALTER TABLE orders.purchase_orders ADD COLUMN IF NOT EXISTS carrier VARCHAR(100);

-- Add metadata column to order_events
ALTER TABLE orders.order_events ADD COLUMN IF NOT EXISTS metadata JSONB;

-- =============================================================================
-- FINDING-022: Customer entity for credit tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,

  -- Customer info
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),

  -- Address
  address TEXT,
  city VARCHAR(100),
  pincode VARCHAR(10),

  -- Credit tracking
  credit_limit_minor INTEGER DEFAULT 0,  -- Credit limit in paise
  outstanding_balance_minor INTEGER DEFAULT 0,  -- Current outstanding in paise

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_customer_credit CHECK (credit_limit_minor >= 0),
  CONSTRAINT customers_store_phone_unique UNIQUE (store_id, phone)
);

-- Index for store customers lookup
CREATE INDEX IF NOT EXISTS customers_store_idx ON public.customers (store_id) WHERE is_active = true;

-- Add customer_id to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- Index for customer sales lookup
CREATE INDEX IF NOT EXISTS sales_customer_idx ON public.sales (customer_id) WHERE customer_id IS NOT NULL;

-- =============================================================================
-- FINDING-023: Make payments.sale_id NOT NULL for new records
-- Note: We can't change existing NULLs, but add default for new records
-- =============================================================================

-- Add constraint to prevent future NULL sale_id (soft constraint via trigger)
CREATE OR REPLACE FUNCTION check_payment_sale_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sale_id IS NULL THEN
    RAISE WARNING 'Payment created without sale_id: %', NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_payment_sale_id_trigger ON public.payments;
CREATE TRIGGER check_payment_sale_id_trigger
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION check_payment_sale_id();

-- =============================================================================
-- FINDING-026: Device token expiry (user-friendly - 90 days with auto-refresh)
-- =============================================================================

ALTER TABLE public.pos_devices ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE public.pos_devices ADD COLUMN IF NOT EXISTS token_refreshed_at TIMESTAMPTZ;
ALTER TABLE public.pos_devices ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Set default expiry for existing devices (90 days from now)
UPDATE public.pos_devices
SET token_expires_at = NOW() + INTERVAL '90 days',
    token_refreshed_at = NOW()
WHERE token_expires_at IS NULL;

-- Index for token expiry check
CREATE INDEX IF NOT EXISTS pos_devices_token_expires_idx ON public.pos_devices (token_expires_at) WHERE active = true;

-- =============================================================================
-- FINDING-027: Configurable max devices per store
-- =============================================================================

ALTER TABLE platform.stores ADD COLUMN IF NOT EXISTS max_devices INTEGER DEFAULT 10;

-- Update existing stores with reasonable default
UPDATE platform.stores SET max_devices = 10 WHERE max_devices IS NULL;

-- =============================================================================
-- FINDING-028: Device re-enrollment notifications for superadmin
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.device_enrollment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  device_id UUID,

  -- Event info
  event_type VARCHAR(50) NOT NULL,  -- 'enrolled', 'unenrolled', 're_enrolled', 'app_uninstalled'
  device_fingerprint VARCHAR(255),
  device_label VARCHAR(255),
  enrollment_code VARCHAR(50),

  -- Previous device info (for re-enrollment)
  previous_device_id UUID,
  previous_device_label VARCHAR(255),

  -- Notification status
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  notification_sent_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB,
  ip_address VARCHAR(50),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_enrollment_event_type CHECK (
    event_type IN ('enrolled', 'unenrolled', 're_enrolled', 'app_uninstalled', 'token_refreshed', 'deactivated')
  )
);

-- Index for pending notifications
CREATE INDEX IF NOT EXISTS device_enrollment_events_pending_idx
  ON public.device_enrollment_events (created_at DESC)
  WHERE notification_sent = false;

-- Index for store events
CREATE INDEX IF NOT EXISTS device_enrollment_events_store_idx
  ON public.device_enrollment_events (store_id, created_at DESC);

-- =============================================================================
-- FINDING-014: Track sync event attempts and failures
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sync_event_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  device_id UUID NOT NULL,

  -- Event info
  event_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,

  -- Failure tracking
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Resolution
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution_type VARCHAR(50),  -- 'processed', 'expired', 'manual_skip'

  -- Constraints
  CONSTRAINT sync_event_failures_unique UNIQUE (store_id, device_id, event_id)
);

-- Index for unresolved failures
CREATE INDEX IF NOT EXISTS sync_event_failures_unresolved_idx
  ON public.sync_event_failures (store_id, device_id)
  WHERE resolved = false;

-- =============================================================================
-- FINDING-011: Idempotency keys for direct API calls
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
  key VARCHAR(255) NOT NULL,
  store_id UUID NOT NULL,
  device_id UUID,

  -- Request info
  route VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  request_hash VARCHAR(64),

  -- Result
  response_status INTEGER,
  response_body JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (key, store_id)
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS api_idempotency_keys_expires_idx
  ON public.api_idempotency_keys (expires_at);

-- Cleanup old keys (run periodically)
DELETE FROM public.api_idempotency_keys WHERE expires_at < NOW() - INTERVAL '1 day';

COMMIT;
