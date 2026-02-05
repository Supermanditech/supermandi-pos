-- Migration: 094_reg_auth_document_storage
-- REG-AUTH-102: Document Storage Backend for Registration Applications
--
-- Extends platform.documents to support 'application' entity type
-- Allows document upload during registration (before store/supplier approval)
--
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- Step 1: Modify entity_type constraint to allow 'application'
-- =============================================================================

-- Remove old constraint if exists and recreate with 'application'
DO $$
BEGIN
  -- First drop any existing constraint
  ALTER TABLE platform.documents
    DROP CONSTRAINT IF EXISTS chk_documents_entity_type;

  -- Add new constraint that includes 'application'
  ALTER TABLE platform.documents
    ADD CONSTRAINT chk_documents_entity_type
    CHECK (entity_type IN ('store', 'supplier', 'application'));
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'platform.documents table does not exist, skipping';
END $$;

-- =============================================================================
-- Step 2: Create application-specific document types enum/reference
-- =============================================================================

-- Document types required for registration
-- Retailers: pan, gstin_certificate, address_proof, owner_photo, store_photo
-- Suppliers: pan_card, gstin_certificate, address_proof, cancelled_cheque

COMMENT ON COLUMN platform.documents.document_type IS
  'Document types: ' ||
  'RETAILERS: pan, gstin_certificate, address_proof, owner_photo, store_photo, cancelled_cheque, fssai, shop_license, aadhaar; ' ||
  'SUPPLIERS: pan_card, gstin_certificate, address_proof, cancelled_cheque, business_license; ' ||
  'APPLICATIONS: Same as respective entity type';

-- =============================================================================
-- Step 3: Update pending_documents view to include applications
-- =============================================================================

CREATE OR REPLACE VIEW platform.pending_documents AS
SELECT
  d.id,
  d.entity_type,
  d.entity_id,
  d.document_type,
  d.file_name,
  d.file_size,
  d.content_type,
  d.status,
  d.uploaded_at,
  CASE
    WHEN d.entity_type = 'store' THEN s.name
    WHEN d.entity_type = 'supplier' THEN sup.business_name
    WHEN d.entity_type = 'application' THEN app.business_name
  END AS entity_name,
  CASE
    WHEN d.entity_type = 'store' THEN s.owner_name
    WHEN d.entity_type = 'supplier' THEN sup.primary_contact_name
    WHEN d.entity_type = 'application' THEN app.owner_name
  END AS owner_name,
  CASE
    WHEN d.entity_type = 'application' THEN app.entity_type
  END AS application_type,
  CASE
    WHEN d.entity_type = 'application' THEN app.status
  END AS application_status
FROM platform.documents d
LEFT JOIN platform.stores s ON d.entity_type = 'store' AND d.entity_id = s.id
LEFT JOIN supplier.suppliers sup ON d.entity_type = 'supplier' AND d.entity_id = sup.id
LEFT JOIN auth.applications app ON d.entity_type = 'application' AND d.entity_id = app.id
WHERE d.status = 'pending'
  AND d.deleted_at IS NULL
ORDER BY d.uploaded_at ASC;

-- =============================================================================
-- Step 4: Create helper function to get required documents by entity type
-- =============================================================================

CREATE OR REPLACE FUNCTION platform.get_required_documents(
  p_entity_type VARCHAR(20)
)
RETURNS TABLE (
  document_type VARCHAR(50),
  is_required BOOLEAN,
  description TEXT
) AS $$
BEGIN
  IF p_entity_type = 'retailer' OR p_entity_type = 'store' THEN
    RETURN QUERY
    SELECT * FROM (VALUES
      ('pan'::VARCHAR(50), true, 'PAN Card of Owner'),
      ('gstin_certificate'::VARCHAR(50), true, 'GSTIN Registration Certificate'),
      ('address_proof'::VARCHAR(50), true, 'Address Proof (Electricity Bill/Rent Agreement)'),
      ('owner_photo'::VARCHAR(50), false, 'Owner Photo'),
      ('store_photo'::VARCHAR(50), false, 'Store Front Photo'),
      ('cancelled_cheque'::VARCHAR(50), false, 'Cancelled Cheque for Bank Account'),
      ('fssai'::VARCHAR(50), false, 'FSSAI License (if applicable)'),
      ('shop_license'::VARCHAR(50), false, 'Shop & Establishment License'),
      ('aadhaar'::VARCHAR(50), false, 'Aadhaar Card of Owner')
    ) AS t(document_type, is_required, description);
  ELSIF p_entity_type = 'supplier' THEN
    RETURN QUERY
    SELECT * FROM (VALUES
      ('pan_card'::VARCHAR(50), true, 'PAN Card of Business/Owner'),
      ('gstin_certificate'::VARCHAR(50), true, 'GSTIN Registration Certificate'),
      ('address_proof'::VARCHAR(50), true, 'Business Address Proof'),
      ('cancelled_cheque'::VARCHAR(50), true, 'Cancelled Cheque for Bank Verification'),
      ('business_license'::VARCHAR(50), false, 'Business License/Registration')
    ) AS t(document_type, is_required, description);
  ELSE
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- Step 5: Create function to check application document completeness
-- =============================================================================

