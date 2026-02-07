-- RO-006: Read-Only Data Audit Script
-- Run BEFORE applying migration 110 to find duplicate data that would violate constraints.
-- This script does NOT modify any data.
--
-- Usage: psql -d supermandi -f scripts/audit-store-data.sql

-- =============================================================================
-- 1. Duplicate phone numbers in platform.stores
-- =============================================================================
SELECT '=== DUPLICATE PHONES IN platform.stores ===' AS section;

SELECT phone, COUNT(*) as count, ARRAY_AGG(id::TEXT || ' (' || name || ')') as stores
FROM platform.stores
WHERE phone IS NOT NULL
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- =============================================================================
-- 2. Duplicate gst_number values in platform.stores
-- =============================================================================
SELECT '=== DUPLICATE GST_NUMBER IN platform.stores ===' AS section;

SELECT UPPER(gst_number) as gst_number, COUNT(*) as count,
       ARRAY_AGG(id::TEXT || ' (' || name || ')') as stores
FROM platform.stores
WHERE gst_number IS NOT NULL AND TRIM(gst_number) != ''
GROUP BY UPPER(gst_number)
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- =============================================================================
-- 3. Duplicate gstin values in platform.stores
-- =============================================================================
SELECT '=== DUPLICATE GSTIN IN platform.stores ===' AS section;

SELECT gstin, COUNT(*) as count,
       ARRAY_AGG(id::TEXT || ' (' || name || ')') as stores
FROM platform.stores
WHERE gstin IS NOT NULL
GROUP BY gstin
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- =============================================================================
-- 4. Duplicate phone in auth.users
-- =============================================================================
SELECT '=== DUPLICATE PHONES IN auth.users ===' AS section;

SELECT phone, COUNT(*) as count, ARRAY_AGG(id::TEXT || ' (' || name || ')') as users
FROM auth.users
WHERE phone IS NOT NULL
GROUP BY phone
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- =============================================================================
-- 5. Duplicate store_user links in auth.store_users
-- =============================================================================
SELECT '=== DUPLICATE STORE-USER LINKS ===' AS section;

SELECT store_id, user_id, COUNT(*) as count
FROM auth.store_users
GROUP BY store_id, user_id
HAVING COUNT(*) > 1;

-- =============================================================================
-- 6. Summary
-- =============================================================================
SELECT '=== SUMMARY ===' AS section;

SELECT 'platform.stores phone duplicates' as check,
       COUNT(*) as duplicate_groups
FROM (
  SELECT phone FROM platform.stores
  WHERE phone IS NOT NULL
  GROUP BY phone HAVING COUNT(*) > 1
) t
UNION ALL
SELECT 'platform.stores gst_number duplicates',
       COUNT(*)
FROM (
  SELECT UPPER(gst_number) FROM platform.stores
  WHERE gst_number IS NOT NULL AND TRIM(gst_number) != ''
  GROUP BY UPPER(gst_number) HAVING COUNT(*) > 1
) t
UNION ALL
SELECT 'auth.users phone duplicates',
       COUNT(*)
FROM (
  SELECT phone FROM auth.users
  WHERE phone IS NOT NULL
  GROUP BY phone HAVING COUNT(*) > 1
) t
UNION ALL
SELECT 'auth.store_users link duplicates',
       COUNT(*)
FROM (
  SELECT store_id, user_id FROM auth.store_users
  GROUP BY store_id, user_id HAVING COUNT(*) > 1
) t;
