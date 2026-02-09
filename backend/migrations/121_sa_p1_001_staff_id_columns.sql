-- SA-P1-001: Add staff_id attribution columns to sales and purchases
ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id uuid NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS staff_id uuid NULL;

CREATE INDEX IF NOT EXISTS sales_staff_id_idx ON sales (staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchases_staff_id_idx ON purchases (staff_id) WHERE staff_id IS NOT NULL;
