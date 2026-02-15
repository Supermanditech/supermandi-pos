-- Migration: 128_t001_relax_gstin_draft_uniqueness
-- T-001: Relax GSTIN uniqueness for DRAFT/OTP_VERIFIED applications
--
-- Problem: GSTIN saved to auth.applications immediately during registration.
-- If user abandons registration, that GSTIN is permanently locked.
-- Fix: Only enforce GSTIN uniqueness for submitted/approved applications.
-- DRAFT and OTP_VERIFIED applications can share GSTINs.
--
-- Also relaxes phone uniqueness similarly, and adds DRAFT auto-expiry.

BEGIN;

-- =============================================================================
-- 1. Relax GSTIN uniqueness: only enforce for submitted/approved applications
-- =============================================================================
DROP INDEX IF EXISTS auth.ux_applications_gstin_active;
CREATE UNIQUE INDEX ux_applications_gstin_active
  ON auth.applications (gstin)
  WHERE status IN ('KYC_SUBMITTED', 'PAYMENTS_SUBMITTED', 'ACTIVE');

-- =============================================================================
-- 2. Relax phone uniqueness: same relaxation
-- =============================================================================
DROP INDEX IF EXISTS auth.ux_applications_phone_entity_active;
CREATE UNIQUE INDEX ux_applications_phone_entity_active
  ON auth.applications (phone, entity_type)
  WHERE status IN ('KYC_SUBMITTED', 'PAYMENTS_SUBMITTED', 'ACTIVE');

-- =============================================================================
-- 3. Update check_gstin_uniqueness: ignore DRAFT/OTP_VERIFIED applications
-- =============================================================================
CREATE OR REPLACE FUNCTION auth.check_gstin_uniqueness(
  p_gstin VARCHAR(15),
  p_entity_type VARCHAR(20)
)
RETURNS TABLE (
  exists_in VARCHAR(30),
  entity_id UUID,
  entity_status VARCHAR(30),
  can_resume BOOLEAN
) AS $$
BEGIN
  -- Check submitted/approved applications (not DRAFT/OTP_VERIFIED/EXPIRED)
  RETURN QUERY
  SELECT
    'application'::VARCHAR(30) as exists_in,
    a.id as entity_id,
    a.status as entity_status,
    (a.status IN ('NEEDS_FIX'))::BOOLEAN as can_resume
  FROM auth.applications a
  WHERE a.gstin = p_gstin
    AND a.entity_type = p_entity_type
    AND a.status IN ('KYC_SUBMITTED', 'PAYMENTS_SUBMITTED', 'ACTIVE', 'NEEDS_FIX')
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Check approved stores (for retailers)
  IF p_entity_type = 'retailer' THEN
    RETURN QUERY
    SELECT
      'store'::VARCHAR(30) as exists_in,
      s.id as entity_id,
      s.status as entity_status,
      false as can_resume
    FROM platform.stores s
    WHERE s.gstin = p_gstin OR s.gst_number = p_gstin
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Check approved suppliers
  IF p_entity_type = 'supplier' THEN
    RETURN QUERY
    SELECT
      'supplier'::VARCHAR(30) as exists_in,
      sp.id as entity_id,
      sp.verification_status as entity_status,
      false as can_resume
    FROM supplier.suppliers sp
    WHERE sp.gstin = p_gstin
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- GSTIN not found anywhere — available
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. Auto-expire stale DRAFT applications (older than 48 hours)
-- Frees up phone numbers and GSTINs from abandoned registrations
-- =============================================================================
CREATE OR REPLACE FUNCTION auth.expire_stale_drafts()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE auth.applications
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE status IN ('DRAFT', 'OTP_VERIFIED')
      AND created_at < NOW() - INTERVAL '48 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  -- Log expirations
  INSERT INTO auth.application_status_log (
    application_id, old_status, new_status, change_reason
  )
  SELECT
    a.id, 'DRAFT', 'EXPIRED', 'Auto-expired: abandoned draft (48h)'
  FROM auth.applications a
  WHERE a.status = 'EXPIRED'
    AND a.updated_at > NOW() - INTERVAL '1 minute';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5. Run stale draft cleanup now (one-time for existing stuck applications)
-- =============================================================================
SELECT auth.expire_stale_drafts();

COMMIT;
