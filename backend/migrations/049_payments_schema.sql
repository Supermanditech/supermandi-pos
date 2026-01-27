-- Migration: 049_payments_schema
-- SM-002: Payment Schema Migration
-- Creates payments schema with sell_payments, buy_payments, BNPL, and credit tables
-- Foundation for SELL, BUY, BNPL, Credit flows
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Create payments schema
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS payments;

-- =============================================================================
-- ALTER platform.stores: Add payment columns for receiving SELL payments
-- =============================================================================
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS upi_vpa VARCHAR(100);

ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS razorpay_account_id VARCHAR(50);

-- =============================================================================
-- TABLE: payments.sell_payments
-- SELL payments (Consumer -> Retailer)
-- Tracks UPI, Cash, DUE, and Split payments from customers
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments.sell_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  sale_id UUID NOT NULL,
  store_id UUID NOT NULL,

  -- Payment mode
  mode VARCHAR(20) NOT NULL,

  -- Amount in minor units (paise)
  amount_minor INTEGER NOT NULL,

  -- UPI specific fields
  upi_order_id VARCHAR(100),
  upi_payment_id VARCHAR(100),
  upi_qr_data TEXT,
  upi_vpa VARCHAR(100),
  upi_payer_vpa VARCHAR(100),
  upi_txn_ref VARCHAR(100),

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending',

  -- Timestamps
  initiated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error tracking
  failure_reason TEXT,

  -- Webhook data storage
  webhook_payload JSONB,

  -- Idempotency
  idempotency_key VARCHAR(100) UNIQUE,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_sell_payments_mode CHECK (mode IN ('CASH', 'UPI', 'DUE', 'SPLIT')),
  CONSTRAINT chk_sell_payments_status CHECK (status IN ('pending', 'initiated', 'completed', 'failed', 'refunded'))
);

-- Indexes for sell_payments
CREATE INDEX IF NOT EXISTS idx_sell_payments_sale ON payments.sell_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sell_payments_store ON payments.sell_payments(store_id, status);
CREATE INDEX IF NOT EXISTS idx_sell_payments_order ON payments.sell_payments(upi_order_id) WHERE upi_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sell_payments_status ON payments.sell_payments(status) WHERE status = 'initiated';

-- =============================================================================
-- TABLE: payments.buy_payments
-- BUY payments (Retailer -> Supplier)
-- Tracks UPI, Bank, BNPL, and Credit payments to suppliers
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments.buy_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  store_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  purchase_order_id UUID,

  -- Payment mode
  mode VARCHAR(20) NOT NULL,

  -- Amount in minor units (paise)
  amount_minor INTEGER NOT NULL,

  -- Payout fields
  payout_id VARCHAR(100),
  payout_utr VARCHAR(100),

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending',

  -- BNPL reference
  bnpl_drawdown_id UUID,

  -- Timestamps
  initiated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error tracking
  failure_reason TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_buy_payments_mode CHECK (mode IN ('UPI', 'BANK', 'BNPL', 'CREDIT')),
  CONSTRAINT chk_buy_payments_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Indexes for buy_payments
CREATE INDEX IF NOT EXISTS idx_buy_payments_po ON payments.buy_payments(purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_buy_payments_store ON payments.buy_payments(store_id, status);
CREATE INDEX IF NOT EXISTS idx_buy_payments_supplier ON payments.buy_payments(supplier_id);

-- =============================================================================
-- TABLE: payments.bnpl_drawdowns
-- BNPL drawdowns - tracks Buy Now Pay Later credit usage
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments.bnpl_drawdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  store_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  purchase_order_id UUID NOT NULL,

  -- Amount
  principal_minor INTEGER NOT NULL,

  -- Terms
  due_date DATE NOT NULL,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'active',

  -- Payment tracking
  paid_at TIMESTAMPTZ,
  paid_amount_minor INTEGER,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_bnpl_status CHECK (status IN ('active', 'paid', 'overdue', 'defaulted'))
);

