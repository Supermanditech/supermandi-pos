# MICRO-BATCH-11 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `71c8c31` (MICRO-BATCH-10) |
| **Batch** | MICRO-BATCH-11: POS — UX Polish + Edge Cases |
| **Issues Covered** | ISSUE-MICRO-070, 072, 074, 075, 100, 101, 102 |
| **Severity** | P2: 4, P3: 3 |

---

## Files Changed

| File | What |
|------|------|
| `src/stores/cartStore.ts` | Defer stock normalization to next tick on rehydration (070) |
| `src/services/printerService.ts` | Printer status check + print lock (072, 102) |
| `src/services/scan/handleScan.ts` | Storm thresholds 5→8, cooldown 1500→1000ms (074) + soft stock warning (075) |
| `src/services/syncService.ts` | Replace Date.now+Math.random with uuidv4() (100) |
| `src/screens/PaymentScreen.tsx` | navigate→replace for SuccessPrint (101) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-070 (P2): Large cart (500+ items) rehydration freezes UI
- **Axis:** E (Scale)
- **Root Cause:** `onRehydrateStorage` callback in cartStore.ts calls `normalizeItemsToStock()` synchronously during rehydration. For large carts (500+ items), this iterates through all items and calls `resolveItemAvailableStock()` for each, blocking the JS thread and causing a visible UI freeze on app startup.
- **File:Line:** `src/stores/cartStore.ts:802-821`
- **Fix Applied:** Wrapped the `normalizeItemsToStock()` call in `setTimeout(() => {...}, 0)` to defer it to the next tick. The cart items are already loaded from storage and visible; the normalization (which adjusts quantities to match current stock levels) runs asynchronously without blocking the initial render.
- **Why This Is Safe:** Cart items are displayed immediately from the persisted state. Stock normalization runs in the background — if any quantities are adjusted, the UI updates reactively via Zustand. No data loss risk: the items are in memory, and normalization only reduces quantities (never corrupts). The `recalculate()` call is also inside the deferred block, so totals are consistent after normalization completes.

### ISSUE-MICRO-072 (P2): Bluetooth printer disconnect mid-print — incomplete receipt
- **Axis:** A (UI)
- **Root Cause:** `printReceipt()` calls `Print.printAsync()` without checking `this.status.connected`. If the printer is disconnected or in error state, the print call proceeds and fails mid-print, potentially producing a partial receipt.
- **File:Line:** `src/services/printerService.ts:106-142`
- **Fix Applied:** (1) Added connection check at the top of `printReceipt()` — if `!this.status.connected`, throws with a clear error message before attempting print. (2) On print failure (catch block), updates `this.status.error` with the failure reason so subsequent calls see the error state. (3) Logs printer errors via `logPosEvent` for monitoring.
- **Why This Is Safe:** The connection check is a fast, synchronous check of local state. If connected, behavior is identical to before. The error status update is informational — it doesn't block future print attempts if the status is manually reset or re-initialized. No API contract change.

### ISSUE-MICRO-074 (P2): Storm detection false positive blocks legitimate scans
- **Axis:** G (Misuse)
- **Root Cause:** `STORM_MAX_SCANS_PER_BARCODE = 5` with `STORM_WINDOW_MS = 2000`. On budget Android phones, the barcode scanner can fire multiple callbacks per physical scan (2-3 callbacks for one scan event). With the duplicate detection window at 2000ms (ISSUE-MICRO-073), the first callback adds the item and subsequent callbacks are caught by duplicate detection — but they still increment the storm counter. 3 physical scans × 2-3 callbacks = 6-9 storm counter hits, triggering false storm detection.
- **File:Line:** `src/services/scan/handleScan.ts:58-62`
- **Fix Applied:** (1) Increased `STORM_MAX_SCANS_PER_BARCODE` from 5 to 8. With multi-callback behavior, this allows ~4 physical scans before triggering (safe margin). (2) Reduced `STORM_COOLDOWN_MS` from 1500ms to 1000ms for faster recovery after a legitimate storm trigger. The cashier can resume scanning sooner.
- **Why This Is Safe:** Two-constant change. The storm detection logic is unchanged — same `isScanStorm()` function, just wider threshold and shorter cooldown. The duplicate detection window (2000ms) still prevents actual duplicate cart additions. Storm detection remains as a second-layer defense against scanner hardware bugs. No API contract change.

