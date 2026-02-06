# MICRO-BATCH-07 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `eb7786f` (MICRO-BATCH-06) |
| **Batch** | MICRO-BATCH-07: SuperAdmin — Pagination + State |
| **Issues Covered** | ISSUE-MICRO-023, 024, 025, 056, 057, 058, 059, 062 |
| **Severity** | P1: 3 (1 deferred), P2: 5 |

---

## Files Changed

| File | What |
|------|------|
| `supermandi-superadmin/src/App.tsx` | All 7 fixes (023, 024, 056, 057, 058, 059, 062) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-023 (P1): Device pagination not reset on filter change
- **Axis:** D (State)
- **Root Cause:** `useEffect` at line 1393 resets `page` (events page) when `deviceIdFilter`, `storeIdFilter`, or `eventTypeFilter` change, but does NOT reset `devicePage`. When user changes a filter, device pagination stays on the old page, potentially showing empty results.
- **File:Line:** `supermandi-superadmin/src/App.tsx:1405-1413`
- **Fix Applied:** (1) Added `setDevicePage(0)` to the existing page-reset effect. (2) Added a new debounced effect (300ms) that calls `refreshDevices(0)` when `deviceIdFilter` or `storeIdFilter` change while on the devices tab. This combines with ISSUE-MICRO-058 for debounced server-side filter refresh.
- **Why This Is Safe:** `setDevicePage(0)` is immediate (UI shows page 1). API call is debounced. Only fires on devices tab. No API contract change.

### ISSUE-MICRO-024 (P1): Auto-refresh stale closure captures filter state
- **Axis:** D (State)
- **Root Cause:** The polling `useEffect` (dependency: `[tab]`) captures refresh functions from the render when `tab` last changed. If user changes filters or pagination after that, the interval callback calls stale functions with old filter/page values. Data refreshes with wrong parameters on each 60s poll tick.
- **File:Line:** `supermandi-superadmin/src/App.tsx:604,1322,1353-1365`
- **Fix Applied:** (1) Added `refreshRef` (useRef) to hold latest refresh function references. (2) Assignment `refreshRef.current = { refreshHealth, refreshEvents, ... }` runs on every render (before the polling effect). (3) Modified the `setInterval` callback to call `refreshRef.current.refreshXxx?.()` instead of directly calling the closure-captured functions. Initial fetch on tab change still uses closure (correct, since effect re-runs on tab change).
- **Why This Is Safe:** Ref pattern is a standard React stale closure fix. Initial fetch unchanged. Polling always uses latest functions. No API contract change.

### ISSUE-MICRO-025 (P1): JWT stored in localStorage — XSS vector
- **Axis:** C (Auth)
- **Root Cause:** `authToken.ts` stores JWT in localStorage (line 36, 59-60, 282-283). Any XSS exploit can read the token.
- **Fix Applied:** **DEFERRED.** Migration to HttpOnly cookies requires backend changes (Set-Cookie header from auth endpoints, cookie parsing middleware, CSRF protection). This is out of scope for a frontend-only batch. The safety rules explicitly state: "MUST NOT change: Backend API (devices, events), auth flow" and "Requires migration: No (JWT→HttpOnly requires backend change)."
- **Why Deferred:** Backend must set HttpOnly cookies on login/refresh endpoints. Frontend-only change cannot achieve this. Tracked for a future backend batch.

### ISSUE-MICRO-056 (P2): Device page button double-click race — page mismatch
- **Axis:** A (UI)
- **Root Cause:** Pagination Prev/Next buttons are only disabled based on page bounds (page 0, last page). During fetch, buttons remain clickable, allowing double-clicks that queue conflicting page changes.
- **File:Line:** `supermandi-superadmin/src/App.tsx:651,830,847,2443-2448`
- **Fix Applied:** (1) Added `devicesLoading` state (useState). (2) Set to `true` at start of `refreshDevices`, `false` in finally block. (3) Added `|| devicesLoading` to both Prev and Next button disabled conditions. (4) Button text shows "Loading…" during fetch.
- **Why This Is Safe:** Purely additive UI guard. No behavior change when not loading. No API contract change.

### ISSUE-MICRO-057 (P2): Device edits lost when filter toggles back
- **Axis:** D (State)
- **Root Cause:** The `deviceEdits` rebuild effect (triggered by `deviceRecords` change) has a delete loop that removes edits for devices no longer in the current page. When user paginates or filters, devices leave the current page and their unsaved edits are deleted. If user navigates back, edits are gone.
- **File:Line:** `supermandi-superadmin/src/App.tsx:1429-1432`
- **Fix Applied:** Removed the delete loop. Edits for non-visible devices are harmless (small in-memory map) and will be correctly applied if the device reappears. New devices are still initialized when they first appear in the current page.
- **Why This Is Safe:** Removing the cleanup only affects memory (minor — device edit objects are small). Initialization logic unchanged. No API contract change.

