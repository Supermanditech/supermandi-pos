-- GCP-STG-0464: TOTP 2FA for retailer and supplier users
-- Stores TOTP secrets for users who enable 2FA on retailer web or supplier portal.
-- ROLLBACK: DROP TABLE IF EXISTS auth.user_totp;

CREATE TABLE IF NOT EXISTS auth.user_totp (
  user_id    UUID PRIMARY KEY,
  totp_secret TEXT NOT NULL,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
