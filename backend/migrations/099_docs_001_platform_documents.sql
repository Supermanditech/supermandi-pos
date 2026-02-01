-- Migration: 099_docs_001_platform_documents
-- DOCS-001: Unified Document Storage Backend
-- Creates tables and infrastructure for document storage across all entity types

BEGIN;

-- =============================================================================
-- Step 1: Create unified documents metadata table
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity reference (polymorphic: store or supplier)
  entity_type VARCHAR(20) NOT NULL, -- 'store' or 'supplier'
  entity_id UUID NOT NULL,

  -- Document classification
  document_type VARCHAR(50) NOT NULL, -- aadhaar, pan, gstin, fssai, shop_license, etc.

  -- File storage
  file_path TEXT NOT NULL, -- Relative path from DOCUMENT_STORAGE_DIR
  file_name VARCHAR(255) NOT NULL, -- Original filename
  file_size INTEGER NOT NULL, -- Size in bytes
  content_type VARCHAR(100) NOT NULL, -- MIME type

  -- Verification status
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  rejection_reason TEXT,

  -- Verification tracking
  verified_by UUID, -- Admin user who verified
  verified_at TIMESTAMPTZ,

  -- Upload tracking
  uploaded_by UUID, -- User who uploaded
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Created platform.documents table

-- =============================================================================
-- Step 2: Create indexes for efficient querying
-- =============================================================================

-- Index for looking up documents by entity
CREATE INDEX IF NOT EXISTS idx_documents_entity
ON platform.documents(entity_type, entity_id);

-- Index for document status (admin queue)
CREATE INDEX IF NOT EXISTS idx_documents_status
ON platform.documents(status)
WHERE status = 'pending';

-- Index for document type per entity (upsert support)
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_entity_type_unique
ON platform.documents(entity_type, entity_id, document_type)
WHERE deleted_at IS NULL;

-- Index for admin verification queries
CREATE INDEX IF NOT EXISTS idx_documents_verified_by
ON platform.documents(verified_by)
WHERE verified_by IS NOT NULL;

-- Created document indexes

-- =============================================================================
-- Step 3: Create store-specific document types view
-- =============================================================================

-- Valid document types for stores
COMMENT ON TABLE platform.documents IS 'DOCS-001: Unified document storage for all entity types (stores, suppliers)';
COMMENT ON COLUMN platform.documents.entity_type IS 'Entity type: store or supplier';
COMMENT ON COLUMN platform.documents.document_type IS 'Document type: aadhaar, pan, gstin, fssai, shop_license, cancelled_cheque, address_proof, owner_photo, store_photo';
COMMENT ON COLUMN platform.documents.file_path IS 'Relative path from DOCUMENT_STORAGE_DIR (e.g., store/{id}/aadhaar_1234567890.jpg)';
COMMENT ON COLUMN platform.documents.status IS 'Verification status: pending, approved, rejected';

-- =============================================================================
-- Step 4: Add trigger for updated_at
-- =============================================================================

DROP TRIGGER IF EXISTS update_documents_updated_at ON platform.documents;

CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON platform.documents
FOR EACH ROW
EXECUTE FUNCTION platform.update_updated_at_column();

-- Created updated_at trigger

-- =============================================================================
-- Step 5: Create audit log entries for document changes
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.document_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES platform.documents(id) ON DELETE CASCADE,

  -- Change tracking
  action VARCHAR(20) NOT NULL, -- uploaded, approved, rejected, deleted, replaced
  old_status VARCHAR(20),
  new_status VARCHAR(20),

  -- Actor
  actor_id UUID,
  actor_type VARCHAR(20), -- admin, system, user

  -- Context
  reason TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_audit_document
ON platform.document_audit(document_id);

CREATE INDEX IF NOT EXISTS idx_document_audit_created
ON platform.document_audit(created_at DESC);

-- Created document_audit table

-- =============================================================================
-- Step 6: Create function to log document changes
-- =============================================================================

CREATE OR REPLACE FUNCTION platform.log_document_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO platform.document_audit (
      document_id,
      action,
      old_status,
      new_status,
      actor_id,
      actor_type,
      reason
    ) VALUES (
      NEW.id,
      CASE
        WHEN NEW.status = 'approved' THEN 'approved'
        WHEN NEW.status = 'rejected' THEN 'rejected'
        ELSE 'status_changed'
      END,
      OLD.status,
      NEW.status,
      NEW.verified_by,
      'admin',
      NEW.rejection_reason
    );
  END IF;

  -- Log soft deletes
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO platform.document_audit (
      document_id,
      action,
      old_status,
      new_status,
      actor_id,
      actor_type
    ) VALUES (
      NEW.id,
      'deleted',
      OLD.status,
      'deleted',
      NEW.deleted_by,
      'admin'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_audit ON platform.documents;

CREATE TRIGGER trg_document_audit
AFTER UPDATE ON platform.documents
FOR EACH ROW
EXECUTE FUNCTION platform.log_document_change();

-- Created document audit trigger

-- =============================================================================
-- Step 7: Migrate existing supplier KYC documents to unified table
-- =============================================================================

-- Insert supplier KYC documents into unified documents table
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
  uploaded_at,
  created_at,
  updated_at
)
SELECT
  'supplier',
  supplier_id,
  document_type,
  file_path,
  file_name,
  file_size,
  mime_type,
  status,
  rejection_reason,
  verified_by,
  verified_at,
  created_at,
  created_at,
  updated_at
FROM supplier.kyc_documents
WHERE NOT EXISTS (
  SELECT 1 FROM platform.documents d
  WHERE d.entity_type = 'supplier'
    AND d.entity_id = supplier.kyc_documents.supplier_id
    AND d.document_type = supplier.kyc_documents.document_type
)
ON CONFLICT DO NOTHING;

-- Migrated existing supplier KYC documents

-- =============================================================================
-- Step 8: Add helper view for pending documents (admin queue)
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
  END AS entity_name,
  CASE
    WHEN d.entity_type = 'store' THEN s.contact_name
    WHEN d.entity_type = 'supplier' THEN sup.contact_name
  END AS owner_name
FROM platform.documents d
LEFT JOIN platform.stores s ON d.entity_type = 'store' AND d.entity_id = s.id
LEFT JOIN supplier.suppliers sup ON d.entity_type = 'supplier' AND d.entity_id = sup.id
WHERE d.status = 'pending'
  AND d.deleted_at IS NULL
ORDER BY d.uploaded_at ASC;

-- Created pending_documents view

COMMIT;
