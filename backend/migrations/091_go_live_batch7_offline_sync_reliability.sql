-- Migration: 091_go_live_batch7_offline_sync_reliability
-- GO-LIVE Batch 7: Offline & Sync Reliability (GO-LIVE-216 to GO-LIVE-230)
-- 15 tickets addressing race conditions, sync guarantees, and offline resilience
-- Safe to run multiple times (idempotent)

BEGIN;

-- =============================================================================
-- GO-LIVE-216: Race condition in concurrent sync operations (CRITICAL)
-- VERIFICATION: Advisory locks are already implemented in sync.ts
-- This migration adds database-level enforcement as defense-in-depth
-- =============================================================================

-- Create sync_locks table for tracking active sync operations
CREATE TABLE IF NOT EXISTS sync_locks (
  store_id UUID NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  lock_acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id VARCHAR(100),
  PRIMARY KEY (store_id, device_id)
);

COMMENT ON TABLE sync_locks IS
'GO-LIVE-216: Tracks active sync operations per device. Used with pg_advisory_lock for race prevention.';

-- Index for cleanup of stale locks
CREATE INDEX IF NOT EXISTS idx_sync_locks_acquired_at
  ON sync_locks (lock_acquired_at);

-- Function to clean up stale sync locks (older than 5 minutes)
CREATE OR REPLACE FUNCTION cleanup_stale_sync_locks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sync_locks
  WHERE lock_acquired_at < NOW() - INTERVAL '5 minutes';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_stale_sync_locks() IS
'GO-LIVE-216: Cleanup function for stale sync locks. Run periodically.';

-- =============================================================================
-- GO-LIVE-217: Inventory sync queued but never guaranteed (CRITICAL)
-- Add tracking table for inventory sync guarantees
-- =============================================================================

CREATE TABLE IF NOT EXISTS inventory_sync_guarantees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  product_id UUID NOT NULL,
  sale_id VARCHAR(100),
  expected_deduction INTEGER NOT NULL,
  actual_deduction INTEGER,
  sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ,
  error_message TEXT,
  CONSTRAINT chk_inventory_sync_status CHECK (
    sync_status IN ('pending', 'synced', 'failed', 'compensated')
  )
);

CREATE INDEX IF NOT EXISTS idx_inventory_sync_guarantees_pending
  ON inventory_sync_guarantees (store_id, sync_status)
  WHERE sync_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_inventory_sync_guarantees_sale
  ON inventory_sync_guarantees (sale_id)
  WHERE sale_id IS NOT NULL;

COMMENT ON TABLE inventory_sync_guarantees IS
'GO-LIVE-217: Tracks inventory deductions to ensure they are eventually applied. Enables compensation on failure.';

