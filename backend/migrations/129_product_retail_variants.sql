-- Migration: 129_product_retail_variants
-- T-056: Loose product retail variant schema
-- Enables LOOSE_BULK products to have retail selling units
-- Example: Buy 1000kg flour → sell as 1kg, 5kg, 500gm, 250gm variants
-- Each variant gets its own barcode (prefix 3), price, and label
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: catalog.product_retail_variants
-- Retail selling units for LOOSE_BULK products
-- A store_product (LOOSE_BULK) can have N variants, each with distinct
-- quantity, unit, price, and scannable barcode
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.product_retail_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent store product (must be LOOSE_BULK)
  store_product_id UUID NOT NULL REFERENCES catalog.store_products(id) ON DELETE CASCADE,

  -- Variant display info
  variant_label VARCHAR(100) NOT NULL,  -- e.g., "1 kg", "500 gm", "12 pcs"

  -- Quantity in base unit
  variant_qty NUMERIC(12,4) NOT NULL,  -- e.g., 1.0000 (kg), 0.5000 (kg), 500.0000 (gm)
  base_unit VARCHAR(20) NOT NULL,       -- KG, GM, LTR, ML, PCS, DOZEN

  -- Pricing in minor units (paise)
  sell_price_minor INTEGER NOT NULL,

  -- Scannable barcode (system-generated, prefix 3)
  barcode VARCHAR(100) NOT NULL,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Sort order within parent
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_variant_base_unit
    CHECK (base_unit IN ('KG', 'GM', 'LTR', 'ML', 'PCS', 'DOZEN')),

  CONSTRAINT chk_variant_qty_positive
    CHECK (variant_qty > 0),

  CONSTRAINT chk_variant_price_non_negative
    CHECK (sell_price_minor >= 0),

  CONSTRAINT chk_variant_sort_order
    CHECK (sort_order >= 0)
);

-- Unique barcode across all variants
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_retail_variants_barcode
  ON catalog.product_retail_variants (barcode);

-- Fast lookup: all active variants for a store product
CREATE INDEX IF NOT EXISTS idx_retail_variants_store_product
  ON catalog.product_retail_variants (store_product_id, is_active)
  WHERE is_active = true;

-- Barcode scan lookup (for POS scan resolve)
CREATE INDEX IF NOT EXISTS idx_retail_variants_barcode_lookup
  ON catalog.product_retail_variants (barcode)
  WHERE is_active = true;

-- Sort order within parent
CREATE INDEX IF NOT EXISTS idx_retail_variants_sort
  ON catalog.product_retail_variants (store_product_id, sort_order)
  WHERE is_active = true;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_product_retail_variants_updated_at ON catalog.product_retail_variants;
CREATE TRIGGER update_product_retail_variants_updated_at
  BEFORE UPDATE ON catalog.product_retail_variants
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- =============================================================================
-- CONSTRAINT: Only LOOSE_BULK store_products can have variants
-- Enforced via trigger (cross-table constraint can't use CHECK)
-- =============================================================================
CREATE OR REPLACE FUNCTION catalog.enforce_variant_product_mode()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM catalog.store_products
    WHERE id = NEW.store_product_id
      AND product_mode = 'LOOSE_BULK'
  ) THEN
    RAISE EXCEPTION 'Variants can only be created for LOOSE_BULK products (store_product_id: %)', NEW.store_product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_variant_product_mode ON catalog.product_retail_variants;
CREATE TRIGGER trg_enforce_variant_product_mode
  BEFORE INSERT OR UPDATE ON catalog.product_retail_variants
  FOR EACH ROW
  EXECUTE FUNCTION catalog.enforce_variant_product_mode();

-- =============================================================================
-- FUNCTION: Generate variant barcode with prefix 3
-- Format: 3{storePrefix2}{timestampMs8}{random2} = 13 digits
-- storePrefix: last 2 digits of store_id hash
-- =============================================================================
CREATE OR REPLACE FUNCTION catalog.generate_variant_barcode(p_store_id UUID)
RETURNS VARCHAR(100) AS $$
DECLARE
  v_prefix VARCHAR(2);
  v_ts VARCHAR(8);
  v_rand VARCHAR(2);
  v_barcode VARCHAR(100);
  v_attempts INTEGER := 0;
BEGIN
  -- Extract 2-digit store prefix from store_id
  v_prefix := LPAD(
    (abs(hashtext(p_store_id::text)) % 100)::text,
    2, '0'
  );

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 100 THEN
      RAISE EXCEPTION 'Failed to generate unique variant barcode after 100 attempts';
    END IF;

    -- 8-digit timestamp component (epoch ms mod 10^8)
    v_ts := LPAD(
      ((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint % 100000000::bigint)::text,
      8, '0'
    );

    -- 2-digit random
    v_rand := LPAD((floor(random() * 100))::integer::text, 2, '0');

    v_barcode := '3' || v_prefix || v_ts || v_rand;

    -- Check uniqueness across variants AND store_product_barcodes
    IF NOT EXISTS (
      SELECT 1 FROM catalog.product_retail_variants WHERE barcode = v_barcode
    ) AND NOT EXISTS (
      SELECT 1 FROM catalog.store_product_barcodes WHERE barcode = v_barcode
    ) AND NOT EXISTS (
      SELECT 1 FROM catalog.product_barcodes WHERE barcode = v_barcode
    ) THEN
      RETURN v_barcode;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENT: Document the variant system
-- =============================================================================
COMMENT ON TABLE catalog.product_retail_variants IS
  'Retail selling units for LOOSE_BULK products. Each variant has a unique barcode (prefix 3), sell price, and quantity in base unit. Example: 1000kg flour → variants: 1kg @₹50, 5kg @₹240, 500gm @₹27';

COMMENT ON COLUMN catalog.product_retail_variants.variant_label IS
  'Human-readable label shown on POS. Examples: "1 kg", "500 gm", "250 ml", "12 pcs"';

COMMENT ON COLUMN catalog.product_retail_variants.variant_qty IS
  'Quantity in base_unit. For 500gm: variant_qty=500, base_unit=GM. For 1kg: variant_qty=1, base_unit=KG';

COMMENT ON COLUMN catalog.product_retail_variants.base_unit IS
  'Unit for variant_qty. Must match parent product sold_by type: WEIGHT→KG/GM, COUNT→PCS/DOZEN, VOLUME→LTR/ML';

COMMENT ON COLUMN catalog.product_retail_variants.sell_price_minor IS
  'Sell price in paise (minor units). 5000 = ₹50.00';

COMMENT ON COLUMN catalog.product_retail_variants.barcode IS
  'System-generated barcode with prefix 3 (vs prefix 2 for LOOSE_BULK parent). Used for POS scanning.';

COMMIT;
