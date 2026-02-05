-- Migration: 011b_ensure_runtime_tables.sql
-- Creates tables that ensureSchema.ts normally creates at runtime.
-- Required because subsequent migrations (012+) ALTER these tables.
-- Only includes tables NOT created by later migrations (018, etc.)
-- All use IF NOT EXISTS for idempotency.

BEGIN;

-- Needed by migration 012 (ALTER TABLE pos_device_enrollments)
CREATE TABLE IF NOT EXISTS pos_device_enrollments (
  code TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'superadmin'
);

-- Needed by migration 012 (ALTER TABLE pos_devices)
CREATE TABLE IF NOT EXISTS pos_devices (
  id TEXT PRIMARY KEY,
  store_id TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  device_token TEXT NULL,
  label TEXT NULL,
  device_type TEXT NULL,
  manufacturer TEXT NULL,
  model TEXT NULL,
  android_version TEXT NULL,
  app_version TEXT NULL,
  printing_mode TEXT NULL,
  device_fingerprint TEXT NULL,
  last_seen_online TIMESTAMPTZ NULL,
  last_sync_at TIMESTAMPTZ NULL,
  pending_outbox_count INTEGER NOT NULL DEFAULT 0,
  scan_lookup_v2_enabled BOOLEAN NULL,
  re_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  re_enrolled_at TIMESTAMPTZ NULL,
  inventory_sync_status TEXT DEFAULT 'synced',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Needed by migration 107 (CREATE INDEX on scan_events)
CREATE TABLE IF NOT EXISTS scan_events (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  device_id TEXT NULL,
  scan_value TEXT NOT NULL,
  mode TEXT NOT NULL,
  action TEXT NOT NULL,
  variant_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Needed by migration 082 (pos_events references)
CREATE TABLE IF NOT EXISTS pos_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
