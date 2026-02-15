-- Migration: 134_t069_invoice_system_schema
-- T-069: Invoice system schema + tables
-- Supports two invoice models:
--   Model 1 (buy-resell): SuperMandi buys from supplier, resells to retailer
--   Model 2 (platform-fee): Supplier sells directly, SuperMandi charges commission
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Schema: invoicing
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS invoicing;

-- =============================================================================
-- Table: invoicing.invoice_series
-- Auto-incrementing invoice number series per entity type
-- =============================================================================
CREATE TABLE IF NOT EXISTS invoicing.invoice_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(30) NOT NULL,    -- 'supermandi', 'supplier', 'store'
  entity_id UUID,                       -- NULL for supermandi, supplier_id or store_id otherwise
  prefix VARCHAR(20) NOT NULL,          -- e.g., 'SM-INV', 'SUP-INV', 'ST-INV'
  current_number INTEGER NOT NULL DEFAULT 0,
  fiscal_year VARCHAR(10) NOT NULL,     -- e.g., '2025-26'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invoice_series_unique UNIQUE (entity_type, entity_id, fiscal_year)
);

-- =============================================================================
-- Table: invoicing.invoices
-- Master invoice table for all invoice types
-- =============================================================================
CREATE TABLE IF NOT EXISTS invoicing.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Invoice identification
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,

  -- Invoice model
  invoice_model VARCHAR(20) NOT NULL,   -- 'buy_resell' or 'platform_fee'
  invoice_type VARCHAR(20) NOT NULL,    -- 'purchase' (supplier→SM), 'sale' (SM→retailer), 'commission' (SM fee)

  -- Status lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- draft → issued → paid → cancelled
  -- draft → issued → overdue → paid
  -- draft → cancelled

  -- Parties
  seller_type VARCHAR(20) NOT NULL,     -- 'supermandi', 'supplier', 'store'
  seller_id UUID,                        -- supplier_id, store_id, or NULL for supermandi
  seller_name VARCHAR(500),
  seller_gstin VARCHAR(20),
  seller_address TEXT,

  buyer_type VARCHAR(20) NOT NULL,      -- 'supermandi', 'supplier', 'store'
  buyer_id UUID,
  buyer_name VARCHAR(500),
  buyer_gstin VARCHAR(20),
  buyer_address TEXT,

  -- Amounts (all in minor units / paise)
  subtotal_minor BIGINT NOT NULL DEFAULT 0,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  taxable_amount_minor BIGINT NOT NULL DEFAULT 0,
  cgst_minor BIGINT NOT NULL DEFAULT 0,
  sgst_minor BIGINT NOT NULL DEFAULT 0,
  igst_minor BIGINT NOT NULL DEFAULT 0,
  total_tax_minor BIGINT NOT NULL DEFAULT 0,
  total_amount_minor BIGINT NOT NULL DEFAULT 0,
  amount_paid_minor BIGINT NOT NULL DEFAULT 0,
  balance_due_minor BIGINT NOT NULL DEFAULT 0,

  -- Platform fee (Model 2 only)
  platform_fee_percent DECIMAL(5,2),
  platform_fee_minor BIGINT DEFAULT 0,

  -- References
  order_id UUID,                         -- Link to order if order-based
  purchase_order_number VARCHAR(50),
  reference_note TEXT,

  -- Metadata
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  fiscal_year VARCHAR(10),
  created_by UUID,                       -- admin or system user
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_invoice_model CHECK (invoice_model IN ('buy_resell', 'platform_fee')),
  CONSTRAINT chk_invoice_type CHECK (invoice_type IN ('purchase', 'sale', 'commission', 'credit_note', 'debit_note')),
  CONSTRAINT chk_invoice_status CHECK (status IN ('draft', 'issued', 'paid', 'overdue', 'cancelled', 'void')),
  CONSTRAINT chk_seller_type CHECK (seller_type IN ('supermandi', 'supplier', 'store')),
  CONSTRAINT chk_buyer_type CHECK (buyer_type IN ('supermandi', 'supplier', 'store'))
);

