-- Migration: 093_reg_auth_database_foundation
-- REG-AUTH-101: Database Foundation for Registration-First Authentication
--
-- Creates applications table and adds missing columns to stores/suppliers
-- Safe to run multiple times (idempotent)
--
-- CRITICAL: This migration implements the Registration-First Authentication spec (REG-AUTH-000)
-- OTP verify is ONLY permitted with existing registration/application_id

BEGIN;

-- =============================================================================
-- TABLE: auth.applications
-- Registration applications for retailers and suppliers
-- Status workflow: DRAFT → KYC_SUBMITTED → PAYMENTS_SUBMITTED → ACTIVE
--                  KYC_SUBMITTED → NEEDS_FIX → (user fixes) → KYC_SUBMITTED
--                  NEEDS_FIX → EXPIRED (30 days timeout)
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity type: retailer or supplier
  entity_type VARCHAR(20) NOT NULL,

  -- Phone (verified via Firebase OTP) - REQUIRED
  phone VARCHAR(20) NOT NULL,
  firebase_uid VARCHAR(128),

  -- Email (optional for retailers, required for suppliers)
  email VARCHAR(255),

  -- Business/Store details
  business_name VARCHAR(255) NOT NULL,  -- store_name for retailers
  owner_name VARCHAR(255) NOT NULL,
  gstin VARCHAR(15) NOT NULL,

  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),

  -- KYC Documents (JSONB for flexibility)
  -- Expected keys: pan_url, gstin_url, address_proof_url, bank_statement_url, etc.
  document_urls JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Payment details (for retailers: UPI, for suppliers: bank account)
  upi_vpa VARCHAR(100),
  bank_account_number VARCHAR(50),
  bank_ifsc VARCHAR(20),
  bank_name VARCHAR(100),

  -- Application status (state machine)
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',

  -- Admin review tracking
  admin_notes TEXT,
  rejection_reason TEXT,
  reviewed_by_user_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  -- Linked entity after approval
  approved_store_id UUID,  -- FK to platform.stores (set after approval for retailers)
  approved_supplier_id UUID,  -- FK to supplier.suppliers (set after approval for suppliers)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,  -- When KYC_SUBMITTED
  needs_fix_at TIMESTAMPTZ,  -- When moved to NEEDS_FIX
  expires_at TIMESTAMPTZ,    -- 30 days after NEEDS_FIX

  -- Constraints
  CONSTRAINT chk_applications_entity_type CHECK (
    entity_type IN ('retailer', 'supplier')
  ),
  CONSTRAINT chk_applications_status CHECK (
    status IN ('DRAFT', 'KYC_SUBMITTED', 'PAYMENTS_SUBMITTED', 'ACTIVE', 'NEEDS_FIX', 'EXPIRED')
  ),
  CONSTRAINT chk_applications_gstin_format CHECK (
    gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$'
  ),
  CONSTRAINT chk_applications_supplier_email CHECK (
    entity_type != 'supplier' OR email IS NOT NULL
  )
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_auth_applications_updated_at ON auth.applications;
CREATE TRIGGER update_auth_applications_updated_at
  BEFORE UPDATE ON auth.applications
  FOR EACH ROW
  EXECUTE FUNCTION platform.update_updated_at_column();

-- =============================================================================
-- INDEXES: auth.applications
-- =============================================================================

-- GSTIN uniqueness - critical for duplicate prevention
-- Only one active application per GSTIN (not EXPIRED)
CREATE UNIQUE INDEX IF NOT EXISTS ux_applications_gstin_active
  ON auth.applications (gstin)
  WHERE status != 'EXPIRED';

-- Phone uniqueness per entity type (not EXPIRED)
CREATE UNIQUE INDEX IF NOT EXISTS ux_applications_phone_entity_active
  ON auth.applications (phone, entity_type)
  WHERE status != 'EXPIRED';

-- Firebase UID uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS ux_applications_firebase_uid
  ON auth.applications (firebase_uid)
  WHERE firebase_uid IS NOT NULL;

-- Status lookup for admin dashboard
CREATE INDEX IF NOT EXISTS idx_applications_status
  ON auth.applications (status);

-- Entity type + status for filtered queries
CREATE INDEX IF NOT EXISTS idx_applications_entity_status
  ON auth.applications (entity_type, status);

-- Pending applications by date (for admin queue)
CREATE INDEX IF NOT EXISTS idx_applications_pending_queue
  ON auth.applications (created_at)
  WHERE status IN ('KYC_SUBMITTED', 'PAYMENTS_SUBMITTED');

-- Expiring applications (NEEDS_FIX older than 30 days)
CREATE INDEX IF NOT EXISTS idx_applications_expiring
  ON auth.applications (needs_fix_at)
  WHERE status = 'NEEDS_FIX';

-- =============================================================================
-- ALTER: platform.stores - Add missing registration fields
-- =============================================================================

-- GSTIN column
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS gstin VARCHAR(15);

-- Owner name
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);

-- KYC Document URLs (JSONB)
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS document_urls JSONB NOT NULL DEFAULT '{}'::jsonb;

-- UPI VPA for payments
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS upi_vpa VARCHAR(100);

-- Application reference (link back to original application)
ALTER TABLE platform.stores
  ADD COLUMN IF NOT EXISTS application_id UUID;

