-- V3: POS OTP authentication table
-- ROLLBACK: DROP TABLE IF EXISTS pos_otp;

CREATE TABLE IF NOT EXISTS pos_otp (
  phone VARCHAR(15) PRIMARY KEY,
  otp_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_otp_expires ON pos_otp (expires_at);
