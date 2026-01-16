-- Migration: 027_store_products_taxonomy
-- CAT-002: Add taxonomy_id to store_products for category assignment
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- ADD taxonomy_id COLUMN to catalog.store_products
-- Links store products to global FMCG taxonomy for categorization
-- =============================================================================

-- Add column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalog'
    AND table_name = 'store_products'
    AND column_name = 'taxonomy_id'
  ) THEN
    ALTER TABLE catalog.store_products
    ADD COLUMN taxonomy_id UUID NULL;
  END IF;
END $$;

-- Add FK constraint (deferrable for bulk updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_store_products_taxonomy'
  ) THEN
    ALTER TABLE catalog.store_products
    ADD CONSTRAINT fk_store_products_taxonomy
    FOREIGN KEY (taxonomy_id)
    REFERENCES catalog.fmcg_taxonomy(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- =============================================================================
-- INDEXES for performance at scale (10k stores)
-- =============================================================================

-- Composite index for store + taxonomy lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_store_products_store_taxonomy
  ON catalog.store_products (store_id, taxonomy_id)
  WHERE is_active = true;

-- Taxonomy-only index for global category stats
CREATE INDEX IF NOT EXISTS idx_store_products_taxonomy
  ON catalog.store_products (taxonomy_id)
  WHERE taxonomy_id IS NOT NULL AND is_active = true;

-- Partial index for uncategorized products (need attention)
CREATE INDEX IF NOT EXISTS idx_store_products_uncategorized
  ON catalog.store_products (store_id)
  WHERE taxonomy_id IS NULL AND is_active = true;

-- =============================================================================
-- HELPER: Category keyword mapping table for deterministic assignment
-- Maps product name keywords to taxonomy categories
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalog.taxonomy_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  taxonomy_id UUID NOT NULL REFERENCES catalog.fmcg_taxonomy(id) ON DELETE CASCADE,

  -- Keyword pattern (case-insensitive matching)
  keyword VARCHAR(100) NOT NULL,

  -- Priority (higher = more specific, checked first)
  priority INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT taxonomy_keywords_unique UNIQUE (keyword)
);

-- Index for keyword lookups
CREATE INDEX IF NOT EXISTS idx_taxonomy_keywords_keyword
  ON catalog.taxonomy_keywords (LOWER(keyword));

CREATE INDEX IF NOT EXISTS idx_taxonomy_keywords_taxonomy
  ON catalog.taxonomy_keywords (taxonomy_id);

-- =============================================================================
-- SEED: Keyword mappings for deterministic category assignment
-- =============================================================================

