-- Migration: 139_t154_khata_entries
-- T-154: Khata (credit ledger) entries table
-- Tracks credit/debit/payment entries per customer per store
-- "Khata" is the Hindi term for a credit ledger used by Indian retailers
-- balance_minor holds the running balance after each entry
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: orders.khata_entries
-- Per-store credit ledger entries for customer accounts
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders.khata_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store isolation
  store_id UUID NOT NULL REFERENCES platform.stores(id),

  -- Customer identification
  customer_name VARCHAR(200) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,

  -- Entry type and amount
  entry_type VARCHAR(20) NOT NULL,
  amount_minor BIGINT NOT NULL,            -- Amount in paise (always positive)

  -- Description / notes
  description TEXT,

  -- Optional link to sale
  sale_id VARCHAR(100) REFERENCES public.sales(id),

  -- Running balance after this entry (in paise, positive = customer owes store)
  balance_minor BIGINT NOT NULL DEFAULT 0,

  -- Staff who created the entry
  created_by UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_khata_entry_type CHECK (
    entry_type IN ('credit', 'debit', 'payment')
  ),
  CONSTRAINT chk_khata_amount CHECK (amount_minor > 0)
);

-- Primary lookup: all entries for a customer at a store
CREATE INDEX IF NOT EXISTS idx_khata_entries_store_phone
  ON orders.khata_entries (store_id, customer_phone, created_at DESC);

-- Store-level listing
CREATE INDEX IF NOT EXISTS idx_khata_entries_store
  ON orders.khata_entries (store_id, created_at DESC);

-- Sale reference lookup
CREATE INDEX IF NOT EXISTS idx_khata_entries_sale
  ON orders.khata_entries (sale_id)
  WHERE sale_id IS NOT NULL;

COMMENT ON TABLE orders.khata_entries IS
  'Khata (credit ledger) entries — tracks credit/debit/payment per customer per store. balance_minor is running balance.';

COMMIT;
