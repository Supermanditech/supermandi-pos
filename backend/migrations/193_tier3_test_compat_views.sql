-- AUDIT-011: Compatibility views for tier3 integration tests
-- These views map the test-expected table names to actual schema-qualified tables
-- ROLLBACK: DROP VIEW IF EXISTS outbox_events; DROP VIEW IF EXISTS inventory;

-- Tests expect: outbox_events (aggregate_type, aggregate_id, event_type, created_at)
-- Actual: orders.event_outbox (aggregate_type, aggregate_id, event_type, created_at)
CREATE OR REPLACE VIEW public.outbox_events AS
  SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at
  FROM orders.event_outbox
  UNION ALL
  SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at
  FROM inventory.event_outbox;

-- Tests expect: inventory (product_id, store_id, quantity, ...)
-- Actual: inventory.inventory_ledger
CREATE OR REPLACE VIEW public.inventory AS
  SELECT id, store_id, product_id, delta_qty as quantity, transaction_type, reference_type, reference_id, notes, created_at
  FROM inventory.inventory_ledger;
