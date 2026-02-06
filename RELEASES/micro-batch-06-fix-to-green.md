# MICRO-BATCH-06 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `f3a5b5d` (MICRO-BATCH-05) |
| **Batch** | MICRO-BATCH-06: Supplier Portal — State + UX |
| **Issues Covered** | ISSUE-MICRO-019, 022, 050, 053, 054, 055, 052, 089 |
| **Severity** | P1: 2, P2: 6 (1 already handled) |

---

## Files Changed

| File | What |
|------|------|
| `supplier-portal/src/app/(dashboard)/products/page.tsx` | SPA navigation unsaved warning (019) |
| `supplier-portal/src/app/(dashboard)/orders/page.tsx` | Body scroll lock on modal (022) |
| `supplier-portal/src/lib/auth.tsx` | Refresh failure warning (050), idle timeout warning (055) |
| `supplier-portal/src/app/(dashboard)/kyc/page.tsx` | Stale IFSC lookup guard (054) |
| `supplier-portal/src/app/(dashboard)/earnings/page.tsx` | Payout modal loading message (052) |
| `supplier-portal/src/app/(dashboard)/layout.tsx` | Body scroll lock on layout modals (089) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-019 (P1): Unsaved form data lost on route navigation
- **Axis:** D (State)
- **Root Cause:** `beforeunload` handler only catches browser refresh/close. Next.js client-side navigation (sidebar Link clicks) bypasses it, silently discarding form data.
- **File:Line:** `supplier-portal/src/app/(dashboard)/products/page.tsx:193-203`
- **Fix Applied:** Added `useEffect` that monkey-patches `history.pushState` when `hasUnsavedChanges && showForm` are both true. When a sidebar Link triggers SPA navigation, `window.confirm` asks the user to confirm. On cleanup, the original `pushState` is restored. Does NOT patch `replaceState` (used by pagination URL sync from ISSUE-MICRO-005).
- **Why This Is Safe:** Guard only activates when the product form is open AND has unsaved changes. Pagination continues to work (uses `router.replace` → `replaceState`). Original `pushState` is restored on cleanup. No API contract change.

### ISSUE-MICRO-022 (P1): Modal body scrolls page behind backdrop
- **Axis:** A (UI)
- **Root Cause:** Order details modal uses `fixed inset-0` backdrop but doesn't lock body scroll. Page content scrolls behind the modal when user scrolls at modal edges.
- **File:Line:** `supplier-portal/src/app/(dashboard)/orders/page.tsx:2,191-195`
- **Fix Applied:** (1) Added `useEffect` import. (2) Added `useEffect` that sets `document.body.style.overflow = 'hidden'` when `selectedOrder` is truthy. Cleanup restores `overflow = ''`.
- **Why This Is Safe:** Effect only runs when modal is open. Cleanup runs on modal close or component unmount. No API contract change.

### ISSUE-MICRO-050 (P2): Auth token refresh — no retry UX, immediate redirect
- **Axis:** C (Auth)
- **Root Cause:** `refreshAccessToken()` in `auth.tsx` returns `false` on failure, but the caller (`checkAndRefresh`) silently continues. User is unaware their session is degraded until the next API call triggers 401 → redirect to login.
- **File:Line:** `supplier-portal/src/lib/auth.tsx:3,158-167`
- **Fix Applied:** (1) Imported `react-hot-toast`. (2) In `checkAndRefresh`, after `refreshAccessToken()` returns false while auth cookie still exists, show toast: "Session refresh failed. Please save your work." Uses `hasWarnedRefresh` flag to avoid repeated warnings. Flag resets on successful refresh.
- **Why This Is Safe:** Toast is purely informational. Auth flow unchanged (401 handling still redirects to login). Warning only shown once per failure cycle. No API contract change.

### ISSUE-MICRO-053 (P2): Dashboard stats inaccurate for >100 products
- **Axis:** E (Scale)
- **Root Cause:** Dashboard fetches products with `limit: 100` and calculates stats client-side. If supplier has >100 products, counts are wrong.
- **File:Line:** `supplier-portal/src/app/(dashboard)/dashboard/page.tsx:52-82`
- **Fix Applied:** **ALREADY HANDLED.** `GL-CRIT-0099` at line 70 documents that the code already uses `getDashboardStats()` as the primary source for accurate server-side counts. The client-side calculation is only a fallback when the stats endpoint fails, and it already uses `pagination.total` for total count. No changes needed.
- **Why This Is Safe:** No changes needed.

### ISSUE-MICRO-054 (P2): IFSC verification race — old lookup overwrites new
- **Axis:** D (State)
- **Root Cause:** When user clicks "Verify IFSC" twice rapidly (changing the code between clicks), the older request's `onSuccess` can return after the newer one, overwriting the correct result with stale data.
- **File:Line:** `supplier-portal/src/app/(dashboard)/kyc/page.tsx:42,85-98,133`
- **Fix Applied:** (1) Added `latestIfscRef = useRef('')` to track the latest requested IFSC code. (2) In `handleIFSCLookup`, sets `latestIfscRef.current = ifsc` before calling `mutate()`. (3) In `onSuccess` and `onError` callbacks, checks `if (ifscCode !== latestIfscRef.current) return` — stale results are silently ignored.
- **Why This Is Safe:** Uses React Query's `onSuccess(data, variables)` pattern where `variables` is the IFSC string. Ref is always up-to-date (no stale closure). Only the latest request's result is applied. No API contract change.

