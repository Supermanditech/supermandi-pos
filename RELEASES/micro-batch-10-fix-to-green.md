# MICRO-BATCH-10 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `a67eaf8` (MICRO-BATCH-09) |
| **Batch** | MICRO-BATCH-10: POS — Device + Sync Safety |
| **Issues Covered** | ISSUE-MICRO-030, 031, 066, 067, 069, 076, 077, 073 |
| **Severity** | P1: 2, P2: 6 (2 already handled) |

---

## Files Changed

| File | What |
|------|------|
| `src/services/deviceSession.ts` | AsyncStorage→SecureStore auto-migration on load + security warnings (031) |
| `src/services/offline/sync.ts` | Increment attempt counter on network/server/parse errors (066, 076) |
| `src/services/scan/handleScan.ts` | Duplicate window 1000ms→2000ms (073) |
| `src/services/api/enrollApi.ts` | Add `activeDeviceCount` to enrollment response type (030) |
| `src/screens/EnrollDeviceScreen.tsx` | Multi-device warning after enrollment (030) |
| `src/services/api/apiClient.ts` | Token refresh attempt before session clear on 401 (077) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-030 (P1): Multiple devices same store — no uniqueness constraint
- **Axis:** G (Misuse)
- **Root Cause:** Multiple devices can enroll for the same store without any uniqueness check. If two phones scan the same enrollment QR code, both become active POS devices for the store, risking duplicate sales and inventory inconsistencies.
- **File:Line:** `src/services/api/enrollApi.ts:8-16`, `src/screens/EnrollDeviceScreen.tsx:407-415`
- **Fix Applied:** (1) Added optional `activeDeviceCount?: number` field to `DeviceEnrollResponse` type — the server can populate this with the number of active devices for the store. (2) After successful enrollment, if `activeDeviceCount > 1`, shows a warning alert: "This store has N active POS devices. Multiple devices on the same store may cause duplicate sales." This warns operators about the multi-device situation so they can contact SuperAdmin.
- **Why This Is Safe:** The `activeDeviceCount` field is optional — if the server doesn't include it (current behavior), no warning is shown. The warning is informational only, it doesn't block enrollment. No enrollment API contract change (field is additive). The existing `reEnrolled` flag, `deviceFingerprint` (DEV-071), and duplicate label check (GL-RJ-006) continue to work.
- **Note:** Full server-side uniqueness enforcement (rejecting duplicate enrollments) requires a backend change to the enrollment endpoint. This client-side fix provides visibility until then.

### ISSUE-MICRO-031 (P1): Token in AsyncStorage plaintext (SecureStore fallback)
- **Axis:** C (Auth)
- **Root Cause:** When SecureStore is available but empty (e.g., after app reinstall), `loadFromStorage()` falls through to AsyncStorage and reads from plaintext. When SecureStore save fails, `saveDeviceSession()` silently falls back to AsyncStorage without adequate security warning. No migration path from AsyncStorage to SecureStore.
- **File:Line:** `src/services/deviceSession.ts:60-95,133-134`
- **Fix Applied:** (1) Added auto-migration in `loadFromStorage()`: when SecureStore is available but empty, checks AsyncStorage for existing session data. If found, migrates to SecureStore and deletes from AsyncStorage. (2) When SecureStore is NOT available, logs explicit security warning: `ISSUE-MICRO-031: SecureStore not available — token stored in plaintext AsyncStorage`. (3) In `saveDeviceSession()`, when falling back to AsyncStorage, logs `ISSUE-MICRO-031: Saving to AsyncStorage (PLAINTEXT) — SecureStore unavailable or failed`.
- **Why This Is Safe:** Migration is automatic and transparent — reads from AsyncStorage, writes to SecureStore, deletes from AsyncStorage. If SecureStore write fails during migration, the session remains in AsyncStorage (no data loss). Existing devices with SecureStore sessions are unaffected. No API contract change.

