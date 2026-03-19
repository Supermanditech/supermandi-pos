-- Migration 201: Commercial terms, procurement payment intents, and order term snapshots
-- V3-FIX-174: Structured MOQ tiers, delivery SLA, published commercial terms
-- V3-FIX-176: Procurement payment intents for retailer-to-SuperMandi settlement
-- V3-HARDEN-177: Canonical published-term and checkout-state contract
-- ROLLBACK: DROP TABLE IF EXISTS procurement.payment_intents; ALTER TABLE catalog.supplier_products DROP COLUMN IF EXISTS moq_tiers, DROP COLUMN IF EXISTS delivery_sla_days, DROP COLUMN IF EXISTS delivery_terms, DROP COLUMN IF EXISTS finance_eligible, DROP COLUMN IF EXISTS published_terms_version, DROP COLUMN IF EXISTS published_by, DROP COLUMN IF EXISTS published_at;

BEGIN;

-- ============================================================
-- 1. Supplier products: structured commercial terms
-- ============================================================
ALTER TABLE catalog.supplier_products
  ADD COLUMN IF NOT EXISTS moq_tiers JSONB,
  ADD COLUMN IF NOT EXISTS delivery_sla_days INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_terms TEXT,
  ADD COLUMN IF NOT EXISTS finance_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_terms_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_by TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- moq_tiers: [{minQty, maxQty, discountPct, priceMinor}]
-- delivery_terms: free-text delivery conditions
-- published_terms_version: monotonically incrementing on each admin publish

-- ============================================================
-- 2. Order term snapshots — preserve accepted terms at order time
-- Uses the live orders.purchase_orders table (not procurement schema)
-- ============================================================
ALTER TABLE orders.purchase_orders
  ADD COLUMN IF NOT EXISTS accepted_terms_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS accepted_terms_version INTEGER,
  ADD COLUMN IF NOT EXISTS payment_lane VARCHAR(30) DEFAULT 'SUPERMANDI_PRINCIPAL';

-- ============================================================
-- 3. Procurement payment intents — retailer pays SuperMandi
-- ============================================================
CREATE SCHEMA IF NOT EXISTS procurement;

CREATE TABLE IF NOT EXISTS procurement.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  order_id UUID NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  provider VARCHAR(30) NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'created',
  mode VARCHAR(20) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_payment_intent_status CHECK (status IN (
    'created', 'pending', 'authorized', 'paid', 'failed', 'refunded', 'expired'
  )),
  CONSTRAINT chk_payment_intent_provider CHECK (provider IN (
    'PHONEPE', 'PINE_LABS', 'RAZORPAY', 'BNPL', 'SUPERMANDI_CREDIT', 'MANUAL', 'UPI_DIRECT'
  )),
  CONSTRAINT chk_payment_intent_mode CHECK (mode IN (
    'UPI', 'BANK', 'BNPL', 'CREDIT', 'CASH', 'CARD'
  ))
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_order ON procurement.payment_intents(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_store ON procurement.payment_intents(store_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON procurement.payment_intents(status);

-- ============================================================
-- 4. Back-fill existing approved products with defaults
-- ============================================================
UPDATE catalog.supplier_products
SET delivery_sla_days = COALESCE(delivery_days, 2),
    published_at = COALESCE(approved_at, NOW()),
    published_by = 'SYSTEM_BACKFILL'
WHERE approval_status = 'approved'
  AND published_at IS NULL;

COMMIT;