### ISSUE-MICRO-055 (P2): Idle timeout logout without warning — form data lost
- **Axis:** C (Auth)
- **Root Cause:** Idle check interval at line 119 calls `logout()` immediately when `elapsed > IDLE_TIMEOUT_MS`. No warning before logout. User loses unsaved form data.
- **File:Line:** `supplier-portal/src/lib/auth.tsx:121-140`
- **Fix Applied:** Added `IDLE_WARNING_MS = IDLE_TIMEOUT_MS - 5 * 60 * 1000` (25 minutes). In the idle check interval, when elapsed crosses the warning threshold but is still under the timeout, shows a toast: "Your session will expire in 5 minutes due to inactivity. Click anywhere to stay logged in." Uses `hasWarnedIdle` flag to avoid repeated warnings. Flag resets when user becomes active.
- **Why This Is Safe:** Warning is a toast notification — does not block or change auth flow. Timeout and logout behavior unchanged. User still gets logged out at 30 minutes, but now gets a 5-minute warning. No API contract change.

### ISSUE-MICRO-052 (P2): Payout modal stuck loading on slow network
- **Axis:** A (UI)
- **Root Cause:** Payout details modal shows only a spinner when loading order breakdown. No text indication of what's happening. On slow networks, user sees an unlabeled spinner with no context.
- **File:Line:** `supplier-portal/src/app/(dashboard)/earnings/page.tsx:330-334`
- **Fix Applied:** Changed spinner `div` from single element to `flex-col` layout with loading message: "Loading order details..." shown below the spinner. Modal remains closeable via backdrop/✕/Close button.
- **Why This Is Safe:** Purely visual change. No behavior change. Modal close mechanisms unchanged. No API contract change.

### ISSUE-MICRO-089 (P2): Modal body scroll not locked during open state
- **Axis:** D (State)
- **Root Cause:** Logout confirmation modal and email verification modal in the dashboard layout don't lock body scroll. Page content scrolls behind the backdrop.
- **File:Line:** `supplier-portal/src/app/(dashboard)/layout.tsx:30-39`
- **Fix Applied:** Added `useEffect` that sets `document.body.style.overflow = 'hidden'` when either `showLogoutConfirm` or `showVerificationModal` is true. Cleanup restores `overflow = ''`. Moved state declarations to ensure correct ordering (all `useState` before `useEffect`).
- **Why This Is Safe:** Effect only runs when modals are open. Cleanup runs on modal close or unmount. No API contract change.

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

### Test 1: SPA navigation unsaved warning (ISSUE-MICRO-019)
- **Step:** Open Products page → click "Add Product" → type a product name → click "Orders" in sidebar
- **Expected:** `window.confirm` dialog: "You have unsaved changes. Are you sure you want to leave?" Cancel stays on page. OK navigates away.
- **PASS/FAIL:** ___

### Test 2: Browser refresh unsaved warning (ISSUE-MICRO-019, existing)
- **Step:** Products page → "Add Product" → type a name → press F5
- **Expected:** Browser shows "Leave site? Changes you made may not be saved" dialog.
- **PASS/FAIL:** ___

### Test 3: Order modal scroll lock (ISSUE-MICRO-022)
- **Step:** Orders page → "View Details" on an order with many items → try scrolling the page behind the modal
- **Expected:** Page behind modal does not scroll. Only the modal content scrolls.
- **PASS/FAIL:** ___

### Test 4: IFSC lookup race (ISSUE-MICRO-054)
- **Step:** KYC page → Bank tab → enter IFSC "HDFC0001234" → click "Verify IFSC" → immediately change to "SBIN0001234" → click "Verify IFSC" again
- **Expected:** Only the second lookup result (SBI) is shown. The first result (HDFC) is discarded even if it returns late.
- **PASS/FAIL:** ___

### Test 5: Idle timeout warning (ISSUE-MICRO-055)
- **Step:** Login to supplier portal → wait 25 minutes without any activity
- **Expected:** Toast notification: "Your session will expire in 5 minutes due to inactivity. Click anywhere to stay logged in." Activity after toast resets the timer.
- **PASS/FAIL:** ___

### Test 6: Payout modal loading message (ISSUE-MICRO-052)
- **Step:** Earnings page → click on a payout → observe loading state
- **Expected:** Spinner shown with text "Loading order details..." below it.
- **PASS/FAIL:** ___

### Test 7: Layout modal scroll lock (ISSUE-MICRO-089)
- **Step:** Click "Logout" in sidebar → try scrolling the page behind the confirmation modal
- **Expected:** Page behind modal does not scroll.
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
