-- STAGING-FIX-004: Add business_type column for retailer registration parity
-- Values: kirana, supermarket, hypermarket, other
-- Used by retailer registration to capture store type during application

ALTER TABLE auth.applications ADD COLUMN IF NOT EXISTS business_type VARCHAR(50);

COMMENT ON COLUMN auth.applications.business_type IS 'Business type: kirana, supermarket, hypermarket, other';