### ISSUE-MICRO-066 (P2): Sync loop deadlock on batch of corrupted JSON events
- **Axis:** E (Scale)
- **Root Cause:** When `syncOutboxBatch()` encounters a server error (500), network error, or response parse error, it throws without incrementing the attempt counter for the events in the batch. The `syncOutboxWithRetry()` in syncService.ts retries with backoff, but the same events are fetched again each time. After 5 retries, the sync gives up — until the next network change re-triggers the cycle. Events that consistently cause server errors are never moved to dead letter, creating an infinite retry loop across connectivity changes.
- **File:Line:** `src/services/offline/sync.ts:44-89`
- **Fix Applied:** (1) Added `MAX_SYNC_ATTEMPTS = 10` constant. (2) After `getPendingEvents()`, extract `batchEventIds` for tracking. (3) On network error, server error (500), and response parse error: call `incrementAttempts(batchEventIds)` before throwing. (4) After incrementing, check `getExceededRetryEvents(MAX_SYNC_ATTEMPTS)` — if any events exceed 10 attempts, mark them as rejected (`max_attempts_exceeded`) via `markEventsRejected()`. This breaks the infinite loop by moving consistently-failing events to dead letter after 10 attempts.
- **Why This Is Safe:** `incrementAttempts()` and `getExceededRetryEvents()` already exist in outbox.ts (AUD-081-D FIX) but were never called from `syncOutboxBatch()`. The 10-attempt threshold is generous (allows for transient errors). Rejected events are cleaned up by the 30-day TTL from ISSUE-MICRO-026. No outbox schema change. No sync protocol change.

### ISSUE-MICRO-067 (P2): Network state change during sync — incomplete flush
- **Axis:** D (State)
- **Root Cause:** Concern that if network drops during a sync operation, events might be partially synced without proper tracking.
- **Fix Applied:** **ALREADY HANDLED.** `syncOutboxBatch()` already checks `const state = await NetInfo.fetch(); if (!state.isConnected) return 0;` at the start of each batch (line 41-42). If the network drops mid-fetch, the fetch fails with a network error that propagates up to `syncOutboxWithRetry()` which retries with exponential backoff. The `NetInfo.addEventListener` in `startAutoSync()` re-triggers sync when connectivity is restored. Server-side duplicate detection (`duplicate_ignored` status) handles re-sent events safely.
- **Why Already Handled:** Three layers of protection: (1) Per-batch network check before fetch, (2) Network error propagation + retry with backoff, (3) Server-side idempotency via duplicate detection.

### ISSUE-MICRO-069 (P2): Token revoked by admin — app unaware until next request
- **Axis:** D (State)
- **Root Cause:** If admin revokes a device token, the app only discovers this on the next API request that fails with 401.
- **Fix Applied:** **ALREADY HANDLED.** PosRootLayout (line 499-516) subscribes to `AppState.addEventListener("change")` and starts polling `fetchUiStatus()` every 60 seconds when app is active. `fetchUiStatus()` calls a protected endpoint through `apiClient.get()`. If the token is revoked, the server returns 401 → `requestJson()` handles it by calling `clearDeviceSession()` (line 296-298). On the next `loadStatus()` iteration, `getDeviceSession()` returns null → navigation is reset to `EnrollDevice` screen (lines 405-410).
- **Why Already Handled:** The 60-second ui-status polling on foreground acts as a proactive token validity check. Token revocation is detected within 60 seconds of the app being in foreground.

### ISSUE-MICRO-076 (P2): Server 500 error doesn't increment retry attempt counter
- **Axis:** D (State)
- **Root Cause:** Same as ISSUE-MICRO-066. The `!res.ok` block in `syncOutboxBatch()` throws without incrementing the attempt counter.
- **File:Line:** `src/services/offline/sync.ts:84-89`
- **Fix Applied:** Combined with ISSUE-MICRO-066. The `incrementAttempts(batchEventIds)` call is now made on all three error paths: network error, response parse error, and server error. After incrementing, exhausted events (≥10 attempts) are marked as rejected.
- **Why This Is Safe:** Same as ISSUE-MICRO-066.

