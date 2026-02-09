-- SA-P1-001: Add staff_id attribution columns to sales and purchases

-- sales table exists from migration 018
ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id uuid NULL;
CREATE INDEX IF NOT EXISTS sales_staff_id_idx ON sales (staff_id) WHERE staff_id IS NOT NULL;

-- purchases table is created by ensureSchema.ts at runtime, not by migrations.
-- Guard with IF EXISTS so CI migrations don't fail on fresh DB.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchases' AND table_schema = 'public') THEN
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS staff_id uuid NULL;
    CREATE INDEX IF NOT EXISTS purchases_staff_id_idx ON purchases (staff_id) WHERE staff_id IS NOT NULL;
  END IF;
END $$;
