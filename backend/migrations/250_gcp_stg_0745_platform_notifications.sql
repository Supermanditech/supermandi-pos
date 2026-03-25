-- Migration: 250_gcp_stg_0745_platform_notifications
-- GCP-STG-0745: Platform-level notification center
-- Store-scoped notifications (visible to all users of a store)
-- Complements notifications.notifications (which is user-scoped)
-- Safe to run multiple times (idempotent)
-- ROLLBACK: DROP TABLE IF EXISTS platform.notifications;

BEGIN;

CREATE TABLE IF NOT EXISTS platform.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES platform.stores(id),
  title VARCHAR(200) NOT NULL,
  body TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  read_by UUID,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_notifications_store_unread
  ON platform.notifications (store_id, is_read, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_platform_notifications_store
  ON platform.notifications (store_id, created_at DESC);

COMMENT ON TABLE platform.notifications IS
  'Store-scoped notifications for the notification center. Visible to all users of a store.';

COMMIT;
