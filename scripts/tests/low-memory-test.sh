#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0654 — Low-Memory Device (2GB RAM) Test Plan
# ────────────────────────────────────────────────────────────────
# Documents test plan for POS app on 2GB RAM devices with 10K
# products: memory baselines, FlatList virtualization, chunked
# loading, and OOM prevention.
#
# Usage:  bash scripts/tests/low-memory-test.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'DOCS'
================================================================
  LOW-MEMORY DEVICE TEST PLAN — SuperMandi POS (2GB RAM / 10K Products)
================================================================

TARGET DEVICE PROFILE
---------------------
  RAM:         2 GB (typical budget Android: Redmi 9A, Samsung A03)
  Storage:     32 GB (expect 8-10 GB free after OS + apps)
  Android:     10-12 (Go Edition possible)
  Processor:   MediaTek Helio G25 or equivalent
  Products:    10,000 SKUs in store catalog

================================================================
  TEST 1: Memory Usage Baseline
================================================================

  Objective: Establish app memory footprint at rest and under load.

  Steps:
    1. Fresh install the app (clear data first)
    2. Login to test store with 10K products
    3. Wait for initial product sync to complete
    4. Measure memory:
       adb shell dumpsys meminfo com.supermandi.pos

  Expected baselines:
    - After login (no products loaded): < 80 MB total PSS
    - After full product sync:          < 150 MB total PSS
    - While browsing product list:      < 200 MB total PSS
    - Peak during search:               < 250 MB total PSS

  Record these values:
    - Java Heap (should be < 64 MB)
    - Native Heap (should be < 40 MB)
    - Graphics (should be < 30 MB)
    - Total PSS (should be < 250 MB peak)

  Automated measurement:
    for i in $(seq 1 10); do
      sleep 5
      adb shell dumpsys meminfo com.supermandi.pos \
        | grep "TOTAL PSS" | awk '{print $3}'
    done

================================================================
  TEST 2: FlatList Virtualization Verification
================================================================

  Objective: Confirm product list only renders visible items.

  Steps:
    1. Navigate to Sell screen (product catalog)
    2. Open React Native debugger (or Flipper)
    3. Scroll through the product list
    4. Monitor rendered component count

  Expected:
    - At any time, only ~20-30 product items are mounted (not 10K)
    - windowSize prop is set (recommended: 5)
    - maxToRenderPerBatch is set (recommended: 10)
    - initialNumToRender is set (recommended: 10)
    - removeClippedSubviews={true} on Android

  Verify in code:
    grep -r "windowSize\|maxToRenderPerBatch\|initialNumToRender\|removeClippedSubviews" \
      src/screens/ src/components/

  If NOT found, these props MUST be added to all FlatList/SectionList
  components that render product lists.

  Memory impact:
    Without virtualization: 10K items × ~2KB each = ~20 MB in JS heap
    With virtualization:    30 items × ~2KB each  = ~60 KB in JS heap

================================================================
  TEST 3: Product Store Chunked Loading
================================================================

  Objective: Verify products load in chunks, not all at once.

  Steps:
    1. Clear app data
    2. Login to store with 10K products
    3. Monitor network requests during initial sync:
       adb logcat | grep -i "product.*sync\|chunk\|page\|offset"
    4. Check memory during sync

  Expected:
    - Products fetched in pages of 100-500 (not all 10K at once)
    - Each chunk is written to local DB before next chunk fetched
    - Memory stays below 200 MB during sync
    - Progress indicator shows percentage
    - If app is killed during sync, resume from last chunk (not restart)

  Network verification:
    # Monitor API calls for pagination
    adb logcat -s ReactNativeJS | grep -E "page=|offset=|limit="

  DB verification:
    # Check products are being inserted incrementally
    adb shell run-as com.supermandi.pos \
      sqlite3 databases/pos.db "SELECT COUNT(*) FROM products" \
      # Run every 5 seconds during sync — count should increase gradually

================================================================
  TEST 4: Crash-on-OOM Prevention
================================================================

  Objective: App handles low memory gracefully without crashing.

  Steps:
    1. Open Android Developer Options > Memory limits
       (or use: adb shell setprop dalvik.vm.heapsize 128m)
    2. Launch SuperMandi POS
    3. Login and wait for sync
    4. Perform these actions in sequence:
       a. Browse product list (scroll 500+ items)
       b. Search for product
       c. Add 20 items to cart
       d. Open cart
       e. Navigate to payment
       f. Go back to sell screen
       g. Repeat steps a-f three times

  Expected:
    - App MUST NOT crash with OutOfMemoryError
    - If memory is critically low, app should:
      * Show a warning toast ("Low memory — performance may be reduced")
      * Release cached images/data
      * NOT lose cart contents
    - Android onTrimMemory callback should trigger cache cleanup

  OOM detection:
    # Monitor for OOM kills
    adb logcat | grep -i "out.of.memory\|lowmemory\|OOM\|GC_FOR_ALLOC"

    # Monitor for app process kills
    adb shell dumpsys activity processes | grep com.supermandi.pos

================================================================
  TEST 5: Image Loading on Low Memory
================================================================

  Objective: Product images don't consume excessive memory.

  Steps:
    1. Ensure 10K products have thumbnail images
    2. Scroll through product list rapidly
    3. Monitor image cache size

  Expected:
    - Images are loaded lazily (only visible ones)
    - Image cache has a size limit (recommended: 50 MB)
    - Old images are evicted when cache is full
    - Placeholder shown while loading (not blank space)

  Configuration to verify:
    - react-native-fast-image or expo-image with cache policy
    - Image resize mode: 'cover' with appropriate dimensions
    - No full-resolution images loaded for thumbnails

================================================================
  ANDROID DEVELOPER OPTIONS FOR SIMULATION
================================================================

  To simulate a 2GB device on a higher-RAM device:

  1. Enable Developer Options:
     Settings > About Phone > Tap Build Number 7 times

  2. Set memory limits:
     Developer Options > "Don't keep activities" — ENABLE
     Developer Options > "Background process limit" — At most 2
     Developer Options > "Limit background processes" — 2

  3. Use adb to limit heap:
     adb shell setprop dalvik.vm.heapgrowthlimit 128m
     adb shell setprop dalvik.vm.heapsize 256m

  4. Use Android Studio Profiler:
     Android Studio > View > Tool Windows > Profiler
     Select the device and app process
     Monitor Memory tab in real-time

  5. Generate memory pressure:
     # Fill device memory to trigger low-memory conditions
     adb shell dd if=/dev/urandom of=/data/local/tmp/fillmem bs=1M count=500
     # Clean up after test:
     adb shell rm /data/local/tmp/fillmem

================================================================
  PASS CRITERIA
================================================================

  All tests must pass on a 2GB RAM device (or simulated):
    ✅ Peak memory < 250 MB total PSS with 10K products
    ✅ FlatList renders only visible items (< 30 mounted)
    ✅ Product sync uses chunked loading (pages of 100-500)
    ✅ No OOM crashes after 3 full navigation cycles
    ✅ Image cache bounded (< 50 MB)
    ✅ Cart contents preserved during low-memory events
    ✅ Graceful degradation, not crashes

================================================================
  END OF LOW-MEMORY TEST PLAN
================================================================
DOCS
