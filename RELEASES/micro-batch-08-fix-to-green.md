# MICRO-BATCH-08 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `1436583` (MICRO-BATCH-07) |
| **Batch** | MICRO-BATCH-08: SuperAdmin — Fetch + UX Polish |
| **Issues Covered** | ISSUE-MICRO-060, 061, 063, 064, 086, 081 |
| **Severity** | P2: 6 (1 deferred) |

---

## Files Changed

| File | What |
|------|------|
| `supermandi-superadmin/src/App.tsx` | 4 fixes (060, 061, 064, 086) |
| `supermandi-superadmin/src/api/authToken.ts` | 1 fix (081) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-060 (P2): In-flight refs guard incomplete — no visual indicator
- **Axis:** D (State)
- **Root Cause:** `eventsInFlightRef` (line 601) silently prevents duplicate event fetches but shows no UI feedback. Users see no indication that data is being refreshed — the "Last refresh" timestamp updates only after completion. `devicesLoading` was added in MICRO-BATCH-07 for device pagination, but the events refresh had no equivalent.
- **File:Line:** `supermandi-superadmin/src/App.tsx:598,808,829,2092`
- **Fix Applied:** (1) Added `eventsLoading` state (useState). (2) Set to `true` at start of `refreshEvents`, `false` in finally block. (3) Added "Refreshing…" text in the nav bar next to the "Last refresh" timestamp when `eventsLoading` is true.
- **Why This Is Safe:** Purely additive UI indicator. No change to fetch logic, timing, or error handling. The in-flight ref guard is unchanged. No API contract change.

### ISSUE-MICRO-061 (P2): Confusing dual pagination in events view
- **Axis:** A (UI)
- **Root Cause:** On the devices tab, two device lists are displayed adjacently: (1) "Devices (status)" — the server-side paginated device registry with edits/save, and (2) "Devices (events window)" — a summary derived from the last N events in memory. Users may confuse the two lists and expect event pagination to affect both, or vice versa.
- **File:Line:** `supermandi-superadmin/src/App.tsx:2489-2493`
- **Fix Applied:** (1) Added a horizontal rule (`<hr>`) between the device registry section and the events-derived summary. (2) Renamed "Devices (events window)" to "Device Activity (from events)". (3) Added clarifying subtitle: "derived from event log, independent of device registry above."
- **Why This Is Safe:** Purely visual/label change. No behavior change. No API contract change.

### ISSUE-MICRO-063 (P2): Missing AbortController on fetch — orphaned promises
- **Axis:** D (State)
- **Root Cause:** When user switches tabs, in-progress fetch requests from the previous tab continue to completion. Their `setState` calls update state for data the user is no longer viewing.
- **Fix Applied:** **DEFERRED.** Proper AbortController implementation requires modifying 10+ API module files (`health.ts`, `posEvents.ts`, `devices.ts`, `stores.ts`, `suppliers.ts`, `users.ts`, `settings.ts`, `audit.ts`, `documents.ts`, `ai.ts`) to accept an optional `signal` parameter and pass it to `fetch()`. This is an infrastructure-level cross-cutting change that should be done consistently across all portals, not scoped to a single-portal batch.
- **Why Deferred:** (1) In-flight refs already prevent duplicate concurrent requests. (2) `clearInterval` on tab change prevents new polling ticks. (3) Orphaned promises only update state for hidden tabs — functionally harmless. (4) Modifying 10+ API files in a batch scoped to "SuperAdmin Fetch + UX Polish" is scope creep. (5) Better suited for MICRO-BATCH-12 (Infrastructure Hardening) or a dedicated cross-cutting batch.

### ISSUE-MICRO-064 (P2): Pagination button stale total after mutation
- **Axis:** D (State)
- **Root Cause:** After `executeDeviceSave` or `executeDeviceReset` succeeds, the code updates `deviceRecords` locally (mapping the updated device into the array) but does NOT re-fetch from the server. `deviceTotal` stays at its old value. If the mutation changes whether the device matches the current server-side filter (e.g., deactivating a device when filtering for active only), the pagination shows a stale total until the next polling refresh.
- **File:Line:** `supermandi-superadmin/src/App.tsx:1816,1866`
- **Fix Applied:** Added `void refreshDevices()` after the successful local state update in both `executeDeviceSave` and `executeDeviceReset`. This re-fetches the current page from the server, updating both `deviceRecords` and `deviceTotal` to reflect the post-mutation state.
- **Why This Is Safe:** `refreshDevices()` is the same function used by polling and filter changes. The in-flight ref prevents concurrent calls. The server has already processed the PATCH, so the re-fetch returns consistent data. No API contract change.

