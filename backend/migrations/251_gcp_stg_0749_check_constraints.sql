-- Migration: 251_gcp_stg_0749_check_constraints
-- GCP-STG-0749a+b: Add CHECK constraints to order_status_history + platform.notifications
-- ROLLBACK: ALTER TABLE orders.order_status_history DROP CONSTRAINT IF EXISTS chk_osh_new_status; ALTER TABLE orders.order_status_history DROP CONSTRAINT IF EXISTS chk_osh_previous_status; ALTER TABLE platform.notifications DROP CONSTRAINT IF EXISTS chk_notification_category;

BEGIN;

-- GCP-STG-0749a: order_status_history status constraints
ALTER TABLE orders.order_status_history
  DROP CONSTRAINT IF EXISTS chk_osh_new_status;
ALTER TABLE orders.order_status_history
  ADD CONSTRAINT chk_osh_new_status
  CHECK (new_status IN ('draft', 'submitted', 'confirmed', 'shipped', 'delivered', 'partial_received', 'cancelled', 'rejected'));

ALTER TABLE orders.order_status_history
  DROP CONSTRAINT IF EXISTS chk_osh_previous_status;
ALTER TABLE orders.order_status_history
  ADD CONSTRAINT chk_osh_previous_status
  CHECK (previous_status IS NULL OR previous_status IN ('draft', 'submitted', 'confirmed', 'shipped', 'delivered', 'partial_received', 'cancelled', 'rejected'));

-- GCP-STG-0749b: platform.notifications category constraint
ALTER TABLE platform.notifications
  DROP CONSTRAINT IF EXISTS chk_notification_category;
ALTER TABLE platform.notifications
  ADD CONSTRAINT chk_notification_category
  CHECK (category IN ('general', 'low_stock', 'expiry', 'order', 'payment', 'system', 'reorder'));

COMMIT;