-- =============================================================================
-- Table: invoicing.invoice_items
-- Line items for each invoice
-- =============================================================================
CREATE TABLE IF NOT EXISTS invoicing.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoicing.invoices(id) ON DELETE CASCADE,

  -- Product reference
  product_id UUID,                       -- catalog.products.id
  supplier_product_id UUID,              -- catalog.supplier_products.id
  product_name VARCHAR(500) NOT NULL,
  product_sku VARCHAR(100),
  hsn_code VARCHAR(20),                  -- HSN/SAC code for GST

  -- Quantities
  quantity NUMERIC(12,4) NOT NULL,
  unit VARCHAR(20) DEFAULT 'PCS',

  -- Pricing (all in minor units)
  unit_price_minor BIGINT NOT NULL,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  taxable_amount_minor BIGINT NOT NULL DEFAULT 0,

  -- Tax breakdown
  gst_rate DECIMAL(5,2) DEFAULT 0,       -- e.g., 5.00, 12.00, 18.00, 28.00
  cgst_minor BIGINT NOT NULL DEFAULT 0,
  sgst_minor BIGINT NOT NULL DEFAULT 0,
  igst_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL DEFAULT 0,

  -- Sort order
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Table: invoicing.invoice_payments
-- Payment records against invoices
-- =============================================================================
CREATE TABLE IF NOT EXISTS invoicing.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoicing.invoices(id) ON DELETE CASCADE,

  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_minor BIGINT NOT NULL,
  payment_mode VARCHAR(20) NOT NULL,     -- 'bank_transfer', 'upi', 'cash', 'cheque', 'neft', 'rtgs'
  payment_reference VARCHAR(100),         -- UTR, cheque number, etc.
  notes TEXT,

  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_payment_mode CHECK (payment_mode IN (
    'bank_transfer', 'upi', 'cash', 'cheque', 'neft', 'rtgs', 'adjustment'
  ))
);

-- =============================================================================
-- Table: invoicing.credit_notes
-- Credit notes linked to original invoices
-- =============================================================================
CREATE TABLE IF NOT EXISTS invoicing.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number VARCHAR(50) NOT NULL,
  original_invoice_id UUID NOT NULL REFERENCES invoicing.invoices(id),
  reason VARCHAR(50) NOT NULL,           -- 'return', 'price_correction', 'damaged', 'other'
  amount_minor BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'issued',

  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_credit_note_reason CHECK (reason IN ('return', 'price_correction', 'damaged', 'short_delivery', 'other')),
  CONSTRAINT chk_credit_note_status CHECK (status IN ('draft', 'issued', 'applied', 'cancelled'))
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Invoice lookups
CREATE INDEX IF NOT EXISTS idx_invoices_number
  ON invoicing.invoices (invoice_number);

CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON invoicing.invoices (status, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_seller
  ON invoicing.invoices (seller_type, seller_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_buyer
  ON invoicing.invoices (buyer_type, buyer_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_model_type
  ON invoicing.invoices (invoice_model, invoice_type);

CREATE INDEX IF NOT EXISTS idx_invoices_order
  ON invoicing.invoices (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_fiscal_year
  ON invoicing.invoices (fiscal_year, invoice_date DESC);

-- Invoice items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
  ON invoicing.invoice_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_product
  ON invoicing.invoice_items (product_id)
  WHERE product_id IS NOT NULL;

-- Payments
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice
  ON invoicing.invoice_payments (invoice_id);

-- Credit notes
CREATE INDEX IF NOT EXISTS idx_credit_notes_original
  ON invoicing.credit_notes (original_invoice_id);

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON SCHEMA invoicing IS 'Invoice management system supporting buy-resell and platform-fee models';
COMMENT ON TABLE invoicing.invoices IS 'Master invoice table — all invoice types (purchase, sale, commission, credit/debit notes)';
COMMENT ON TABLE invoicing.invoice_items IS 'Line items for each invoice with GST breakdown';
COMMENT ON TABLE invoicing.invoice_payments IS 'Payment records against invoices for reconciliation';
COMMENT ON TABLE invoicing.credit_notes IS 'Credit notes linked to original invoices for returns/adjustments';
COMMENT ON TABLE invoicing.invoice_series IS 'Auto-incrementing invoice number series per entity type and fiscal year';

COMMIT;
