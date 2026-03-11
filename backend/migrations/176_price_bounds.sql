-- SA-P0-003: Global price bounds for product pricing validation
-- Configurable min/max price (in paise) enforced across POS and Retailer Admin.

CREATE TABLE IF NOT EXISTS platform.price_bounds (
  id SERIAL PRIMARY KEY,
  min_price_paise INTEGER NOT NULL DEFAULT 100,        -- ₹1 minimum
  max_price_paise INTEGER NOT NULL DEFAULT 10000000,   -- ₹1,00,000 maximum
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- Seed default row
INSERT INTO platform.price_bounds (min_price_paise, max_price_paise)
SELECT 100, 10000000
WHERE NOT EXISTS (SELECT 1 FROM platform.price_bounds);

COMMENT ON TABLE platform.price_bounds IS 'SA-P0-003: Global price bounds for product pricing validation';

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_price_bounds_updated_at ON platform.price_bounds;
CREATE TRIGGER update_price_bounds_updated_at
  BEFORE UPDATE ON platform.price_bounds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
