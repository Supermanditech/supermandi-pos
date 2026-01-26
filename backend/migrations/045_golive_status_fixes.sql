-- Migration: 045_golive_status_fixes
-- P3-003: Update store KYC status for demo/production stores
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- P3-003: Fix store KYC status
-- Demo stores should be 'approved' for testing, production stores stay 'pending'
-- =============================================================================

-- Update demo stores to have 'approved' KYC status
UPDATE platform.stores
SET kyc_status = 'approved',
    updated_at = NOW()
WHERE store_type = 'demo'
  AND (kyc_status IS NULL OR kyc_status = 'pending');

-- Log how many stores were updated
DO $$
DECLARE
  demo_updated INTEGER;
BEGIN
  SELECT COUNT(*) INTO demo_updated
  FROM platform.stores
  WHERE store_type = 'demo' AND kyc_status = 'approved';

  RAISE NOTICE 'P3-003: % demo stores have approved KYC status', demo_updated;
END $$;

-- =============================================================================
-- P3-002: Fix supplier verification for demo data (optional cleanup)
-- Set verified for demo/seeded suppliers with active status
-- =============================================================================

UPDATE supplier.suppliers
SET verification_status = 'verified',
    verified_at = NOW(),
    updated_at = NOW()
WHERE status = 'active'
  AND verification_status = 'pending'
  AND (
    -- Demo suppliers (identifiable by GSTIN pattern or business name)
    gstin LIKE '00%' OR
    business_name ILIKE '%demo%' OR
    business_name ILIKE '%test%'
  );

-- Log how many suppliers were updated
DO $$
DECLARE
  suppliers_updated INTEGER;
BEGIN
  SELECT COUNT(*) INTO suppliers_updated
  FROM supplier.suppliers
  WHERE status = 'active' AND verification_status = 'verified';

  RAISE NOTICE 'P3-002: % suppliers have verified status', suppliers_updated;
END $$;

COMMIT;
