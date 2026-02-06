# MICRO-BATCH-04 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `1af40c3` (MICRO-BATCH-03) |
| **Batch** | MICRO-BATCH-04: Retailer Portal — State + Auth |
| **Issues Covered** | ISSUE-MICRO-045, 046, 047, 049, 079, 044, 092 |
| **Severity** | P2: 6, P3: 1, (2 already fixed) |

---

## Files Changed

| File | What |
|------|------|
| `retailer-admin/src/lib/AuthContext.tsx` | Refresh mutex (049), abort on logout (047) |
| `retailer-admin/src/pages/ProductsPage.tsx` | AbortController (079), silent refresh (044), category URL sync (092) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-045 (P2): Stale closure in search debounce — wrong results
- **Axis:** D (State)
- **Root Cause:** Audit flagged stale closure risk in `doSearch` callback.
- **File:Line:** `retailer-admin/src/pages/DashboardPage.tsx:197-234`
- **Fix Applied:** **ALREADY FIXED.** GL-CRIT-0038 added `currentSearchRef` pattern — `currentSearchRef.current` is set before each search and checked after each response. Only the latest search result is accepted. `doSearch` uses `useCallback` with `[accessToken]` dependency. The search effect depends on `[searchQuery, doSearch]`, ensuring the closure is fresh.
- **Why This Is Safe:** Pre-existing fix. No changes needed.

### ISSUE-MICRO-046 (P2): Optimistic UI update without rollback on error
- **Axis:** D (State)
- **Root Cause:** Audit flagged potential optimistic update without rollback in category operations.
- **File:Line:** `retailer-admin/src/pages/DashboardPage.tsx:78-82, 108-112`
- **Fix Applied:** **ALREADY SAFE (FALSE POSITIVE).** Both `handleCategoryRename` (line 77: `if (response.ok)`) and `handleCategoryToggleHidden` (line 108: `if (response.ok)`) only update local state after server confirmation. These are NOT optimistic updates — they are server-confirmed mutations. No rollback needed because state is only changed on success.
- **Why This Is Safe:** Code review confirms updates are inside `if (response.ok)` blocks. No changes needed.

### ISSUE-MICRO-047 (P2): Logout doesn't cancel in-flight API requests
- **Axis:** D (State)
- **Root Cause:** When `logout()` is called, the `refreshAccessToken` fetch at line 252 continues even after state is cleared. If the refresh completes after logout, it calls `setAccessToken()` on a stale session. Also, on component unmount, orphaned promises from the refresh interval complete after the provider unmounts.
- **File:Line:** `retailer-admin/src/lib/AuthContext.tsx:197-223, 236-285`
- **Fix Applied:** (1) Added `authAbortRef = useRef<AbortController>(new AbortController())` to track in-flight auth requests. (2) In `refreshAccessToken`, pass `signal: authAbortRef.current.signal` to the `fetch()` call. (3) In `logout()`, call `authAbortRef.current.abort()` then create a new `AbortController` for the next session. (4) Added `AbortError` catch handling to silently ignore abort errors.
- **Why This Is Safe:** `AbortController.abort()` cleanly cancels the in-flight fetch. The new `AbortController` created after abort ensures the next login session gets a fresh controller. No API contract change. The `finally` block still clears `isRefreshingRef`.

### ISSUE-MICRO-049 (P2): Session refresh token race — concurrent refreshes
- **Axis:** C (Auth)
- **Root Cause:** `checkAndRefresh` runs immediately on mount AND on a 30-second interval. If the initial refresh takes longer than 30s (slow network/2G), the interval fires a second `refreshAccessToken` while the first is in-flight. The server invalidates the old refresh token on first use, so the second request fails, potentially triggering an unnecessary logout.
- **File:Line:** `retailer-admin/src/lib/AuthContext.tsx:236-285, 290-348`
- **Fix Applied:** Added `isRefreshingRef = useRef(false)` as a synchronous mutex. At the top of `refreshAccessToken`, check `if (isRefreshingRef.current) return true` (skip if already refreshing). Set `true` immediately, cleared in `finally`. Early-return paths before `try` also clear the ref.
- **Why This Is Safe:** `useRef` is synchronous — the guard takes effect immediately. Returning `true` when already refreshing tells the caller "refresh is in progress, assume it will succeed" (prevents premature logout). The `finally` block ensures the ref is always cleared. No API contract change.

