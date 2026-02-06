# DEFERRED TICKETS — FIX-TO-GREEN

**Parent SHA**: `38f1541` (MICRO-BATCH-13)
**Batch**: Deferred tickets from MICRO-BATCH-07, 08, and remaining P3s
**Gate**: `pnpm -r typecheck` = 0 errors / 22 projects
**Risk**: LOW-MEDIUM — HttpOnly cookie migration is backwards-compatible (hybrid mode)

---

## Issues Summary

| # | Issue | Priority | Source | Status |
|---|-------|----------|--------|--------|
| 1 | ISSUE-MICRO-025 | P1 | BATCH-07 deferred | **FIXED** |
| 2 | ISSUE-MICRO-063 | P2 | BATCH-08 deferred | **FIXED** |
| 3 | ISSUE-MICRO-095 | P3 | Remaining P3 | **FIXED** |
| 4 | ISSUE-MICRO-096 | P3 | Remaining P3 | **FIXED** |
| 5 | ISSUE-MICRO-097 | P3 | Remaining P3 | **FIXED** |
| 6 | ISSUE-MICRO-098 | P3 | Remaining P3 | **FIXED** |
| 7 | ISSUE-MICRO-099 | P3 | Remaining P3 | **FIXED** |
| 8 | ISSUE-MICRO-093 | P3 | Remaining P3 | Already fixed (RET-AUD-040) |
| 9 | ISSUE-MICRO-094 | P3 | Remaining P3 | Already fixed (DEFAULT_ICON) |
| 10 | ISSUE-MICRO-108 | P3 | Remaining P3 | Already fixed (ISSUE-MICRO-089) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-025 (P1): SuperAdmin JWT stored in localStorage — XSS vector
- **Root Cause:** JWT stored in `localStorage` is accessible via XSS attacks
- **Fix Applied (Hybrid Mode — backwards-compatible):**
  - **Backend (`adminAuth.ts`):** On successful OTP verification, sets `admin_session` HttpOnly cookie with `secure` (production), `sameSite: 'strict'`, 24h maxAge, `/api` path. Added `/auth/logout` endpoint that clears the cookie.
  - **Backend (`adminToken.ts`):** Added `extractCookie()` helper. Middleware now checks HttpOnly cookie (Method 0) before Bearer header (Method 1) and other methods.
  - **Backend (`adminAuth.ts` `/auth/check`):** Also reads from cookie for session validation.
  - **Frontend (`authToken.ts`):** Added `credentials: 'include'` to `fetchWithTimeout` (all API calls) and all direct `fetch()` calls (send-otp, verify-otp, refresh, logout).
  - **No new dependencies.** Cookie parsing done manually (same pattern as api-gateway).
- **Why Hybrid:** localStorage write is preserved for now so existing sessions work. New logins set both cookie + localStorage. Backend accepts either. Can migrate to cookie-only later by removing localStorage writes.
- **Files:** `backend/src/routes/v1/admin/adminAuth.ts`, `backend/src/middleware/adminToken.ts`, `supermandi-superadmin/src/api/authToken.ts`

### ISSUE-MICRO-063 (P2): Missing AbortController on fetch — orphaned promises
- **Root Cause:** Tab switches leave in-flight requests running; their setState calls update hidden tabs
- **Fix Applied:**
  - **`authToken.ts`:** Added module-level `tabController` (AbortController). New `abortActiveRequests()` function aborts the current controller and creates a fresh one. `fetchWithTimeout` cascades tab-abort to each request's individual controller via event listener.
  - **`App.tsx`:** Wrapped `setTab` to call `abortActiveRequests()` on every tab change. Imported `abortActiveRequests` from authToken.
- **Why This Is Safe:** Only aborts requests from the *previous* tab. New tab's requests use the fresh controller. Requests with caller-provided signals bypass tab abort entirely. AbortError is already handled gracefully throughout the codebase (catch + ignore pattern).
- **Files:** `supermandi-superadmin/src/api/authToken.ts`, `supermandi-superadmin/src/App.tsx`

### ISSUE-MICRO-095 (P3): Bank details potentially visible in error toasts
- **Root Cause:** `toast.error(error.message)` in bank verification could expose server-side error details containing bank account info
- **Fix Applied:** Replaced raw `error.message` with generic: `'Bank verification failed. Please check your details and try again.'`
- **File:** `supplier-portal/src/app/(dashboard)/kyc/page.tsx`

