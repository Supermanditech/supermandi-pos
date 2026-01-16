-- Migration: 026_fmcg_taxonomy
-- CAT-001: Global FMCG taxonomy master table (labels + icon keys) + seed data
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: catalog.fmcg_taxonomy
-- Global FMCG category dictionary for kirana stores
-- Used across all stores to render category names and icons automatically
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.fmcg_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Labels
  label_en VARCHAR(100) NOT NULL,
  label_hi VARCHAR(100),

  -- Icon key (MaterialCommunityIcons glyph name)
  icon_key VARCHAR(100) NOT NULL,

  -- Sorting
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fmcg_taxonomy_label_en_unique UNIQUE (label_en)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_catalog_fmcg_taxonomy_updated_at ON catalog.fmcg_taxonomy;
CREATE TRIGGER update_catalog_fmcg_taxonomy_updated_at
  BEFORE UPDATE ON catalog.fmcg_taxonomy
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fmcg_taxonomy_sort_order
  ON catalog.fmcg_taxonomy (sort_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_fmcg_taxonomy_active
  ON catalog.fmcg_taxonomy (is_active)
  WHERE is_active = true;

-- =============================================================================
-- SEED: 15 kirana-friendly broad FMCG categories
-- Indian industry-standard categories with Hindi labels and icons
-- =============================================================================

-- First, delete existing seed data if re-running (idempotent)
-- Using label_en as the unique key for upsert

INSERT INTO catalog.fmcg_taxonomy (id, label_en, label_hi, icon_key, sort_order, is_active)
VALUES
  -- All / Sab (special category - shows all products)
  ('f0000000-0000-0000-0000-000000000001', 'Sab', 'सभी', 'view-grid', 0, true),

  -- Staples
  ('f0000000-0000-0000-0000-000000000002', 'Atta-Dal', 'आटा-दाल', 'barley', 10, true),
  ('f0000000-0000-0000-0000-000000000003', 'Chawal', 'चावल', 'rice', 20, true),
  ('f0000000-0000-0000-0000-000000000004', 'Masala', 'मसाला', 'shaker-outline', 30, true),
  ('f0000000-0000-0000-0000-000000000005', 'Tel-Ghee', 'तेल-घी', 'bottle-wine-outline', 40, true),

  -- Snacks & Beverages
  ('f0000000-0000-0000-0000-000000000006', 'Namkeen', 'नमकीन', 'food-croissant', 50, true),
  ('f0000000-0000-0000-0000-000000000007', 'Biscuit', 'बिस्कुट', 'cookie-outline', 60, true),
  ('f0000000-0000-0000-0000-000000000008', 'Chai-Coffee', 'चाय-कॉफी', 'coffee', 70, true),
  ('f0000000-0000-0000-0000-000000000009', 'Cold Drink', 'कोल्ड ड्रिंक', 'bottle-soda-classic', 80, true),

  -- Dairy
  ('f0000000-0000-0000-0000-000000000010', 'Doodh', 'दूध-पनीर', 'cow', 90, true),

  -- Personal & Home Care
  ('f0000000-0000-0000-0000-000000000011', 'Sabun', 'साबुन', 'hand-wash-outline', 100, true),
  ('f0000000-0000-0000-0000-000000000012', 'Safai', 'सफाई', 'spray-bottle', 110, true),

  -- Specialty
  ('f0000000-0000-0000-0000-000000000013', 'Baby', 'बेबी', 'baby-face-outline', 120, true),
  ('f0000000-0000-0000-0000-000000000014', 'Paan-Supari', 'पान-सुपारी', 'leaf', 130, true),

  -- Catch-all
  ('f0000000-0000-0000-0000-000000000015', 'Baaki', 'बाकी', 'dots-horizontal', 999, true)

ON CONFLICT (label_en) DO UPDATE SET
  label_hi = EXCLUDED.label_hi,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

COMMIT;
