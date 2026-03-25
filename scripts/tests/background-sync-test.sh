#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0653 — Background Sync Reliability Test Plan
# ────────────────────────────────────────────────────────────────
# Documents test scenarios for POS background sync reliability:
# app backgrounding, force-close recovery, and data integrity.
#
# Usage:  bash scripts/tests/background-sync-test.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'DOCS'
================================================================
  BACKGROUND SYNC RELIABILITY TEST PLAN — SuperMandi POS
================================================================

OVERVIEW
--------
The POS app performs background sync for:
  - Product catalog updates (server → device)
  - Completed sale uploads (device → server)
  - Inventory adjustments (bidirectional)
  - Settings/config changes (server → device)

This test plan validates sync reliability under adverse conditions.

================================================================
  TEST SCENARIO 1: App Backgrounded During Product Sync
================================================================

  Precondition:
    - Device has 5,000+ products cached locally
    - Server has 200 new/updated products pending sync
    - App is on Sell screen (active session)

  Steps:
    1. Trigger product sync (pull-to-refresh or auto-sync timer)
    2. Wait 2 seconds (sync partially complete)
    3. Press HOME button to background the app
    4. Wait 30 seconds
    5. Reopen the app

  Expected:
    - App resumes without crash
    - Sync resumes from where it left off (not from scratch)
    - No duplicate products in local DB
    - Product count matches server after sync completes

  Verification queries:
    -- Check local product count
    SELECT COUNT(*) FROM products WHERE store_id = '<test_store>';

    -- Check for duplicates
    SELECT barcode, COUNT(*) as cnt FROM products
    WHERE store_id = '<test_store>'
    GROUP BY barcode HAVING cnt > 1;

    -- Check sync status
    SELECT * FROM sync_metadata
    WHERE entity = 'products' AND store_id = '<test_store>';

================================================================
  TEST SCENARIO 2: App Killed During Sale Upload
================================================================

  Precondition:
    - Device has 3 completed sales in offline queue
    - Network is available

  Steps:
    1. Ensure offline sale queue has pending uploads
    2. Trigger sync (auto or manual)
    3. While sync is in progress, force-kill the app:
       adb shell am force-stop com.supermandi.pos
    4. Wait 5 seconds
    5. Reopen the app

  Expected:
    - App reopens to login/PIN screen
    - After login, offline queue still shows unsync'd sales
    - Sales that were fully uploaded before kill are NOT re-uploaded
    - Sales partially uploaded are retried (idempotent — no double charges)
    - Server has no duplicate sale records

  Verification queries:
    -- Check server-side sales
    SELECT sale_id, created_at, total_amount, status
    FROM sales WHERE store_id = '<test_store>'
    ORDER BY created_at DESC LIMIT 10;

    -- Check for duplicate sales (same items, same time window)
    SELECT sale_id, total_amount, COUNT(*) as cnt
    FROM sales WHERE store_id = '<test_store>'
      AND created_at > NOW() - INTERVAL '1 hour'
    GROUP BY sale_id, total_amount HAVING cnt > 1;

    -- Check idempotency keys
    SELECT * FROM idempotency_keys
    WHERE entity = 'sale' AND store_id = '<test_store>'
    ORDER BY created_at DESC LIMIT 10;

================================================================
  TEST SCENARIO 3: Resume After Force-Close
================================================================

  Precondition:
    - App has been running for 10+ minutes
    - Multiple sync cycles have completed
    - Some data is pending upload

  Steps:
    1. Note current sync state (last sync timestamp)
    2. Force-close app: adb shell am force-stop com.supermandi.pos
    3. Wait 10 seconds
    4. Reopen app and login
    5. Check sync state

  Expected:
    - Last successful sync timestamp is preserved
    - Pending uploads are retried
    - No data corruption in local SQLite/AsyncStorage
    - App does NOT do a full re-sync (incremental from last checkpoint)

  Verification:
    -- Check AsyncStorage for sync state
    adb shell run-as com.supermandi.pos \
      cat databases/RKStorage | strings | grep sync

    -- Check sync checkpoint
    SELECT * FROM sync_checkpoints WHERE store_id = '<test_store>';

================================================================
  TEST SCENARIO 4: Network Loss During Sync
================================================================

  Precondition:
    - Sync is in progress (products downloading)
    - Device has active WiFi connection

  Steps:
    1. Start product sync
    2. After 3 seconds, disable WiFi:
       adb shell svc wifi disable
    3. Wait for sync error/timeout (should be < 30s)
    4. Re-enable WiFi:
       adb shell svc wifi enable
    5. Wait for auto-retry (or trigger manual sync)

  Expected:
    - Sync fails gracefully (no crash, shows retry UI)
    - Partial data is preserved (not rolled back)
    - Auto-retry kicks in within 60 seconds of network restoration
    - Final state: all products synced, no corruption

================================================================
  TEST SCENARIO 5: Concurrent Sync Conflicts
================================================================

  Precondition:
    - Two POS devices logged into same store
    - Both performing sales simultaneously

  Steps:
    1. Device A: complete sale (offline)
    2. Device B: complete sale (offline)
    3. Both devices come online simultaneously
    4. Both trigger sync

  Expected:
    - No sale overwrites or lost sales
    - Both sales appear on server
    - Inventory decrements are additive (not last-write-wins)
    - Conflict resolution follows store_id + device_id scoping

================================================================
  AUTOMATED VERIFICATION SCRIPT
================================================================

  After each test scenario, run these checks:

  # 1. No orphaned records
  curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_URL/api/v1/pos/sync/status" | jq '.pendingUploads'

  # 2. Product count matches
  LOCAL=$(adb shell run-as com.supermandi.pos \
    sqlite3 databases/pos.db "SELECT COUNT(*) FROM products")
  REMOTE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_URL/api/v1/products/count" | jq '.count')
  echo "Local: $LOCAL, Remote: $REMOTE"

  # 3. No duplicate sales
  curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_URL/api/v1/admin/sales/duplicates?storeId=$STORE_ID" \
    | jq '.duplicates | length'

================================================================
  PASS CRITERIA
================================================================

  All 5 scenarios must pass:
    ✅ No crashes on any scenario
    ✅ No data loss (sales, products, inventory)
    ✅ No duplicate records on server
    ✅ Incremental sync resumes (not full re-sync)
    ✅ Sync completes within 2 minutes of network restoration
    ✅ Idempotency keys prevent double-processing

================================================================
  END OF BACKGROUND SYNC TEST PLAN
================================================================
DOCS
