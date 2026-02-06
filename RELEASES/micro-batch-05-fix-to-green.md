# MICRO-BATCH-05 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `3ad822e` (MICRO-BATCH-04) |
| **Batch** | MICRO-BATCH-05: Supplier Portal — Critical Mutations |
| **Issues Covered** | ISSUE-MICRO-004, 005, 006, 007, 009, 018, 020, 021 |
| **Severity** | P0: 4, P1: 4, (2 already safe) |

---

## Files Changed

| File | What |
|------|------|
| `supplier-portal/src/app/(dashboard)/orders/page.tsx` | Modal close guard (004), delivered validation (020) |
| `supplier-portal/src/app/(dashboard)/products/page.tsx` | Pagination URL sync (005), delete modal guard (007) |
| `supplier-portal/src/lib/api.ts` | AbortSignal on uploads (006) |
| `supplier-portal/src/app/(dashboard)/upload/page.tsx` | Fix template category (021), wrap mutationFn (006) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-004 (P0): Modal close during in-flight mutation (Orders)
- **Axis:** A (UI)
- **Root Cause:** Backdrop click and ✕ close button close the order details modal even while `shipmentMutation`, `updateStatusMutation`, `itemStatusMutation`, or `addNoteMutation` is in-flight. Completed mutations silently update state after modal unmounts.
- **File:Line:** `supplier-portal/src/app/(dashboard)/orders/page.tsx:338-342, 351-355`
- **Fix Applied:** (1) Added `isAnyMutationPending` computed variable that tracks all four mutation states. (2) Backdrop `onClick` handler checks `if (isAnyMutationPending) return` before closing. (3) Close button (✕) `onClick` handler has the same guard. Modal stays open until mutation completes or fails.
- **Why This Is Safe:** User can still close the modal after any mutation resolves (success or error). The `onSuccess` handlers already close the modal on success. On error, toast shows and user can retry or close manually. No API contract change.

### ISSUE-MICRO-005 (P0): Pagination state lost on page refresh
- **Axis:** D (State)
- **Root Cause:** `currentPage` stored in `useState(1)` — local state lost on F5 refresh or browser back button. Suppliers with large catalogs lose their position.
- **File:Line:** `supplier-portal/src/app/(dashboard)/products/page.tsx:61, 625-651`
- **Fix Applied:** (1) Replaced `useState(1)` with `Math.max(1, parseInt(searchParams.get('page') || '1') || 1)` — currentPage is derived from URL. (2) Added `useRouter` and `usePathname` imports from `next/navigation`. (3) Added `handlePageChange(newPage)` that updates URL via `router.replace` (no history pollution). (4) Previous/Next buttons now call `handlePageChange` instead of `setCurrentPage`. (5) URL `?page=N` param persists across refresh and back-button navigation.
- **Why This Is Safe:** `useSearchParams` triggers re-render on URL change → derived `currentPage` updates → useQuery refetches with new page. Page 1 has no `?page=` param (clean URL). Existing `?action=add` param is not affected. No API contract change.

### ISSUE-MICRO-006 (P0): No abort on file uploads (CSV/KYC)
- **Axis:** A (UI)
- **Root Cause:** `uploadProductsCsv` and `uploadKycDocument` use raw `fetch()` bypassing `apiFetch` (which has AbortController). No way for callers to cancel in-flight uploads.
- **File:Line:** `supplier-portal/src/lib/api.ts:611-642, 720-753`
- **Fix Applied:** (1) Added `options?: { signal?: AbortSignal }` parameter to `uploadProductsCsv`. (2) Added `options?: { signal?: AbortSignal }` parameter to `uploadKycDocument`. (3) Both pass `signal` to their `fetch()` calls. (4) In `upload/page.tsx`, wrapped `mutationFn` as `(file: File) => uploadProductsCsv(file)` to maintain React Query type compatibility.
- **Why This Is Safe:** Second parameter is optional with default `undefined` — all existing callers continue to work. Signal defaults to `undefined` (no abort behavior unless explicitly provided). The mutation wrapper doesn't change behavior. No API contract change.

### ISSUE-MICRO-007 (P0): No debounce on delete button — double deletion
- **Axis:** A (UI)
- **Root Cause:** Delete confirmation modal's backdrop `onClick` closes the modal even while `deleteMutation.isPending`. User could dismiss during deletion, then the mutation completes silently.
- **File:Line:** `supplier-portal/src/app/(dashboard)/products/page.tsx:656-657`
- **Fix Applied:** Changed backdrop `onClick={() => setDeleteConfirm(null)}` to `onClick={() => { if (!deleteMutation.isPending) setDeleteConfirm(null); }}`. Modal stays open during deletion. The Delete button itself already has `disabled={deleteMutation.isPending}`.
- **Why This Is Safe:** User can still close modal after deletion completes (success or error). `onSuccess` already calls `setDeleteConfirm(null)`. No API contract change.

