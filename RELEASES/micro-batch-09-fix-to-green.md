# MICRO-BATCH-09 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `cb907f0` (MICRO-BATCH-08) |
| **Batch** | MICRO-BATCH-09: POS — Transaction Safety |
| **Issues Covered** | ISSUE-MICRO-027, 028, 029, 026, 032, 065, 071, 068 |
| **Severity** | P1: 5 (2 already handled), P2: 3 |

---

## Files Changed

| File | What |
|------|------|
| `src/services/offline/outbox.ts` | Dead letter TTL cleanup (026) |
| `src/services/offline/sync.ts` | Import + call cleanup during sync (026) |
| `src/services/api/apiClient.ts` | Timeout 30s→60s (032) |
| `src/screens/PaymentScreen.tsx` | Reset cart lock on failure (071), price freshness check (068) |
| `src/screens/SuccessPrintScreenV2.tsx` | Immediate sync on completion (027), offline receipt indicator (029) |
| `src/stores/cartStore.ts` | Add priceFetchedAt tracking to CartItem (068) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-027 (P1): Cart cleared before server confirmation (offline sale)
- **Axis:** D (State)
- **Root Cause:** Cart is cleared in SuccessPrintScreenV2 `handleSkip()` after payment, before the outbox event syncs to the backend. While the sale IS persisted to SQLite before cart clearing (no data loss), there was no mechanism to sync the sale to the server promptly.
- **File:Line:** `src/screens/SuccessPrintScreenV2.tsx:93`
- **Fix Applied:** Added fire-and-forget `void syncOutbox()` call in the SuccessPrintScreenV2 mount effect. As soon as the success screen loads, the outbox sync is triggered immediately — sending the sale (+ payment events) to the server ASAP rather than waiting for the next background sync cycle. If the sync fails or the device is offline, regular background sync retries automatically.
- **Why This Is Safe:** `syncOutbox()` has a `syncing` guard to prevent concurrent calls. Fire-and-forget — doesn't block the user or delay cart clearing. If it fails, the existing background sync retries. No payment flow sequence change.

### ISSUE-MICRO-028 (P1): Partial sale state not restored on app crash
- **Axis:** D (State)
- **Root Cause:** If the app crashes during a partial sale, the partial sale confirmation state should be recoverable.
- **Fix Applied:** **ALREADY HANDLED.** GO-LIVE-234 (PaymentScreen.tsx lines 576-603) saves partial sale state to storage on mount via `savePartialSaleState()`. The `updatePartialSaleConfirmed(true)` call (line 627) persists the confirmation flag. On remount after crash, `loadPartialSaleState()` (line 581) restores the state and verifies via ID matching (lines 583-592) that the saved state matches the current selection.
- **Why Already Handled:** All three requirements (save, restore, verify) are implemented by GO-LIVE-234. No changes needed.

### ISSUE-MICRO-029 (P1): Receipt printed but sale backend-rejected
- **Axis:** B (API)
- **Root Cause:** SuccessPrintScreenV2 prints the receipt without verifying the sale was confirmed by the backend. For offline sales, there is no synchronous backend confirmation available. The receipt gives no indication that the sale is pending server sync.
- **File:Line:** `src/screens/SuccessPrintScreenV2.tsx:52-55`
- **Fix Applied:** (1) Offline bill refs always start with `"OFF-"` (from `nextOfflineBillRef()`). Added detection: `const isOfflineSale = billNumber.startsWith("OFF-")`. (2) When offline, receipt now includes `"* OFFLINE SALE - PENDING SYNC *"` line between the payment mode and the separator. This tells the customer and cashier that the sale hasn't been confirmed by the server yet. (3) Combined with ISSUE-MICRO-027's immediate sync trigger, the sale is synced ASAP — but if still pending when receipt is printed, the indicator is visible.
- **Why This Is Safe:** Display-only change to receipt content. Does not change when the receipt is printed. Does not change the print flow. Online sales (no "OFF-" prefix) are unaffected. No API contract change.

