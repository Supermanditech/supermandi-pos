-- Migration: 010_translation_quotas
-- ROLLBACK: DROP FUNCTION IF EXISTS catalog.get_translation_quota_status(UUID); DROP FUNCTION IF EXISTS catalog.check_translation_quota(UUID, INTEGER, INTEGER); DROP TABLE IF EXISTS catalog.translation_quotas CASCADE;
-- TR-PEND-004: Cost + Quota Guards for Bulk Translation
-- Tracks per-store daily translation usage to prevent runaway costs
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- TABLE: catalog.translation_quotas
-- Tracks daily machine translation usage per store
-- =============================================================================
CREATE TABLE IF NOT EXISTS catalog.translation_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Store identification
  store_id UUID NOT NULL,

  -- Date of quota tracking (UTC date)
  quota_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Usage counters
  products_translated INTEGER NOT NULL DEFAULT 0,
  api_calls_made INTEGER NOT NULL DEFAULT 0,
  characters_translated INTEGER NOT NULL DEFAULT 0,

  -- Quota limits (per store, per day)
  max_products INTEGER NOT NULL DEFAULT 500,
  max_api_calls INTEGER NOT NULL DEFAULT 1000,
  max_characters INTEGER NOT NULL DEFAULT 500000,

  -- Status flags
  quota_exceeded BOOLEAN NOT NULL DEFAULT false,
  last_exceeded_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT translation_quotas_unique UNIQUE (store_id, quota_date)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_catalog_translation_quotas_updated_at ON catalog.translation_quotas;
CREATE TRIGGER update_catalog_translation_quotas_updated_at
  BEFORE UPDATE ON catalog.translation_quotas
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- Store + date lookup (primary access pattern)
CREATE INDEX IF NOT EXISTS translation_quotas_store_date_idx
  ON catalog.translation_quotas (store_id, quota_date);

-- Find exceeded quotas for alerting
CREATE INDEX IF NOT EXISTS translation_quotas_exceeded_idx
  ON catalog.translation_quotas (quota_exceeded, quota_date)
  WHERE quota_exceeded = true;

-- =============================================================================
-- FUNCTION: Check and increment translation quota
-- Returns true if within quota, false if exceeded
-- =============================================================================
CREATE OR REPLACE FUNCTION catalog.check_translation_quota(
  p_store_id UUID,
  p_product_count INTEGER DEFAULT 1,
  p_char_count INTEGER DEFAULT 0
) RETURNS BOOLEAN AS $$
DECLARE
  v_quota RECORD;
  v_within_quota BOOLEAN;
BEGIN
  -- Upsert quota record for today
  INSERT INTO catalog.translation_quotas (store_id, quota_date)
  VALUES (p_store_id, CURRENT_DATE)
  ON CONFLICT (store_id, quota_date) DO NOTHING;

  -- Get current quota with lock
  SELECT * INTO v_quota
  FROM catalog.translation_quotas
  WHERE store_id = p_store_id AND quota_date = CURRENT_DATE
  FOR UPDATE;

  -- Check if within limits
  v_within_quota := (
    v_quota.products_translated + p_product_count <= v_quota.max_products
    AND v_quota.characters_translated + p_char_count <= v_quota.max_characters
  );

  IF v_within_quota THEN
    -- Increment counters
    UPDATE catalog.translation_quotas
    SET
      products_translated = products_translated + p_product_count,
      characters_translated = characters_translated + p_char_count,
      api_calls_made = api_calls_made + 1,
      updated_at = NOW()
    WHERE store_id = p_store_id AND quota_date = CURRENT_DATE;
  ELSE
    -- Mark as exceeded
    UPDATE catalog.translation_quotas
    SET
      quota_exceeded = true,
      last_exceeded_at = NOW(),
      updated_at = NOW()
    WHERE store_id = p_store_id AND quota_date = CURRENT_DATE
    AND NOT quota_exceeded;
  END IF;

  RETURN v_within_quota;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Get quota status for a store
-- =============================================================================
CREATE OR REPLACE FUNCTION catalog.get_translation_quota_status(p_store_id UUID)
RETURNS TABLE (
  products_used INTEGER,
  products_remaining INTEGER,
  characters_used INTEGER,
  characters_remaining INTEGER,
  is_exceeded BOOLEAN,
  reset_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(q.products_translated, 0)::INTEGER,
    GREATEST(0, COALESCE(q.max_products, 500) - COALESCE(q.products_translated, 0))::INTEGER,
    COALESCE(q.characters_translated, 0)::INTEGER,
    GREATEST(0, COALESCE(q.max_characters, 500000) - COALESCE(q.characters_translated, 0))::INTEGER,
    COALESCE(q.quota_exceeded, false),
    (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
  FROM catalog.translation_quotas q
  WHERE q.store_id = p_store_id AND q.quota_date = CURRENT_DATE
  UNION ALL
  SELECT 0, 500, 0, 500000, false, (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
  WHERE NOT EXISTS (
    SELECT 1 FROM catalog.translation_quotas
    WHERE store_id = p_store_id AND quota_date = CURRENT_DATE
  )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMIT;
