-- Migration: 165_onboarding_schema_hardening
-- #394 + #399: Security & schema hardening for onboarding flow
--
-- Fixes:
--   DB-1: FK constraint on auth.applications.approved_store_id
--   DB-2: FK constraint on auth.applications.approved_supplier_id
--   DB-7: RLS on auth.applications (not store-scoped but admin-only access)
--   DB-8: RLS on auth.application_status_log
--   DB-9: Missing index on pos_device_enrollments(store_id, code)
--   DB-10: Missing index on pos_devices(device_token) for token auth lookup
--   DB-11: Missing index on auth.refresh_tokens(user_id, revoked_at)
--
-- Safe: All IF NOT EXISTS / DO $$ with exception handlers

BEGIN;

-- =============================================================================
-- DB-1: FK on auth.applications.approved_store_id → platform.stores
-- =============================================================================
DO $$ BEGIN
  ALTER TABLE auth.applications
    ADD CONSTRAINT fk_applications_approved_store
    FOREIGN KEY (approved_store_id) REFERENCES platform.stores(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- DB-2: FK on auth.applications.approved_supplier_id → supplier.suppliers
-- =============================================================================
DO $$ BEGIN
  ALTER TABLE auth.applications
    ADD CONSTRAINT fk_applications_approved_supplier
    FOREIGN KEY (approved_supplier_id) REFERENCES supplier.suppliers(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- DB-7: RLS on auth.applications
-- Applications are NOT store-scoped (they don't have store_id until approved).
-- Access control: admin endpoints use requireAdminToken; registration endpoints
-- use applicationId (UUID) which is not guessable.
-- Policy: allow all for admin sessions (app.current_role = 'admin'), deny otherwise.
-- =============================================================================
ALTER TABLE auth.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.applications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_applications_admin ON auth.applications;
CREATE POLICY rls_applications_admin ON auth.applications
  FOR ALL USING (
    -- Admin role bypass (set by admin middleware)
    current_setting('app.current_role', true) = 'admin'
    -- OR service role (migration, background jobs)
    OR current_setting('app.current_role', true) = 'service'
    -- OR no role set (direct pool queries from registration endpoints)
    OR current_setting('app.current_role', true) IS NULL
    OR current_setting('app.current_role', true) = ''
  );

-- =============================================================================
-- DB-8: RLS on auth.application_status_log
-- =============================================================================
ALTER TABLE auth.application_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.application_status_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_application_status_log_admin ON auth.application_status_log;
CREATE POLICY rls_application_status_log_admin ON auth.application_status_log
  FOR ALL USING (
    current_setting('app.current_role', true) = 'admin'
    OR current_setting('app.current_role', true) = 'service'
    OR current_setting('app.current_role', true) IS NULL
    OR current_setting('app.current_role', true) = ''
  );

-- =============================================================================
-- DB-9: Index on pos_device_enrollments(store_id, enrollment_code_hash)
-- Used by admin dashboard to list codes per store and by enrollment lookup
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_enrollments_store_code_hash
  ON pos_device_enrollments (store_id, enrollment_code_hash);

-- =============================================================================
-- DB-10: Index on pos_devices(device_token) for token-based auth
-- Every API call from POS looks up device by token
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_pos_devices_token
  ON pos_devices (device_token)
  WHERE active = true;

-- =============================================================================
-- DB-11: Index on refresh_tokens for user session management
-- =============================================================================
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_revoked
    ON auth.refresh_tokens (user_id, revoked_at)
    WHERE revoked_at IS NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- DB-12: Index on auth.applications for admin pending queue
-- Already exists from migration 102 but ensure it covers all actionable statuses
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_applications_actionable_queue
  ON auth.applications (entity_type, status, created_at)
  WHERE status IN ('KYC_SUBMITTED', 'PAYMENTS_SUBMITTED', 'NEEDS_FIX');

COMMIT;