### ISSUE-MICRO-009 (P0): Table key mismatch during filter causes wrong-item edit
- **Axis:** D (State)
- **Root Cause:** Audit flagged potential React key mismatches in filtered product table.
- **File:Line:** `supplier-portal/src/app/(dashboard)/products/page.tsx:536-609`
- **Fix Applied:** **ALREADY SAFE (FALSE POSITIVE).** Table rows use `key={product.id}` — stable server-assigned UUIDs. React's reconciliation correctly tracks elements with unique stable keys, even after client-side filtering. `handleEdit(product)` passes the correct product object regardless of filter state. No DOM reuse confusion possible with UUID keys.
- **Why This Is Safe:** No changes needed.

### ISSUE-MICRO-018 (P1): Loading persists after useQuery error (spinner + retry confusion)
- **Axis:** A (UI)
- **Root Cause:** Audit flagged potential loading/error state collision in products query.
- **File:Line:** `supplier-portal/src/app/(dashboard)/products/page.tsx:78-81, 491-510`
- **Fix Applied:** **ALREADY HANDLED.** The render logic correctly checks `isLoading` first, then `isError` with a retry button, then data/empty states. React Query v5 correctly sets `isLoading=false` when `isError=true` (after retries exhausted). The existing code properly separates these states with distinct UI treatments.
- **Why This Is Safe:** No changes needed.

### ISSUE-MICRO-020 (P1): Status update without receipt quantity validation
- **Axis:** B (API)
- **Root Cause:** When marking an order as `delivered` (from `shipped` status), no validation checks if items have been received. The `shipped` → `delivered` transition goes through the `else` branch without the receipt quantity check that exists for `confirmed/pending` → `shipped`.
- **File:Line:** `supplier-portal/src/app/(dashboard)/orders/page.tsx:689-694`
- **Fix Applied:** Added `delivered` validation in the `else` branch: `if (newStatus === 'delivered')`, filter items without received quantities, show `window.confirm` warning with count of unreceived items. User can override (same UX pattern as the shipping validation at GL-CRIT-0063).
- **Why This Is Safe:** Validation is client-side only — does not block the API. User can override with confirmation. Same UX pattern as the existing shipping check. No API contract change.

### ISSUE-MICRO-021 (P1): CSV template shows wrong category names vs backend enum
- **Axis:** G (Misuse)
- **Root Cause:** Template example uses "Grocery" category which does not exist in `PRODUCT_CATEGORIES` enum. Backend may silently accept it or reject it. Suppliers using the template get wrong categories.
- **File:Line:** `supplier-portal/src/app/(dashboard)/upload/page.tsx:123, 137`
- **Fix Applied:** Changed "Grocery" to "Chawal" in both (1) the example table row and (2) the downloadable CSV template string. "Chawal" (Rice) matches the `PRODUCT_CATEGORIES` enum and is correct for "Basmati Rice 5kg".
- **Why This Is Safe:** Only changes display text and template data. No API contract change. "Chawal" is a valid category value that matches the dropdown in the products page.

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

### Test 1: Modal close blocked during mutation (ISSUE-MICRO-004)
- **Step:** Open Orders page → View Details on an order → click "Mark as Confirmed" → while "Updating..." is shown, click backdrop or ✕
- **Expected:** Modal stays open. Cannot close during mutation. Toast shows success, then modal closes automatically.
- **PASS/FAIL:** ___

### Test 2: Pagination persists on refresh (ISSUE-MICRO-005)
- **Step:** Open Products page → navigate to page 3 → note URL shows `?page=3` → press F5
- **Expected:** Page reloads showing page 3. URL still has `?page=3`. Products are from page 3.
- **PASS/FAIL:** ___

### Test 3: Pagination back-button (ISSUE-MICRO-005)
- **Step:** Products page → navigate to page 2 → go to Orders page → press browser back button
- **Expected:** Returns to Products page at page 2. URL has `?page=2`.
- **PASS/FAIL:** ___

### Test 4: Delete modal blocked during pending (ISSUE-MICRO-007)
- **Step:** Products page → click Delete on a product → in confirmation modal, click "Delete" → immediately click backdrop
- **Expected:** Modal stays open during deletion. After delete completes, modal closes automatically.
- **PASS/FAIL:** ___

### Test 5: Delivered validation (ISSUE-MICRO-020)
- **Step:** Open Orders → find a shipped order with items that have receivedQuantity=0 → click "Mark as Delivered"
- **Expected:** Confirmation dialog: "X item(s) have not been marked as received. Mark as delivered anyway?" User can confirm or cancel.
- **PASS/FAIL:** ___

### Test 6: CSV template category (ISSUE-MICRO-021)
- **Step:** Open Upload page → check example table → click "Download Template" → open CSV
- **Expected:** Category shows "Chawal" (not "Grocery") in both the table and downloaded file.
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
