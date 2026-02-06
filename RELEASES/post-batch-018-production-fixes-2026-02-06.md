# POST-BATCH-018: Production Fix Pack

**Date:** 2026-02-06
**Parent:** POST-BATCH-017 (3c50b2f)
**Type:** Production-grade fixes (5 tickets)
**Status:** CODE_COMPLETE — awaiting operator black-box verification

---

## Tickets

| # | Ticket | Priority | Portal | Status |
|---|--------|----------|--------|--------|
| 1 | FIX-001 | P1 | Landing | DONE |
| 2 | FIX-002 | P0 | SuperAdmin | DONE |
| 3 | FIX-003 | P0 | SuperAdmin | DONE |
| 4 | FIX-004 | P0 | Retailer | DONE |
| 5 | FIX-005 | P0 | Supplier | DONE |

---

## FIX-001 (P1): Landing header portal links — wrong-origin redirects

**Root cause:** Landing page at port 8084 uses relative links (`/supplier/login`, `/retailer/login`, `/admin/`) which resolve to `localhost:8084/...` instead of the correct Docker ports (8082, 8081, 8083).

**Fix:** Added JavaScript snippet to `supermandi-landing/index.html` that detects `localhost` and rewrites portal links to correct Docker ports. In production (shared domain), relative paths work unchanged.

**Files:** `supermandi-landing/index.html`

---

## FIX-002 (P0): SuperAdmin auth — polling 401 hard redirect

**Root cause:** `handle401Response()` in `authToken.ts` did `window.location.replace("/")` on ANY 401 response. Background polling (analytics, devices, audit) hit 401 → immediate hard redirect → user force-logged-out mid-session.

**Fix:**
1. `handle401Response()` now only clears tokens — no redirect
2. `refreshSession()` only clears token on confirmed 401, not transient errors
3. Token refresh in `App.tsx` tracks consecutive failures — only logs out after 2 consecutive refresh failures (was: 1)
4. All 5 API modules (analytics, ai, audit, barcodeSheets, devices) no longer call `handle401Response()` — they throw errors for the caller to handle

**Files:**
- `supermandi-superadmin/src/api/authToken.ts`
- `supermandi-superadmin/src/App.tsx`
- `supermandi-superadmin/src/api/analytics.ts`
- `supermandi-superadmin/src/api/ai.ts`
- `supermandi-superadmin/src/api/audit.ts`
- `supermandi-superadmin/src/api/barcodeSheets.ts`
- `supermandi-superadmin/src/api/devices.ts`

---

## FIX-003 (P0): SuperAdmin session persistence / auto-logout

**Root cause:** Session tokens stored in `sessionStorage` (per-tab, lost on new tab/browser restart). Plus a 5-minute buffer in `getSessionToken()` made tokens appear expired prematurely.

**Fix:**
1. All `sessionStorage` → `localStorage` (12 occurrences in authToken.ts)
2. Removed 5-minute expiry buffer — now uses exact expiry time

**Files:** `supermandi-superadmin/src/api/authToken.ts`

---

## FIX-004 (P0): Retailer Firebase Phone OTP resilience

**Root cause:** reCAPTCHA verifier expires or fails → `recaptchaVerifier` set to null → user cannot send OTP without page reload. No auto-recovery.

**Fix:**
1. Added `ensureRecaptcha()` helper — auto-recreates verifier if expired/cleared
2. reCAPTCHA `expired-callback` now auto-re-initializes instead of going null
3. `sendOtp()` calls `ensureRecaptcha()` before sending — handles all stale states
4. Added `auth/internal-error` error code handling
5. `recaptchaVerifier.clear()` calls wrapped in try-catch to prevent cleanup crashes

**Files:** `retailer-admin/src/lib/firebase.ts`

---

## FIX-005 (P0): Supplier Firebase Phone OTP resilience

**Root cause:** Same as FIX-004 (identical pattern).

**Fix:** Same pattern as FIX-004 applied to supplier portal. Also removed debug logging that leaked partial Firebase API key.

**Files:** `supplier-portal/src/lib/firebase.ts`

---

## Infrastructure Changes

### docker-compose.local-prod.yml
- `retailer-admin`: Pre-built image `:9bb03f7` → build from source with `VITE_API_BASE_URL=http://localhost:8080`
- `superadmin`: Pre-built image `:9bb03f7` → build from source with `VITE_API_BASE_URL=http://localhost:8080`
- `landing`: Pre-built image `:9bb03f7` → build from source (includes FIX-001 script)

---

## Verification Checklist (Operator)

- [ ] `docker compose -f scripts/docker-compose.local-prod.yml down`
- [ ] `docker compose -f scripts/docker-compose.local-prod.yml up -d --build`
- [ ] All 17 containers healthy
- [ ] Landing (8084): portal links navigate to correct ports
- [ ] SuperAdmin (8083/admin/): login persists across tabs + browser restart
- [ ] SuperAdmin: no auto-logout during idle (polling doesn't force redirect)
- [ ] Retailer (8081/retailer/): OTP send flow works (if Firebase domain whitelisted)
- [ ] Supplier (8082/supplier/): OTP send flow works (if Firebase domain whitelisted)

---

## Firebase Domain Note (FIX-004/005)

The code-level fixes make OTP more resilient. However, Firebase Phone Auth also requires:
1. `localhost` whitelisted in Firebase Console → Authentication → Settings → Authorized domains
2. reCAPTCHA site key registered for the testing domain

If OTP still fails with `auth/invalid-app-credential`, verify the Firebase Console domain whitelist.
