-- STAGING-FIX-012: Allow same firebase_uid across different entity types
-- The same phone number can register as both supplier and retailer.
-- The unique constraint should be per entity_type, not global.

-- Drop the global unique constraint
DROP INDEX IF EXISTS auth.ux_applications_firebase_uid;

-- Create a new partial unique constraint scoped to entity_type
CREATE UNIQUE INDEX ux_applications_firebase_uid_entity
  ON auth.applications (firebase_uid, entity_type)
  WHERE firebase_uid IS NOT NULL AND deleted_at IS NULL;
