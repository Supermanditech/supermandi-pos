-- Migration: 185_migrate_ledger_source_column
-- POS-INV-003: Migrate existing [source=X] notes to proper source column
-- Safe to run multiple times (UPDATE only affects rows where source IS NULL)

BEGIN;

-- Migrate [source=POS_INVENTORY] notes to source column
UPDATE inventory.inventory_ledger
SET source = 'POS_INVENTORY',
    notes = TRIM(REPLACE(notes, '[source=POS_INVENTORY]', ''))
WHERE source IS NULL
  AND notes LIKE '%[source=POS_INVENTORY]%';

-- Migrate [source=bulk_deduction] notes to source column
UPDATE inventory.inventory_ledger
SET source = 'BULK_DEDUCTION',
    notes = TRIM(REPLACE(notes, '[source=bulk_deduction]', ''))
WHERE source IS NULL
  AND notes LIKE '%[source=bulk_deduction]%';

-- Clean up empty notes left after migration
UPDATE inventory.inventory_ledger
SET notes = NULL
WHERE notes = '';

COMMIT;
