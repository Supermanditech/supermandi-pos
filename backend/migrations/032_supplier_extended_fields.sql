-- Migration: 032_supplier_extended_fields (renumbered from 014 to resolve conflict with 014_stores_add_store_code)
-- Extends supplier schema with full 4-section registration form fields
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- ALTER supplier.suppliers: Add Section A-B fields
-- =============================================================================

-- Section A: Identity & Compliance
ALTER TABLE supplier.suppliers ADD COLUMN IF NOT EXISTS fssai VARCHAR(14);  -- FSSAI license number

-- Section B: Contact & Address
ALTER TABLE supplier.suppliers ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT false;
ALTER TABLE supplier.suppliers ADD COLUMN IF NOT EXISTS secondary_phone VARCHAR(20);
ALTER TABLE supplier.suppliers ADD COLUMN IF NOT EXISTS area VARCHAR(100);  -- Locality/area name

-- =============================================================================
-- ALTER supplier.supplier_store_links: Add Section C-D fields (per-store)
-- =============================================================================

-- Section C: Commercial Terms
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'Cash';
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS delivery_charges INTEGER DEFAULT 0;  -- In minor units (paise)
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS delivery_schedule VARCHAR(255);  -- e.g., "Mon/Wed/Fri", "Daily"
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS returns_allowed BOOLEAN DEFAULT false;
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS returns_window INTEGER DEFAULT 0;  -- Days
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS tax_invoice_provided BOOLEAN DEFAULT false;
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS price_source VARCHAR(50);  -- Rate List, Phone Call, App, WhatsApp

-- Section D: Operational Metadata (per-store since different stores may use different categories)
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS categories_supplied JSONB DEFAULT '[]'::jsonb;  -- Array of category names
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS brands_supplied TEXT;  -- Comma-separated brand names
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS ordering_channel VARCHAR(50);  -- SuperMandi, WhatsApp, Phone, etc.
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS notes TEXT;

-- Service area and delivery address (specific to store-supplier relationship)
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS service_area VARCHAR(255);
ALTER TABLE supplier.supplier_store_links ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for FSSAI lookup
CREATE INDEX IF NOT EXISTS suppliers_fssai_idx ON supplier.suppliers (fssai) WHERE fssai IS NOT NULL;

-- Index for category filtering (GIN for JSONB array containment)
CREATE INDEX IF NOT EXISTS supplier_store_links_categories_idx
  ON supplier.supplier_store_links USING gin (categories_supplied);

-- =============================================================================
-- CONSTRAINTS
-- =============================================================================

-- Payment terms constraint
DO $$ BEGIN
  ALTER TABLE supplier.supplier_store_links
    ADD CONSTRAINT chk_store_link_payment_terms
    CHECK (payment_terms IN ('Cash', 'UPI', 'Credit', 'Cash + Credit'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Returns window must be positive if returns allowed
DO $$ BEGIN
  ALTER TABLE supplier.supplier_store_links
    ADD CONSTRAINT chk_store_link_returns_window
    CHECK (NOT returns_allowed OR returns_window >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
