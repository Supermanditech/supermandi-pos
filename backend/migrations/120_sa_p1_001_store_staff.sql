-- SA-P1-001: POS store staff table (PIN login + RBAC)

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.store_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES platform.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  pin_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('CASHIER', 'STOCK_MANAGER', 'MANAGER')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS store_staff_store_phone_uq
  ON platform.store_staff(store_id, phone);

CREATE INDEX IF NOT EXISTS store_staff_store_active_idx
  ON platform.store_staff(store_id, is_active);