INSERT INTO catalog.taxonomy_keywords (taxonomy_id, keyword, priority)
VALUES
  -- Atta-Dal (f0000000-0000-0000-0000-000000000002)
  ('f0000000-0000-0000-0000-000000000002', 'atta', 100),
  ('f0000000-0000-0000-0000-000000000002', 'flour', 100),
  ('f0000000-0000-0000-0000-000000000002', 'dal', 100),
  ('f0000000-0000-0000-0000-000000000002', 'lentil', 100),
  ('f0000000-0000-0000-0000-000000000002', 'toor', 90),
  ('f0000000-0000-0000-0000-000000000002', 'moong', 90),
  ('f0000000-0000-0000-0000-000000000002', 'chana', 90),
  ('f0000000-0000-0000-0000-000000000002', 'urad', 90),
  ('f0000000-0000-0000-0000-000000000002', 'maida', 90),
  ('f0000000-0000-0000-0000-000000000002', 'besan', 90),
  ('f0000000-0000-0000-0000-000000000002', 'suji', 90),
  ('f0000000-0000-0000-0000-000000000002', 'semolina', 90),
  ('f0000000-0000-0000-0000-000000000002', 'aashirvaad', 80),
  ('f0000000-0000-0000-0000-000000000002', 'shakti bhog', 80),
  ('f0000000-0000-0000-0000-000000000002', 'pillsbury', 80),

  -- Chawal (f0000000-0000-0000-0000-000000000003)
  ('f0000000-0000-0000-0000-000000000003', 'rice', 100),
  ('f0000000-0000-0000-0000-000000000003', 'chawal', 100),
  ('f0000000-0000-0000-0000-000000000003', 'basmati', 100),
  ('f0000000-0000-0000-0000-000000000003', 'biryani', 90),
  ('f0000000-0000-0000-0000-000000000003', 'poha', 90),
  ('f0000000-0000-0000-0000-000000000003', 'chura', 90),
  ('f0000000-0000-0000-0000-000000000003', 'india gate', 80),
  ('f0000000-0000-0000-0000-000000000003', 'daawat', 80),

  -- Masala (f0000000-0000-0000-0000-000000000004)
  ('f0000000-0000-0000-0000-000000000004', 'masala', 100),
  ('f0000000-0000-0000-0000-000000000004', 'spice', 100),
  ('f0000000-0000-0000-0000-000000000004', 'mirch', 90),
  ('f0000000-0000-0000-0000-000000000004', 'haldi', 90),
  ('f0000000-0000-0000-0000-000000000004', 'turmeric', 90),
  ('f0000000-0000-0000-0000-000000000004', 'jeera', 90),
  ('f0000000-0000-0000-0000-000000000004', 'cumin', 90),
  ('f0000000-0000-0000-0000-000000000004', 'dhania', 90),
  ('f0000000-0000-0000-0000-000000000004', 'coriander', 90),
  ('f0000000-0000-0000-0000-000000000004', 'garam', 90),
  ('f0000000-0000-0000-0000-000000000004', 'mdh', 80),
  ('f0000000-0000-0000-0000-000000000004', 'everest', 80),
  ('f0000000-0000-0000-0000-000000000004', 'catch', 80),

  -- Tel-Ghee (f0000000-0000-0000-0000-000000000005)
  ('f0000000-0000-0000-0000-000000000005', 'oil', 100),
  ('f0000000-0000-0000-0000-000000000005', 'tel', 100),
  ('f0000000-0000-0000-0000-000000000005', 'ghee', 100),
  ('f0000000-0000-0000-0000-000000000005', 'sunflower', 90),
  ('f0000000-0000-0000-0000-000000000005', 'mustard', 90),
  ('f0000000-0000-0000-0000-000000000005', 'sarson', 90),
  ('f0000000-0000-0000-0000-000000000005', 'groundnut', 90),
  ('f0000000-0000-0000-0000-000000000005', 'refined', 90),
  ('f0000000-0000-0000-0000-000000000005', 'fortune', 80),
  ('f0000000-0000-0000-0000-000000000005', 'saffola', 80),
  ('f0000000-0000-0000-0000-000000000005', 'amul ghee', 80),

  -- Namkeen (f0000000-0000-0000-0000-000000000006)
  ('f0000000-0000-0000-0000-000000000006', 'namkeen', 100),
  ('f0000000-0000-0000-0000-000000000006', 'chips', 100),
  ('f0000000-0000-0000-0000-000000000006', 'bhujia', 100),
  ('f0000000-0000-0000-0000-000000000006', 'mixture', 90),
  ('f0000000-0000-0000-0000-000000000006', 'kurkure', 90),
  ('f0000000-0000-0000-0000-000000000006', 'lays', 80),
  ('f0000000-0000-0000-0000-000000000006', 'haldiram', 80),
  ('f0000000-0000-0000-0000-000000000006', 'bikaji', 80),

  -- Biscuit (f0000000-0000-0000-0000-000000000007)
  ('f0000000-0000-0000-0000-000000000007', 'biscuit', 100),
  ('f0000000-0000-0000-0000-000000000007', 'cookie', 100),
  ('f0000000-0000-0000-0000-000000000007', 'rusk', 90),
  ('f0000000-0000-0000-0000-000000000007', 'parle', 80),
  ('f0000000-0000-0000-0000-000000000007', 'britannia', 80),
  ('f0000000-0000-0000-0000-000000000007', 'oreo', 80),
  ('f0000000-0000-0000-0000-000000000007', 'hide seek', 80),

  -- Chai-Coffee (f0000000-0000-0000-0000-000000000008)
  ('f0000000-0000-0000-0000-000000000008', 'tea', 100),
  ('f0000000-0000-0000-0000-000000000008', 'chai', 100),
  ('f0000000-0000-0000-0000-000000000008', 'coffee', 100),
  ('f0000000-0000-0000-0000-000000000008', 'tata tea', 80),
  ('f0000000-0000-0000-0000-000000000008', 'brooke bond', 80),
  ('f0000000-0000-0000-0000-000000000008', 'nescafe', 80),
  ('f0000000-0000-0000-0000-000000000008', 'bru', 80),

  -- Cold Drink (f0000000-0000-0000-0000-000000000009)
  ('f0000000-0000-0000-0000-000000000009', 'cola', 100),
  ('f0000000-0000-0000-0000-000000000009', 'pepsi', 100),
  ('f0000000-0000-0000-0000-000000000009', 'coca', 100),
  ('f0000000-0000-0000-0000-000000000009', 'sprite', 100),
  ('f0000000-0000-0000-0000-000000000009', 'fanta', 100),
  ('f0000000-0000-0000-0000-000000000009', 'thums up', 100),
  ('f0000000-0000-0000-0000-000000000009', 'limca', 100),
  ('f0000000-0000-0000-0000-000000000009', 'maaza', 90),
  ('f0000000-0000-0000-0000-000000000009', 'frooti', 90),
  ('f0000000-0000-0000-0000-000000000009', 'juice', 90),
  ('f0000000-0000-0000-0000-000000000009', 'soda', 90),
  ('f0000000-0000-0000-0000-000000000009', 'water bottle', 80),
  ('f0000000-0000-0000-0000-000000000009', 'bisleri', 80),

  -- Doodh (f0000000-0000-0000-0000-000000000010)
  ('f0000000-0000-0000-0000-000000000010', 'milk', 100),
  ('f0000000-0000-0000-0000-000000000010', 'doodh', 100),
  ('f0000000-0000-0000-0000-000000000010', 'paneer', 100),
  ('f0000000-0000-0000-0000-000000000010', 'curd', 100),
  ('f0000000-0000-0000-0000-000000000010', 'dahi', 100),
  ('f0000000-0000-0000-0000-000000000010', 'butter', 90),
  ('f0000000-0000-0000-0000-000000000010', 'cheese', 90),
  ('f0000000-0000-0000-0000-000000000010', 'amul', 80),
  ('f0000000-0000-0000-0000-000000000010', 'mother dairy', 80),

  -- Sabun (f0000000-0000-0000-0000-000000000011)
  ('f0000000-0000-0000-0000-000000000011', 'soap', 100),
  ('f0000000-0000-0000-0000-000000000011', 'sabun', 100),
  ('f0000000-0000-0000-0000-000000000011', 'shampoo', 100),
  ('f0000000-0000-0000-0000-000000000011', 'toothpaste', 100),
  ('f0000000-0000-0000-0000-000000000011', 'cream', 90),
  ('f0000000-0000-0000-0000-000000000011', 'lotion', 90),
  ('f0000000-0000-0000-0000-000000000011', 'dettol', 80),
  ('f0000000-0000-0000-0000-000000000011', 'lifebuoy', 80),
  ('f0000000-0000-0000-0000-000000000011', 'dove', 80),
  ('f0000000-0000-0000-0000-000000000011', 'colgate', 80),
  ('f0000000-0000-0000-0000-000000000011', 'pepsodent', 80),
  ('f0000000-0000-0000-0000-000000000011', 'closeup', 80),
  ('f0000000-0000-0000-0000-000000000011', 'head shoulder', 80),
  ('f0000000-0000-0000-0000-000000000011', 'clinic plus', 80),

  -- Safai (f0000000-0000-0000-0000-000000000012)
  ('f0000000-0000-0000-0000-000000000012', 'detergent', 100),
  ('f0000000-0000-0000-0000-000000000012', 'surf', 100),
  ('f0000000-0000-0000-0000-000000000012', 'cleaning', 90),
  ('f0000000-0000-0000-0000-000000000012', 'cleaner', 90),
  ('f0000000-0000-0000-0000-000000000012', 'phenyl', 90),
  ('f0000000-0000-0000-0000-000000000012', 'lizol', 90),
  ('f0000000-0000-0000-0000-000000000012', 'harpic', 90),
  ('f0000000-0000-0000-0000-000000000012', 'vim', 80),
  ('f0000000-0000-0000-0000-000000000012', 'tide', 80),
  ('f0000000-0000-0000-0000-000000000012', 'ariel', 80),
  ('f0000000-0000-0000-0000-000000000012', 'rin', 80),

  -- Baby (f0000000-0000-0000-0000-000000000013)
  ('f0000000-0000-0000-0000-000000000013', 'diaper', 100),
  ('f0000000-0000-0000-0000-000000000013', 'baby', 100),
  ('f0000000-0000-0000-0000-000000000013', 'pampers', 90),
  ('f0000000-0000-0000-0000-000000000013', 'huggies', 90),
  ('f0000000-0000-0000-0000-000000000013', 'mamy poko', 90),
  ('f0000000-0000-0000-0000-000000000013', 'cerelac', 80),
  ('f0000000-0000-0000-0000-000000000013', 'lactogen', 80),

  -- Paan-Supari (f0000000-0000-0000-0000-000000000014)
  ('f0000000-0000-0000-0000-000000000014', 'paan', 100),
  ('f0000000-0000-0000-0000-000000000014', 'supari', 100),
  ('f0000000-0000-0000-0000-000000000014', 'gutka', 90),
  ('f0000000-0000-0000-0000-000000000014', 'tobacco', 90),
  ('f0000000-0000-0000-0000-000000000014', 'cigarette', 90),
  ('f0000000-0000-0000-0000-000000000014', 'bidi', 90),
  ('f0000000-0000-0000-0000-000000000014', 'matchbox', 80),
  ('f0000000-0000-0000-0000-000000000014', 'lighter', 80)

