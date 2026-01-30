-- GO-LIVE-130: Add reviewer tracking to supplier_requests
-- Tracks which admin approved/rejected supplier requests

BEGIN;

-- Add reviewed_by column to supplier_requests
ALTER TABLE supplier.supplier_requests
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;

-- Add comment
COMMENT ON COLUMN supplier.supplier_requests.reviewed_by IS
'GO-LIVE-130: UUID of the admin who reviewed (approved/rejected) this request';

-- Create index for audit queries
CREATE INDEX IF NOT EXISTS idx_supplier_requests_reviewed_by
  ON supplier.supplier_requests(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

COMMIT;
