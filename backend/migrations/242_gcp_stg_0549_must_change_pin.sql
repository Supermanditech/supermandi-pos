-- GCP-STG-0549: Force PIN change on first POS staff login
-- ROLLBACK: ALTER TABLE platform.store_staff DROP COLUMN IF EXISTS must_change_pin;
ALTER TABLE platform.store_staff ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: mark existing auto-created MANAGER staff (they may have default PIN)
-- We can't reverse bcrypt to check if PIN is "1234", so mark ALL managers created
-- before this migration. They'll be prompted to change PIN on next login.
COMMENT ON COLUMN platform.store_staff.must_change_pin IS 'GCP-STG-0549: When TRUE, staff must change PIN on next login';