ON CONFLICT (keyword) DO UPDATE SET
  taxonomy_id = EXCLUDED.taxonomy_id,
  priority = EXCLUDED.priority;

-- =============================================================================
-- FUNCTION: Assign taxonomy based on product name keywords
-- Returns taxonomy_id or NULL (fallback to 'Baaki')
-- =============================================================================

CREATE OR REPLACE FUNCTION catalog.assign_taxonomy_by_name(product_name TEXT)
RETURNS UUID AS $$
DECLARE
  result_taxonomy_id UUID;
  baaki_id UUID := 'f0000000-0000-0000-0000-000000000015'; -- Baaki/Others fallback
BEGIN
  -- Find best matching keyword (highest priority wins)
  SELECT tk.taxonomy_id INTO result_taxonomy_id
  FROM catalog.taxonomy_keywords tk
  JOIN catalog.fmcg_taxonomy ft ON ft.id = tk.taxonomy_id AND ft.is_active = true
  WHERE LOWER(product_name) LIKE '%' || LOWER(tk.keyword) || '%'
  ORDER BY tk.priority DESC, LENGTH(tk.keyword) DESC
  LIMIT 1;

  -- Return found taxonomy or fallback to Baaki
  RETURN COALESCE(result_taxonomy_id, baaki_id);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- BACKFILL: Assign taxonomy to existing store products
-- Safe to run multiple times (only updates NULL taxonomy_id)
-- =============================================================================

-- Update store products that don't have taxonomy assigned
UPDATE catalog.store_products sp
SET taxonomy_id = catalog.assign_taxonomy_by_name(
  COALESCE(sp.display_name, p.name, '')
)
FROM catalog.products p
WHERE sp.product_id = p.id
  AND sp.taxonomy_id IS NULL
  AND sp.is_active = true;

COMMIT;