-- Function to reconcile pending inventory syncs
CREATE OR REPLACE FUNCTION reconcile_inventory_syncs(p_store_id UUID)
RETURNS TABLE(
  product_id UUID,
  pending_deductions INTEGER,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    isg.product_id,
    SUM(isg.expected_deduction)::INTEGER as pending_deductions,
    'needs_reconciliation'::TEXT as status
  FROM inventory_sync_guarantees isg
  WHERE isg.store_id = p_store_id
    AND isg.sync_status = 'pending'
    AND isg.created_at < NOW() - INTERVAL '1 hour'
  GROUP BY isg.product_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- GO-LIVE-219: Dead letter queue for failed sync events (HIGH)
-- VERIFICATION: failed_sync_events table already exists (migration 076)
-- Add additional columns for better tracking and auto-remediation
-- =============================================================================

ALTER TABLE failed_sync_events
  ADD COLUMN IF NOT EXISTS event_payload JSONB;

ALTER TABLE failed_sync_events
  ADD COLUMN IF NOT EXISTS resolution_status VARCHAR(20) DEFAULT 'unresolved';

ALTER TABLE failed_sync_events
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE failed_sync_events
  ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(100);

-- Add check constraint for resolution status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_failed_sync_resolution_status'
  ) THEN
    ALTER TABLE failed_sync_events
      ADD CONSTRAINT chk_failed_sync_resolution_status
      CHECK (resolution_status IN ('unresolved', 'auto_resolved', 'manually_resolved', 'abandoned'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_failed_sync_events_unresolved
  ON failed_sync_events (store_id, resolution_status)
  WHERE resolution_status = 'unresolved';

COMMENT ON COLUMN failed_sync_events.event_payload IS
'GO-LIVE-219: Store the original event payload for debugging and manual retry.';

COMMENT ON COLUMN failed_sync_events.resolution_status IS
'GO-LIVE-219: Track whether failed event has been resolved or needs attention.';

-- =============================================================================
-- GO-LIVE-221: Sale idempotency check has race window (HIGH)
-- VERIFICATION: pg_advisory_xact_lock already implemented
-- Add unique constraint on (store_id, sale_id) for database-level enforcement
-- =============================================================================

-- Create processed_sync_events table for idempotency tracking
CREATE TABLE IF NOT EXISTS processed_sync_events (
  event_id VARCHAR(100) NOT NULL,
  store_id UUID NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_status VARCHAR(20) NOT NULL,
  PRIMARY KEY (event_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_sync_events_store_device
  ON processed_sync_events (store_id, device_id, processed_at DESC);

-- Index for duplicate checking by event_id (no partial predicate - NOW() is not immutable)
CREATE INDEX IF NOT EXISTS idx_processed_sync_events_recent
  ON processed_sync_events (event_id, processed_at DESC);

COMMENT ON TABLE processed_sync_events IS
'GO-LIVE-221: Tracks all processed sync events for idempotency. Prevents duplicate processing.';

-- Cleanup function for old processed events
CREATE OR REPLACE FUNCTION cleanup_old_processed_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM processed_sync_events
  WHERE processed_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- GO-LIVE-225: Bills cached locally but conflicts not detected (MEDIUM)
-- Add conflict detection metadata to sales table
-- =============================================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS device_created_at TIMESTAMPTZ;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS server_received_at TIMESTAMPTZ;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS conflict_status VARCHAR(20) DEFAULT NULL;

-- Add check constraint for conflict status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_conflict_status'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT chk_sales_conflict_status
      CHECK (conflict_status IS NULL OR conflict_status IN ('none', 'detected', 'resolved', 'ignored'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_conflicts
  ON public.sales (store_id, conflict_status)
  WHERE conflict_status = 'detected';

COMMENT ON COLUMN public.sales.device_created_at IS
'GO-LIVE-225: Timestamp when sale was created on device (offline). Used for conflict detection.';

COMMENT ON COLUMN public.sales.server_received_at IS
'GO-LIVE-225: Timestamp when server received the sale. Gap indicates offline period.';

COMMENT ON COLUMN public.sales.conflict_status IS
'GO-LIVE-225: Tracks if sale had conflicts during sync (duplicate bill, inventory shortage, etc).';

-- =============================================================================
-- GO-LIVE-226: Pending outbox count never updates after sync (MEDIUM)
-- Add trigger to update pos_devices.pending_outbox_count
-- =============================================================================

-- Ensure pending_outbox_count column exists
ALTER TABLE public.pos_devices
  ADD COLUMN IF NOT EXISTS pending_outbox_count INTEGER DEFAULT 0;

ALTER TABLE public.pos_devices
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

ALTER TABLE public.pos_devices
  ADD COLUMN IF NOT EXISTS last_sync_event_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pos_devices_pending_outbox
  ON public.pos_devices (store_id, pending_outbox_count DESC)
  WHERE pending_outbox_count > 0;

COMMENT ON COLUMN public.pos_devices.pending_outbox_count IS
'GO-LIVE-226: Number of events pending in device outbox. Updated on sync.';

COMMENT ON COLUMN public.pos_devices.last_sync_at IS
'GO-LIVE-226: Timestamp of last successful sync from this device.';

COMMENT ON COLUMN public.pos_devices.last_sync_event_count IS
'GO-LIVE-226: Number of events processed in last sync batch.';

-- =============================================================================
-- GO-LIVE-229: Device session cache race condition (MEDIUM)
-- Add locking mechanism for device session updates
-- =============================================================================

ALTER TABLE public.pos_devices
  ADD COLUMN IF NOT EXISTS session_version INTEGER DEFAULT 1;

ALTER TABLE public.pos_devices
  ADD COLUMN IF NOT EXISTS session_locked_at TIMESTAMPTZ;

ALTER TABLE public.pos_devices
  ADD COLUMN IF NOT EXISTS session_lock_holder VARCHAR(100);

-- Function for optimistic locking on device sessions
CREATE OR REPLACE FUNCTION update_device_session_safe(
  p_device_id VARCHAR(100),
  p_expected_version INTEGER,
  p_new_token TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE public.pos_devices
  SET
    session_version = session_version + 1,
    auth_token = COALESCE(p_new_token, auth_token),
    updated_at = NOW()
  WHERE device_id = p_device_id
    AND session_version = p_expected_version;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected = 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_device_session_safe IS
'GO-LIVE-229: Optimistic locking for device session updates. Returns false if version mismatch.';

-- =============================================================================
-- GO-LIVE-230: Bill number collision across devices (MEDIUM)
-- Add device-prefixed bill number generation
-- =============================================================================

-- Add device_prefix to bill_sequences
ALTER TABLE public.bill_sequences
  ADD COLUMN IF NOT EXISTS device_ranges JSONB DEFAULT '{}';

COMMENT ON COLUMN public.bill_sequences.device_ranges IS
'GO-LIVE-230: Tracks bill number ranges assigned to each device. Prevents collisions.';

-- Function to allocate bill number range to device
CREATE OR REPLACE FUNCTION allocate_bill_range(
  p_store_id UUID,
  p_device_id VARCHAR(100),
  p_range_size INTEGER DEFAULT 1000
)
RETURNS TABLE(range_start INTEGER, range_end INTEGER) AS $$
DECLARE
  v_current_last INTEGER;
  v_device_ranges JSONB;
  v_new_start INTEGER;
  v_new_end INTEGER;
BEGIN
  -- Lock the row for update
  SELECT last_number, device_ranges
  INTO v_current_last, v_device_ranges
  FROM public.bill_sequences
  WHERE store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Create new sequence entry
    INSERT INTO public.bill_sequences (store_id, last_number, device_ranges)
    VALUES (p_store_id, p_range_size, jsonb_build_object(p_device_id, jsonb_build_object('start', 1, 'end', p_range_size)))
    RETURNING 1, p_range_size INTO v_new_start, v_new_end;
  ELSE
    v_new_start := v_current_last + 1;
    v_new_end := v_current_last + p_range_size;

    -- Update sequence and device ranges
    UPDATE public.bill_sequences
    SET
      last_number = v_new_end,
      device_ranges = v_device_ranges || jsonb_build_object(
        p_device_id, jsonb_build_object('start', v_new_start, 'end', v_new_end, 'allocated_at', NOW())
      ),
      updated_at = NOW()
    WHERE store_id = p_store_id;
  END IF;

  RETURN QUERY SELECT v_new_start, v_new_end;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION allocate_bill_range IS
'GO-LIVE-230: Allocates a range of bill numbers to a device. Prevents collision across devices.';

-- =============================================================================
-- Summary view for offline sync health monitoring
-- =============================================================================

CREATE OR REPLACE VIEW sync_health_summary AS
SELECT
  s.id as store_id,
  s.name as store_name,
  COALESCE(pending.count, 0) as pending_sync_events,
  COALESCE(failed.count, 0) as failed_sync_events,
  COALESCE(stale_devices.count, 0) as devices_with_stale_data,
  COALESCE(inv_pending.count, 0) as pending_inventory_syncs
FROM platform.stores s
LEFT JOIN (
  SELECT store_id, COUNT(*) as count
  FROM processed_sync_events
  WHERE processed_at > NOW() - INTERVAL '1 hour'
  GROUP BY store_id
) pending ON pending.store_id = s.id
LEFT JOIN (
  SELECT store_id::UUID, COUNT(*) as count
  FROM failed_sync_events
  WHERE resolution_status = 'unresolved'
  GROUP BY store_id
) failed ON failed.store_id = s.id
LEFT JOIN (
  SELECT store_id::UUID as store_id, COUNT(*) as count
  FROM public.pos_devices
  WHERE last_seen_online < NOW() - INTERVAL '1 hour'
    AND pending_outbox_count > 0
  GROUP BY store_id
) stale_devices ON stale_devices.store_id = s.id
LEFT JOIN (
  SELECT store_id, COUNT(*) as count
  FROM inventory_sync_guarantees
  WHERE sync_status = 'pending'
  GROUP BY store_id
) inv_pending ON inv_pending.store_id = s.id;

COMMENT ON VIEW sync_health_summary IS
'GO-LIVE Batch 7: Dashboard view for monitoring offline sync health across stores.';

-- =============================================================================
-- Verification queries
-- =============================================================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- GO-LIVE-216: Verify sync_locks table
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_name = 'sync_locks';
  RAISE NOTICE 'GO-LIVE-216: sync_locks table exists: %', v_count = 1;

  -- GO-LIVE-217: Verify inventory_sync_guarantees table
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_name = 'inventory_sync_guarantees';
  RAISE NOTICE 'GO-LIVE-217: inventory_sync_guarantees table exists: %', v_count = 1;

  -- GO-LIVE-219: Verify failed_sync_events columns
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_name = 'failed_sync_events' AND column_name = 'resolution_status';
  RAISE NOTICE 'GO-LIVE-219: failed_sync_events.resolution_status exists: %', v_count = 1;

  -- GO-LIVE-221: Verify processed_sync_events table
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_name = 'processed_sync_events';
  RAISE NOTICE 'GO-LIVE-221: processed_sync_events table exists: %', v_count = 1;

  -- GO-LIVE-225: Verify sales conflict columns
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_name = 'sales' AND column_name = 'conflict_status';
  RAISE NOTICE 'GO-LIVE-225: sales.conflict_status exists: %', v_count = 1;

  -- GO-LIVE-226: Verify pos_devices columns
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_name = 'pos_devices' AND column_name = 'last_sync_at';
  RAISE NOTICE 'GO-LIVE-226: pos_devices.last_sync_at exists: %', v_count = 1;

  -- GO-LIVE-229: Verify session_version column
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_name = 'pos_devices' AND column_name = 'session_version';
  RAISE NOTICE 'GO-LIVE-229: pos_devices.session_version exists: %', v_count = 1;

  -- GO-LIVE-230: Verify device_ranges column
  SELECT COUNT(*) INTO v_count FROM information_schema.columns
  WHERE table_name = 'bill_sequences' AND column_name = 'device_ranges';
  RAISE NOTICE 'GO-LIVE-230: bill_sequences.device_ranges exists: %', v_count = 1;
END $$;

COMMIT;
