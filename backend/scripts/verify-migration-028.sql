-- Migration 028 Verification Queries
-- Run after migration to verify all objects created correctly

-- =============================================================================
-- 1. Verify Tables Exist
-- =============================================================================
SELECT '=== TABLES ===' as section;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE (table_schema = 'auth' AND table_name = 'store_users')
   OR (table_schema = 'platform' AND table_name IN ('compliance_documents', 'csv_imports', 'impersonation_logs'))
ORDER BY table_schema, table_name;

-- =============================================================================
-- 2. Verify Inventory Ledger Columns Added
-- =============================================================================
SELECT '=== INVENTORY LEDGER COLUMNS ===' as section;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'inventory'
  AND table_name = 'inventory_ledger'
  AND column_name IN ('source', 'source_id');

-- =============================================================================
-- 3. Verify Unique Index for Idempotency
-- =============================================================================
SELECT '=== IDEMPOTENCY INDEX ===' as section;

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'inventory_ledger'
  AND indexname = 'inventory_ledger_source_idempotency_idx';

-- =============================================================================
-- 4. Verify Roles Created
-- =============================================================================
SELECT '=== ROLES ===' as section;

SELECT name, description, permissions
FROM auth.roles
WHERE name IN ('RETAILER_ADMIN', 'RETAILER_STAFF');

-- =============================================================================
-- 5. Verify Stores Extension Columns
-- =============================================================================
SELECT '=== STORES PORTAL COLUMNS ===' as section;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'platform'
  AND table_name = 'stores'
  AND column_name LIKE 'retailer_portal%';

-- =============================================================================
-- 6. Verify Foreign Keys
-- =============================================================================
SELECT '=== FOREIGN KEYS ===' as section;

SELECT
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('store_users', 'compliance_documents', 'csv_imports', 'impersonation_logs');

-- =============================================================================
-- 7. Check CSV Imports Index (NOT unique on sha256)
-- =============================================================================
SELECT '=== CSV IMPORTS HASH INDEX (should NOT be UNIQUE) ===' as section;

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'csv_imports'
  AND indexname = 'csv_imports_hash_idx';

-- =============================================================================
-- SUMMARY
-- =============================================================================
SELECT '=== VERIFICATION COMPLETE ===' as section;
SELECT 'If all sections show expected data, migration 028 is correctly applied.' as result;