### ISSUE-MICRO-026 (P1): Outbox dead letter no TTL — storage exhaustion
- **Axis:** D (State)
- **Root Cause:** `markEventsRejected()` sets `error_flag` on permanently failed events, but these events stay in the SQLite database indefinitely. Over time, accumulated dead letter events can exhaust device storage.
- **File:Line:** `src/services/offline/outbox.ts:163-181`, `src/services/offline/sync.ts:4,130`
- **Fix Applied:** (1) Added `DEAD_LETTER_TTL_DAYS = 30` constant. (2) Added `cleanupExpiredDeadLetters()` function that deletes events where `error_flag IS NOT NULL AND created_at < cutoff` (30 days ago). Returns count of deleted events for logging. (3) Called `cleanupExpiredDeadLetters()` at the start of `syncOutbox()` so cleanup runs once per sync cycle.
- **Why This Is Safe:** Only deletes events with `error_flag IS NOT NULL` (already permanently failed — corrupted or server-rejected). Events pending sync (`error_flag IS NULL`) are never touched. 30-day TTL gives ample time for admin review. Runs before sync batches, not during. No outbox schema change.

### ISSUE-MICRO-032 (P1): API timeout (30s) too short for 2G networks
- **Axis:** E (Scale)
- **Root Cause:** `API_TIMEOUT_MS = 30000` at apiClient.ts line 209 applies to ALL API requests via `AbortController.abort()` after timeout. On 2G networks (latency 400-1000ms, throughput 20-40 kbps), large sync batches or sale creation requests may not complete within 30 seconds. The timeout aborts the request and the caller sees a network error.
- **File:Line:** `src/services/api/apiClient.ts:209`
- **Fix Applied:** Changed `API_TIMEOUT_MS` from `30000` to `60000` (60 seconds).
- **Why This Is Safe:** One-line constant change. No behavior change beyond timeout duration. The AbortController pattern is unchanged. 60 seconds is a standard mobile API timeout for developing markets. No API contract change.

### ISSUE-MICRO-065 (P2): Double-tap payment guard — verify edge cases
- **Axis:** A (UI)
- **Root Cause:** The double-tap guard at line 638 uses `submittingRef` (useRef) for synchronous checking. Concern: do early returns within the `try` block (UPI validation at lines 646-652) leave `submittingRef.current = true`, blocking future payment attempts?
- **Fix Applied:** **ALREADY HANDLED.** The `finally` block at lines 752-758 correctly resets `submittingRef.current = false` (when `!finalized.current`). In JavaScript, `finally` ALWAYS executes after `return` within a `try` block. So the early returns at lines 647 ("UPI Offline") and 651 ("UPI Error") DO trigger the finally block, which resets the guard. The user can retry after the alert is dismissed.
- **Why Already Handled:** JavaScript's `try/return/finally` semantics guarantee the guard is reset on all exit paths. The `if (!finalized.current)` check correctly distinguishes between failure (reset) and success (keep locked).

### ISSUE-MICRO-071 (P2): Cart lock timeout not reset after payment failure
- **Axis:** D (State)
- **Root Cause:** Cart is locked on PaymentScreen mount (`lockCart()` in useEffect at line 203). `lockedAt` is set to `Date.now()` at mount time. If the user spends 4 minutes making a payment that fails, they only have 1 minute left on the 5-minute timeout before auto-unlock. On retry, the cart might auto-unlock mid-payment if the user has been on the screen for >5 minutes total.
- **File:Line:** `src/screens/PaymentScreen.tsx:708`
- **Fix Applied:** Added `lockCart()` call at the top of the `catch` block in `handleCompletePayment()`. This re-invokes `lockCart()` which resets `lockedAt` to `Date.now()`, giving the user a fresh 5-minute window for their retry attempt.
- **Why This Is Safe:** `lockCart()` is idempotent — calling it when already locked just resets `lockedAt`. The cart remains locked. The 5-minute timeout restarts from the failure moment. The cleanup in `useEffect` (line 205-206) still unlocks on unmount. No API contract change.