### ISSUE-MICRO-077 (P2): No token refresh mechanism — requires re-enrollment
- **Axis:** C (Auth)
- **Root Cause:** When a device token expires or becomes invalid (401 `device_unauthorized`), the client immediately clears the session and forces full re-enrollment. No attempt is made to refresh the token, even if the server supports it.
- **File:Line:** `src/services/api/apiClient.ts:211-230,296-312`
- **Fix Applied:** (1) Added `attemptTokenRefresh()` function that calls `POST /api/v1/pos/token/refresh` using raw `fetch` (bypasses the `requestJson` 401 handler to avoid recursion). (2) Added `tokenRefreshInProgress` guard to prevent concurrent refresh attempts. (3) Added `lastRefreshAttemptTs` + 30-second cooldown to prevent infinite retry loops if the refreshed token is also invalid. (4) In the 401 `device_unauthorized` handler: before clearing the session, attempts token refresh. If refresh succeeds, saves new token and retries the original request. If refresh fails (endpoint doesn't exist, network error, etc.), falls back to clearing the session (current behavior).
- **Why This Is Safe:** The refresh attempt is wrapped in try-catch — any failure falls back to the existing `clearDeviceSession()` behavior. The 30-second cooldown prevents infinite retry if the refreshed token is also invalid. Uses raw `fetch` instead of `requestJson` to avoid triggering the same 401 handler. The `tokenRefreshInProgress` guard prevents concurrent refresh calls. When the backend adds the refresh endpoint, the client will automatically use it. Until then, behavior is identical to current (refresh fails → clear session → re-enroll).
- **Note:** The backend endpoint `POST /api/v1/pos/token/refresh` must be implemented for this fix to have effect. Until then, the fallback to re-enrollment is unchanged.

### ISSUE-MICRO-073 (P2): Duplicate barcode detection window too short (1000ms)
- **Axis:** D (State)
- **Root Cause:** `DUPLICATE_WINDOW_MS = 1000` at handleScan.ts line 57. On low-end Android phones (Redmi, budget devices), barcode scanner callbacks can fire twice within 1000ms due to slow JS thread processing. The second scan passes the duplicate check and adds a second unit to the cart.
- **File:Line:** `src/services/scan/handleScan.ts:57`
- **Fix Applied:** Changed `DUPLICATE_WINDOW_MS` from `1000` to `2000` (2 seconds). Updated the comment to explain the rationale.
- **Why This Is Safe:** One-line constant change. The duplicate check logic is unchanged — same `isDuplicate()` function, just a wider time window. 2000ms still allows deliberate re-scans (user waits 2 seconds between intentional scans). The per-barcode storm detection (5 scans in 2 seconds) provides an additional layer of protection. No API contract change.

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

### Test 1: SecureStore migration (ISSUE-MICRO-031)
- **Step:** On device, inspect console logs during app startup.
- **Expected:** If session was previously stored in AsyncStorage, console shows `[deviceSession] ISSUE-MICRO-031: Migrated session from AsyncStorage to SecureStore`. Subsequent restarts load from SecureStore (no migration log).
- **PASS/FAIL:** ___

### Test 2: SecureStore unavailable warning (ISSUE-MICRO-031)
- **Step:** On emulator without hardware keystore, start app and observe console.
- **Expected:** Console shows `ISSUE-MICRO-031: SecureStore not available — token stored in plaintext AsyncStorage`. On save, shows `ISSUE-MICRO-031: Saving to AsyncStorage (PLAINTEXT)`.
- **PASS/FAIL:** ___

### Test 3: Sync attempt counter on 500 errors (ISSUE-MICRO-066/076)
- **Step:** On device, create offline sales while disconnected. Before reconnecting, use DevTools to make the sync endpoint return 500 errors.
- **Expected:** After 10 failed sync attempts per event, console shows `ISSUE-MICRO-066: N event(s) exceeded 10 attempts, marked as rejected`. Events stop being retried. Other pending events are unaffected.
- **PASS/FAIL:** ___

### Test 4: Sync loop termination (ISSUE-MICRO-066)
- **Step:** Inject a corrupted event into the outbox SQLite DB. Reconnect to network and trigger sync.
- **Expected:** Corrupted events are detected and marked as corrupted (existing AUD-081-A fix). Sync loop terminates normally. No infinite loop.
- **PASS/FAIL:** ___

### Test 5: Duplicate barcode window (ISSUE-MICRO-073)
- **Step:** On low-end device, rapidly scan the same barcode twice within 1-2 seconds.
- **Expected:** Only one unit is added to the cart (second scan within 2s is suppressed). After waiting 2+ seconds, scanning the same barcode again shows "already in cart" toast.
- **PASS/FAIL:** ___

### Test 6: Multi-device enrollment warning (ISSUE-MICRO-030)
- **Step:** Enroll a second device for the same store (using the same enrollment code on a different phone or after clearing app data).
- **Expected:** If the server includes `activeDeviceCount` in the response and it's >1, an alert warns: "This store has N active POS devices." If the server doesn't include the field, no warning is shown (current behavior preserved).
- **PASS/FAIL:** ___

### Test 7: Token refresh on 401 (ISSUE-MICRO-077)
- **Step:** If the backend has `POST /api/v1/pos/token/refresh`: revoke a device token from SuperAdmin, then trigger any API call from the POS app. If the backend does NOT have the endpoint: same test — verify current behavior is preserved (session cleared, redirect to enroll).
- **Expected:** With refresh endpoint: token is refreshed silently, request retries, no re-enrollment needed. Console shows `ISSUE-MICRO-077: Token refreshed, retrying request`. Without refresh endpoint: app clears session and redirects to EnrollDevice (same as before).
- **PASS/FAIL:** ___

### Test 8: Full sale flow regression (critical)
- **Step:** Scan items → select Cash → Complete Payment → print/skip receipt → verify cart cleared → scan new items → test offline sale → reconnect → verify sync completes.
- **Expected:** Entire flow works as before. No regressions from MICRO-BATCH-10 changes.
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