-- Indexes for bnpl_drawdowns
CREATE INDEX IF NOT EXISTS idx_bnpl_store ON payments.bnpl_drawdowns(store_id, status);
CREATE INDEX IF NOT EXISTS idx_bnpl_supplier ON payments.bnpl_drawdowns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bnpl_due_date ON payments.bnpl_drawdowns(due_date) WHERE status = 'active';

-- =============================================================================
-- TABLE: payments.bnpl_settings
-- BNPL settings - per-supplier credit limits and terms
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments.bnpl_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Supplier reference (NULL = global default)
  supplier_id UUID,

  -- Credit limits
  max_credit_minor INTEGER NOT NULL DEFAULT 5000000,  -- Rs 50,000 default

  -- Terms
  default_tenure_days INTEGER DEFAULT 7,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on supplier_id (allows one NULL for global default)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bnpl_settings_supplier ON payments.bnpl_settings(supplier_id) WHERE supplier_id IS NOT NULL;

-- =============================================================================
-- TABLE: payments.credit_offers
-- Credit offers - loan offers to retailers based on POS data
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments.credit_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  store_id UUID NOT NULL,

  -- Offer source (e.g., 'OCEN', 'SUPERMANDI', 'PARTNER_BANK')
  offer_source VARCHAR(50) NOT NULL,

  -- Offer details
  amount_minor INTEGER NOT NULL,
  tenure_months INTEGER NOT NULL,
  interest_rate_annual DECIMAL(5,2),
  emi_minor INTEGER,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'available',

  -- Validity
  valid_until TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_credit_offer_status CHECK (status IN ('available', 'applied', 'approved', 'disbursed', 'rejected', 'expired'))
);

-- Indexes for credit_offers
CREATE INDEX IF NOT EXISTS idx_credit_store ON payments.credit_offers(store_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_valid ON payments.credit_offers(valid_until) WHERE status = 'available';

-- =============================================================================
-- TABLE: payments.credit_applications
-- Credit applications - retailer applications for credit offers
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments.credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  store_id UUID NOT NULL,
  offer_id UUID REFERENCES payments.credit_offers(id),

  -- Application details
  requested_amount_minor INTEGER NOT NULL,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'submitted',

  -- KYC tracking
  kyc_status VARCHAR(20) DEFAULT 'pending',

  -- Disbursement tracking
  disbursed_amount_minor INTEGER,
  disbursed_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_credit_app_status CHECK (status IN ('submitted', 'processing', 'approved', 'disbursed', 'rejected')),
  CONSTRAINT chk_credit_kyc_status CHECK (kyc_status IN ('pending', 'submitted', 'verified', 'rejected'))
);

-- Indexes for credit_applications
CREATE INDEX IF NOT EXISTS idx_credit_app_store ON payments.credit_applications(store_id);
CREATE INDEX IF NOT EXISTS idx_credit_app_status ON payments.credit_applications(status) WHERE status IN ('submitted', 'processing');

-- =============================================================================
-- TABLE: payments.customer_dues
-- Customer dues - tracks DUE payments from customers
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments.customer_dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  store_id UUID NOT NULL,
  sale_id UUID,

  -- Customer info
  customer_name VARCHAR(100),
  customer_phone VARCHAR(15),

  -- Amount tracking
  amount_minor INTEGER NOT NULL,
  paid_amount_minor INTEGER DEFAULT 0,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending',

  -- Due date
  due_date DATE,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_dues_status CHECK (status IN ('pending', 'partial', 'paid')),
  CONSTRAINT chk_dues_amounts CHECK (paid_amount_minor >= 0 AND paid_amount_minor <= amount_minor)
);

-- Indexes for customer_dues
CREATE INDEX IF NOT EXISTS idx_dues_store ON payments.customer_dues(store_id, status);
CREATE INDEX IF NOT EXISTS idx_dues_phone ON payments.customer_dues(store_id, customer_phone) WHERE customer_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dues_due_date ON payments.customer_dues(due_date) WHERE status != 'paid';

COMMIT;