### ISSUE-MICRO-068 (P2): Price race between catalog update and sale creation
- **Axis:** B (API)
- **Root Cause:** `updatePrice()` in cartStore.ts accepts prices without checking when they were last fetched from the catalog. If catalog prices change between scan and payment, the cart may contain stale prices. No mechanism to detect or warn about stale prices.
- **File:Line:** `src/stores/cartStore.ts:23`, `src/stores/cartStore.ts:333,344,491`, `src/screens/PaymentScreen.tsx:5,175,637-654`
- **Fix Applied:** (1) Added `priceFetchedAt?: number` field to `CartItem` interface — optional for backward compatibility with existing persisted carts. (2) Set `priceFetchedAt: Date.now()` in `addItem()` for both new and existing items (price comes from current catalog state). (3) Set `priceFetchedAt: Date.now()` in `updatePrice()`. (4) Added `PRICE_FRESHNESS_THRESHOLD_MS = 4 hours` constant in PaymentScreen. (5) Added `priceWarningDismissedRef` to track if warning was dismissed. (6) In `handleCompletePayment()`, before payment submission, checks if any cart items have prices older than 4 hours and shows a confirmation dialog. User can dismiss once to proceed.
- **Why This Is Safe:** `priceFetchedAt` is optional — old carts without it work fine (items without `priceFetchedAt` don't trigger the warning). The check only warns, never blocks — user can always proceed. The 4-hour threshold is generous (covers typical catalog sync cycles). No sale creation API change. No outbox schema change. The warning uses the same `Alert.alert` + ref pattern as the existing partial sale confirmation (proven pattern in this codebase).

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

### Test 1: Dead letter TTL cleanup (ISSUE-MICRO-026)
- **Step:** On device with the POS app, trigger a sync (ensure some dead letter events exist or have existed). Check console logs.
- **Expected:** On sync, log message: `[Outbox] ISSUE-MICRO-026: Cleaned up N dead letter events older than 30 days` (if any exist). No pending events are deleted.
- **PASS/FAIL:** ___

### Test 2: API timeout (ISSUE-MICRO-032)
- **Step:** On device, open Chrome DevTools / React Native debugger → Network tab → trigger an API call (e.g., scan a product)
- **Expected:** No timeout error occurs within 30-60 seconds on slow networks. Timeout only triggers after 60 seconds.
- **PASS/FAIL:** ___

### Test 3: Cart lock reset on payment failure (ISSUE-MICRO-071)
- **Step:** On device, scan items → go to Payment → disconnect network → attempt Cash payment → observe error → wait 2 minutes → attempt payment again
- **Expected:** Payment retry works without "cart unlocked" warnings. Cart remains locked throughout. The 5-minute timeout restarted from the failure moment.
- **PASS/FAIL:** ___

### Test 4: Immediate sync on sale completion (ISSUE-MICRO-027)
- **Step:** On device, scan items → complete Cash payment → observe console logs on success screen
- **Expected:** Console shows `[Sync]` log entries immediately after success screen loads (sync triggered without waiting for next background cycle). If offline, sync will retry on reconnect.
- **PASS/FAIL:** ___

### Test 5: Offline receipt indicator (ISSUE-MICRO-029)
- **Step:** On device, disconnect network → scan items → complete Cash payment (offline) → print receipt
- **Expected:** Receipt includes line `* OFFLINE SALE - PENDING SYNC *` between the payment mode and the separator. Bill number starts with "OFF-". When online, this line does NOT appear.
- **PASS/FAIL:** ___

### Test 6: Price freshness warning (ISSUE-MICRO-068)
- **Step:** On device, scan items → leave app idle for >4 hours (or set device clock forward 5 hours) → go to Payment → tap Complete Payment
- **Expected:** Warning dialog: "Price Freshness Warning — N item(s) have prices loaded over 4 hours ago. Prices may have changed. Proceed with current prices?" with Cancel/Proceed buttons. Tapping Proceed completes payment. Warning only shows once per payment session.
- **PASS/FAIL:** ___

### Test 7: Full sale flow regression (critical)
- **Step:** Scan items → select Cash → Complete Payment → print/skip receipt → verify cart cleared → scan new items
- **Expected:** Entire flow works as before. No regressions from MICRO-BATCH-09 changes.
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
