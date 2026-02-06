# MICRO-BATCH-03 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `1fafd85` (MICRO-BATCH-02) |
| **Batch** | MICRO-BATCH-03: Retailer Portal — Submit + Loading Fixes |
| **Issues Covered** | ISSUE-MICRO-003, 013, 014, 015, 016, 017, 048, 084 |
| **Severity** | P0: 1, P1: 4, P2: 2, (4 already fixed) |

---

## Files Changed

| File | What |
|------|------|
| `retailer-admin/src/pages/ProductsPage.tsx` | useRef submit guard (003), error/empty state separation (048) |
| `retailer-admin/src/pages/DashboardPage.tsx` | Block modal close during save (014) |
| `retailer-admin/src/api/store.ts` | safeJson in fetchSuppliers (015) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-003 (P0): Double-click submit creates duplicate products
- **Axis:** A (UI)
- **Root Cause:** `isSubmitting` set via `useState` at line 395. React state updates are async — there's a 0-300ms window on 3G where a second click fires before `disabled={isSubmitting}` takes effect. Two POST requests create duplicate products.
- **File:Line:** `retailer-admin/src/pages/ProductsPage.tsx:391-395, 537`
- **Fix Applied:** Added `submittingRef = useRef(false)` as synchronous guard. At the top of `handleSubmit`, check `if (submittingRef.current) return` before any async work. Set `true` immediately (synchronous), cleared in `finally`. The existing `disabled={isSubmitting}` remains for UI feedback.
- **Why This Is Safe:** `useRef` is synchronous — the guard takes effect immediately on the first call, before React re-renders. The second rapid click sees `submittingRef.current = true` and returns early. No API contract change. The `finally` block ensures the ref is always cleared.

### ISSUE-MICRO-013 (P1): Loading state never clears on error
- **Axis:** A (UI)
- **Root Cause:** Audit flagged missing `finally` blocks on async loading functions.
- **File:Line:** `retailer-admin/src/pages/DashboardPage.tsx:127-142`
- **Fix Applied:** **ALREADY FIXED.** All three dashboard loaders (`loadInventory`, `loadCategories`, `loadDailySummary`) have `finally` blocks that clear their respective loading states. ProductsPage `fetchProducts` also has `finally { setIsLoading(false) }`.
- **Why This Is Safe:** Pre-existing fix. No changes needed.

### ISSUE-MICRO-014 (P1): Modal state orphaned during in-flight request
- **Axis:** D (State)
- **Root Cause:** Escape key (via `useEscapeKey` hook) and backdrop click close the category rename modal even while `handleCategoryRename` is in-flight. If the rename completes after close, the success handler updates state for a no-longer-visible modal.
- **File:Line:** `retailer-admin/src/pages/DashboardPage.tsx:52-58, 1129`
- **Fix Applied:** (1) Changed `useEscapeKey` condition from `!!editingCategory` to `!!editingCategory && !catEditSaving` — escape key disabled during save. (2) Changed backdrop `onClick` to guard with `if (!catEditSaving)` — backdrop click blocked during save.
- **Why This Is Safe:** The modal stays open while saving, preventing orphaned state. Once save completes (success or error), `catEditSaving` becomes false, and the user can close normally. No API contract change.

### ISSUE-MICRO-015 (P1): Silent JSON parse failure in fetchSuppliers
- **Axis:** B (API)
- **Root Cause:** `fetchSuppliers` at line 256 uses bare `response.json()`. If the response body is malformed (HTML error page, truncated JSON), this throws an unhandled parse error. All other fetch functions in the same file use `safeJson()`.
- **File:Line:** `retailer-admin/src/api/store.ts:256`
- **Fix Applied:** Replaced `return response.json()` with `const data = await safeJson<ApiResponse<Supplier[]>>(response); if (!data) throw new Error('Invalid response from server'); return data;` — consistent with all other functions in the file.
- **Why This Is Safe:** `safeJson` is already imported and used throughout the file. The error message matches the existing pattern. No API contract change.

### ISSUE-MICRO-016 (P1): Unconsumed response body on 409
- **Axis:** B (API)
- **Root Cause:** Audit flagged unconsumed body on 409 response causing HTTP/1.1 connection pollution.
- **File:Line:** `retailer-admin/src/pages/ProductsPage.tsx:498`
- **Fix Applied:** **ALREADY FIXED.** Line 498 already has `await response.json() // consume response body` before throwing. This was addressed when AUD-025-B (conflict resolution) was implemented.
- **Why This Is Safe:** Pre-existing fix. No changes needed.

### ISSUE-MICRO-017 (P1): Import page loading state never clears on network error
- **Axis:** A (UI)
- **Root Cause:** Audit flagged missing error handling in import upload flow.
- **File:Line:** `retailer-admin/src/pages/ImportPage.tsx:77-132`
- **Fix Applied:** **ALREADY FIXED.** Both `handleUploadAndValidate` and `handleCommit` have `finally { setIsProcessing(false) }` blocks. Error paths set `setStep('upload')` or `setStep('review')` to restore navigation state.
- **Why This Is Safe:** Pre-existing fix. No changes needed.

### ISSUE-MICRO-048 (P2): Error state and empty state collision in Products table
- **Axis:** A (UI)
- **Root Cause:** When `fetchProducts` fails, `error` is set to a non-empty string but `products` remains empty. The table shows "No products yet. Add your first product above!" — misleading when the real problem is a network error.
- **File:Line:** `retailer-admin/src/pages/ProductsPage.tsx:1503-1507`
- **Fix Applied:** Added error-aware branch: when `error` is set and products list is empty, display "Could not load products. Please try again." in red instead of the normal empty state message. Search and true-empty states remain unchanged.
- **Why This Is Safe:** Only changes the text shown when `error` is truthy AND list is empty. No API contract change. Error banner above the table still shows the specific error message.

### ISSUE-MICRO-084 (P2): Category toggle error not cleared on successful retry
- **Axis:** D (State)
- **Root Cause:** Audit flagged `catToggleError` not being cleared on retry.
- **File:Line:** `retailer-admin/src/pages/DashboardPage.tsx:49, 102`
- **Fix Applied:** **ALREADY FIXED.** Line 102 already calls `setCatToggleError(null)` at the start of every `handleCategoryToggleHidden` invocation. This was addressed by RET-AUD-040.
- **Why This Is Safe:** Pre-existing fix. No changes needed.

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

### Test 1: Double-click product create (ISSUE-MICRO-003)
- **Step:** Open product form → fill all required fields → click "Save Product" rapidly 5 times within 500ms
- **Expected:** Only 1 product created. Network tab shows exactly 1 POST request.
- **PASS/FAIL:** ___

### Test 2: Modal close during rename (ISSUE-MICRO-014)
- **Step:** Click "Edit" on a category → type new name → click "Save" → immediately press Escape or click backdrop
- **Expected:** Modal stays open while saving. Rename completes OR error shown. Modal closable after save completes.
- **PASS/FAIL:** ___

### Test 3: Supplier fetch with bad JSON (ISSUE-MICRO-015)
- **Step:** Code inspection: verify `safeJson` used at line 256 of `retailer-admin/src/api/store.ts`
- **Expected:** `safeJson<ApiResponse<Supplier[]>>(response)` present with null check
- **PASS/FAIL:** ___

### Test 4: Error state vs empty state (ISSUE-MICRO-048)
- **Step:** Load products page → disconnect network in DevTools → trigger products refresh (change category or click refresh)
- **Expected:** Red text "Could not load products. Please try again." — NOT "No products yet. Add your first product above!"
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