-- GSTIN uniqueness for approved stores
CREATE UNIQUE INDEX IF NOT EXISTS ux_stores_gstin
  ON platform.stores (gstin)
  WHERE gstin IS NOT NULL;

-- GSTIN format check (conditional - only if not null)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_stores_gstin_format'
  ) THEN
    ALTER TABLE platform.stores
      ADD CONSTRAINT chk_stores_gstin_format CHECK (
        gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$'
      );
  END IF;
END $$;

-- =============================================================================
-- ALTER: supplier.suppliers - Add missing KYC fields
-- =============================================================================

-- KYC Document URLs (JSONB)
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS document_urls JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Bank account details
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50);

ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20);

ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);

-- Application reference
ALTER TABLE supplier.suppliers
  ADD COLUMN IF NOT EXISTS application_id UUID;

-- =============================================================================
-- UPDATE: public.stores VIEW - Include new columns
-- =============================================================================
CREATE OR REPLACE VIEW public.stores AS
  SELECT
    id::TEXT as id,
    name,
    code,
    phone,
    email,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    timezone,
    currency,
    status,
    gstin,
    owner_name,
    document_urls,
    upi_vpa,
    application_id,
    created_at,
    updated_at
  FROM platform.stores;

-- =============================================================================
-- TABLE: auth.application_status_log
-- Audit log for application status changes
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.application_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  application_id UUID NOT NULL REFERENCES auth.applications(id) ON DELETE CASCADE,

  -- Status transition
  old_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,

  -- Who made the change
  changed_by_user_id UUID REFERENCES auth.users(id),
  change_reason TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for application history lookup
CREATE INDEX IF NOT EXISTS idx_application_status_log_app
  ON auth.application_status_log (application_id, created_at DESC);

-- =============================================================================
-- FUNCTION: Update application status with logging
-- =============================================================================
CREATE OR REPLACE FUNCTION auth.update_application_status(
  p_application_id UUID,
  p_new_status VARCHAR(30),
  p_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_old_status VARCHAR(30);
BEGIN
  -- Get current status
  SELECT status INTO v_old_status
  FROM auth.applications
  WHERE id = p_application_id;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Application not found: %', p_application_id;
  END IF;

  -- Update status
  UPDATE auth.applications
  SET
    status = p_new_status,
    updated_at = NOW(),
    needs_fix_at = CASE WHEN p_new_status = 'NEEDS_FIX' THEN NOW() ELSE needs_fix_at END,
    expires_at = CASE WHEN p_new_status = 'NEEDS_FIX' THEN NOW() + INTERVAL '30 days' ELSE expires_at END,
    submitted_at = CASE WHEN p_new_status = 'KYC_SUBMITTED' AND submitted_at IS NULL THEN NOW() ELSE submitted_at END,
    reviewed_at = CASE WHEN p_new_status IN ('ACTIVE', 'NEEDS_FIX') THEN NOW() ELSE reviewed_at END,
    reviewed_by_user_id = CASE WHEN p_new_status IN ('ACTIVE', 'NEEDS_FIX') THEN COALESCE(p_user_id, reviewed_by_user_id) ELSE reviewed_by_user_id END
  WHERE id = p_application_id;

  -- Log status change
  INSERT INTO auth.application_status_log (
    application_id,
    old_status,
    new_status,
    changed_by_user_id,
    change_reason
  ) VALUES (
    p_application_id,
    v_old_status,
    p_new_status,
    p_user_id,
    p_reason
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Check GSTIN uniqueness across applications, stores, and suppliers
-- Returns the existing entity if GSTIN already exists
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
  -- Check active applications first
  RETURN QUERY
  SELECT
    'application'::VARCHAR(30) as exists_in,
    a.id as entity_id,
    a.status as entity_status,
    (a.status NOT IN ('ACTIVE', 'EXPIRED'))::BOOLEAN as can_resume
  FROM auth.applications a
  WHERE a.gstin = p_gstin
    AND a.entity_type = p_entity_type
    AND a.status != 'EXPIRED'
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Check approved stores (for retailers)
  IF p_entity_type = 'retailer' THEN
    RETURN QUERY
    SELECT
      'store'::VARCHAR(30) as exists_in,
      s.id as entity_id,
      s.status as entity_status,
      false as can_resume  -- Already approved, cannot resume registration
    FROM platform.stores s
    WHERE s.gstin = p_gstin
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
      false as can_resume  -- Already approved, cannot resume registration
    FROM supplier.suppliers sp
    WHERE sp.gstin = p_gstin
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- GSTIN not found anywhere
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SCHEDULED JOB: Expire applications in NEEDS_FIX after 30 days
-- This should be called by a cron job or pg_cron
-- =============================================================================
CREATE OR REPLACE FUNCTION auth.expire_stale_applications()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE auth.applications
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE status = 'NEEDS_FIX'
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  -- Log expirations
  INSERT INTO auth.application_status_log (
    application_id,
    old_status,
    new_status,
    change_reason
  )
  SELECT
    a.id,
    'NEEDS_FIX',
    'EXPIRED',
    'Auto-expired after 30 days'
  FROM auth.applications a
  WHERE a.status = 'EXPIRED'
    AND a.updated_at > NOW() - INTERVAL '1 minute';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