### ISSUE-MICRO-096 (P3): Status filter not persisted in URL
- **Root Cause:** Status filter was `useState('all')` — lost on page refresh or back navigation
- **Fix Applied:** Read `statusFilter` from `searchParams.get('status')` (URL). Filter button click updates URL params via `router.push()`. Page resets to 1 on filter change.
- **File:** `supplier-portal/src/app/(dashboard)/products/page.tsx`

### ISSUE-MICRO-097 (P3): No error.tsx in dashboard route segments
- **Root Cause:** Only root-level `error.tsx` existed. Dashboard page errors crashed the full layout.
- **Fix Applied:** Created `supplier-portal/src/app/(dashboard)/error.tsx` — catches errors within dashboard pages, shows "Something went wrong" with Try Again button.
- **File:** `supplier-portal/src/app/(dashboard)/error.tsx` (NEW)

### ISSUE-MICRO-098 (P3): No loading.tsx for slow page transitions
- **Root Cause:** No loading fallback for Next.js route transitions within dashboard layout
- **Fix Applied:** Created `supplier-portal/src/app/(dashboard)/loading.tsx` — skeleton loading with pulse animation for page transitions.
- **File:** `supplier-portal/src/app/(dashboard)/loading.tsx` (NEW)

### ISSUE-MICRO-099 (P3): Email sent indicator misleading
- **Root Cause:** Verification modal says "Enter the 6-digit code sent to your email" but doesn't mention checking spam
- **Fix Applied:** Added note: "If you don't see the email, please check your spam or junk folder."
- **File:** `supplier-portal/src/app/(dashboard)/layout.tsx`

---

## Files Changed (7 modified, 2 new)

### Modified
- `backend/src/routes/v1/admin/adminAuth.ts` — Set HttpOnly cookie on login, add extractCookie helper, add /auth/logout, update /auth/check
- `backend/src/middleware/adminToken.ts` — Add extractCookie helper, check cookie before Bearer header
- `supermandi-superadmin/src/api/authToken.ts` — credentials: 'include', tab AbortController, abortActiveRequests
- `supermandi-superadmin/src/App.tsx` — Import abortActiveRequests, wrap setTab
- `supplier-portal/src/app/(dashboard)/kyc/page.tsx` — Sanitize bank error toast
- `supplier-portal/src/app/(dashboard)/products/page.tsx` — Sync status filter to URL params
- `supplier-portal/src/app/(dashboard)/layout.tsx` — Add spam folder note to email modal

### New
- `supplier-portal/src/app/(dashboard)/error.tsx` — Dashboard error boundary
- `supplier-portal/src/app/(dashboard)/loading.tsx` — Dashboard loading skeleton

---

## Regression Risk Assessment

| Change | Risk | Reason |
|--------|------|--------|
| HttpOnly cookie (025) | Low | Hybrid mode: both cookie + localStorage work. No new dependency. |
| Tab AbortController (063) | Very Low | Only cancels requests from previous tab. AbortError already handled. |
| Bank error sanitize (095) | None | Generic error message, no behavior change |
| Status URL sync (096) | None | Additive URL param, default unchanged |
| Dashboard error.tsx (097) | None | Additive error boundary |
| Dashboard loading.tsx (098) | None | Additive loading skeleton |
| Spam note (099) | None | Additive UI text |

---

## Blackbox Verification Tests

1. **HttpOnly cookie on login**: SuperAdmin → login with OTP → Chrome DevTools → Application → Cookies → verify `admin_session` cookie exists with HttpOnly flag
2. **Cookie auth works**: After login, clear localStorage → refresh page → should still be authenticated (cookie provides auth)
3. **Logout clears cookie**: Click logout → verify `admin_session` cookie is removed
4. **Tab change aborts requests**: Open Network tab → switch tabs rapidly → verify previous tab's requests show "(canceled)"
5. **Bank error sanitized**: Supplier KYC → submit invalid bank details → verify toast shows generic message (not raw server error)
6. **Status filter in URL**: Supplier products → click "Approved" filter → URL should show `?status=approved`. Refresh page → filter should persist.
7. **Dashboard error boundary**: Force a render error in a dashboard page → should see "Something went wrong" with Try Again button (not a full page crash)
8. **Loading skeleton**: Navigate between supplier dashboard pages → should see skeleton loading animation
9. **Email spam note**: Supplier layout → click "Verify Email" → modal should include "check your spam or junk folder" text