### ISSUE-MICRO-058 (P2): No debounce on filter inputs — N API calls per keystroke
- **Axis:** E (Scale)
- **Root Cause:** Filter inputs fire `setDeviceIdFilter` / `setStoreIdFilter` on every keystroke. For device tab, each filter change should trigger a server-side refresh. Without debounce, N keystrokes = N API calls.
- **File:Line:** `supermandi-superadmin/src/App.tsx:1413-1419`
- **Fix Applied:** Added a debounced `useEffect` that calls `refreshDevices(0)` after 300ms of filter inactivity. Only fires when on the devices tab. Timer is cleared on each keystroke (standard debounce pattern via cleanup function). Combined with ISSUE-MICRO-023 page reset.
- **Why This Is Safe:** Client-side filtering (events useMemo) remains immediate. Only the server-side device refresh is debounced. No API contract change.

### ISSUE-MICRO-059 (P2): Document/Audit pagination no reset on filter change
- **Axis:** D (State)
- **Root Cause:** When `auditLogsFilter` or `documentsEntityFilter` changes, the existing effects refresh data but don't reset the page to 0. If user is on page 5 and changes filter, it fetches page 5 with the new filter — which may have fewer results, showing empty or wrong data.
- **File:Line:** `supermandi-superadmin/src/App.tsx:1398-1406`
- **Fix Applied:** Added two separate effects: (1) `setAuditLogsPage(0)` on `auditLogsFilter` change. (2) `setDocumentsPage(0)` on `documentsEntityFilter` change. These trigger the existing page-dependent refresh effects.
- **Why This Is Safe:** Page reset is a state change that triggers existing refresh logic. No new API calls beyond the expected refresh. No API contract change.

### ISSUE-MICRO-062 (P2): No optimistic rollback on device toggle failure
- **Axis:** D (State)
- **Root Cause:** `executeDeviceSave` updates `deviceEdits` (draft state) optimistically when user toggles switches (active, scanLookupV2Enabled). On save failure, the error message is set but the draft is NOT rolled back. UI shows the toggled value even though the server rejected the change.
- **File:Line:** `supermandi-superadmin/src/App.tsx:1803-1812`
- **Fix Applied:** In the `catch` block of `executeDeviceSave`, after logging the error, find the original device from `deviceRecords` and reset `deviceEdits[deviceId]` to match the server state (label, deviceType, printingMode, scanLookupV2Enabled, active).
- **Why This Is Safe:** Rollback only happens on failure. Uses the same field mapping as the initialization logic in the deviceEdits rebuild effect. No API contract change.

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

### Test 1: Device pagination reset on filter (ISSUE-MICRO-023)
- **Step:** Devices tab → navigate to page 2 → type a Store ID in the filter
- **Expected:** Device pagination resets to page 1. After 300ms debounce, devices refresh with the filter applied.
- **PASS/FAIL:** ___

### Test 2: Auto-refresh uses current filters (ISSUE-MICRO-024)
- **Step:** Devices tab → set a Store ID filter → wait 60+ seconds for auto-refresh
- **Expected:** Auto-refreshed device data still reflects the current filter. Not reverted to unfiltered data.
- **PASS/FAIL:** ___

### Test 3: Pagination disabled during fetch (ISSUE-MICRO-056)
- **Step:** Devices tab → click "Next" → immediately try clicking "Prev" or "Next" again
- **Expected:** Buttons show "Loading…" and are disabled during fetch. Cannot double-click.
- **PASS/FAIL:** ___

### Test 4: Device edits preserved across filter (ISSUE-MICRO-057)
- **Step:** Devices tab → edit a device label on page 1 (don't save) → navigate to page 2 → navigate back to page 1
- **Expected:** Unsaved label edit is still present.
- **PASS/FAIL:** ___

### Test 5: Filter debounce (ISSUE-MICRO-058)
- **Step:** Devices tab → rapidly type "store-123" in Store ID filter → watch network tab
- **Expected:** Only 1 API call fires (after 300ms pause), not 9 calls (one per keystroke).
- **PASS/FAIL:** ___

### Test 6: Audit/Doc page reset on filter (ISSUE-MICRO-059)
- **Step:** Audit Logs tab → navigate to page 3 → change the Action filter
- **Expected:** Page resets to 1. Data refreshes with new filter from page 1.
- **PASS/FAIL:** ___

### Test 7: Device toggle rollback on failure (ISSUE-MICRO-062)
- **Step:** Devices tab → toggle a device's Active switch → simulate failure (disconnect network, then click Save)
- **Expected:** Error message shown. Toggle reverts to original position (matches server state).
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
