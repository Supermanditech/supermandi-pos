-- GCP-STG-0551: Prevent duplicate supplier applications on same phone
-- Partial unique index: only one in-progress application per phone number
-- DRAFTs/OTP_VERIFIED are handled by app-level upsert logic
-- Terminal statuses (REJECTED, WITHDRAWN, EXPIRED) allow re-application
-- ROLLBACK: DROP INDEX IF EXISTS auth.idx_supplier_app_phone_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_app_phone_active
ON auth.applications (phone)
WHERE entity_type = 'supplier'
  AND status NOT IN ('DRAFT', 'OTP_VERIFIED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');