### ISSUE-MICRO-075 (P2): Stock check only at payment — not at scan time
- **Axis:** A (UI)
- **Root Cause:** Stock validation via `validateCartStock()` happens at payment time. If stock is low between scan and payment, the cashier only discovers this at checkout. While `capAddQuantity()` in `addItem()` blocks items at 0 stock, there's no soft warning for low-stock items (e.g., only 2 units left).
- **File:Line:** `src/services/scan/handleScan.ts:210-220`
- **Fix Applied:** After successfully adding an item to the cart, checks `product.metadata.availableQty`. If the available quantity is ≤5 and >0, shows a `ToastAndroid` with "Low stock: only N left". This gives the cashier immediate visibility into stock levels without blocking the sale.
- **Why This Is Safe:** Display-only change — a non-blocking toast on Android. Does not affect item addition, cart logic, or payment flow. The `availableQty` field comes from the store product lookup (already in metadata). If metadata is missing or `availableQty` is null, no toast is shown. The ≤5 threshold is low enough to avoid noise on well-stocked items. No iOS equivalent (Android-only toast), consistent with other scan notifications in this codebase.

### ISSUE-MICRO-100 (P3): Weak idempotency key (Date.now + Math.random)
- **Axis:** D (State)
- **Root Cause:** `syncService.ts:35` generates pending transaction IDs as `${Date.now()}-${Math.random().toString(16).slice(2)}`. `Date.now()` has millisecond granularity (collisions possible under rapid transactions), and `Math.random()` is not cryptographically secure (predictable on some JS engines).
- **File:Line:** `src/services/syncService.ts:35`
- **Fix Applied:** Replaced with `uuidv4()` from `src/utils/uuid.ts`, which uses `Crypto.randomUUID()` (Expo's crypto module — cryptographically secure). Added `import { uuidv4 } from "../utils/uuid"`.
- **Why This Is Safe:** `uuidv4()` is already used throughout the codebase (e.g., `outbox.ts:29` for event IDs). The generated ID format changes from `timestamp-hex` to `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`, but this is an internal client-side ID used only for queue deduplication — not sent to the server as-is. Existing queued transactions with old-format IDs continue to work. No API contract change.

### ISSUE-MICRO-101 (P3): Navigation state not cleared after successful sale
- **Axis:** A (UI)
- **Root Cause:** After successful payment, `navigation.navigate("SuccessPrint", ...)` pushes the SuccessPrint screen onto the navigation stack on top of PaymentScreen. If the user presses the Android hardware back button from SuccessPrint (before tapping Skip/Done), they navigate back to a stale PaymentScreen with completed-sale state.
- **File:Line:** `src/screens/PaymentScreen.tsx:725`
- **Fix Applied:** Changed `navigation.navigate("SuccessPrint", ...)` to `navigation.replace("SuccessPrint", ...)`. This replaces PaymentScreen in the navigation stack with SuccessPrint, so there's no stale Payment screen to go back to. Combined with SuccessPrintScreenV2's `handleSkip()` which uses `navigation.reset()` to clear the stack entirely, the navigation flow is now: SellScan → Payment → (replace) SuccessPrint → (reset) SellScan.
- **Why This Is Safe:** `replace()` is a standard React Navigation API. The SuccessPrint screen receives the same params. The `finalized.current = true` guard in PaymentScreen is unchanged. The SuccessPrint screen's reset behavior is unaffected. No API contract change.

### ISSUE-MICRO-102 (P3): Print queue overflow — no backpressure on rapid reprint
- **Axis:** A (UI)
- **Root Cause:** `printerService.printReceipt()` has no protection against concurrent calls. While `SuccessPrintScreenV2.handlePrint()` has a `printStatus === "printing"` guard, other callers (or component remounts) could trigger concurrent `Print.printAsync()` calls, leading to print queue overflow or interleaved receipts.
- **File:Line:** `src/services/printerService.ts:28-33, 106-142`
- **Fix Applied:** (1) Added `printInProgress` boolean field to `PrinterService`. (2) At the top of `printReceipt()`, if `printInProgress` is true, returns `false` immediately (logs warning). (3) Sets `printInProgress = true` before print, resets in `finally` block after print completes or fails. This ensures only one print job runs at a time regardless of caller.
- **Why This Is Safe:** The print lock is service-level — applies to all callers consistently. The `finally` block ensures the lock is released even on errors or cancellations. Concurrent callers get `false` return (not an error), so they can retry later. The existing `handlePrint()` guard in SuccessPrintScreenV2 still works as a first line of defense. No API contract change.

---

## Gates Run

| Gate | Result |
|------|--------|
| `pnpm -r typecheck` | **0 errors across all 22 projects** |
| API contract changes | **None** |
| New dependencies | **None** |
| Schema changes | **None** |
| New files | **None** |

---

## Blackbox Tests (Operator-Run)

### Test 1: Large cart rehydration (ISSUE-MICRO-070)
- **Step:** Add 200+ items to cart → force-close app → reopen.
- **Expected:** App loads within 2s (no black screen or freeze). Cart items are visible immediately. Stock normalization runs in background — if any quantities change, the UI updates smoothly.
- **PASS/FAIL:** ___

### Test 2: Printer status check (ISSUE-MICRO-072)
- **Step:** If possible, disconnect BT printer → tap Print from SuccessPrint screen.
- **Expected:** Error message shown immediately (not a hang or partial print). If expo-print status shows disconnected, error is immediate. If expo-print uses system dialog, the system dialog handles the error.
- **PASS/FAIL:** ___

### Test 3: Storm detection tuning (ISSUE-MICRO-074)
- **Step:** On device, scan the same barcode 6x rapidly in 2 seconds.
- **Expected:** No storm warning. Item is added once (duplicate detection), subsequent scans show "already in cart" toast. Storm warning only triggers at 8+ rapid scans of the same barcode. After storm triggers, recovery happens after 1 second (down from 1.5s).
- **PASS/FAIL:** ___

### Test 4: Soft stock warning (ISSUE-MICRO-075)
- **Step:** Scan an item that has ≤5 units in stock (check catalog for low-stock items).
- **Expected:** Item is added to cart AND a toast shows "Low stock: only N left". Items with >5 stock show no warning. Items with 0 stock are blocked by existing cap logic.
- **PASS/FAIL:** ___

### Test 5: Idempotency key format (ISSUE-MICRO-100)
- **Step:** Complete a sale while offline → inspect the pending transaction queue via console or debugger.
- **Expected:** Transaction ID format is UUID v4 (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`), not the old `timestamp-hex` format. Sync works normally after reconnection.
- **PASS/FAIL:** ___

### Test 6: Navigation stack after sale (ISSUE-MICRO-101)
- **Step:** Complete a Cash payment → on SuccessPrint screen, press Android hardware back button.
- **Expected:** Does NOT navigate back to Payment screen. Either stays on SuccessPrint or goes to SellScan (depending on nav configuration). No stale Payment screen is accessible.
- **PASS/FAIL:** ___

### Test 7: Print lock (ISSUE-MICRO-102)
- **Step:** On SuccessPrint screen, rapidly tap Print button 5 times.
- **Expected:** Only 1 print dialog opens. Console may show `ISSUE-MICRO-102: Print already in progress, skipping` for subsequent taps.
- **PASS/FAIL:** ___

### Test 8: Full sale flow regression (critical)
- **Step:** Scan items → select Cash → Complete Payment → print/skip receipt → verify cart cleared → scan new items → test offline sale → reconnect → verify sync completes.
- **Expected:** Entire flow works as before. No regressions from MICRO-BATCH-11 changes.
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
