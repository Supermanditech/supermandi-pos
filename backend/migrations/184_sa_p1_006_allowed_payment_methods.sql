-- Migration: 100_sa_p1_006_allowed_payment_methods
-- SA-P1-006: Payment Method Control Per Store
-- Adds allowed_payment_methods column to platform.stores
-- Updates public.stores VIEW to expose the new column
-- Default: all methods enabled (CASH, UPI, DUE)
-- Safe to run multiple times (idempotent)

BEGIN;

ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS allowed_payment_methods TEXT[]
DEFAULT '{CASH,UPI,DUE}';

COMMENT ON COLUMN platform.stores.allowed_payment_methods
IS 'SA-P1-006: Payment methods this store can accept at checkout. Default: all enabled.';

-- Recreate public.stores VIEW to include allowed_payment_methods
-- (view was defined in migration 038 without this column)
DROP VIEW IF EXISTS public.stores;
CREATE VIEW public.stores AS
  SELECT
    id::TEXT as id,
    name,
    code,
    store_code,
    phone,
    email,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    timezone,
    currency,
    status,
    store_type,
    active,
    upi_vpa,
    scan_lookup_v2_enabled,
    address,
    contact_name,
    contact_phone,
    contact_email,
    location,
    pos_device_id,
    kyc_status,
    upi_vpa_updated_at,
    upi_vpa_updated_by,
    allowed_payment_methods,
    created_at,
    updated_at
  FROM platform.stores;

COMMIT;
