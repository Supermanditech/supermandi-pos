-- GCP-STG-0463: TOTP 2FA for SuperAdmin
-- Stores TOTP secrets for admin users who enable 2FA.
-- ROLLBACK: DROP TABLE IF EXISTS admin_totp;

CREATE TABLE IF NOT EXISTS admin_totp (
  email       TEXT PRIMARY KEY,
  totp_secret TEXT NOT NULL,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index not needed: email is PK, queries are always by email.
