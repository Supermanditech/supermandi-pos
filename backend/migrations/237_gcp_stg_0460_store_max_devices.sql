-- GCP-STG-0460: Per-store device quota (default 10)
-- ROLLBACK: ALTER TABLE platform.stores DROP COLUMN IF EXISTS max_pos_devices;
ALTER TABLE platform.stores ADD COLUMN IF NOT EXISTS max_pos_devices INTEGER DEFAULT 10;