CREATE OR REPLACE FUNCTION auth.check_application_documents(
  p_application_id UUID
)
RETURNS TABLE (
  document_type VARCHAR(50),
  is_required BOOLEAN,
  status VARCHAR(20),
  is_complete BOOLEAN
) AS $$
DECLARE
  v_entity_type VARCHAR(20);
BEGIN
  -- Get application entity type
  SELECT entity_type INTO v_entity_type
  FROM auth.applications
  WHERE id = p_application_id;

  IF v_entity_type IS NULL THEN
    RAISE EXCEPTION 'Application not found: %', p_application_id;
  END IF;

  RETURN QUERY
  SELECT
    req.document_type,
    req.is_required,
    COALESCE(doc.status, 'missing'::VARCHAR(20)) AS status,
    CASE
      WHEN NOT req.is_required THEN true
      WHEN doc.id IS NOT NULL AND doc.status != 'rejected' THEN true
      ELSE false
    END AS is_complete
  FROM platform.get_required_documents(v_entity_type) req
  LEFT JOIN platform.documents doc ON
    doc.entity_type = 'application'
    AND doc.entity_id = p_application_id
    AND doc.document_type = req.document_type
    AND doc.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Step 6: Create function to migrate application documents to store/supplier
-- =============================================================================

-- When application is approved, copy documents to the new store/supplier entity
CREATE OR REPLACE FUNCTION auth.migrate_application_documents(
  p_application_id UUID,
  p_target_entity_type VARCHAR(20),
  p_target_entity_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Copy documents from application to target entity
  WITH migrated AS (
    INSERT INTO platform.documents (
      entity_type,
      entity_id,
      document_type,
      file_path,
      file_name,
      file_size,
      content_type,
      status,
      rejection_reason,
      verified_by,
      verified_at,
      uploaded_by,
      uploaded_at
    )
    SELECT
      p_target_entity_type,
      p_target_entity_id,
      document_type,
      file_path,
      file_name,
      file_size,
      content_type,
      status,
      rejection_reason,
      verified_by,
      verified_at,
      uploaded_by,
      uploaded_at
    FROM platform.documents
    WHERE entity_type = 'application'
      AND entity_id = p_application_id
      AND deleted_at IS NULL
    ON CONFLICT (entity_type, entity_id, document_type) WHERE deleted_at IS NULL
    DO UPDATE SET
      file_path = EXCLUDED.file_path,
      file_name = EXCLUDED.file_name,
      file_size = EXCLUDED.file_size,
      content_type = EXCLUDED.content_type,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM migrated;

  -- Soft-delete the application documents (keep for audit)
  UPDATE platform.documents
  SET deleted_at = NOW()
  WHERE entity_type = 'application'
    AND entity_id = p_application_id
    AND deleted_at IS NULL;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Step 7: Create view for application KYC status
-- =============================================================================

CREATE OR REPLACE VIEW auth.application_kyc_status AS
SELECT
  a.id AS application_id,
  a.entity_type,
  a.business_name,
  a.status AS application_status,
  COUNT(DISTINCT CASE WHEN doc.status IS NOT NULL AND doc.status != 'rejected' THEN doc.document_type END) AS uploaded_count,
  COUNT(DISTINCT CASE WHEN req.is_required THEN req.document_type END) AS required_count,
  COUNT(DISTINCT CASE WHEN req.is_required AND (doc.id IS NULL OR doc.status = 'rejected') THEN req.document_type END) AS missing_count,
  ARRAY_AGG(DISTINCT CASE WHEN req.is_required AND (doc.id IS NULL OR doc.status = 'rejected') THEN req.document_type END)
    FILTER (WHERE req.is_required AND (doc.id IS NULL OR doc.status = 'rejected')) AS missing_documents,
  CASE
    WHEN COUNT(DISTINCT CASE WHEN req.is_required AND (doc.id IS NULL OR doc.status = 'rejected') THEN req.document_type END) = 0
    THEN true
    ELSE false
  END AS kyc_complete
FROM auth.applications a
CROSS JOIN LATERAL platform.get_required_documents(a.entity_type) req
LEFT JOIN platform.documents doc ON
  doc.entity_type = 'application'
  AND doc.entity_id = a.id
  AND doc.document_type = req.document_type
  AND doc.deleted_at IS NULL
WHERE a.status NOT IN ('ACTIVE', 'EXPIRED')
GROUP BY a.id, a.entity_type, a.business_name, a.status;

COMMIT;
