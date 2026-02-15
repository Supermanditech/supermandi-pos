-- T-250: Add 'fulfilled' status to pending_reorders
-- When a reorder-originated PO reaches 'delivered' via GRN, the linked
-- pending_reorders should transition to 'fulfilled' to close the lifecycle.
--
-- Lifecycle: pending → approved (PO created) → fulfilled (PO delivered via GRN)
--            pending → dismissed (user dismissed)
--            pending → expired (TTL expired)

-- Drop and recreate the CHECK constraint to include 'fulfilled'
ALTER TABLE reorder.pending_reorders
  DROP CONSTRAINT IF EXISTS chk_pending_reorders_status;

ALTER TABLE reorder.pending_reorders
  ADD CONSTRAINT chk_pending_reorders_status CHECK (
    status IN ('pending', 'approved', 'dismissed', 'expired', 'fulfilled')
  );

-- Index for quick lookup: find approved pending_reorders by purchase_order_id
-- Used by GRN auto-close to find linked reorders when PO is delivered
CREATE INDEX IF NOT EXISTS idx_pending_reorders_po_id
  ON reorder.pending_reorders (purchase_order_id)
  WHERE status = 'approved';

COMMENT ON CONSTRAINT chk_pending_reorders_status ON reorder.pending_reorders IS
  'T-250: Added fulfilled status for GRN auto-close lifecycle';