### ISSUE-MICRO-086 (P2): QR code re-renders every 1s during enrollment
- **Axis:** A (UI)
- **Root Cause:** The enrollment timer effect sets `enrollNow` state every 1 second. Since `enrollNow` is state in the App component (4500+ lines), the entire component re-renders every second during enrollment. The `enrollmentCountdown` useMemo recalculates correctly, but `<QRCodeSVG>` (which receives unchanged props) still gets re-rendered because its parent re-renders.
- **File:Line:** `supermandi-superadmin/src/App.tsx:546-562 (new component), removed: enrollNow state, timer effect, enrollmentCountdown useMemo`
- **Fix Applied:** (1) Extracted `EnrollmentCountdown` component (defined before `App`) that manages its own `now` state + timer internally. Takes `expiresAt` as a prop and renders the countdown. (2) Removed `enrollNow` state, the timer `useEffect`, and the `enrollmentCountdown` `useMemo` from `App`. (3) Replaced `{enrollmentCountdown}` in JSX with `<EnrollmentCountdown expiresAt={enrollment.expiresAt} />`.
- **Why This Is Safe:** The 1-second re-renders now happen only inside the small `EnrollmentCountdown` component. The parent App component does not re-render. QR code and all other elements are unaffected. Countdown calculation is identical to the previous `useMemo` logic. No API contract change.

### ISSUE-MICRO-081 (P2): No request correlation ID across services
- **Axis:** B (API)
- **Root Cause:** API calls from the SuperAdmin UI don't include a correlation/trace ID header. When debugging issues across services (frontend → API gateway → backend), there's no way to correlate a request chain.
- **File:Line:** `supermandi-superadmin/src/api/authToken.ts:177-184`
- **Fix Applied:** Modified `getAuthHeaders()` to include `X-Request-ID: crypto.randomUUID()` in every request. Since all API module files (`devices.ts`, `posEvents.ts`, `health.ts`, etc.) spread `...getAuthHeaders()` into their fetch headers, every API call from SuperAdmin now includes a unique correlation ID.
- **Why This Is Safe:** `X-Request-ID` is an additive header — the backend can log it if it supports it, or ignore it. `crypto.randomUUID()` is available in all modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+). No backend changes required. No API contract change.

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

### Test 1: Events loading indicator (ISSUE-MICRO-060)
- **Step:** Events tab → change the Limit dropdown (e.g., 200 → 500) or wait for auto-refresh
- **Expected:** "Refreshing…" text appears next to "Last refresh: HH:MM:SS" in the nav bar. Disappears when fetch completes.
- **PASS/FAIL:** ___

### Test 2: Device activity section separation (ISSUE-MICRO-061)
- **Step:** Devices tab → scroll to the bottom past the device registry list
- **Expected:** Horizontal line separating the device registry from the events-derived summary. Section renamed to "Device Activity (from events)" with subtitle "derived from event log, independent of device registry above."
- **PASS/FAIL:** ___

### Test 3: Device total update after save (ISSUE-MICRO-064)
- **Step:** Devices tab → toggle a device's Active switch → Save → observe the pagination "Page X / Y (Z devices)" text
- **Expected:** Pagination total updates after save completes (re-fetches from server).
- **PASS/FAIL:** ___

### Test 4: QR code stable during countdown (ISSUE-MICRO-086)
- **Step:** Devices tab → enter a Store ID → "Create enrollment" → observe the QR code and countdown timer
- **Expected:** Countdown ticks every second. QR code does NOT flicker/re-render. (In Chrome DevTools → Rendering → Paint flashing: QR code area should NOT flash green every second.)
- **PASS/FAIL:** ___

### Test 5: Correlation ID header (ISSUE-MICRO-081)
- **Step:** Any tab → open Chrome DevTools → Network → observe any API request headers
- **Expected:** Every API request includes `X-Request-ID` header with a UUID value (e.g., `X-Request-ID: 550e8400-e29b-41d4-a716-446655440000`).
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