### ISSUE-MICRO-079 (P2): No AbortController on API requests — orphaned promises
- **Axis:** D (State)
- **Root Cause:** `fetchProducts()` and `fetchSuppliers()` in the data loading `useEffect` don't use `AbortController`. If the component unmounts during a fetch (e.g., navigating away), the promise completes and tries to set state. Similarly, when category changes trigger a new fetch, the previous fetch response can overwrite the new one.
- **File:Line:** `retailer-admin/src/pages/ProductsPage.tsx:233-254, 257-261`
- **Fix Applied:** (1) Modified `fetchProducts` to accept `options?: { signal?: AbortSignal; silent?: boolean }` and pass `signal` to `authFetch`. (2) Modified `fetchSuppliers` to accept `signal?: AbortSignal` and pass it to `authFetch`. (3) Both functions now catch `AbortError` and return early (no error state update). (4) Initial load `useEffect` creates `AbortController`, passes signal to all fetches, returns cleanup that calls `controller.abort()`. (5) Category change `useEffect` also uses `AbortController` with cleanup.
- **Why This Is Safe:** `AbortController` is a standard Web API. The `authFetch` function already accepts `RequestInit` which includes `signal`. Abort errors are silently caught. No API contract change.

### ISSUE-MICRO-044 (P2): Scroll position lost on data refresh (large catalogs)
- **Axis:** A (UI)
- **Root Cause:** After `handleSubmit` (create/update) and `handleBulkSubmit` (bulk import), `fetchProducts()` sets `setIsLoading(true)`, which unmounts the product table and shows "Loading products..." text. When loading completes, the table re-renders from scratch at scroll position 0. Users with large catalogs lose their scroll position.
- **File:Line:** `retailer-admin/src/pages/ProductsPage.tsx:537, 336, 643`
- **Fix Applied:** Added `silent` option to `fetchProducts`. When `{ silent: true }`, the function skips `setIsLoading(true)`, keeping the existing table visible during the background refresh. Applied to all three mutation success paths: `handleSubmit` (line 537), `handleDelete` (line 336), and `handleBulkSubmit` (line 643). The `setIsLoading(false)` in `finally` is a harmless no-op when loading was never set to true.
- **Why This Is Safe:** The table remains visible during refresh. `setProducts(data.data || [])` updates in-place, and React reconciles the DOM without destroying scroll position. Initial page load and category changes still show the loading indicator (not silent). No API contract change.

### ISSUE-MICRO-092 (P3): Browser back button breaks form state (query params)
- **Axis:** A (UI)
- **Root Cause:** `selectedCategory` is local `useState` — not synced to URL. When user filters by category, navigates to another page, and hits back, the category filter resets to "all" because the URL has no memory of the previous filter.
- **File:Line:** `retailer-admin/src/pages/ProductsPage.tsx:164-188, 1424, 1436`
- **Fix Applied:** (1) Changed the search params effect to NOT delete the `category` param from URL — it persists for back-button navigation. (2) Added `handleCategorySelect(catId)` handler that updates both `selectedCategory` state and URL search params. (3) Replaced direct `setSelectedCategory` calls in category filter buttons with `handleCategorySelect`. (4) When navigating back, the browser restores the URL with `?category=X`, the search params effect reads it, and sets the correct category.
- **Why This Is Safe:** `action=create` and `search=...` params are still consumed and deleted (one-time navigation). Only `category` persists in URL. URL param changes trigger the existing category-change useEffect which fetches products. No API contract change.

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

### Test 1: Token refresh mutex (ISSUE-MICRO-049)
- **Step:** Open retailer portal in Chrome → open DevTools Network tab → throttle to "Slow 3G" → login → observe network requests for `/auth/refresh`
- **Expected:** Only 1 refresh request at a time (no concurrent /auth/refresh requests). If first refresh takes >30s, second attempt is skipped.
- **PASS/FAIL:** ___

### Test 2: Logout cancels in-flight (ISSUE-MICRO-047)
- **Step:** Open retailer portal → login → throttle to "Slow 3G" → while token refresh is in-flight (visible in Network tab), click logout
- **Expected:** Refresh request shows "(canceled)" in Network tab. No errors in console. Clean redirect to login page.
- **PASS/FAIL:** ___

### Test 3: AbortController on unmount (ISSUE-MICRO-079)
- **Step:** Open retailer portal → navigate to Products page → while products are loading, navigate back to Dashboard
- **Expected:** No errors in console. Products fetch shows "(canceled)" in Network tab. No state update on unmounted component.
- **PASS/FAIL:** ___

### Test 4: Silent refresh preserves scroll (ISSUE-MICRO-044)
- **Step:** Open Products page with >20 products → scroll down to product #15 → click Edit → change name → Save
- **Expected:** After save, product list updates in-place WITHOUT flashing "Loading products..." and WITHOUT scrolling to top. Scroll position preserved.
- **PASS/FAIL:** ___

### Test 5: Category filter persists on back button (ISSUE-MICRO-092)
- **Step:** Open Products page → click "Beverages" category filter → note URL shows `?category=...` → navigate to Dashboard → press browser back button
- **Expected:** Products page shows "Beverages" filter active (not "All"). URL still has `?category=...`.
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
