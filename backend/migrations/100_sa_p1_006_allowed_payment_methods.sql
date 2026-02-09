-- Migration: 100_sa_p1_006_allowed_payment_methods
-- SA-P1-006: Payment Method Control Per Store
-- Adds allowed_payment_methods column to platform.stores
-- Default: all methods enabled (CASH, UPI, DUE)
-- Safe to run multiple times (idempotent)

BEGIN;

ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS allowed_payment_methods TEXT[]
DEFAULT '{CASH,UPI,DUE}';

COMMENT ON COLUMN platform.stores.allowed_payment_methods
IS 'SA-P1-006: Payment methods this store can accept at checkout. Default: all enabled.';

COMMIT;
