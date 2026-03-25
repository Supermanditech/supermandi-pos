-- Migration: 018_sales_schema
-- ROLLBACK: DROP VIEW IF EXISTS public.stores; DROP TABLE IF EXISTS public.collections, public.sale_items, public.sales, public.bill_sequences CASCADE;
-- V3.0.9 Production: Sales schema for POS transactions
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: public.bill_sequences
-- Atomic bill number generation per store
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bill_sequences (
  store_id UUID PRIMARY KEY,  -- FK to platform.stores
  last_number INTEGER NOT NULL DEFAULT 0,
  prefix VARCHAR(10) NOT NULL DEFAULT 'B',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: public.sales
-- Sales transactions (bills) from POS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sales (
  id VARCHAR(100) PRIMARY KEY,  -- Can be UUID or custom sale ID (sale_xxx format)

  -- Store & Device
  store_id UUID NOT NULL,  -- FK to platform.stores
  device_id VARCHAR(100),  -- FK to pos_devices (can be null for migrated data)

  -- Bill identification
  bill_ref VARCHAR(50) NOT NULL,

  -- Amounts (minor units - paise)
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  discount_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_mode VARCHAR(20),
  payment_status VARCHAR(20) DEFAULT 'pending',

  -- Customer info (optional)
  customer_name VARCHAR(255),
  customer_phone VARCHAR(20),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_sale_status CHECK (
    status IN ('pending', 'completed', 'cancelled', 'voided')
  ),
  CONSTRAINT chk_sale_payment_mode CHECK (
    payment_mode IS NULL OR payment_mode IN ('CASH', 'UPI', 'DUE')
  ),
  CONSTRAINT chk_sale_payment_status CHECK (
    payment_status IN ('pending', 'paid', 'failed')
  ),
  CONSTRAINT chk_sale_amounts CHECK (
    subtotal_minor >= 0 AND
    discount_minor >= 0 AND
    total_minor >= 0
  )
);

-- Unique bill ref per store
CREATE UNIQUE INDEX IF NOT EXISTS sales_store_bill_ref_unique_idx
  ON public.sales (store_id, bill_ref);

-- Store sales lookup (most recent first)
CREATE INDEX IF NOT EXISTS sales_store_created_idx
  ON public.sales (store_id, created_at DESC);

-- Status filter
CREATE INDEX IF NOT EXISTS sales_status_idx
  ON public.sales (status);

-- Device lookup
CREATE INDEX IF NOT EXISTS sales_device_idx
  ON public.sales (device_id)
  WHERE device_id IS NOT NULL;

-- =============================================================================
-- TABLE: public.sale_items
-- Line items for sales transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  sale_id VARCHAR(100) NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,

  -- Product references
  product_id UUID NOT NULL,  -- FK to catalog.products
  variant_id VARCHAR(100),  -- Optional variant identifier

  -- Product info (snapshot at sale time)
  name VARCHAR(500),
  barcode VARCHAR(100),

  -- Quantities & Pricing (minor units)
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sale items lookup
CREATE INDEX IF NOT EXISTS sale_items_sale_idx
  ON public.sale_items (sale_id);

-- Product sales lookup (for reports)
CREATE INDEX IF NOT EXISTS sale_items_product_idx
  ON public.sale_items (product_id);

-- =============================================================================
-- TABLE: public.collections
-- Cash collections (non-sale payments like DUE settlements)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.collections (
  id VARCHAR(100) PRIMARY KEY,  -- Can be UUID or custom ID

  -- Store & Device
  store_id UUID NOT NULL,  -- FK to platform.stores
  device_id VARCHAR(100),

  -- Amount
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  mode VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Reference (e.g., customer name or invoice ref)
  reference VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_collection_mode CHECK (
    mode IN ('CASH', 'UPI', 'DUE')
  ),
  CONSTRAINT chk_collection_status CHECK (
    status IN ('pending', 'paid', 'failed')
  )
);

-- Store collections lookup
CREATE INDEX IF NOT EXISTS collections_store_idx
  ON public.collections (store_id, created_at DESC);

-- =============================================================================
-- VIEW: public.stores
-- Convenience view for accessing platform.stores from public schema
-- Drop and recreate to handle schema changes safely
-- =============================================================================
DROP VIEW IF EXISTS public.stores;
CREATE VIEW public.stores AS
SELECT id, name, code, phone, email, address_line1, address_line2,
       city, state, pincode, timezone, currency, status, created_at, updated_at
FROM platform.stores;

COMMIT;
