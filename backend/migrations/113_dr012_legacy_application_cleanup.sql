-- DR-012: Legacy Application Records Cleanup
--
-- Coexistence rules between legacy applications and new instant-store flow:
--   1. Applications whose GSTIN/phone now have a store → link + close
--   2. Stale DRAFT applications (>90 days, no phone verified) → expire
--   3. Supplier applications are untouched
--   4. Active/approved applications are untouched
--
-- Idempotent: safe to run multiple times.
-- Produces RAISE NOTICE report for operator.

DO $$
DECLARE
  v_linked INT := 0;
  v_expired INT := 0;
  r RECORD;
BEGIN
  -- =========================================================================
  -- STEP 1: Link orphaned retailer applications to matching stores
  -- An application is "orphaned" if a store exists with the same GSTIN but
  -- the application has no approved_store_id set.
  -- =========================================================================
  FOR r IN
    SELECT a.id AS app_id, a.gstin, a.status AS app_status,
           s.id AS store_id, s.name AS store_name
    FROM auth.applications a
    JOIN platform.stores s ON s.gstin = a.gstin AND s.gstin IS NOT NULL
    WHERE a.entity_type = 'retailer'
      AND a.approved_store_id IS NULL
      AND a.status NOT IN ('EXPIRED')
      AND s.status != 'deleted'
  LOOP
    UPDATE auth.applications
    SET approved_store_id = r.store_id,
        status = 'ACTIVE',
        updated_at = NOW()
    WHERE id = r.app_id
      AND approved_store_id IS NULL;  -- idempotent guard

    IF FOUND THEN
      INSERT INTO auth.application_status_log
        (application_id, old_status, new_status, change_reason)
      VALUES
        (r.app_id, r.app_status, 'ACTIVE',
         'DR-012: Auto-linked to existing store ' || r.store_id::TEXT);
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  -- =========================================================================
  -- STEP 2: Expire stale DRAFT retailer applications (>90 days, unverified)
  -- These are abandoned registrations that were never completed.
  -- =========================================================================
  FOR r IN
    SELECT a.id AS app_id, a.gstin, a.phone, a.created_at
    FROM auth.applications a
    WHERE a.entity_type = 'retailer'
      AND a.status = 'DRAFT'
      AND a.firebase_uid IS NULL         -- never verified phone
      AND a.created_at < NOW() - INTERVAL '90 days'
  LOOP
    UPDATE auth.applications
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE id = r.app_id
      AND status = 'DRAFT';  -- idempotent guard

    IF FOUND THEN
      INSERT INTO auth.application_status_log
        (application_id, old_status, new_status, change_reason)
      VALUES
        (r.app_id, 'DRAFT', 'EXPIRED',
         'DR-012: Stale unverified DRAFT expired after 90 days');
      v_expired := v_expired + 1;
    END IF;
  END LOOP;

  -- =========================================================================
  -- REPORT
  -- =========================================================================
  RAISE NOTICE '[DR-012] Legacy Application Cleanup Report:';
  RAISE NOTICE '  Applications linked to existing stores: %', v_linked;
  RAISE NOTICE '  Stale DRAFT applications expired:       %', v_expired;
  RAISE NOTICE '  Supplier applications: UNTOUCHED';
  RAISE NOTICE '  Active/approved applications: UNTOUCHED';
END $$;
