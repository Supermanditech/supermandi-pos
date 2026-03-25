-- =============================================================================
-- Migration: 020_fix_order_events_constraint
-- ROLLBACK: ALTER TABLE orders.order_events DROP CONSTRAINT IF EXISTS chk_order_event_type; ALTER TABLE orders.order_events ADD CONSTRAINT chk_order_event_type CHECK (event_type IN ('created','submitted','confirmed','shipped','received','partial_received','cancelled','note_added'));
-- Fixes the order_events event_type constraint to allow 'status_transition'
-- The statusService.ts uses 'status_transition' for cancel/status changes
-- Safe to run multiple times (idempotent)
-- =============================================================================

BEGIN;

-- Drop existing constraint if it exists
ALTER TABLE orders.order_events DROP CONSTRAINT IF EXISTS chk_order_event_type;

-- Add updated constraint with 'status_transition' included
ALTER TABLE orders.order_events ADD CONSTRAINT chk_order_event_type CHECK (event_type IN (
  'created',
  'submitted',
  'confirmed',
  'shipped',
  'received',
  'partial_received',
  'cancelled',
  'note_added',
  'status_transition'
));

COMMIT;
