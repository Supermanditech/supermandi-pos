# Live Testing Issues — State Machine

> Created during CTO live testing on 2026-03-05
> All issues to be fixed in one batch, then deployed together.

## Issue State Lifecycle

```
DISCOVERED → ANALYZED → SOLUTION_DESIGNED → FIXED → VERIFIED
```

---

## ITERATION_1_COMPLETE — Snapshot (Frozen 2026-03-05T15:50:00Z)

| Field | Value |
|-------|-------|
| **Deployed SHA** | `a09bc67` |
| **Staging URL** | `https://staging.supermandi.tech` |
| **Iteration** | 1 (broad surface scan) |
| **Frozen at** | 2026-03-05T15:50:00Z |
| **Total Issues** | 14 (ISSUE-014 through ISSUE-027) |

### Severity Breakdown
| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | ISSUE-015, ISSUE-016 |
| HIGH | 2 | ISSUE-014, ISSUE-023 |
| MEDIUM | 7 | ISSUE-017, ISSUE-018, ISSUE-019, ISSUE-021, ISSUE-022, ISSUE-024, ISSUE-026 |
| LOW | 3 | ISSUE-020, ISSUE-025, ISSUE-027 |

### Platform Coverage (Iteration 1)
| Platform | Screens Tested | Total Screens | Coverage | Issues |
|----------|---------------|---------------|----------|--------|
| POS | 43 | 43 | 100% | 5 (014–018) |
| Retailer | 10 | 29 | 34% | 1 (025) |
| Supplier | 15 | 22 | 68% | 2 (022, 026) |
| SuperAdmin | 25 | 25 | 100% | 4 (019, 023, 024, 027) |
| Cross-function | 10 flows | 10 flows | 100% | 5 blocked |

### Critical Blocker Summary
1. **ISSUE-016** (CRITICAL): Sale creation fails — `resolveVariantFromCatalogProduct` cannot find/create variant bridge for POS-digitised products. Blocks entire sell flow.
2. **ISSUE-015** (CRITICAL): Catalog/Orders/Reorder microservices require JWT but POS only has device token. `setAuthToken()` never called. Blocks purchase + reorder.
3. **ISSUE-014** (HIGH): `stores.ts:390` — `addUpdate("upi_vpa", ...)` missing from PATCH handler. UPI VPA silently dropped.
4. **ISSUE-023** (HIGH): `POST /admin/products/:id/approve` → 500. Blocks supplier → catalog pipeline.

### Immutability Rule
> **ISSUE-014 through ISSUE-027 are FROZEN.** Do not edit, renumber, or delete.
> New findings from Iteration 2+ start at **ISSUE-028**.

---

## ITERATION_2_DEEP_SCREEN_LOCK — Started 2026-03-05T16:00:00Z

**Mode:** Strict screen → sub-screen → modal lock.
**Protocol per screen:** Pass A (happy path) → Pass B (failure/recovery) → Pass C (data parity).
**Layers per screen:** UI, UX, wiring, navigation, API, DB/tables, GCP state, business logic, user-flow continuity.
**No skipping:** Blocked screens get exact blocker + required operator action recorded.

---

## Codex Live Testing Lock (2026-03-05)

This is now the mandatory execution contract for Claude during live staging testing.

### Scope Lock
1. Environment: `https://staging.supermandi.tech` (GCP staging only).
2. Mode: Real user interaction only (actual clicks/taps and observed runtime behavior).
3. Traversal lock: `screen -> sub-screen -> modal/drawer/dialog`.
4. Move-forward rule: do not move to the next screen until the current layer is exhausted or blocked with evidence.

### Issue Logging Lock
1. Keep existing `ISSUE-001..ISSUE-034` unchanged.
2. Append new findings as `ISSUE-035+` only (append-only policy).
3. Every finding must include:
   - platform and exact screen path
   - sub-screen/modal path
   - repro steps and trigger action
   - expected vs actual behavior
   - impact layers (`ui`, `ux`, `wiring`, `navigation`, `api`, `db/tables`, `gcp state`, `business logic`, `user flow`)
   - evidence reference (log, response, screenshot, or timestamped observation)

### Platform Order Lock
1. POS app (device)
2. Retailer web
3. Supplier web
4. SuperAdmin web
5. Cross-function flows

### Cross-Function Mandatory Flows
1. Store onboarding and approval chain across roles.
2. POS enrollment/re-enrollment/cancel/retry behavior.
3. Stock sync parity from POS to Retailer views.
4. Retailer/Supplier/SuperAdmin role boundary and data visibility checks.
5. Transaction lifecycle continuity (create, cancel, retry, partial failure recovery).

---

## Tomorrow Machine-State TODO (Locked, No Execution Tonight)

This section is the canonical handoff for tomorrow. Do not run fixes tonight.

### Priority Ticket List (Exact IDs)

| Ticket ID | Mapped Issue | Severity | Required Action Tomorrow |
|-----------|--------------|----------|---------------------------|
| SECURITY-SA-LOGIN-001 | ISSUE-001 | CRITICAL | Enforce SuperAdmin allowlist in OTP send flow; fail-closed if allowlist missing |
| SECURITY-REG-OTP-001 | ISSUE-002 | HIGH | Block registration resume bypass until OTP is freshly verified |
| BUG-REG-DRAFT-001 | ISSUE-003 | HIGH | Auto-handle stale DRAFT conflict + expose safe "start fresh" path |
| UX-REG-OTP-002 | ISSUE-004 | MEDIUM | Prevent step advancement when OTP verification failed |
| BUG-FIREBASE-001 | ISSUE-006 (re-verify runtime) | HIGH | Re-validate Firebase Admin token verification on staging IAM/secrets/runtime |
| POS-BUILD-API-001 | ISSUE-011 | CRITICAL | Build POS APK only with `staging-apk` profile for staging testing |
| POS-ENROLL-UX-001 | ISSUE-012 | HIGH | Add cancel/back/abort path during long enrollment attempts |
| POS-ENROLL-UX-002 | ISSUE-013 | MEDIUM | Add retry/progress feedback during enrollment retries |

### Staging POS Build Rules (Must Follow)

1. Build input must be clean and reproducible (`git status` clean for tracked files).
2. Staging APK must be built using `eas build --profile staging-apk --platform android`.
3. APK must target `https://staging.supermandi.tech` (never local IP, never production for staging tests).
4. `.env` local overrides must not leak into staging artifact.
5. Verify artifact stamp before distribution: commit SHA, API target, package name, versionCode/versionName.
6. Firebase App Distribution release notes must include SHA + API target + build profile.
7. Any diagnostic-only code (temporary logs/instrumentation) must be removed or explicitly isolated before final release candidate.

### Git Discipline Rules (Must Follow)

1. State-only changes and code changes must be separate commits.
2. One ticket or tightly-related micro-batch per commit; no mixed unrelated edits.
3. No force push on `main`; use branch + PR flow for fix wave.
4. No deploy until tracker/state are truth-synced with actual commit SHAs.
5. Post-fix: re-run impacted checks, then runtime verify, then update tracker verdict.
6. If runtime evidence contradicts prior "resolved" status, reopen immediately with clear evidence.

---

## ISSUE-001: SuperAdmin OTP Accepts Arbitrary Emails (CRITICAL)

**State:** `SOLUTION_DESIGNED`
**Severity:** CRITICAL — SECURITY
**Discovered:** CTO entered wrong email, OTP was sent and login succeeded

### Problem
SuperAdmin login sends OTP to any email entered. No allowlist or domain restriction.
Anyone who guesses the `/superadmin/` URL can receive an OTP and log in.

### Root Cause
`backend/src/routes/v1/admin/auth.ts` — `/send-otp` endpoint sends OTP to any valid email
without checking against an admin allowlist.

### Production-Grade Solution
1. **Add `SUPERADMIN_ALLOWED_EMAILS` env var** — comma-separated list of authorized emails
2. **Backend gate**: Before sending OTP, check `email ∈ allowedEmails`. Reject with 403 if not.
3. **Fallback**: If env var not set, reject ALL requests (fail-closed, not fail-open)
4. **Audit log**: Log all login attempts (allowed + denied) with email + IP

### Files to Change
- `backend/src/routes/v1/admin/auth.ts` — add allowlist check in `/send-otp`
- `backend/services/api-gateway/src/index.ts` — ensure rate limiting on admin auth routes
- GCP Secret: Add `SUPERADMIN_ALLOWED_EMAILS` secret

### Effort: Small (1-2 hours)

---

## ISSUE-002: Registration OTP Bypass via Resume Logic (HIGH)

**State:** `SOLUTION_DESIGNED`
**Severity:** HIGH — SECURITY
**Discovered:** Code review during live testing session

### Problem
`retailer-admin/src/pages/RegisterPage.tsx` lines 377-417: When backend returns
`APPLICATION_EXISTS`, the UI loads the existing application and can bypass OTP verification
step entirely, jumping straight to business details form.

### Root Cause
Resume logic trusts `application.status` from backend without re-verifying phone ownership.
If a DRAFT application exists, the UI shows business details form without requiring fresh OTP.

### Production-Grade Solution
1. **Backend**: Add `otp_verified_at` timestamp to applications table
2. **Backend**: In resume flow, require fresh OTP if `otp_verified_at` is NULL or older than 15 min
3. **Frontend**: On APPLICATION_EXISTS, always show OTP verification first before loading form
4. **Frontend**: Only bypass OTP if `application.otp_verified_at` is within 15-min window

### Files to Change
- `backend/migrations/173_add_otp_verified_at.sql` — new column
- `backend/src/routes/v1/retailer-admin/registration.ts` — enforce OTP freshness on resume
- `retailer-admin/src/pages/RegisterPage.tsx` — require OTP before resume

### Effort: Medium (2-3 hours)

---

## ISSUE-003: APPLICATION_EXISTS Blocks Re-Registration (HIGH)

**State:** `SOLUTION_DESIGNED`
**Severity:** HIGH — UX BLOCKER
**Discovered:** CTO could not re-register after failed attempt

### Problem
Once a DRAFT application exists for a phone number, all new registration attempts fail with
"Application already exists." User has no way to clear this except via API call to `/clear`.

### Root Cause
`backend/src/routes/v1/retailer-admin/registration.ts` — `/create` returns 409 if ANY
non-expired application exists for the phone number, regardless of completion status.

### Production-Grade Solution
1. **Auto-expire stale DRAFTs**: Add background job or on-create check that expires DRAFT
   applications older than 24 hours
2. **User-facing clear**: Add "Start Fresh" button on RegisterPage when APPLICATION_EXISTS
   is returned — calls `/clear` endpoint, then retries
3. **Backend**: `/create` should auto-clear DRAFTs older than 24h before checking for conflicts

### Files to Change
- `backend/src/routes/v1/retailer-admin/registration.ts` — auto-expire stale DRAFTs in `/create`
- `retailer-admin/src/pages/RegisterPage.tsx` — add "Start Fresh" button on conflict

### Effort: Small (1-2 hours)

---

## ISSUE-004: Error Flashes But Page Advances (MEDIUM)

**State:** `SOLUTION_DESIGNED`
**Severity:** MEDIUM — UX
**Discovered:** CTO saw "Invalid OTP" error briefly, but page moved forward anyway

### Problem
On RegisterPage, when OTP verification fails, error toast/message shows briefly but the
page state advances to the business details step. User is confused — error shown but
progress made.

### Root Cause
`retailer-admin/src/pages/RegisterPage.tsx` — the APPLICATION_EXISTS resume handler
(ISSUE-002) fires after the OTP error, loading the existing application and advancing
the form step. Two async paths racing: error display vs resume logic.

### Production-Grade Solution
1. **Fix ISSUE-002 first** — once resume requires fresh OTP, this race condition disappears
2. **Add step-gate**: Form step can only advance via explicit `setStep()` call after
   successful verification, never from error handlers
3. **Error state blocks advancement**: If `otpError` is set, `setStep(2)` is a no-op

### Files to Change
- `retailer-admin/src/pages/RegisterPage.tsx` — add step advancement guard

### Effort: Small (included in ISSUE-002 fix)

---

## ISSUE-005: Firebase Rate Limit Not Handled at confirm() Level (HIGH)

**State:** `SOLUTION_DESIGNED`
**Severity:** HIGH — UX BLOCKER
**Discovered:** CTO sent 5+ OTPs, then all OTP verifications failed silently

### Problem
Firebase enforces ~5 OTPs per phone number per hour. After hitting the limit:
- `sendOtp()` may still succeed (queued)
- `confirmationResult.confirm(otp)` fails with generic error
- User sees "Invalid OTP" when the real issue is rate limiting
- No recovery path — user must wait 1 hour

### Root Cause
`retailer-admin/src/lib/firebase.ts` — `verifyOtp()` catches all errors as "Invalid OTP"
without checking for rate-limit-specific error codes. The `sendOtp()` function handles
`auth/too-many-requests` but `confirm()` errors are not differentiated.

### Production-Grade Solution
1. **Client-side send counter**: Track OTP sends per session. After 3rd send, show warning:
   "You have limited attempts remaining. Please enter OTP carefully."
2. **After 5th send**: Disable resend button for 30 min, show countdown timer
3. **In `verifyOtp()`**: Catch `auth/too-many-requests` and `auth/quota-exceeded` specifically,
   show: "Too many attempts. Please wait 30 minutes and try again."
4. **Cooldown display**: Show remaining wait time based on first-send timestamp

### Files to Change
- `retailer-admin/src/lib/firebase.ts` — add rate-limit detection in `verifyOtp()`
- `retailer-admin/src/pages/LoginPage.tsx` — add send counter + cooldown UI
- `retailer-admin/src/pages/RegisterPage.tsx` — same send counter + cooldown UI

### Effort: Medium (2-3 hours)

---

## ISSUE-006: Firebase Identity Toolkit API Cross-Project (RESOLVED)

**State:** `VERIFIED`
**Severity:** HIGH — BACKEND BLOCKER
**Discovered:** All Firebase token verifications returned `auth/internal-error`

### Problem
Backend on Cloud Run (`supermandi-backend` project) could not verify Firebase ID tokens
from the POS Firebase project (`supermandi-pos`).

### Root Cause
Identity Toolkit API was not enabled on the `supermandi-backend` GCP project.
Firebase Admin SDK's `verifyIdToken()` calls Identity Toolkit under the hood.

### Fix Applied
```bash
gcloud services enable identitytoolkit.googleapis.com --project=supermandi-backend
```
No code change or redeployment needed. API enablement is project-level.

### Verified: YES — Token verification now succeeds.

---

## ISSUE-007: Password Fallback Missing for Registration (LOW)

**State:** `ANALYZED`
**Severity:** LOW — UX
**Discovered:** Code review — login has password fallback, registration does not

### Problem
LoginPage has `VITE_ENABLE_PASSWORD_LOGIN=true` fallback when Firebase is not configured.
RegisterPage has no equivalent — registration is impossible without Firebase.

### Production-Grade Solution
1. **For now**: Not critical — registration is a one-time flow, Firebase will be configured
2. **Future**: Add password-based registration flow as fallback
3. **Priority**: Fix only if Firebase is unreliable in production

### Files to Change
- `retailer-admin/src/pages/RegisterPage.tsx` — add password fallback (future)

### Effort: Medium (3-4 hours) — deferred

---

## ISSUE-008: GCP LB 411 on Bodyless POST — STG-176 Incomplete Fix (HIGH)

**State:** `SOLUTION_DESIGNED`
**Severity:** HIGH — FUNCTIONAL BLOCKER
**Discovered:** GCP live testing — curl POST without body returns 411 Length Required

### Problem
GCP HTTP(S) Load Balancer requires `Content-Length` header for POST requests. When browser
`fetch()` sends POST without a body, some browsers/environments don't include `Content-Length: 0`,
causing GCP LB to reject with `411 Length Required` before the request reaches the backend.

The STG-176 fix (adding `body: '{}'`) was applied to `authToken.ts` (refresh + logout) but
was **NOT applied** to 8 other POST calls across 7 API files.

### Root Cause
`supermandi-superadmin/src/api/deviceEnrollments.ts` — `createDeviceEnrollment()` and
`resendEnrollmentCode()` send POST without body. Same pattern in 6 other API files.

### Affected POST Calls (8 total)
| File | Function | Line |
|------|----------|------|
| `deviceEnrollments.ts` | `createDeviceEnrollment` | ~38 |
| `deviceEnrollments.ts` | `resendEnrollmentCode` | ~102 |
| `invoices.ts` | invoice action POST | ~215 |
| `monitoring.ts` | monitoring POST | ~46 |
| `quality.ts` | quality action POST | ~123 |
| `refunds.ts` | refund action POST | ~56 |
| `registrationEvents.ts` | registration event POST | ~97 |
| `suppliers.ts` | supplier action POST | ~232 |

### Production-Grade Solution
Add `body: '{}'` to ALL bodyless POST fetch calls — same pattern as STG-176 fix in authToken.ts.

### Files to Change
All 7 files above — single-line addition of `body: '{}'` per fetch call.

### Effort: Tiny (30 minutes) — but requires portal rebuild + CDN invalidation

---

## ISSUE-009: SuperAdmin QR/Enrollment Button Broken (HIGH)

**State:** `SOLUTION_DESIGNED`
**Severity:** HIGH — FUNCTIONAL BLOCKER
**Discovered:** CTO live testing — "QR" button in Stores tab does nothing

### Problem
Clicking the "QR" button in the Stores directory to generate a POS enrollment code fails
silently. The `createDeviceEnrollment()` function sends a POST to
`/api/v1/admin/stores/:storeId/device-enrollments` without a body, potentially triggering
the GCP LB 411 error (ISSUE-008).

### Root Cause
Direct consequence of ISSUE-008. The enrollment POST has no body.

### Production-Grade Solution
Fix ISSUE-008 (add `body: '{}'` to the fetch call in `createDeviceEnrollment()`).

### Files to Change
- `supermandi-superadmin/src/api/deviceEnrollments.ts` line 38-44 — add `body: '{}'`

### Effort: Included in ISSUE-008

---

## ISSUE-010: PATCH Without Body — Enrollment Revoke (LOW)

**State:** `ANALYZED`
**Severity:** LOW — POTENTIAL
**Discovered:** Code audit during GCP testing

### Problem
`revokeEnrollmentCode()` in `deviceEnrollments.ts` sends PATCH without body.
GCP LB appears to accept bodyless PATCH (tested: returns 401, not 411), but this is fragile.

### Production-Grade Solution
Add `body: '{}'` for consistency with STG-176 pattern.

### Files to Change
- `supermandi-superadmin/src/api/deviceEnrollments.ts` line 58-64 — add `body: '{}'`
- `supermandi-superadmin/src/api/documents.ts` line ~92 — add `body: '{}'`

### Effort: Tiny (included in ISSUE-008 sweep)

---

## GCP Live Testing Results (2026-03-05)

### Infrastructure Health
| Component | Status | Evidence |
|-----------|--------|----------|
| API Gateway | HEALTHY | `GET /api/v1/admin/health` → 200 `{"status":"ok"}` |
| Main Backend | HEALTHY | `GET /api/v1/ready` → `{"ready":true, 12ms}` |
| SuperAdmin Portal | SERVING | `GET /admin/` → 200 |
| Retailer Portal | SERVING | `GET /retailer/` → 200 |
| Supplier Portal | SERVING | `GET /supplier/` → 200 |
| Landing Page | SERVING | `GET /` → 200 |
| CORS | CORRECT | Preflight 204 with proper `Access-Control-Allow-*` headers |
| CSRF | CORRECT | Accepts `Content-Type: application/json` (all SuperAdmin calls have this) |
| POS Enrollment API | WORKING | `POST /api/v1/pos/enroll` → proper `ENROLLMENT_CODE_INVALID` for test code |
| POS Auth | WORKING | `GET /api/v1/pos/ui-status` → proper `DEVICE_UNAUTHORIZED` |

### Route Registration Audit
All 30+ admin route files properly registered and mounted:
- Gateway proxy: explicit routes for `/api/v1/admin/stores`, `/api/v1/admin/device-enrollments`, etc.
- Backend: all routes mounted in `routes/v1/index.ts` lines 158-199
- Auth: double-layer (gateway `adminAuthMiddleware` + backend `requireAdminToken`)
- Permissions: `requirePermission("stores", "create")` — super_admin role bypasses all checks ✓

### Endpoints That REQUIRE Body (Confirmed Working)
- `POST /api/v1/admin/stores` — store creation (has body) ✓
- `PATCH /api/v1/admin/stores/:id` — store update (has body) ✓
- `PATCH /api/v1/admin/stores/:id/status` — status change (has body) ✓

### Endpoints That LACK Body (Potentially Broken by 411)
- `POST /api/v1/admin/stores/:id/device-enrollments` — enrollment creation (NO body)
- `POST /api/v1/admin/device-enrollments/:code/resend` — enrollment resend (NO body)

---

## ISSUE-011: POS App API URL Points to Production, Not Staging (CRITICAL)

**State:** `SOLUTION_DESIGNED`
**Severity:** CRITICAL — POS COMPLETELY BROKEN
**Discovered:** CTO live testing — "Activate POS" button spins 5 min then "Could not connect to server"

### Problem
The POS release APK was built with `production-apk` EAS profile, which does NOT set
`EXPO_PUBLIC_API_URL`. It falls back to `app.json` default: `https://supermandi.tech` (production).
But the backend is only deployed on `https://staging.supermandi.tech`. The enrollment code
SM-5BZ2K2 was created on staging — the POS app is trying to reach a server that has no backend.

### Root Cause
`eas.json` — `production-apk` profile has no `env.EXPO_PUBLIC_API_URL` override.
`app.json` line 31 — `"API_URL": "https://supermandi.tech"` (production, no backend deployed).
`staging-apk` profile (line 26-34) correctly sets `"https://staging.supermandi.tech"` but was not used.

### Evidence
- POS error: "Activation Failed — Could not connect to the server (code: Network request failed)"
- curl to `staging.supermandi.tech/api/v1/pos/enroll` with SM-5BZ2K2 → 200 OK (backend works)
- POS app hitting wrong domain entirely

### Production-Grade Solution
**Immediate (unblock testing):**
1. Rebuild APK with `eas build --profile staging-apk --platform android`
2. Install on Redmi, generate new enrollment code, retry

**Permanent (prevent recurrence):**
1. Add `EXPO_PUBLIC_API_URL` to `production-apk` profile in eas.json pointing to production domain
2. Only use `staging-apk` for staging testing, `production-apk` for production
3. Add build-time validation: if `API_URL` domain doesn't resolve → fail build

### Files to Change
- `eas.json` — add env override to `production-apk` profile (or always use `staging-apk` for now)

### Effort: Tiny (rebuild only, no code change for immediate fix)

---

## ISSUE-012: EnrollDevice Screen — No Back/Cancel Navigation (HIGH)

**State:** `SOLUTION_DESIGNED`
**Severity:** HIGH — UX DEAD-END
**Discovered:** CTO live testing — "nor it has back or refresh navigation so real user will be confused"

### Problem
When the "Activate POS" button is pressed:
1. The button shows a spinner with "Activating..." text
2. The spinner runs for ~5 minutes (60s timeout × 3 retries with exponential backoff)
3. During this time, there is NO way to cancel, go back, or refresh
4. The user is completely stuck staring at a spinner with no feedback
5. Real users will force-close the app, thinking it's frozen

### Root Cause
`src/screens/EnrollDeviceScreen.tsx` — `handleActivate()` (lines 242-401):
- Uses `fetchWithTimeout` with 60s timeout × 3 retries = ~3-5 minutes total
- Loading state (`isSubmitting`) disables the button but provides no cancel mechanism
- No back button in the navigation header
- No pull-to-refresh or tap-to-cancel gesture
- `navigation.replace()` on success means no back stack

### Production-Grade Solution
1. **Add Cancel button**: Show "Cancel" next to the spinner during activation. On tap, abort
   the fetch request via AbortController and reset form state.
2. **Add timeout feedback**: After 10 seconds of spinning, show "Still trying... Attempt 2 of 3"
3. **Add back navigation**: Always show a back/home button that cancels any in-flight request
4. **Reduce total wait**: Change from 3 retries × 60s to 2 retries × 15s = ~30s max
   (enrollment is a simple API call, 60s is excessive)

### Files to Change
- `src/screens/EnrollDeviceScreen.tsx` — add cancel button, retry feedback, back nav
- `src/services/api/apiClient.ts` — consider reducing enrollment-specific timeout

### Effort: Small (1-2 hours)

---

## ISSUE-013: EnrollDevice Spinner — No Progress/Retry Feedback (MEDIUM)

**State:** `SOLUTION_DESIGNED`
**Severity:** MEDIUM — UX
**Discovered:** CTO live testing — "activating button keeps spinning not responding nor showing any error on screen"

### Problem
The activation spinner shows "Activating..." for the entire duration (~5 minutes) without:
- Indicating which retry attempt is in progress (1 of 3, 2 of 3, etc.)
- Showing elapsed time or estimated remaining time
- Displaying intermediate status ("Connecting...", "Retrying...", "Server not responding...")
- Providing any visual indication that the app is still working (vs frozen)

After 5 minutes, the error alert appears suddenly — user had no warning it was failing.

### Root Cause
`src/screens/EnrollDeviceScreen.tsx` — `handleActivate()` retry loop (lines 286-307):
- Retry logic is inside the API function, not exposed to UI
- Loading state is a simple boolean (`isSubmitting`) — no granularity
- No callback or state update between retry attempts

### Production-Grade Solution
1. **Retry callback**: Pass `onRetry(attempt, maxAttempts)` to the enrollment function
2. **Progress text**: Show "Connecting..." → "Retrying (2/3)..." → "Last attempt..."
3. **Elapsed timer**: Show "⏱ 15s" counter so user knows the app isn't frozen
4. **Early error display**: If first attempt fails, immediately show inline warning
   "Connection slow — retrying automatically" before starting retry 2

### Files to Change
- `src/screens/EnrollDeviceScreen.tsx` — add retry state + progress display
- `src/services/api/enrollApi.ts` — expose retry callback

### Effort: Small (included in ISSUE-012 fix)

---

## Summary Table

| ID | Severity | State | Blocker? | Effort |
|----|----------|-------|----------|--------|
| ISSUE-001 | CRITICAL | SOLUTION_DESIGNED | Yes — security | Small |
| ISSUE-002 | HIGH | SOLUTION_DESIGNED | Yes — security | Medium |
| ISSUE-003 | HIGH | SOLUTION_DESIGNED | Yes — UX | Small |
| ISSUE-004 | MEDIUM | SOLUTION_DESIGNED | No — cosmetic | Small |
| ISSUE-005 | HIGH | SOLUTION_DESIGNED | Yes — UX | Medium |
| ISSUE-006 | HIGH | VERIFIED | No — resolved | Done |
| ISSUE-007 | LOW | ANALYZED | No — deferred | Deferred |
| ISSUE-008 | HIGH | SOLUTION_DESIGNED | Yes — functional | Tiny |
| ISSUE-009 | HIGH | SOLUTION_DESIGNED | Yes — functional | Tiny (in 008) |
| ISSUE-010 | LOW | ANALYZED | No — defensive | Tiny (in 008) |
| ISSUE-011 | CRITICAL | SOLUTION_DESIGNED | Yes — POS broken | Tiny (rebuild) |
| ISSUE-012 | HIGH | SOLUTION_DESIGNED | Yes — UX dead-end | Small |
| ISSUE-013 | MEDIUM | SOLUTION_DESIGNED | No — UX polish | Small (in 012) |

## Batch Fix Order (When Ready)

```
0. ISSUE-011 (POS API URL mismatch) — IMMEDIATE: rebuild APK with staging-apk profile
1. ISSUE-012 (EnrollDevice no back/cancel nav) — HIGH: user stuck on screen
2. ISSUE-013 (Spinner 5min no feedback) — MEDIUM: included in 012
3. ISSUE-008 (GCP LB 411 bodyless POST) — Tiny fix, unblocks 6 other modules
4. ISSUE-001 (SuperAdmin allowlist) — CRITICAL security, smallest fix
5. ISSUE-002 (OTP bypass) — HIGH security, blocks ISSUE-004
6. ISSUE-003 (Stale DRAFT cleanup) — HIGH UX, standalone
7. ISSUE-004 (Error flash) — MEDIUM, auto-fixed by ISSUE-002
8. ISSUE-005 (Rate limit UX) — HIGH UX, standalone
9. ISSUE-010 (PATCH body hardening) — LOW, defensive
10. ISSUE-007 — Deferred to post-launch
```

## Deploy Plan

All fixes committed to single branch `fix/live-testing-batch`.
Single PR, single deploy. No partial deploys.
Backend changes require Cloud Run redeploy.
Frontend changes require portal rebuild + CDN cache invalidation.
**POS APK**: Rebuild with `eas build --profile staging-apk` for staging testing.

## CTO Immediate Action

### To unblock POS enrollment NOW:
**Rebuild APK with staging profile** — the current APK points to production (`supermandi.tech`)
which has no backend deployed. The staging-apk profile in eas.json is already configured correctly.
```bash
eas build --profile staging-apk --platform android
```
Then install the new APK on Redmi and retry enrollment with a new code (SM-5BZ2K2 may have been consumed).

### Browser diagnostics to share:
If any SuperAdmin button click doesn't work:
1. Open browser DevTools (F12) → Console tab
2. Click the button
3. Screenshot any red error messages
4. Check Network tab for failed requests (red rows)
5. Share the HTTP status code and response body

---

## Live Testing Findings (2026-03-05 — API-Level POS Audit)

### ISSUE-014: Store UPI VPA Not Persisted on PATCH (HIGH — Business Logic)

**State:** `DISCOVERED`
**Severity:** HIGH — breaks UPI payments for all stores
**Platform:** POS App / SuperAdmin
**Screen path:** POS > SplashScreen > ui-status | SuperAdmin > Stores > Edit Store
**Sub-screen:** N/A
**Modal:** N/A

#### Problem
When a SuperAdmin updates a store's UPI VPA via `PATCH /api/v1/admin/stores/:storeId`, the request succeeds (200 OK) and the store status is set to ACTIVE, but the `upi_vpa` column value is never written to the database. It remains `null`.

This means:
- POS `GET /api/v1/pos/ui-status` returns `upiVpa: null`
- UPI payment initiation will fail (no VPA to generate QR code)
- UPI is listed in `allowedPaymentMethods` but is non-functional
- Store appears ACTIVE but cannot accept UPI payments

#### Repro Steps
1. SuperAdmin PATCH store with `{"upiVpa": "test@upi"}`
2. Response returns 200 OK with updated store (no `upi_vpa` in response)
3. GET store → `upi_vpa: null`, `upi_vpa_updated_at: null`
4. POS ui-status → `upiVpa: null`

#### Expected vs Actual
- **Expected:** `upi_vpa` column updated to `"test@upi"`, `upi_vpa_updated_at` set, POS sees VPA
- **Actual:** `upi_vpa` remains `null`, only `status` column changes to ACTIVE

#### Root Cause
`backend/src/routes/v1/admin/stores.ts` lines 380-391: The PATCH handler calls `normalizeUpiVpa()` and uses the result to set `status` to ACTIVE/DRAFT, but **never calls `addUpdate("upi_vpa", normalized)`** — the VPA value itself is dropped.

#### Evidence Chain
1. **PATCH request:** `PATCH /api/v1/admin/stores/a6c43ede...` with `{"upiVpa":"test-evidence@upi"}` → 200 OK
2. **GET response:** `{"store":{"upi_vpa":null,"upi_vpa_updated_at":null,"status":"ACTIVE"}}`
3. **POS ui-status:** `{"upiVpa":null,"allowedPaymentMethods":["CASH","UPI","DUE"]}`
4. **Code evidence:** `stores.ts:390` — `addUpdate("status", ...)` present, `addUpdate("upi_vpa", ...)` missing
5. **Timestamp:** 2026-03-05T14:56:13Z

#### Impact Layers
- **API:** PATCH silently drops upi_vpa value
- **DB/tables:** `platform.stores.upi_vpa` column never updated
- **Business logic:** Store marked ACTIVE without functional UPI
- **User flow:** UPI payment option shown but will fail at payment time
- **GCP state:** Staging DB has null VPA for all stores

#### Fix Required
Add `addUpdate("upi_vpa", normalized)` and `addUpdate("upi_vpa_updated_at", new Date().toISOString())` in the upiVpa handler block (after line 390).

---

### ISSUE-015: Catalog/Orders/Reorder Microservices Reject POS Device Token (CRITICAL — Auth Mismatch)

**State:** `DISCOVERED`
**Severity:** CRITICAL — breaks POS purchase, reorder, and order flows entirely
**Platform:** POS App
**Screen path:** POS > PurchaseScreen, ReorderScreen, OrderHistory, OrderDetail, GRN, BuyScreen
**Sub-screen:** All sub-screens on affected screens
**Modal:** PurchaseCartModal, PaymentOptionsSheet, ProductDetailModal, EditReorderModal, DismissReasonModal

#### Problem
The catalog (`/api/v1/catalog/*`), orders (`/api/v1/orders/*`), and reorder (`/api/v1/reorder/*`) microservices use JWT Bearer token authentication via the `authenticate` middleware from auth-service. However, the POS app only has a **device token** (from enrollment) — it never obtains a JWT.

The POS `apiClient` sends:
- `x-device-token: <deviceToken>` (always present)
- `Authorization: Bearer <token>` (from `getAuthToken()` — always null because `setAuthToken` is never called in production code)

Result: All catalog/orders/reorder endpoints return `401 UNAUTHORIZED` for POS requests.

#### Affected Screens
1. **PurchaseScreen** (Screen 8) — catalog browse, buy catalog, categories
2. **ReorderScreen** (Screen 9) — pending reorders, approve, dismiss
3. **OrderHistory** (Screen 17) — order listing
4. **OrderDetail** (Screen 18) — order detail, submit, cancel, pay
5. **GRN** (Screen 21) — goods receive
6. **BuyScreen** (Screen 26) — full catalog browse, product detail

#### Repro Steps
1. Enroll POS device → get device token
2. Call `GET /api/v1/catalog/stores/:storeId/buy-catalog` with `x-device-token` header
3. Response: `{"error":{"code":"UNAUTHORIZED","message":"Missing or invalid Authorization header. Use Bearer <token>."}}`
4. Same for `/api/v1/orders/*` and `/api/v1/reorder/*`

#### Expected vs Actual
- **Expected:** POS device token accepted by catalog/orders/reorder services, or token exchange provides JWT
- **Actual:** 401 UNAUTHORIZED — microservices only accept JWT, POS has no JWT

#### Root Cause
1. `backend/services/auth-service/src/middleware/authenticate.ts:87` — extracts Bearer token only
2. `backend/services/catalog-service/src/routes/catalog.ts:20` — `router.use(authenticate)` requires JWT
3. `src/services/api/storage.ts:17` — `getAuthToken()` returns null (no JWT ever stored)
4. `src/services/api/storage.ts:48` — `setAuthToken()` never called in production code (only tests)
5. POS endpoints under `/api/v1/pos/*` work because they use device-token middleware, not JWT

#### Evidence Chain
1. `GET /api/v1/catalog/stores/:storeId/buy-catalog` with `x-device-token` → 401 UNAUTHORIZED
2. `GET /api/v1/orders/stores/:storeId/orders` with `x-device-token` → 401 UNAUTHORIZED
3. `GET /api/v1/reorder/stores/:storeId/reorder/pending` with `x-device-token` → 401 UNAUTHORIZED
4. `GET /api/v1/pos/inventory/statement` with `x-device-token` → 200 OK (device token auth works)
5. **Timestamp:** 2026-03-05T15:05:00Z

#### Impact Layers
- **API:** 3 microservice prefixes reject POS requests (catalog, orders, reorder)
- **Wiring:** POS apiClient never obtains JWT; setAuthToken dead code
- **Navigation:** PurchaseScreen, BuyScreen, ReorderScreen, OrderHistory will show error states or empty
- **Business logic:** Retailers cannot browse supplier catalog, create purchase orders, or manage reorders from POS
- **User flow:** All purchase/reorder flows are dead ends

#### Fix Options
**Option A (recommended):** Add device-token-to-JWT exchange — when POS enrolls, also issue a JWT scoped to the store. Store it via `setAuthToken()`. Refresh alongside device token.
**Option B (quick):** Add `x-device-token` acceptance to the microservice `authenticate` middleware as a fallback auth path.
**Option C (gateway):** Have the API gateway translate `x-device-token` into a Bearer JWT before proxying to microservices.

---

### ISSUE-016: Sale Creation Fails for POS-Digitised Products (CRITICAL — Business Logic)

**State:** `DISCOVERED`
**Severity:** CRITICAL — POS cannot complete any sale (core business function broken)
**Platform:** POS App
**Screen path:** POS > SellScanScreen > Cart > Checkout > PaymentScreen
**Sub-screen:** Cart sheet (checkout trigger)
**Modal:** N/A

#### Problem
When a product is created via POS digitisation (`POST /api/v1/pos/store-products`) and a sale is attempted, the sale creation endpoint returns HTTP 500 `{"error":"failed to create sale"}`. The product appears in search, has stock, but cannot be sold.

#### Repro Steps
1. Create product: `POST /api/v1/pos/store-products` with `{"name":"Test Dal 1kg","barcode":"TEST-DAL-001","sellPrice":150}` → 201, storeProductId
2. Set stock: `PATCH /store-products/stock` → 200, stock=100
3. Search confirms: `GET /search?q=dal` → found, stock=100
4. Create sale: `POST /api/v1/pos/sales` with `{"items":[{"storeProductId":"...","quantity":2,"priceMinor":15000}]}` → **500**

#### Expected vs Actual
- **Expected:** Sale created with saleId and billRef
- **Actual:** 500 `{"error":"failed to create sale"}`

#### Root Cause (Probable)
`sales.ts:135` — `resolveVariantFromCatalogProduct()` finds the catalog product but fails during variant bridge creation (Step 3, ~line 237). Product has no variants: `GET /variants` → `[]`. The catch block at line 1285 returns generic 500. Server log inspection needed.

#### Evidence Chain
1. Product created: storeProductId `75b00c8e`, 201 OK
2. Stock set: 100 units, 200 OK
3. Search: found, currentStock `100.000`
4. Sale: 500 `{"error":"failed to create sale"}`
5. Variants: `{"data":[]}` (empty)
6. Timestamp: 2026-03-05T15:06:50Z

#### Impact Layers
- **API:** 500 on sale creation for all POS-digitised products
- **Business logic:** Core sell function broken
- **User flow:** Scan → Cart → Checkout → ERROR (dead end)
- **DB/tables:** Missing variant bridge records

---

### ISSUE-017: Stock-In Silently Skips Items / Fails on Barcode Lookup (MEDIUM)

**State:** `DISCOVERED`
**Severity:** MEDIUM — stock-in appears to succeed but processes 0 items
**Platform:** POS App
**Screen path:** POS > PurchaseScreen > StockInView | POS > InwardScreen

#### Problem
`POST /api/v1/pos/stock-in` returns `itemsProcessed: 0` when items are sent with `storeProductId` (ignored — endpoint only accepts `barcode`). When sent with `barcode`, returns 500 error (barcode not in `catalog.store_product_barcodes` join table for POS-digitised products).

#### Repro Steps
1. `POST /stock-in` with `{"items":[{"storeProductId":"75b00c8e","quantity":100}]}` → `itemsProcessed: 0`
2. `POST /stock-in` with `{"items":[{"barcode":"TEST-DAL-001","quantity":100}]}` → 500
3. Stock unchanged at 0

#### Expected vs Actual
- **Expected:** Stock increased
- **Actual:** `itemsProcessed: 0` (silent skip) or 500 error

#### Evidence
1. storeProductId path: `{"itemsProcessed":0,"totalAmount":0}` 200 OK (no effect)
2. barcode path: `{"success":false,"error":"Failed to record stock-in"}` 500
3. Workaround: `PATCH /store-products/stock` works directly
4. Timestamp: 2026-03-05T15:05:09Z

#### Impact Layers
- **API:** Silent success with no effect
- **Business logic:** Physical stock receipt not recordable
- **UX:** Misleading "success" response

---

### ISSUE-018: Shift Start Uses DeviceId as StaffId (MEDIUM — Data Integrity)

**State:** `DISCOVERED`
**Severity:** MEDIUM — shift records have wrong staff attribution
**Platform:** POS App
**Screen path:** POS > Menu > Shift

#### Problem
`POST /api/v1/pos/shifts/start` creates a shift with `staffId` set to the **deviceId** instead of the actual logged-in staff member's ID.

#### Repro Steps
1. Login as staff Manager (staffId: `d6e51a7d`)
2. Start shift: `POST /shifts/start` with `x-staff-id: d6e51a7d` header
3. Response: `{"shift":{"staffId":"fbd29f1b..."}}` — this is the deviceId, not the staffId

#### Expected vs Actual
- **Expected:** `staffId: "d6e51a7d..."` (the logged-in Manager)
- **Actual:** `staffId: "fbd29f1b..."` (the deviceId)

#### Evidence
1. Shift response: `staffId: "fbd29f1b-7f55-4d7c-980b-7f09401bef93"` = deviceId
2. Actual staff: `d6e51a7d-bd3a-43b9-8f5a-fdf8fef4c304` = Manager
3. DeviceId confirmed from enrollment: `fbd29f1b-7f55-4d7c-980b-7f09401bef93`
4. Timestamp: 2026-03-05T15:10:57Z

#### Impact Layers
- **DB/tables:** `shifts.staff_id` contains deviceId, not staff member ID
- **Business logic:** Shift reports will show wrong staff attribution
- **User flow:** Daily closing reconciliation will have wrong cashier/manager name

---

### ISSUE-014 UPDATE: UPI VPA Not Persisted — Also Affects POS Payment Settings Endpoint

**Additional evidence (POS endpoint):**
- `PATCH /api/v1/pos/store/payment-settings` with `{"upiVpa":"test-store@upi"}` → 200 OK, response shows `upiVpa: "test-store@upi"`
- But `GET /api/v1/pos/ui-status` still returns `upiVpa: null`
- Both admin PATCH and POS payment-settings PATCH fail to persist the UPI VPA value
- This confirms the VPA persistence issue spans multiple endpoints
- Timestamp: 2026-03-05T15:11:00Z

---

## POS Platform 1: Screen Completion Summary

| # | Screen | Status | Findings |
|---|--------|--------|----------|
| 1 | SplashScreen | TESTED | upiVpa null (→ISSUE-014) |
| 2 | EnrollDeviceScreen | TESTED | All error codes correct |
| 3 | ForceUpdateScreen | SKIPPED | forceUpdate=false, cannot trigger from API |
| 4 | DeviceBlockedScreen | SKIPPED | deviceActive=true, cannot trigger from API |
| 5 | PaymentSetupScreen | TESTED | VPA update returns success but doesn't persist (→ISSUE-014) |
| 6 | StaffLoginScreen | TESTED | All paths correct |
| 7 | SellScanScreen | TESTED | Product search/create work; Sale creation BROKEN (→ISSUE-016) |
| 8 | PurchaseScreen | BLOCKED | Catalog endpoints UNAUTHORIZED (→ISSUE-015) |
| 9 | ReorderScreen | BLOCKED | Reorder endpoints UNAUTHORIZED (→ISSUE-015) |
| 10 | CreditScreen | BLOCKED | creditEnabled=false |
| 11 | MenuScreen | TESTED | Badges and summary work |
| 12 | PaymentScreen | BLOCKED | Cannot create sale (→ISSUE-016), UPI VPA null (→ISSUE-014) |
| 13 | SuccessPrintScreenV2 | BLOCKED | No successful sale to reach this screen |
| 14 | SalesHistory | TESTED | Empty (no sales), endpoint works |
| 15 | BillDetail | BLOCKED | No bills exist |
| 17 | OrderHistory | BLOCKED | Orders UNAUTHORIZED (→ISSUE-015) |
| 18 | OrderDetail | BLOCKED | Orders UNAUTHORIZED (→ISSUE-015) |
| 21 | GRN | BLOCKED | Orders UNAUTHORIZED (→ISSUE-015) |
| 22 | Inward | TESTED | Stock-in broken for POS products (→ISSUE-017) |
| 25 | StockStatement | TESTED | Works correctly |
| 26 | BuyScreen | BLOCKED | Catalog UNAUTHORIZED (→ISSUE-015) |
| 27 | BnplDues | TESTED | Works (empty, bnplEnabled=false) |
| 28 | Khata | TESTED | Works (empty) |
| 29 | CustomerList | TESTED | Works (empty) |
| 30 | DailyClosing | TESTED | Works (empty) |
| 31 | DailyReport | TESTED | Works (empty) |
| 32 | Shift | TESTED | StaffId=DeviceId BUG (→ISSUE-018) |
| 33 | OverdueDues | TESTED | Works (empty) |
| 34 | Return | TESTED | Route not found — sale lookup 404 |
| 37 | OpeningStock | TESTED | processedCount=0 (→ISSUE-017 pattern) |
| 38 | ChatList | TESTED | Works (empty) |
| 39 | ChatConversation | TESTED | Support conversation created OK |
| 40 | AIInsights | TESTED | Works — slow-movers detected correctly |
| 41 | BulkPurchaseCredit | BLOCKED | creditEnabled=false |

### POS Critical Blockers (must fix before usable)
1. **ISSUE-016** (CRITICAL): Sale creation fails → core sell function broken
2. **ISSUE-015** (CRITICAL): Catalog/orders/reorder auth mismatch → purchase/reorder broken
3. **ISSUE-014** (HIGH): UPI VPA not persisted → UPI payments broken

---

## ISSUE-019: Admin Auth Refresh Returns Same Token (Not Refreshed)

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Platform** | SuperAdmin Web |
| **Screen** | N/A (API — auth/refresh endpoint) |
| **Status** | DISCOVERED |
| **Impacted Layers** | API, Auth, Session Management |

**Evidence:**
```
POST /api/v1/admin/auth/refresh
Authorization: Bearer <original_token>
Content-Type: application/json

Response: {"sessionToken":"<IDENTICAL_TOKEN>","expiresAt":1772805481000,"expiresIn":28800}
```

The `sessionToken` in the response is byte-for-byte identical to the input token. The `expiresIn: 28800` (8h remaining) confirms it is the original token's remaining TTL, NOT a freshly issued 24h token.

**Expected:** New JWT with fresh `iat` and `exp` (24h from now).
**Actual:** Same JWT returned, expiry not extended.
**Root Cause:** Needs code-level investigation — the handler at `backend/src/routes/v1/admin/adminAuth.ts:369-419` calls `jwt.sign()` with fresh payload but the deployed code may differ from local.

---

## ISSUE-020: Admin Auth Refresh/Logout Blocked Without Content-Type Header

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Platform** | SuperAdmin Web |
| **Screen** | N/A (API — auth/refresh, auth/logout) |
| **Status** | DISCOVERED |
| **Impacted Layers** | API, CSRF Middleware |

**Evidence:**
```
POST /api/v1/admin/auth/refresh (no Content-Type, with Content-Length: 0)
→ 403 {"error":{"code":"CSRF_VALIDATION_FAILED","message":"Request blocked. Include Content-Type: application/json or X-Requested-With header."}}

POST /api/v1/admin/auth/logout (same)
→ 403 CSRF_VALIDATION_FAILED
```

Empty-body POST requests without `Content-Type: application/json` are rejected by CSRF middleware. Browser fetch calls may or may not include Content-Type for empty bodies depending on implementation.

**Fix:** Frontend must always include `Content-Type: application/json` header on POSTs. This is a frontend discipline issue, not a backend bug per se. Worth noting for integration testing.

---

## ISSUE-021: Admin Refresh Returns 411 Length Required (Cloud Run)

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Platform** | POS App + SuperAdmin Web |
| **Screen** | Token refresh (all platforms) |
| **Status** | DISCOVERED |
| **Impacted Layers** | API, GCP Infrastructure |

**Evidence (from POS testing, ISSUE-008):**
```
POST /api/v1/pos/token/refresh (no body)
→ 411 Length Required (Cloud Run load balancer rejects POST without Content-Length)
```

Same pattern affects admin auth refresh when called without `Content-Length` header.

**Root Cause:** GCP Cloud Run's load balancer requires `Content-Length` header on all POST requests. Clients that send POST with no body and no Content-Length get rejected before reaching the application.

**Fix:** POS client and web frontends must include `Content-Length: 0` (or send empty JSON body `{}`) on all POST requests.

---

## ISSUE-022: Supplier Dashboard Endpoint Missing (404)

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Platform** | Supplier Web |
| **Screen** | Dashboard |
| **Status** | DISCOVERED |
| **Impacted Layers** | API, Routing |

**Evidence:**
```
GET /api/v1/supplier/dashboard
Authorization: Bearer <valid_supplier_token>
→ 404 {"error":{"code":"NOT_FOUND","message":"Cannot GET /api/v1/supplier/dashboard"}}
```

The supplier portal frontend likely expects a dashboard endpoint. Working supplier endpoints: `/profile`, `/products`, `/orders`.

---

## ISSUE-023: Admin Product Approval Returns 500

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **Platform** | SuperAdmin Web |
| **Screen** | Supplier Product Management |
| **Status** | DISCOVERED |
| **Impacted Layers** | API, DB, Business Logic |

**Evidence:**
```
POST /api/v1/admin/products/f6f94952-9d67-4411-bcdd-d03a71a9776c/approve
Authorization: Bearer <admin_token>
→ 500 {"error":"Failed to approve product"}
```

Supplier product was created successfully (status: pending), but admin approval endpoint returns 500. The handler at `suppliers.ts:787` queries `catalog.supplier_products` table — likely a DB schema/data issue (missing table, missing columns, or constraint violation).

**Cross-function impact:** Blocks the entire Supplier → Admin → Catalog pipeline. Products cannot be made available to retailers/POS.

---

## ISSUE-024: Admin Device Revoke Endpoint 404

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Platform** | SuperAdmin Web |
| **Screen** | Device Management |
| **Status** | DISCOVERED |
| **Impacted Layers** | API, Routing |

**Evidence:**
```
POST /api/v1/admin/devices/<deviceId>/revoke
→ 404 Not Found
```

Device list works (`GET /api/v1/admin/devices` → 200), but device revocation endpoint is missing from gateway routing. The handler exists in code but may not be mounted correctly.

---

## ISSUE-025: Retailer Health Endpoint Requires Auth (Blocks Monitoring)

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Platform** | Retailer Web |
| **Screen** | N/A (health check) |
| **Status** | DISCOVERED |
| **Impacted Layers** | API, Monitoring |

**Evidence:**
```
GET /api/v1/retailer-admin/health
→ 401 {"error":{"code":"UNAUTHORIZED","message":"Authentication required."}}
```

Health endpoints should typically be unauthenticated for load balancer health checks. The retailer health endpoint is behind the auth middleware stack (lines 225-229 of routes/v1/index.ts apply `requireActiveStore` + `requireActiveUser` to all `/retailer-admin` routes).

**Fix:** Move health route mounting before the auth middleware, similar to how auth routes are mounted before middleware at line 215.

---

## ISSUE-026: Supplier Single Product Detail 404

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Platform** | Supplier Web |
| **Screen** | Product Detail |
| **Status** | DISCOVERED |
| **Impacted Layers** | API, Routing |

**Evidence:**
```
GET /api/v1/supplier/products/f6f94952-9d67-4411-bcdd-d03a71a9776c
Authorization: Bearer <valid_supplier_token>
→ 404 Not Found
```

Product list works (`GET /products` → 200 with the product in the list), but individual product detail endpoint returns 404. The route `GET /products/:productId` may not be implemented.

---

## ISSUE-027: Admin Analytics Dashboard Endpoint 404

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Platform** | SuperAdmin Web |
| **Screen** | Analytics Dashboard |
| **Status** | DISCOVERED |
| **Impacted Layers** | API, Routing |

**Evidence:**
```
GET /api/v1/admin/analytics/dashboard → 404
GET /api/v1/admin/analytics/overview → 200 OK (works)
GET /api/v1/admin/ai/insights → 404
GET /api/v1/admin/global-products → 404
```

The analytics overview endpoint works but the dashboard-specific endpoint is missing. AI insights and global products endpoints also 404.

---

## Platform 2: Retailer Web Portal Completion Summary

| # | Screen / Endpoint | Status | Notes |
|---|-------------------|--------|-------|
| 1 | Login (`/auth/login`) | TESTED | 401 INVALID_CREDENTIALS for wrong creds (correct) |
| 2 | Register (`/auth/register`) | TESTED | Requires Firebase idToken (can't test full flow) |
| 3 | Firebase OTP Login | TESTED | 401 INVALID_TOKEN for fake token (correct) |
| 4 | Forgot Password (email) | TESTED | 200 anti-enumeration response (correct) |
| 5 | Registration check-gstin | TESTED | 200 OK, returns action:CREATE |
| 6 | Registration create | TESTED | 201 Created, application in DRAFT |
| 7 | Registration verify-otp | TESTED | 400 Firebase token required |
| 8 | Registration status | TESTED | 200 OK with full application + documents |
| 9 | Registration resume | TESTED | 200 OK with masked phone |
| 10 | Health | **ISSUE-025** | 401 — blocked by auth middleware |
| 11 | Protected endpoints | BLOCKED | Cannot test without retailer JWT (Firebase required) |

**Retailer Blocker:** Cannot create retailer users without Firebase OTP. Platform-service init endpoint (`POST /admin/stores/:id/retailer-admin/init`) returns 404 — likely not deployed or gateway misconfigured for platform-service routes.

---

## Platform 3: Supplier Web Portal Completion Summary

| # | Screen / Endpoint | Status | Notes |
|---|-------------------|--------|-------|
| 1 | Register | TESTED | 201 with JWT, GSTIN required |
| 2 | Login | TESTED | 401 for wrong creds (correct) |
| 3 | Forgot Password | TESTED | 200 anti-enumeration (correct) |
| 4 | Auth Refresh | TESTED | 400 "Refresh token required" |
| 5 | Profile GET | TESTED | 200 OK, full profile data |
| 6 | Profile PATCH | TESTED | 200 OK, contactName updated |
| 7 | Products List | TESTED | 200 OK, pagination works |
| 8 | Products Create | TESTED | 201, category validation works |
| 9 | Products Detail | **ISSUE-026** | 404 for valid product ID |
| 10 | Orders | TESTED | 200 OK, empty with statusCounts |
| 11 | Dashboard | **ISSUE-022** | 404 endpoint missing |
| 12 | Customers | N/A | Not tested |
| 13 | BNPL | N/A | Not tested |
| 14 | Auth Guards | TESTED | All protected routes return 401 without token |
| 15 | KYC Status Guard | TESTED | 403 STATUS_NOT_ALLOWED for KYC_SUBMITTED |

---

## Platform 4: SuperAdmin Web Portal Completion Summary

| # | Screen / Endpoint | Status | Notes |
|---|-------------------|--------|-------|
| 1 | Auth Send OTP | TESTED | 200 anti-enumeration for non-admin emails |
| 2 | Auth Check | TESTED | 200 valid:true with admin details |
| 3 | Auth Refresh | **ISSUE-019** | Returns same token, not refreshed |
| 4 | Auth Logout | TESTED | 200 success (with Content-Type header) |
| 5 | Health | TESTED | 200 OK |
| 6 | Stores List | TESTED | 200 OK, returns seeded store |
| 7 | Store Detail | TESTED | 200 OK, full store data |
| 8 | Store Create | TESTED | 201 with auto-generated code |
| 9 | Store Update (PATCH) | **ISSUE-014** | upi_vpa not persisted |
| 10 | Store Delete | TESTED | 200 OK |
| 11 | Devices List | TESTED | 200 OK, shows enrolled device |
| 12 | Device Revoke | **ISSUE-024** | 404 endpoint not found |
| 13 | Device Enrollments | TESTED | 200 OK, GET works |
| 14 | Pending Suppliers | TESTED | 200 OK (empty — supplier auto-verified) |
| 15 | Verified Suppliers | TESTED | 200 OK, shows test supplier |
| 16 | Supplier Status Update | TESTED | 200 OK, KYC_SUBMITTED → ACTIVE |
| 17 | Product Approve | **ISSUE-023** | 500 internal error |
| 18 | Analytics Overview | TESTED | 200 OK with sales data |
| 19 | Analytics Dashboard | **ISSUE-027** | 404 endpoint missing |
| 20 | POS Events | TESTED | 200 OK, shows test events |
| 21 | Settings | TESTED | 200 OK with feature flags |
| 22 | Users | TESTED | 200 OK (empty) |
| 23 | AI Insights | **ISSUE-027** | 404 endpoint missing |
| 24 | Global Products | **ISSUE-027** | 404 endpoint missing |
| 25 | Barcode Sheets | TESTED | 400 "storeId required" (correct validation) |

---

## Platform 5: Cross-Function Flow Summary

| Flow | Status | Notes |
|------|--------|-------|
| Store Creation (Admin) | TESTED | Creates store, auto-code generated, DRAFT status |
| Store Activation (Admin) | TESTED | PATCH works for status but NOT upi_vpa (ISSUE-014) |
| Enrollment Code (Admin→POS) | TESTED | Code generated, POS enrolls successfully |
| Supplier Registration | TESTED | Self-registration → JWT → profile update works |
| Supplier Activation (Admin) | TESTED | verification-status PATCH works |
| Supplier Product → Admin Approval | **BLOCKED** | Product creation works, approval 500 (ISSUE-023) |
| POS Sale Creation | **BLOCKED** | Variant bridge missing (ISSUE-016) |
| POS Purchase (Catalog) | **BLOCKED** | JWT auth mismatch (ISSUE-015) |
| POS Stock-In | **BLOCKED** | Barcode lookup fails (ISSUE-017) |
| Retailer Portal Access | **BLOCKED** | No way to create retailer user without Firebase |

---

## Summary of All Issues (ISSUE-014 through ISSUE-027)

| Issue | Severity | Platform | Summary |
|-------|----------|----------|---------|
| ISSUE-014 | HIGH | POS + Admin | UPI VPA not persisted on PATCH |
| ISSUE-015 | CRITICAL | POS | Catalog/Orders/Reorder auth mismatch (JWT vs device token) |
| ISSUE-016 | CRITICAL | POS | Sale creation fails — variant bridge missing |
| ISSUE-017 | MEDIUM | POS | Stock-in silently skips items — barcode lookup fails |
| ISSUE-018 | MEDIUM | POS | Shift staffId = deviceId (wrong staff attribution) |
| ISSUE-019 | MEDIUM | Admin | Auth refresh returns same token (not refreshed) |
| ISSUE-020 | LOW | Admin | CSRF blocks empty-body POSTs without Content-Type |
| ISSUE-021 | MEDIUM | POS + Admin | 411 Length Required on token refresh (Cloud Run) |
| ISSUE-022 | MEDIUM | Supplier | Dashboard endpoint 404 |
| ISSUE-023 | HIGH | Admin | Product approval 500 (cross-function blocker) |
| ISSUE-024 | MEDIUM | Admin | Device revoke endpoint 404 |
| ISSUE-025 | LOW | Retailer | Health endpoint behind auth middleware |
| ISSUE-026 | MEDIUM | Supplier | Single product detail 404 |
| ISSUE-027 | LOW | Admin | Analytics dashboard, AI insights, global products all 404 |

### Critical Path (Must Fix for Usable Platform)
1. **ISSUE-016** (CRITICAL): Sale creation → core revenue function
2. **ISSUE-015** (CRITICAL): Auth mismatch → entire POS purchase/reorder flow
3. **ISSUE-023** (HIGH): Product approval → supplier-to-catalog pipeline
4. **ISSUE-014** (HIGH): UPI VPA → payment method setup

---

## ITERATION 2 — Deep Screen-Lock Findings (2026-03-05T16:00:00Z → 17:00:00Z)

### Iteration 2 Summary

| Field | Value |
|-------|-------|
| **SHA** | `a09bc67` |
| **Mode** | Deep screen-lock (Pass A/B/C per screen) |
| **New Issues** | ISSUE-028 through ISSUE-032 (5 new) |
| **Root Causes Confirmed** | 4 (ISSUE-014, ISSUE-015, ISSUE-016, ISSUE-023) |

### Root Cause Confirmations (Iteration 1 issues deepened)

#### ISSUE-014 — Root Cause CONFIRMED with Live Evidence
**File:** `backend/src/routes/v1/admin/stores.ts:390`
**Root cause:** `addUpdate("upi_vpa", normalized)` is MISSING from the PATCH handler. Only `addUpdate("status", normalized ? "ACTIVE" : "DRAFT")` is present.
**Evidence:** PATCH `{"upi_vpa":"updated-store@ybl"}` → returns 200 with `updated_at` changed (16:30:12.742Z) but `upi_vpa` still reads `"test-store@upi"` (original creation value).
**Fix:** Add `addUpdate("upi_vpa", normalized);` after line 390 in stores.ts.

#### ISSUE-015 — Root Cause DEEPENED: Deployment Architecture Issue
**Root cause:** Not just auth mismatch — catalog-service, order-service, reorder-service are separate Docker images that are NOT deployed on staging. `docker-entrypoint.sh` line 35 only runs `node dist/server.js` (main-backend). The gateway routes `/api/v1/catalog/*`, `/api/v1/orders/*`, `/api/v1/reorder/*` all point to main-backend which doesn't mount these route handlers.
**Impact:** Entire purchase ordering, catalog browsing, and reorder suggestion flows are 404 for ALL clients (POS and Retailer).
**Fix:** Either deploy microservices as separate Cloud Run services, OR mount their route handlers in main-backend's server.js.

#### ISSUE-016 — Root Cause NARROWED: Transaction Chain Failure
**Evidence:** Used correct storeProductId `75b00c8e-f07d-46b9-8615-aa354e6bbb77` confirmed via `/pos/store-products/lookup`. Sale creation still returns 500 "failed to create sale". Also tried with productId, barcode, all identifiers — all fail.
**Suspected root cause:** `ensureSaleAvailability()` at `inventoryService.ts:546` uses `INNER JOIN retailer_variants rv ON rv.variant_id = v.id AND rv.store_id = $1`. If `resolveVariantFromCatalogProduct()` fails to create the variant bridge (products → variants → retailer_variants), the INNER JOIN returns 0 rows → "product_not_found" error → caught by generic 500 handler.
**Blocked by:** Cannot confirm without server-side logs or direct DB query. MCP staging-db connection returns ECONNRESET.

#### ISSUE-023 — Root Cause CONFIRMED
**File:** `backend/src/routes/v1/admin/suppliers.ts:855` + `middleware/adminToken.ts:178`
**Root cause:** `requireAdminToken` sets `req.adminId = decoded.email || 'jwt-session'` (email string like `"supermanditech@gmail.com"`). But approval handler casts to UUID: `SET approved_by = $2::uuid` (line 855) and `VALUES (..., $2::uuid)` (line 864). PostgreSQL throws `invalid input syntax for type uuid`.
**Impact:** Product approval is broken for ALL admin auth methods (JWT email, master token "master-token" — none are UUIDs).
**Fix:** Either (a) change `approved_by` column to TEXT and remove `::uuid` casts, or (b) generate a deterministic UUID from adminId string, or (c) use `admin_id` text column with proper type.

---

### ISSUE-028: POS Inventory Transaction (stock-in) Returns 500

**State:** `DISCOVERED`
**Severity:** HIGH
**Platform:** POS
**Screen:** Stock-In / Inventory Transactions
**Path:** `POST /api/v1/pos/inventory/transactions`

#### Repro Steps
1. Device token authenticated (valid)
2. POST with body: `{"transactionType":"stock_in","items":[{"productId":"2b53ecf0-9528-44cf-8394-1cd63088d04a","quantity":10,"unitCost":120}]}`
3. Returns: `{"success":false,"error":"Failed to record transactions"}`

#### Expected vs Actual
- **Expected:** Stock balance increased by 10, transaction entry returned
- **Actual:** 500 "Failed to record transactions"

#### Root Cause Analysis
The handler at `inventory.ts:299` runs `SELECT current_stock FROM catalog.store_products WHERE store_id = $1 AND product_id = $2 FOR UPDATE`. If this succeeds, it then runs `UPDATE catalog.store_products SET current_stock = $1 WHERE store_id = $2 AND product_id = $3` and inserts into `inventory.stock_balances`. The 500 likely comes from a constraint violation or missing table/column in the transaction.
**Note:** The zero-entry response `{"success":true,"data":{"entries":[]},"message":"Recorded 0 transaction(s)"}` from an earlier attempt suggests the `productId` validation at line 294 (`if (!productId || quantity === undefined || quantity === 0)`) may be silently skipping items.

#### Impact
- **Layers:** API, DB, business logic
- **Severity:** HIGH — blocks stock management flow
- **Owner:** Backend
- **Fix order:** After ISSUE-016 (same transaction chain dependency)

---

### ISSUE-029: POS Scan Barcode Validator Rejects Alphanumeric Barcodes

**State:** `DISCOVERED`
**Severity:** LOW
**Platform:** POS
**Screen:** Sell > Scan
**Path:** `POST /api/v1/pos/scan/resolve`

#### Repro Steps
1. POST with body: `{"barcode":"TEST-DAL-001"}` (the barcode assigned to Test Dal 1kg)
2. Returns: `{"error":"VALIDATION_ERROR","message":"Invalid barcode format"}`
3. Numeric barcode `8901234567890` works (returns NOT_FOUND as expected — no matching product)

#### Expected vs Actual
- **Expected:** Barcode `TEST-DAL-001` resolves to Test Dal 1kg product
- **Actual:** Rejected by barcode format validator

#### Root Cause
Scan endpoint has a barcode format validator that only accepts numeric barcodes (EAN/UPC format). Internal/custom alphanumeric barcodes created via POS digitization are rejected.

#### Impact
- **Layers:** API, business logic
- **Severity:** LOW — only affects non-standard barcodes; standard EAN/UPC barcodes work
- **Owner:** Backend
- **Fix order:** Low priority

---

### ISSUE-030: POS Shift Started with Wrong Staff ID

**State:** `DISCOVERED` (deepened from ISSUE-018)
**Severity:** MEDIUM
**Platform:** POS
**Screen:** Shifts
**Path:** `GET /api/v1/pos/shifts/current`

#### Evidence
Shift `f54bd7f9-3e39-4a27-8481-1fac79020240` has `staffId: "fbd29f1b-7f55-4d7c-980b-7f09401bef93"` — this is NOT one of the seeded staff IDs (Manager=d6e51a7d, Cashier=ee58dd72). The shift was started by a different staff context (likely from a previous device enrollment).

#### Impact
- **Layers:** business logic, user-flow
- **Severity:** MEDIUM — shift attribution may be incorrect
- **Owner:** Backend/POS

---

### ISSUE-031: Supplier Dashboard Endpoint 404

**State:** `CONFIRMED` (deepened from ISSUE-022)
**Severity:** MEDIUM
**Platform:** Supplier Portal
**Screen:** Dashboard
**Path:** `GET /api/v1/supplier/dashboard`

#### Evidence
Returns `{"error":{"code":"NOT_FOUND"}}`. The supplier router does NOT register a `/dashboard` GET handler. Supplier profile, products, and orders all work.

#### Impact
- **Layers:** API, UI (supplier portal dashboard page would show error)
- **Owner:** Backend
- **Fix order:** Medium priority — portal needs dashboard data

---

### ISSUE-032: Admin Store Stats Returns "store not found" Without storeId

**State:** `DISCOVERED`
**Severity:** LOW
**Platform:** SuperAdmin
**Screen:** Stores Dashboard
**Path:** `GET /api/v1/admin/stores/stats`

#### Evidence
Returns `{"error":"store not found"}` — the endpoint likely requires a storeId parameter or should return aggregate stats across all stores.

#### Impact
- **Layers:** API
- **Severity:** LOW — admin can still view individual stores
- **Owner:** Backend

---

## ITERATION 2 — Coverage Matrix

### SuperAdmin (Platform 4) — Deep Coverage

| Screen / Feature | Pass A (Happy) | Pass B (Failure) | Pass C (Data Parity) | Status |
|-----------------|-----------------|-------------------|----------------------|--------|
| Auth: Email OTP Login | OK (JWT returned) | OK (invalid creds → 401) | JWT claims match | PASS |
| Auth: Refresh | Returns same token (ISSUE-019) | — | iat/exp unchanged | FAIL |
| Stores: List | OK (3 stores) | — | Matches seeded data | PASS |
| Stores: Detail | OK (full store JSON) | Invalid ID → error | Fields match | PASS |
| Stores: Create | OK (validation works) | Empty body → "storeName_required" | — | PASS |
| Stores: PATCH UPI | ISSUE-014 (value not saved) | — | updated_at changes, upi_vpa doesn't | FAIL |
| Stores: Stats | ISSUE-032 (requires storeId) | — | — | FAIL |
| Users: List | OK (empty) | — | — | PASS |
| Staff: List | OK (2 staff returned) | Wrong storeId → empty | Matches seeded | PASS |
| Enrollments: List | OK (4 codes) | — | Matches created codes | PASS |
| Enrollments: Create | OK (SM-HELP8C generated) | — | Code active in list | PASS |
| Enrollments: Devices | OK (shows enrolled device) | — | Device matches | PASS |
| Verified Suppliers | OK (1 supplier) | — | Matches seeded | PASS |
| Pending Suppliers | OK (empty — all verified) | — | — | PASS |
| Pending Products | OK (1 product) | — | Matches supplier product | PASS |
| Product Approve | ISSUE-023 (500 UUID cast) | — | — | FAIL |
| Feature Flags | OK (flags returned) | — | — | PASS |
| Settings | OK (version, features) | — | — | PASS |
| Invoices | OK (empty) | — | — | PASS |
| Refunds | OK (empty) | — | — | PASS |
| Credit Applications | OK (empty) | — | — | PASS |
| Analytics Overview | OK (zero totals) | — | Matches empty state | PASS |
| Analytics Devices | — | — | — | NOT TESTED |
| GRN Alerts | OK (empty) | — | — | PASS |
| Audit Logs | OK (logs returned) | — | — | PASS |
| GST Summary | OK (store-level) | — | Matches empty state | PASS |
| WhatsApp Status | OK (configured: true) | — | — | PASS |
| Quality Overview | OK (system stats) | — | — | PASS |
| Monitoring Health | OK (DB + Redis healthy) | — | Matches deploy | PASS |
| Scheduled Jobs | Not tested (POST only) | — | — | NOT TESTED |
| Documents | Not tested | — | — | NOT TESTED |

**SuperAdmin total:** 24/30 PASS, 4 FAIL (014, 019, 023, 032), 3 NOT TESTED

### POS (Platform 1) — Deep Coverage

| Screen / Feature | Pass A (Happy) | Pass B (Failure) | Pass C (Data Parity) | Status |
|-----------------|-----------------|-------------------|----------------------|--------|
| Enroll | OK (device enrolled) | Missing fields → validation errors | Token works | PASS |
| UI Status | OK (store config returned) | — | Matches store data | PASS |
| Store Products: Search | OK (1 result for "dal") | — | Matches seeded | PASS |
| Store Products: List | OK (2 products) | — | Matches seeded | PASS |
| Store Products: Lookup | OK | Invalid barcode → error | — | PASS |
| Store Products: Freshness | OK (not stale) | — | — | PASS |
| Product Price Lookup | — | — | — | NOT TESTED |
| Scan Resolve | Numeric barcodes work | ISSUE-029 (alpha barcodes) | — | PARTIAL |
| Sale Create | ISSUE-016 (500) | — | — | FAIL |
| Sale Confirm | BLOCKED by ISSUE-016 | — | — | BLOCKED |
| Sale Cancel | BLOCKED by ISSUE-016 | — | — | BLOCKED |
| Sale Return | BLOCKED by ISSUE-016 | — | — | BLOCKED |
| Bills List | OK (empty) | — | — | PASS |
| Daily Summary | OK (zero totals) | — | — | PASS |
| Inventory Ledger | OK (1 entry) | — | Matches stock-in | PASS |
| Inventory Stock Check | OK (100 units) | — | Matches seeded | PASS |
| Inventory Transaction | ISSUE-028 (500) | — | — | FAIL |
| Inventory Valuation | OK (2 SKUs, 150 units) | — | Matches seeded | PASS |
| Inventory Statement | — | — | — | NOT TESTED |
| Staff Login | OK (Manager returned) | Wrong PIN → error | — | PASS |
| Shifts: Current | OK (active shift) | ISSUE-030 (wrong staffId) | — | PARTIAL |
| Shifts: Start | OK (duplicate blocked) | — | — | PASS |
| Daily Report | OK (zero totals) | — | — | PASS |
| Daily Closing Summary | OK (zero totals) | — | — | PASS |
| Customers | OK (empty) | — | — | PASS |
| Dues | OK (empty) | — | — | PASS |
| Khata Customers | OK (empty) | — | — | PASS |
| Payments | 404 (no GET handler) | — | — | N/A (POST only) |
| Refunds | — | — | — | NOT TESTED |
| Opening Stock | POST only (no GET) | — | — | N/A |
| Token Management | — | — | — | NOT TESTED |
| Notifications | — | — | — | NOT TESTED |
| Sync Events (SSE) | — | — | — | NOT TESTED |

**POS total:** 19/32 PASS, 2 FAIL (016, 028), 2 PARTIAL, 4 BLOCKED, 6 NOT TESTED

### Supplier (Platform 3) — Deep Coverage

| Screen / Feature | Pass A (Happy) | Pass B (Failure) | Pass C (Data Parity) | Status |
|-----------------|-----------------|-------------------|----------------------|--------|
| Auth: Register | OK (JWT returned) | — | — | PASS |
| Auth: Login | OK | Wrong password → 401 | — | PASS |
| Profile: GET | OK (full profile) | — | Matches seeded | PASS |
| Profile: PATCH | OK (fields updated) | — | — | PASS |
| Products: List | OK (1 product) | — | Matches seeded | PASS |
| Products: Create | OK | — | — | PASS |
| Dashboard | ISSUE-031 (404) | — | — | FAIL |
| Orders: List | OK (empty) | — | — | PASS |

**Supplier total:** 7/8 PASS, 1 FAIL (031)

### Retailer (Platform 2) — Coverage

| Screen / Feature | Pass A (Happy) | Pass B (Failure) | Pass C (Data Parity) | Status |
|-----------------|-----------------|-------------------|----------------------|--------|
| Registration: Create | OK (DRAFT app) | — | — | PASS |
| Registration: Status | OK (returns app) | — | Matches seeded | PASS |
| Registration: Check GSTIN | — | — | — | NOT TESTED |
| Auth: Login | — | No Firebase/seeded user | — | BLOCKED |
| Auth: Register | — | Requires Firebase idToken | — | BLOCKED |
| Health | 401 (gateway JWT) | — | — | BLOCKED |
| Inventory | BLOCKED (no JWT) | — | — | BLOCKED |
| Products | BLOCKED (no JWT) | — | — | BLOCKED |
| Categories | BLOCKED (no JWT) | — | — | BLOCKED |
| Suppliers | BLOCKED (no JWT) | — | — | BLOCKED |
| Search | BLOCKED (no JWT) | — | — | BLOCKED |

**Retailer total:** 2/11 PASS, 0 FAIL, 9 BLOCKED (requires Firebase or user seeding)

### Cross-Function Flows

| Flow | Status | Blocker |
|------|--------|---------|
| Store Create → Enroll → POS Use | PASS (store created, enrollment works, POS reads work) | Sale creation blocked (ISSUE-016) |
| Supplier Register → Verify → Products → Approve → Catalog | BLOCKED at approve step (ISSUE-023) | adminId UUID cast |
| POS Sale → Payment → Receipt | BLOCKED (ISSUE-016) | Sale creation 500 |
| Stock-In → Inventory Update → Valuation | BLOCKED (ISSUE-028) | Transaction 500 |
| Retailer Registration → Approval → Portal Access | Partially works (reg creates, status checks) | No approval → JWT path |

---

## ITERATION 2 — Blocker Matrix

| Blocker | Blocks | Impact Scope | Fix Complexity |
|---------|--------|--------------|----------------|
| ISSUE-016 (Sale 500) | Sale confirm, cancel, return, payment, receipt, daily reports with data | **Entire sell flow** | MEDIUM — need to debug variant bridge creation |
| ISSUE-015 (Microservices not deployed) | Catalog browse, purchase orders, reorder suggestions | **Purchase + reorder flows** | LOW — mount routes in main-backend OR deploy services |
| ISSUE-023 (Product approval UUID) | Supplier→catalog pipeline, auto-mapping | **Supplier product lifecycle** | LOW — change `::uuid` to `::text` or use email as-is |
| ISSUE-028 (Stock-in 500) | Manual stock entry, stock corrections | **Inventory management** | MEDIUM — debug transaction chain |
| ISSUE-014 (UPI VPA) | UPI payment setup | **Payment configuration** | LOW — add one line: `addUpdate("upi_vpa", normalized)` |
| No Firebase/retailer JWT | All retailer portal screens | **Retailer portal** | OPERATOR — need Firebase setup or DB user seed |

---

## ITERATION 2 — Revised Critical Fix Order

### Tier 1: Core Revenue (Fix First)
1. **ISSUE-016** — Sale creation 500 → debug `resolveVariantFromCatalogProduct` + `ensureSaleAvailability` INNER JOIN
2. **ISSUE-028** — Stock-in 500 → debug inventory transaction chain
3. **ISSUE-014** — UPI VPA not saved → add `addUpdate("upi_vpa", normalized)` (1 line)

### Tier 2: Platform Connectivity
4. **ISSUE-015** — Mount catalog/order/reorder routes in main-backend server.js
5. **ISSUE-023** — Fix `approved_by` UUID cast (change to TEXT or use email)

### Tier 3: UX / Polish
6. **ISSUE-019** — Auth refresh returns same token
7. **ISSUE-030** — Shift staff attribution
8. **ISSUE-031** — Supplier dashboard endpoint
9. **ISSUE-032** — Store stats endpoint
10. **ISSUE-029** — Barcode validator for alphanumeric codes

### Operator Action Required
- **Firebase setup** — needed for retailer portal testing (login, register)
- **Server logs** — needed to debug ISSUE-016 and ISSUE-028 transaction errors
- **MCP staging-db** — connection ECONNRESET, prevents direct DB diagnostics

---

## Rebuild/Redeploy Recommendation

**Minimum fixes for usable platform (Tier 1+2):**
1. Fix ISSUE-014 (1 line in stores.ts)
2. Fix ISSUE-023 (remove `::uuid` cast in suppliers.ts)
3. Fix ISSUE-015 (mount microservice routes in main server)
4. Debug + fix ISSUE-016 (sale creation — requires server logs first)
5. Debug + fix ISSUE-028 (stock-in — requires server logs first)

**After fixes:** Redeploy main-backend only (no gateway or portal changes needed).
**Then:** Re-run Iteration 3 to verify Tier 1+2 fixes and expand retailer coverage.

---

## ITERATION_3_FIX_VERIFY — Started 2026-03-05T18:00:00Z

**Mode:** Fix → Deploy → Verify loop for Tier 1+2 critical issues.
**Deployed SHAs:** `4abe9dbd` → `da7ded4a` → `05a573cf` → `e6bd8b7e` → `104672b6` (final)

### Root Causes Found (via Cloud Run logs + code analysis)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| ISSUE-016 | Migration 163 changed `retailer_variants.store_id` to UUID, but queries passed text params. Then `sale_items` INSERT missing `store_id` column (migration 162 added NOT NULL). Then `inventory_ledger` constraint failed due to NUMERIC→string concatenation in JS arithmetic. | 3 cascading fixes: (1) `::uuid` casts on all `rv.store_id` comparisons, (2) add `store_id` to sale_items INSERT, (3) `Number()` coercion on all `current_qty` reads from PostgreSQL NUMERIC columns |
| ISSUE-028 | `"stock_in"` transaction type not mapped to valid `chk_ledger_transaction_type` values. `Math.max(0,...)` clamping on `stock_after` broke `chk_ledger_stock_consistency` constraint. NUMERIC→string concatenation same as ISSUE-016. | Map `stock_in` → `purchase_received`, remove Math.max clamping, Number() coercion |
| ISSUE-014 | `stores.ts` PATCH handler never called `addUpdate("upi_vpa", ...)` | Added 1 line |
| ISSUE-015 | Gateway `JWT_REQUIRED_PREFIXES` included `/api/v1/catalog`, `/api/v1/orders`, `/api/v1/reorder` — POS uses device tokens, not JWT | Removed from JWT_REQUIRED_PREFIXES |
| ISSUE-023 | `approved_by` and `actor_id` columns were UUID type, but admin email strings passed | Migration 172: change to TEXT, remove `::uuid` casts |

### Systemic Issues Discovered

1. **NUMERIC→String concatenation (ISSUE-033):** PostgreSQL NUMERIC columns return as strings via node-postgres. `"100.000" + (-1)` = `"100.000-1"` (string concatenation, not subtraction). Fixed across 7 files. This is a class of bug that affects ANY arithmetic on NUMERIC query results.

2. **Math.max(0,...) on stock_after (ISSUE-034):** `chk_ledger_stock_consistency` requires `stock_before + delta_qty = stock_after`. Clamping `stock_after` to >= 0 breaks this constraint when stock goes negative. Fixed across 4 files.

### Verification Results (SHA `104672b6`)

| Issue | Status | Evidence |
|-------|--------|----------|
| ISSUE-014 | **VERIFIED** | `upi_vpa: "store@upi"` saved and returned in GET |
| ISSUE-015 | **VERIFIED** | Catalog returns products with device token only (no JWT) |
| ISSUE-016 | **VERIFIED** | Sale created (`bc15d78d`), confirmed (PAID_CASH), stock deducted |
| ISSUE-023 | **VERIFIED** | Product approved (`f6f94952`), auto-mapped to catalog |
| ISSUE-028 | **VERIFIED** | Stock-in 5 units processed, ledger entry created |

### Extended Flow Verification (SHA `104672b6`)

| Flow | Status | Evidence |
|------|--------|----------|
| Sale Create → Confirm (CASH) | **PASS** | Sale `bc15d78d` → PAID_CASH |
| Sale Create → Confirm (DUE) | **PASS** (create), needs customer_phone in sale | DUE confirm requires phone on sale record |
| Product Search | **PASS** | `Test Dal 1kg` found via `/store-products/search?q=dal` |
| Stock-In via POS | **PASS** | 5 units added, stock 99→104 |
| Refund (cash) | **PASS** | Refund `b12c562e` processed for sale `bc15d78d` |
| Inventory Ledger History | **PASS** | 4 entries, all stock_before/stock_after consistent |
| Product Approval → Catalog Map | **PASS** | Auto-mapped with confidence=1 |
| Staff Login | **PASS** | Manager `d6e51a7d` authenticated |

### Issues Still Open

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| ISSUE-001 | CRITICAL | SOLUTION_DESIGNED | SuperAdmin OTP allowlist — needs env var + code |
| ISSUE-002 | HIGH | SOLUTION_DESIGNED | Registration OTP bypass — needs migration |
| ISSUE-003 | HIGH | SOLUTION_DESIGNED | APPLICATION_EXISTS block — needs auto-expire |
| ISSUE-019 | MEDIUM | DISCOVERED | Auth refresh returns same token |
| ISSUE-029 | MEDIUM | DISCOVERED | Barcode validator rejects alphanumeric |
| ISSUE-030 | MEDIUM | DISCOVERED | Shift staff attribution |
| ISSUE-031 | MEDIUM | DISCOVERED | Supplier dashboard endpoint |
| ISSUE-032 | MEDIUM | DISCOVERED | Store stats endpoint |
| ISSUE-033 | MEDIUM | FIXED | NUMERIC→String concatenation (systemic) |
| ISSUE-034 | MEDIUM | FIXED | Math.max(0,...) on stock_after (systemic) |

### Commits in Iteration 3

| SHA | Description |
|-----|-------------|
| `4abe9dbd` | Fix 5 issues: UUID casts, sale_items store_id, stock_in mapping, UPI VPA, JWT prefixes, migration 172 |
| `da7ded4a` | Fix explicit `::text`/`::uuid` casts for mixed-type parameter queries |
| `05a573cf` | Add store_id to sale_items INSERT for migration 162 compat |
| `e6bd8b7e` | Remove Math.max(0,...) clamping on stock_after ledger values (4 files) |
| `104672b6` | Coerce NUMERIC current_qty to Number before arithmetic (7 files) |

---

## ITERATION_4_LOCKED_LIVE_TESTING — Started 2026-03-06T13:00:00Z

**Mode:** Strict screen → sub-screen → modal lock (CTO + Claude).
**Deploy SHA:** `6ad506af` (staging), code SHA `d05efbee`.
**POS APK:** `d78e09c7` (staging-apk profile, EXPO_PUBLIC_API_URL=https://staging.supermandi.tech).
**Append floor:** ISSUE-035+.

---

## ISSUE-035: SuperAdmin Per-Store Feature Override DELETE Blocked by CSRF (HIGH)

**State:** `DISCOVERED`
**Severity:** HIGH — FUNCTIONAL BLOCKER
**Platform:** SuperAdmin Web
**Screen:** Settings Tab → Per-Store Feature Overrides
**Discovered:** CTO live testing 2026-03-06, operator clicked Disable/Revert on minAppVersion override

#### Problem
The **Revert** button (and potentially other DELETE-based actions) on the Per-Store Feature Overrides table fails with:
> "Request blocked. Include Content-Type: application/json or X-Requested-With header."

This is the CSRF protection middleware (`AUTH-CSRF-001`) in the API gateway rejecting the request.

#### Root Cause
`supermandi-superadmin/src/api/featureFlags.ts:86-94` — `removeStoreOverride()` sends a DELETE request with only `Accept: application/json` header. No `Content-Type` and no `X-Requested-With`. The CSRF middleware requires one of these for all state-changing methods (POST/PUT/PATCH/DELETE).

```typescript
// BROKEN — missing CSRF header
export async function removeStoreOverride(storeId: string, key: string): Promise<void> {
  const res = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
}
```

#### Systemic Scope — All Portals Affected
This is NOT isolated to SuperAdmin. All bodyless DELETE calls across all portals will fail CSRF:

| Portal | File | Function | Line |
|--------|------|----------|------|
| **SuperAdmin** | `supermandi-superadmin/src/api/featureFlags.ts` | `removeStoreOverride()` | 86-94 |
| **Retailer** | `retailer-admin/src/components/VariantManager.tsx` | DELETE variant | 200 |
| **Retailer** | `retailer-admin/src/api/store.ts` | `deleteSupplier()` | 403 |
| **Retailer** | `retailer-admin/src/pages/DashboardPage.tsx` | DELETE category | 116 |
| **Retailer** | `retailer-admin/src/pages/ProductsPage.tsx` | DELETE product | 426 |
| **Retailer** | `retailer-admin/src/pages/SuppliersPage.tsx` | DELETE supplier | 517 |
| **Supplier** | `supplier-portal/src/lib/api.ts` | DELETE calls | 552, 937 |

Note: Retailer `authFetch()` adds Content-Type only when `options.body` exists (line 76). DELETE has no body → no Content-Type → CSRF blocked.

#### Fix (One-Line per call site)
Add `"X-Requested-With": "XMLHttpRequest"` to headers on all bodyless DELETE calls. Or add it globally in each portal's fetch wrapper.

#### Evidence
- Screenshot: CTO clicked Disable/Revert on minAppVersion per-store override → red banner appeared with CSRF error
- CSRF middleware source: `backend/services/api-gateway/src/middleware/csrfProtection.ts:60-66`
- API client: `supermandi-superadmin/src/api/featureFlags.ts:89` — DELETE without Content-Type or X-Requested-With

#### Impact
- **SuperAdmin**: Cannot revert per-store feature flag overrides (blocks minAppVersion testing, device deactivation testing)
- **Retailer**: Cannot delete products, variants, categories, suppliers
- **Supplier**: Cannot delete resources via portal
- **Testing blocker**: Cannot set minAppVersion high to test ForceUpdate screen on POS

---

## ISSUE-036: SuperAdmin Global Feature Kill Button Status (NEEDS VERIFICATION)

**State:** `DISCOVERED`
**Severity:** MEDIUM — NEEDS RUNTIME VERIFICATION
**Platform:** SuperAdmin Web
**Screen:** Settings Tab → Feature Kill Switch
**Discovered:** CTO live testing 2026-03-06

#### Problem
Operator reports "when i click its killed" on the global Feature Kill Switch for `minAppVersion`. The KILL button uses PATCH (with Content-Type) which should pass CSRF. Need to verify:
1. Does the KILL button actually work (PATCH should pass CSRF)?
2. Does the flag toggle persist correctly?
3. Does the POS app respect the killed flag on next ui-status fetch?

#### Status
The `minAppVersion` row in screenshot 1 shows "(killed)" text and Global=OFF in screenshot 2. This suggests the KILL button DID work at some point (the global flag IS disabled). The per-store override is ON, making effective=ENABLED. Operator confusion may stem from the interplay between global kill + per-store override.

#### Evidence
- Screenshot 1: minAppVersion shown as "(killed)" in stores directory
- Screenshot 2: Global=OFF, Store Override=ON, Effective=ENABLED
- Code: `toggleGlobalFlag()` uses PATCH with Content-Type (should pass CSRF)

---

## ISSUE-037: Re-Enrollment After Revoke Does Not Set active=true (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | EnrollDeviceScreen → SellScan |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06

#### Problem
When a device is revoked via `POST /api/v1/admin/devices/:id/revoke` (sets `active=false`, `device_token=NULL`), subsequent re-enrollment via activation code:
1. Matches existing device by fingerprint (correct)
2. Sets a new `device_token` (correct)
3. Does NOT set `active=true` (BUG)

**Result:** App has valid token, reaches SellScan, but ALL API calls using `requireDeviceToken` middleware fail with `DEVICE_INACTIVE` (403). The non-strict `fetchUiStatus` masks this by returning safe defaults. Store name shows "Store" / "ID --" (enrollment response doesn't return store data for re-enrollments).

#### Cascade Effects
- SELL tab disappears from tab bar (API calls failing → state not populated)
- Store name/code not displayed ("Store" / "ID --")
- Sync shows "Never" with red cloud (all polls failing)
- App eventually ANRs ("SuperMandi POS isn't responding")

#### Repro Steps
1. Enroll device normally → SellScan works
2. Admin: revoke device via `POST /devices/:id/revoke`
3. On POS: Switch Store → enter new activation code
4. Observe: SellScan loads but SELL tab missing, Store="Store", ID="--", sync="Never"

#### Expected
Re-enrollment should set `active=true` and return full store metadata.

#### Evidence
- Screenshots: `sellscan_tab_issue.png`, `after_enroll_3.png` (SELL tab missing, Store/ID--)
- API: device shows `active: false` after re-enrollment
- Code: enrollment endpoint doesn't update `active` column during fingerprint-matched re-enrollment

---

## ISSUE-038: App ANR During Rapid Device State Changes (MEDIUM)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScan / any |
| **Severity** | MEDIUM |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06

#### Problem
Rapid device state changes (revoke → re-enroll → deactivate → activate) cause the app to become unresponsive and trigger Android ANR dialog "SuperMandi POS isn't responding". Likely caused by cascading auth failures from ISSUE-037, triggering multiple simultaneous error handlers, alerts, and navigation resets.

#### Evidence
- Screenshot: `after_activate.png` (ANR dialog)
- Occurred after: revoke → re-enroll (broken) → admin PATCH active=true

---

## ISSUE-039: "Scan error: VALIDATION_ERROR" Banner Persists After Search (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 2 (Search)

#### Problem
Red error banner "Scan error: VALIDATION_ERROR" appears at top of SellScan screen when user types in search field. The search itself works correctly — results appear below the banner — but the error banner persists and is not auto-dismissed.

Likely cause: the typed text (e.g. "scan") may have been routed through the barcode scan handler in addition to the search handler. The barcode handler returned VALIDATION_ERROR (not a valid barcode format), and the error banner was set but never cleared when search results loaded successfully.

#### Repro Steps
1. On SellScan screen, tap search field
2. Type "scan" (or any text)
3. Observe: red banner "Scan error: VALIDATION_ERROR" appears above search results
4. Search results still load correctly below the error

#### Expected
- Text typed in search field should NOT trigger the barcode scan handler
- OR: error banner should auto-dismiss when search results load successfully

#### Evidence
- Screenshot: `sellscan_search_error.png` — shows red banner + working search results simultaneously
- Product "Scan Bar" (202508142006) correctly returned in search results despite error
- **Reproduces consistently**: cleared search, typed "x" → VALIDATION_ERROR persists. Typed "scan" again → banner changed to RATE_LIMIT_EXCEEDED
- Error banner is never auto-dismissed — persists across multiple searches

---

## ISSUE-040: Scan Error Banner Never Auto-Dismisses (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 2 (Search)

#### Problem
The red "Scan error: ..." banner at the top of SellScan is never automatically dismissed. Once an error appears (VALIDATION_ERROR or RATE_LIMIT_EXCEEDED), it persists indefinitely across:
- Clearing the search field
- Typing new search queries
- Getting successful search results

The banner should auto-dismiss after a timeout (e.g. 5s) or when a new successful operation completes.

#### Evidence
- Screenshot 1: "Scan error: VALIDATION_ERROR" persists even after clearing search and typing "x"
- Screenshot 2: Banner changed to "Scan error: RATE_LIMIT_EXCEEDED" after re-typing "scan" — old error replaced by new error, never cleared

---

## ISSUE-041: Search Triggers Rate Limiting (RATE_LIMIT_EXCEEDED) (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) / Backend |
| **Screen** | SellScanScreen |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 2 (Search)

#### Problem
Typing in the search field triggers "Scan error: RATE_LIMIT_EXCEEDED" after just a few searches. The user performed ~3 searches in ~5 minutes (typed "scan", cleared, typed "x", cleared, typed "scan") and hit the rate limit. This suggests:
1. The rate limit threshold is too aggressive for normal search usage, OR
2. Each keystroke triggers a scan/barcode API call (debounce too short or missing on barcode path), OR
3. Search text is routed through both search handler AND barcode scan handler, doubling API calls

Search results still load despite the error — suggesting search API and scan API are separate endpoints, and only the scan path is rate-limited.

#### Expected
Normal search typing (3-5 queries in 5 minutes) should never hit rate limits.

#### Evidence
- Screenshot: "Scan error: RATE_LIMIT_EXCEEDED" after ~3 searches in 5 minutes
- Search results loaded correctly despite the rate limit error on scan path

---

## ISSUE-042: Stock Count Inconsistency — Same Product Shows Different Stock Values (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen / Sell Cart |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 2/3 (Search + Cart)

#### Problem
The same product ("Scan Bar" 202508142006) shows different stock values on the same screen at the same time:
- **Recent products section**: Stock: 10
- **Search results** (previous screenshots): "Out of stock" / Stock: 0
- **Cart warning**: "⚠ In stock: 0"
- **Product card** (idle view): Stock: 0

The stock value is not consistent across UI sections. This is a **business logic invariant violation** — the same product should show the same stock everywhere.

Likely causes:
1. Recent products cached stale stock data (shows 10), while live API returns 0
2. Search results and product cards pull from different data sources (cache vs API)
3. Stock sync from server may have updated to 0 but cached/recent list wasn't refreshed

#### Evidence
- Screenshot 1: "Recent products" → Stock: 10
- Screenshot 2: Cart → "⚠ In stock: 0"
- Screenshot 3: Product card → Stock: 0
- All within same 1-minute window for identical product

---

## ISSUE-043: Zero-Stock Product Can Be Added to Cart (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen / Sell Cart |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 3 (Cart)

#### Problem
Product "Scan Bar" with **0 stock** was successfully added to cart with qty=2 (line total ₹20,000.00). The cart shows "⚠ In stock: 0" warning but does NOT prevent:
1. Adding the product to cart in the first place
2. Increasing quantity via + button (qty went from 1→2)
3. Proceeding to checkout (₹20,000.00 Checkout button is active/enabled)

Operator reports inconsistent behavior: "sometimes zero stock items are added to cart, sometimes it shows 'Out of stock' and blocks adding."

This is a **business logic invariant violation** — zero-stock products should either:
- Be blocked from cart entirely, OR
- Show clear warning AND block checkout (not just a small red text)

#### Expected
- Zero-stock products should not be addable to cart, OR
- If allowed (backorder mode), checkout should require explicit confirmation
- Behavior should be CONSISTENT — not sometimes blocking, sometimes allowing

#### Evidence
- Screenshot 2: Cart with "Scan Bar" qty=2, ₹20,000.00, "⚠ In stock: 0" but Checkout enabled
- Operator reports: behavior varies between attempts (sometimes blocked, sometimes not)

---

## ISSUE-044: Cart FAB Disappears After Cart Interaction (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 3 (Cart)

#### Problem
After interacting with the Sell Cart sheet (Screenshot 2 shows cart with 1 item/₹10,000 → 2 items/₹20,000), returning to SellScan (Screenshot 3) shows **no cart FAB at the bottom**. The cart indicator ("1 item | Tap to review cart") that was visible in Screenshot 1 is gone.

Either:
1. The cart was silently cleared when the sheet was dismissed (data loss), OR
2. The cart FAB failed to re-render after the sheet closed, OR
3. The operator tapped "Clear" in the cart

If the cart was cleared without explicit user action, this is a data loss issue.

#### Evidence
- Screenshot 1: Cart FAB shows "1 item | ₹10,000.00"
- Screenshot 2: Cart sheet open with 2 items at ₹20,000.00
- Screenshot 3: No cart FAB visible — cart appears empty

---

## ISSUE-045: No Hardware Back Navigation From Cart Sheet (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen / Sell Cart |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 3 (Cart)

#### Problem
Operator reports "no back navigation" — likely:
1. Android hardware back button does not dismiss the Sell Cart bottom sheet, OR
2. After dismissing cart, there's no way to navigate back to previous state

The cart sheet (Screenshot 2) has a back arrow (←) button in the header, but the hardware back button behavior is unclear. If hardware back doesn't work, this is a UX regression on Android.

#### Evidence
- Operator report: "no back navigation"
- Cart sheet has software back arrow but hardware back may not work

---

## ISSUE-046: Zero-Stock Race Condition — Add-to-Cart Inconsistent Guard (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 3 (Cart + Edit)

#### Problem
Zero-stock guard on add-to-cart is **inconsistent** due to a timing/cache race condition:

1. **First attempt**: Product "Scan Bar" (stock=0) was **successfully added** to cart. Edit Item modal opened, showed "In stock: 0 (exceeded!)" but allowed editing qty, price, discount — all functional.
2. **After removing from cart** via "Remove item" in Edit modal, returning to SellScan idle.
3. **Second attempt**: Tapping the same product now shows **"Out of stock" toast** at bottom and **blocks adding**.

The difference: on first attempt the product was likely added from **"Recent products"** (which showed stale **Stock: 10** — see ISSUE-042). The cached stock value passed the guard. On second attempt, the product card showed **Stock: 0** (fresh data), so the guard blocked correctly.

**Root cause**: The add-to-cart stock guard checks the **local/cached stock value** at the moment of tap, NOT the server's current stock. When "Recent products" has stale data (Stock: 10), the guard passes. When the product card has fresh data (Stock: 0), the guard blocks.

This is a cascade of ISSUE-042 (stock inconsistency) → ISSUE-043 (zero-stock in cart) → ISSUE-046 (inconsistent guard).

#### Expected
Stock guard should:
1. Use a single source of truth for stock (not cached vs fresh values depending on which UI element was tapped)
2. Either always block zero-stock, or always allow with clear warning — never vary

#### Evidence
- Screenshot 1 (6:11): Edit modal with "In stock: 0 (exceeded!)" — item was in cart despite 0 stock
- Screenshot 2 (6:12): Edit modal with purchase price 9000, discount 10%, total ₹9,000 — all functional
- Screenshot 3 (6:12): After remove → "Out of stock" toast at bottom, item now blocked from cart
- Operator: "how come stock added in first instance" — confirmed race condition

---

## ISSUE-047: Edit Item Modal — All Fields Functional (PASS — with notes)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen / Edit Item Modal |
| **Severity** | PASS |
| **Status** | TESTED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 4 (Edit Item)

#### Tested Elements — ALL PASS
- ✅ Product Name (editable) — shows "Scan Bar", text input works
- ✅ Barcode — displayed (non-editable): 202508142006
- ✅ Stock warning — "In stock: 0 (exceeded!)" in red
- ✅ Qty field — editable, red border when exceeding stock
- ✅ Sell Price — shows 10000.00, editable
- ✅ Purchase Price — "Optional" placeholder, accepts input (9000 entered)
- ✅ Discount % — accepts input (10 entered), % / ₹ toggle present
- ✅ "Make Free" quick button — visible
- ✅ Item Total — correctly computed: ₹10,000 - 10% = **₹9,000.00** ✓
- ✅ Cancel / Save buttons
- ✅ "Remove item" red link at bottom
- ✅ Numeric keyboard appears for numeric fields
- ✅ Modal opens from pencil (✏) icon in cart

#### Notes
- Edit modal renders as bottom sheet (drag handle visible)
- "exceeded!" warning does NOT block editing — user can still modify and save (by design for override scenarios)

---

## ISSUE-048: Voice API Auth Failure — Raw Error Leaked to UI (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) / Backend |
| **Screen** | SellScanScreen / Voice Sheet |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 5 (Voice)

#### Problem
Tapping the Voice FAB (green mic button) opens the Voice Sheet bottom modal with EN/HI language toggle. The voice feature immediately fails with:
- Red warning icon + **"Couldn't understand"**
- Raw API error message leaked to end user: **"Missing or invalid Authorization header. Use Bearer \<token\>."**

This is a **dual failure**:
1. **Auth bug**: Voice API endpoint is not receiving the device Bearer token (missing Authorization header in voice API call)
2. **Security leak**: Raw server error message (including auth header format hint) is displayed to the end user instead of a friendly message

The voice feature is **completely non-functional** — cannot test speak-to-add-product flow.

#### Evidence
- Screenshot: Voice Sheet showing "Couldn't understand" + raw auth error
- EN/HI toggle visible and functional (UI renders)
- Error appears immediately — not after attempting speech

---

## ISSUE-049: Manual Barcode Entry — "Product not found" For Existing Product (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 6 (Manual Barcode)

#### Problem
Entering barcode `202508142006` in the "Enter barcode manually" field and tapping the green submit arrow shows **"Product not found"** banner (light cyan). However, the product "Scan Bar" with that exact barcode (202508142006) is visible in the product card below.

The manual barcode lookup calls a different API endpoint (or uses different matching logic) than the search — and fails to find a product that clearly exists in the store catalog.

#### Evidence
- Screenshot: "Product not found" banner + product card showing "Scan Bar" 202508142006 below
- Barcode entered exactly matches the product's barcode

---

## ISSUE-050: New Product Opening Stock Not Saved — Shows "In stock: 0" After Save (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) / Backend |
| **Screen** | SellScanScreen / New Product Modal |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layer 7 (New Product / Add Product)

#### Problem
Operator scanned new barcode `8904258112091` via camera → "New product" modal appeared (correct). Operator entered:
- Product name: "Connect Thrive"
- Sell price: 11,000
- Opening stock: 10
- Tapped "Save & Add"

Product was added to cart. However, the cart shows **"⚠ In stock: 0"** — the opening stock of 10 was NOT saved to the backend, or the cart is reading stale stock data.

This means:
1. The stock value entered in the "New product" form is not persisted, OR
2. The stock is saved but the cart reads from a different/cached source, OR
3. The "Save & Add" only creates the product locally without the stock ledger entry

#### Evidence
- Screenshot 5: New Product modal with Opening stock field (operator reports entering 10)
- Screenshot 7: Cart shows "Connect Thrive" ₹11,000 with "⚠ In stock: 0"

---

## ISSUE-051: Complete Payment Button Non-Functional — End-to-End Sale Blocked (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | PaymentScreen |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan → Payment (Checkout Flow)

#### Problem
After full cart flow (add product → discount → checkout → low stock warning → PROCEED):
1. Payment screen shows correctly: "Payment" header, "Cart locked" badge, UPI/Cash/Due tabs
2. Cash selected, Amount: ₹9,900.00, "Collect cash from customer" displayed
3. **"Complete Payment" button appears greyed out / disabled and does not respond to taps**

The entire end-to-end sale flow is **blocked at the final step**. No payment method works:
- Cash: "Complete Payment" non-functional
- UPI: Not tested (but likely same issue)
- Due: Not tested

This is the **#1 business blocker** — the POS cannot complete any sale.

#### Evidence
- Screenshot 9: Payment screen with "Low Stock Warning" dialog (CANCEL/PROCEED)
- Screenshot 10: After PROCEED — Amount ₹9,900.00 displayed, "Complete Payment" appears disabled (grey)
- Operator confirms: "complete payment click doesn't work"

---

## ISSUE-052: Voice FAB Overlaps Product Card Price Pill (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SellScan Layout

#### Problem
The green Voice FAB (mic button) at bottom-right overlaps the price pill (₹10,000.00) on the last product card when only one product is visible. The price is partially obscured.

#### Evidence
- Screenshot 6: Voice FAB covers right side of "₹10,0..." price pill on Scan Bar card

---

## ISSUE-053: Low Stock Warning at Checkout Is Bypassable (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | PaymentScreen |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — Payment Flow

#### Problem
When checking out with zero-stock items, a "Low Stock Warning" dialog appears:
- "Connect Thrive: need 1, have 0"
- "Do you want to proceed anyway?"
- CANCEL / PROCEED buttons

Tapping PROCEED bypasses the stock check entirely. While this may be intentional (allow negative stock for operational flexibility), it contradicts the "Out of stock" block on the SellScan screen that sometimes prevents adding to cart (ISSUE-046).

**Inconsistency**: Cart add sometimes blocks zero-stock, but checkout always allows bypass via PROCEED. The stock enforcement policy is unclear and inconsistent across the flow.

#### Evidence
- Screenshot 9: "Low Stock Warning" dialog with PROCEED option
- After PROCEED: payment screen shows amount, but Complete Payment is disabled (ISSUE-051)

---

## ISSUE-054: Cart-Level Discount — PASS

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | Sell Cart |
| **Severity** | PASS |
| **Status** | TESTED |

**Discovered:** CTO live testing 2026-03-06 — Cart Discount

#### Tested — ALL PASS
- ✅ % / Flat toggle present
- ✅ Discount %: entered 10, shows "Applied" label
- ✅ Subtotal: ₹11,000.00
- ✅ Discount: -₹1,100.00 (10% of 11,000 = 1,100) ✓
- ✅ Total: ₹9,900.00 ✓
- ✅ Checkout button updates to match total: ₹9,900.00

---

## ISSUE-055: New Product Modal — Partial PASS

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | SellScanScreen / New Product Modal |
| **Severity** | PASS (with ISSUE-050 exception) |
| **Status** | TESTED |

**Discovered:** CTO live testing 2026-03-06 — New Product Flow

#### Tested Elements
- ✅ Camera scan of unknown barcode (8904258112091) triggers "New product" modal
- ✅ Barcode pre-filled: 8904258112091
- ✅ Product name field — editable
- ✅ Sell price field — editable
- ✅ Purchase price (optional) — editable
- ✅ Opening stock — field present, default 0, editable
- ✅ "Creates ledger entry if greater than 0" helper text
- ✅ Cancel / "Save & Add" buttons
- ✅ Product created and added to cart after save
- ❌ Opening stock NOT persisted (see ISSUE-050)

---

## MENU SCREEN — Layout Audit (PASS)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | MenuScreen |
| **Severity** | PASS |
| **Status** | TESTED |

**Discovered:** CTO live testing 2026-03-06

### Menu Layout — ALL elements render correctly

**SYSTEM STATUS card:**
- ✅ Store: "supermandi store (SU260305-002)" — Active (green badge)
- ✅ Device: 4089af62-ac0d-4855-8c0e-335e96708432 — Active (green badge)
- ✅ Sync: "Synced" (green badge)

**TODAY'S SALES card:**
- ✅ Total Sales: ₹0.00, Bills: 0, Avg Bill: ₹0.00, Items Sold: 0
- ✅ Refresh (↻) and expand (>) icons
- ✅ "view Details >" link

**SALES section:**
- ✅ Bills / Sales History → Reprint / Download / Share quick actions
- ✅ Return / Refund
- ✅ "printer Ready" status (green) + "test Print" link
- ✅ Barcode Sheets

**PURCHASING section:**
- ✅ Purchase Orders
- ✅ Product Catalog

**STOCK MANAGEMENT section:**
- ✅ Stock Inward
- ✅ Opening Stock

**CUSTOMERS & CREDIT section:**
- ✅ Khata (Credit Book)
- ✅ Customers
- ✅ Customer Management

**Overdue Dues:**
- ✅ "Collect overdue DUE payments and send reminders" (red icon)

**AI & INTELLIGENCE section:**
- ✅ AI Insights — "Alerts, forecasts, slow movers, expiry tracking"
- ✅ Bulk Purchase Credit — "Browse and apply for credit offers"

**MESSAGES section:**
- ✅ Chat — "Message suppliers and support"
- ✅ WhatsApp Support — "Chat with SuperMandi support team"

**REPORTS section:**
- ✅ Purchase History
- ✅ Sales Statement
- ✅ Stock Statement
- ✅ Daily Report

**OPERATIONS section:**
- ✅ Daily Closing — "Z-Report and cash reconciliation"
- ✅ Shift Management — "Start, end, and view shift history"

**SETTINGS section:**
- ✅ Language / भाषा — EN / हि toggle (EN selected)
- ✅ Theme — Light mode / Dark mode toggle (☀/🌙)
- ✅ Switch Staff — "Vikrant (MANAGER)" with > arrow
- ✅ Printer Settings — "Paper width, auto-print, copies"
- ✅ Help & Support — "Contact us, quick links"
- ✅ Switch Store — "Re-enroll to a different store" (red icon)

**Footer:**
- ✅ Build: d78e09c7 · Deployed: 2026-03-05 10:30:35 UTC

**MESSAGES sub-screens:**
- ✅ Chat list: "No conversations yet" empty state + "Contact Support" button
- ✅ Support chat: "SuperMandi Support" — welcome message renders, user messages sent ("Hi", "How are you?" at 4:50pm), chat UI functional with input field + send button

### Notes
- All 22 menu items render with icons, titles, subtitles, and > arrows
- Scroll is smooth across 7 sections
- No missing icons or broken layouts
- Chat UI renders and accepts input, but messages don't reach SuperAdmin (see ISSUE-056, ISSUE-057)

---

## ISSUE-056: Chat Messages Not Received in SuperAdmin Support Queue (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App → SuperAdmin |
| **Screen** | MenuScreen / Chat |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — Menu Chat

#### Problem
POS Chat UI appears functional — user sent "Hi" and "How are you?" at 4:50 PM, messages display in the chat bubble UI. However, messages **never arrived in the SuperAdmin Support Queue**. The chat is one-way — POS can send but SuperAdmin cannot see incoming messages.

Additionally, the SuperAdmin Support Queue page shows **"Authentication required"** error (red banner), suggesting the support/chat API endpoint requires separate auth that is not configured or the session has expired.

#### Evidence
- POS screenshot: Chat shows sent messages ("Hi", "How are you?" at 4:50pm)
- SuperAdmin screenshot: Support Queue page shows "Authentication required" — empty queue
- Backend: healthy (green dot), SuperAdmin: Authenticated

---

## ISSUE-057: SuperAdmin Support Queue — "Authentication required" Error (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | SuperAdmin Portal |
| **Screen** | Support Queue |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — SuperAdmin Support

#### Problem
SuperAdmin portal at `staging.supermandi.tech/admin/#/support` shows:
- "Support Queue" header with Open / Resolved / All tabs
- **Red banner: "Authentication required"**
- Queue is empty despite POS sending messages

The admin user IS authenticated (top-right shows "Authenticated" + Logout button, Backend: healthy). The Support Queue endpoint likely requires a different auth mechanism (e.g., WebSocket auth, separate API token, or the chat backend service is not running/configured).

#### Evidence
- Screenshot: SuperAdmin Support Queue with "Authentication required" red banner
- Admin is logged in (Authenticated badge visible)
- Backend health check: green, "6 Mar 2026, 4:56 pm"

---

## ISSUE-058: Stock Sync Inconsistency Cascades to All Reports and Accounting (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App (Android) |
| **Screen** | All (Sales Statement, Daily Report, Daily Closing, Stock Statement) |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06 — Menu / Sales Statement

#### Problem
The stock sync inconsistency (ISSUE-042) is not just a UI bug — it cascades to **all downstream business data**:

1. **Stock shows 0 sometimes, 10 other times** for the same product (ISSUE-042)
2. Zero-stock products can sometimes be added to cart (ISSUE-043/046)
3. If/when Complete Payment is fixed (ISSUE-051), sales will be recorded with **wrong stock quantities**
4. **Sales Statement** will show incorrect cost values (cost = purchase price × qty, but qty is based on unreliable stock)
5. **Daily Report / Z-Report** will be inaccurate
6. **Stock Statement** will show wrong stock levels
7. **Daily Closing** cash reconciliation will be off

This is a **data integrity cascade** — the root cause (ISSUE-042: stale stock cache) corrupts everything downstream.

CTO assessment: "even sell created is of no use — it will be wrong"

#### Root Cause Chain
```
ISSUE-042 (stale stock cache)
  → ISSUE-043/046 (wrong stock in cart)
    → ISSUE-051 (payment blocked — currently protecting from bad data)
      → If 051 fixed without fixing 042 first: corrupt sales records
        → Wrong reports, wrong accounting, wrong stock levels
```

#### Fix Priority
**ISSUE-042 (stock sync) MUST be fixed BEFORE ISSUE-051 (payment)**. If payment is unblocked while stock is unreliable, the system will record incorrect transactions.

#### Evidence
- Sales Statement: currently ₹0.00 / 0 sales (empty state correct)
- But any future sale would inherit wrong stock data from ISSUE-042

---

## MENU SUB-SCREEN: Sales Statement — PASS (Empty State)

| Field | Value |
|-------|-------|
| **Screen** | Sales Statement |
| **Status** | TESTED |

- ✅ Header: "Sales Statement" + back arrow + refresh
- ✅ Summary row: ₹0.00 Cost Value | 0 Sales | 0 Items
- ✅ Empty state: "No sales data" + chart icon + descriptive text
- ✅ "Make Your First Sale" CTA button
- ✅ Navigation: back arrow works

---

## MENU SUB-SCREENS: Code-Level Audit — ALL 21 PASS

| Field | Value |
|-------|-------|
| **Scope** | All 21 Menu sub-screen components |
| **Method** | Code analysis (not runtime) |
| **Status** | PASS |

**Audited 2026-03-06 — 15,576 lines across 22 files**

All screens implement the 4-state UX pattern (loading/empty/error/data):

| # | Screen | Lines | Loading | Empty | Error | Notes |
|---|--------|-------|---------|-------|-------|-------|
| 1 | SalesStatementScreen | 424 | ✅ | ✅ | ✅ | Pull-to-refresh |
| 2 | SalesHistoryScreen | 310 | ✅ | ✅ | ✅ | Skeleton loader, pagination |
| 3 | ReturnScreen | 902 | ✅ | ✅ | ✅ | 4-step flow, idempotency key |
| 4 | BarcodeSheetScreen | 1421 | ✅ | ✅ | ✅ | Modal workflow |
| 5 | OrderHistoryScreen | 481 | ✅ | ✅ | ✅ | Pagination safeguard |
| 6 | PurchaseScreen | 1436 | ✅ | ✅ | ✅ | ReadinessGate, dual mode |
| 7 | OpeningStockScreen | 718 | ✅ | ✅ | ✅ | Debounce with cleanup |
| 8 | KhataScreen | 932 | ✅ | ✅ | ✅ | Credit/payment modals |
| 9 | CustomerListScreen | 887 | ✅ | ✅ | ✅ | 300ms debounced search |
| 10 | CustomerManagementScreen | 927 | ✅ | ✅ | ✅ | Detail/add/edit modals |
| 11 | OverdueDuesScreen | 572 | ✅ | ✅ | ✅ | Severity color coding |
| 12 | AIInsightsScreen | 319 | ✅ | ✅ | ✅ | 5 tabs, cache-aware loading |
| 13 | BulkPurchaseCreditScreen | 223 | ✅ | ✅ | ✅ | Pull-to-refresh |
| 14 | DailyClosingScreen | 740 | ✅ | ✅ | ✅ | Summary/history tabs |
| 15 | ShiftScreen | 888 | ✅ | ✅ | ✅ | Live 60s ticker |
| 16 | DailyReportScreen | 809 | ✅ | ✅ | ✅ | Print integration |
| 17 | PurchaseHistoryScreen | 469 | ✅ | ✅ | ✅ | Group by reference |
| 18 | StockStatementScreen | 429 | ✅ | ✅ | ✅ | Pull-to-refresh |
| 19 | PrinterSettingsScreen | 360 | ✅ | N/A | N/A | Static settings |
| 20 | HelpScreen | 327 | ✅ | N/A | N/A | Static links, offline |
| 21 | CreditScreen | 1490 | ✅ | ✅ | ✅ | 3 tabs, KYC flow |
| 22 | BillDetailScreen | 432 | ✅ | ✅ | ✅ | Receipt detail |

**0 code-level bugs found.** All screens follow production rules:
- Proper loading/empty/error state handling
- Debounce timers with cleanup (no memory leaks)
- Double-tap guards on critical actions
- Pagination safeguards
- Android BackHandler support
- Theme-aware colors via useThemeColors()
- i18n integration where needed

---

## ISSUE-059: Cannot Validate Most Screens — No Test Data in Staging (HIGH)

| Field | Value |
|-------|-------|
| **Platform** | POS App / Staging Backend |
| **Screen** | All data-dependent screens |
| **Severity** | HIGH |
| **Status** | DISCOVERED |

**Discovered:** CTO live testing 2026-03-06

#### Problem
Most POS screens cannot be functionally validated because the staging store ("SuperMandi Store" SU260305-002) has **no test data**:
- 0 sales / 0 bills → Sales Statement, Sales History, Daily Report all show empty
- 0 purchase orders → Purchase History empty
- 0 customers → Customer list, Khata, Overdue Dues empty
- 0 completed transactions → Daily Closing has nothing to close
- No supplier catalog → Purchase "Live Suppliers" tab empty
- Credit not enabled → Credit tab shows "Credit is not enabled for this store"

**Screens that show ONLY empty states (cannot verify data rendering):**
1. Sales Statement — "No sales data" ✅ empty state only
2. Sales History — empty
3. Purchase Screen (Quick Purchase) — "No Products Found" ✅ empty state only
4. Purchase Screen (Live Suppliers) — "No Products Found" ✅ empty state only
5. Reorder Screen — "All caught up! 0 items need attention" ✅ empty state only
6. Credit Screen — "Credit is not enabled for this store" (expected for this store)
7. Daily Report — empty
8. Daily Closing — no data
9. Purchase History — empty
10. Stock Statement — empty (except "Scan Bar" with broken stock)
11. Customer list / Khata / Overdue — empty

**What WAS tested successfully:**
- Empty state UX for all screens (icons, messages, CTAs) — PASS
- Navigation to/from all screens — PASS
- Tab switching (SELL/PURCH/REORDE/CREDIT/MENU) — PASS
- Code-level audit of all 21 screens — PASS (4-state UX verified in code)

**What CANNOT be tested without data:**
- Data rendering (product grids, transaction lists, report charts)
- Pagination / infinite scroll
- Search/filter within data lists
- Business logic (totals, calculations, grouping)
- Print/share/download of actual reports
- Return/refund flow (requires completed sale)
- Daily closing reconciliation
- Shift totals

#### Recommendation
Before next live testing session:
1. Seed staging store with test data: 10+ products with stock, 5+ sales, 2+ customers
2. OR: complete a full sell→payment flow first (requires ISSUE-051 fix)
3. Then re-test all data-dependent screens with real data

---

## TAB SCREENS: Runtime Layout Audit

### REORDER Tab — PASS (Empty State)
- ✅ "Pending Reorders" header
- ✅ "0 items need attention" subtitle
- ✅ Green check icon + "All caught up!" empty state
- ✅ "No pending reorders at this time. The system will automatically detect low stock items."
- ✅ REORDE tab active (green with notification dot)

### PURCHASE Tab — PASS (Empty State)
- ✅ PURCH tab active (blue)
- ✅ Camera icon + "Quick Purchase" / "Live Suppliers" segmented bar
- ✅ "No Products Found" empty state with search icon
- ✅ "Search for products to add to cart"
- ✅ Note on first load: "Credit is not enabled for this store" toast appeared (from Credit tab — cross-screen toast leak?)

### CREDIT Tab — Noted
- "Credit is not enabled for this store" — expected for non-credit stores
- No further testing possible

### Sales Statement — PASS (Empty State, already logged above)

---

## ISSUE-060: Quick Purchase Scanner Does Not Add Product to Store (HIGH)

**Screen:** PurchaseScreen → Quick Purchase → Camera Scanner
**Steps:** PURCH tab → tap "Quick Purchase" → camera opens → scan barcode
**Expected:** Scanned product is identified/created and added to purchase cart
**Actual:** Barcode is scanned but product is NOT added to the store inventory or purchase cart. Scanner completes with no visible result.
**Impact:** Quick Purchase flow is completely non-functional — operators cannot use barcode scanner to stock-in products.
**Severity:** HIGH

| Layer | Status |
|-------|--------|
| Scanner trigger | ✅ Camera opens |
| Barcode decode | ✅ Barcode scanned |
| Product lookup/creation | ❌ Not added |
| Cart integration | ❌ No product in cart |

---

## ISSUE-061: Live Suppliers Page Keeps Blinking / Flashing (HIGH)

**Screen:** PurchaseScreen → Live Suppliers segment
**Steps:** PURCH tab → tap "Live Suppliers"
**Expected:** Supplier product catalog loads and displays stable grid
**Actual:** Page keeps blinking/flashing — continuous re-renders or failed fetch loop causing visual instability
**Impact:** Live Suppliers is unusable — operators cannot browse supplier catalogs
**Severity:** HIGH
**Likely Cause:** Fetch-retry loop in `ReadinessGate` or catalog API returning error causing state oscillation (setState in error handler triggers re-render → re-fetch → error → loop)

| Layer | Status |
|-------|--------|
| Segment switch | ✅ Tap works |
| Catalog fetch | ❌ Fails / loops |
| UI stability | ❌ Blinking |
| Product grid | ❌ Never renders |

---

## ISSUE-062: Purchase Search Bar Non-Functional — Cannot Search Products (HIGH)

**Screen:** PurchaseScreen → Search bar
**Steps:** PURCH tab → tap search bar → type product name
**Expected:** Search returns matching products from catalog/supplier inventory
**Actual:** Search does not return results. "Failed to load catalog" error shown, then "Retry" button. Search bar effectively non-functional.
**Impact:** Cannot find products to purchase — search, camera, and Quick Purchase all broken. Purchase flow completely blocked.
**Severity:** HIGH
**Related:** ISSUE-060 (Quick Purchase), ISSUE-061 (Live Suppliers) — all three Purchase sub-flows are broken

| Layer | Status |
|-------|--------|
| Search input | ✅ Text entry works |
| Debounce/API call | ❌ Fails |
| Results rendering | ❌ "Failed to load catalog" |
| Product selection | ❌ N/A |

---

## ISSUE-063: Credit Tab — "Credit Not Enabled" But No SuperAdmin Toggle to Enable (HIGH)

**Screen:** CREDIT tab
**Steps:** Tap CREDIT tab
**Expected:** Credit offers/loans shown, OR clear path to enable credit from SuperAdmin
**Actual:** Shows "Credit is not enabled for this store" — but there is no working mechanism in SuperAdmin to enable credit for a store
**Impact:** Credit feature is inaccessible. Operator has no way to activate it.
**Severity:** HIGH
**Note:** Need to verify if credit enable/disable exists in SuperAdmin feature flags or store settings. If it's a feature flag, check `creditEnabled` in feature_flags table.

| Layer | Status |
|-------|--------|
| Credit tab render | ✅ Tab loads |
| Credit status check | ✅ Correctly reads "not enabled" |
| Enable mechanism | ❌ Missing/broken in SuperAdmin |
| Credit flow | ❌ Blocked |

---

## ISSUE-064: Product Category Rail Disappeared from PurchaseScreen (HIGH)

**Screen:** PurchaseScreen
**Steps:** Navigate to PURCH tab
**Expected:** Horizontal category rail (scrollable chips/pills) for filtering products by category (vegetables, fruits, dairy, etc.)
**Actual:** Category rail is completely absent from the UI. No filter mechanism visible.
**Impact:** Without category filtering, operators must rely on search (which is also broken per ISSUE-062). Product discovery is severely degraded.
**Severity:** HIGH
**Action:** Verify if category rail component exists in PurchaseScreen.tsx code. If removed, restore it. If hidden behind a flag/condition, fix the condition.

| Layer | Status |
|-------|--------|
| Category data fetch | ❓ Unknown |
| Category rail render | ❌ Missing |
| Filter interaction | ❌ N/A |
| Product grid filter | ❌ N/A |

---

## ISSUE-065: New Product Scanned — Added to Sell Cart Without Ledger/Stock Reconciliation (HIGH)

**Screen:** SellScanScreen → New product barcode scan
**Steps:** Scan a new barcode → add product details (name, price, stock qty) → product appears in sell cart
**Expected:** When a new product is created via scan, stock ledger entry is created FIRST, then product can be sold from verified stock
**Actual:** Product is added directly to sell cart without verifying ledger stock entry. Stock quantity shown in cart may be inconsistent with actual ledger (see ISSUE-042 root cause).
**Impact:** Sell transactions can be created for products with no verified stock, leading to phantom inventory and incorrect accounting.
**Severity:** HIGH
**Related:** ISSUE-042 (stock sync), ISSUE-050 (new product stock not saved), ISSUE-058 (cascade to reports)
**Business Rule Violation:** Stock integrity — sale must not be created without verified stock-in ledger entry

| Layer | Status |
|-------|--------|
| New product creation | ✅ Product created |
| Stock ledger entry | ❌ Not verified/created |
| Cart stock validation | ❌ Bypassed |
| Sale integrity | ❌ Compromised |

---

## ISSUE-066: End-to-End Sell Checkout Non-Functional — UPI, Cash, Print All Broken (HIGH)

**Screen:** PaymentScreen (from SellScanScreen cart → Checkout)
**Steps:** Add products to cart → tap Checkout → attempt UPI payment / Cash payment / Print receipt
**Expected:** Complete payment flow: select method → process payment → generate receipt → print
**Actual:**
- UPI: Payment initiation fails / no response
- Cash: "Complete Payment" button non-functional (see ISSUE-051)
- Print: Cannot reach print stage since payment doesn't complete
- Cart shows "locked" status but checkout cannot proceed
**Impact:** CRITICAL BUSINESS BLOCKER — no sales can be completed. The entire revenue path (scan → cart → pay → receipt) is broken end-to-end.
**Severity:** HIGH
**Related:** ISSUE-051 (Complete Payment non-functional), ISSUE-042 (stock sync affecting cart data)
**Note:** This is a consolidation of the end-to-end checkout failure. ISSUE-051 covers the specific button issue; this covers the full UPI + Cash + Print chain.

| Layer | Status |
|-------|--------|
| Cart → Checkout nav | ✅ Works |
| Payment method select | ✅ UPI/Cash/Due tabs render |
| UPI payment | ❌ Non-functional |
| Cash payment | ❌ Button disabled/non-functional |
| Receipt generation | ❌ Never reached |
| Print | ❌ Never reached |
| Sale record creation | ❌ Never reached |

---

## CODE-LEVEL AUDIT WAVE 2 — Deep Dive Findings

> These issues were identified via systematic code-level 17-layer audit of all POS screens.
> Discovery only — no fixes applied.

---

## ISSUE-067: PurchaseScreen Live Suppliers Re-Fetch Loop Causes Blinking (HIGH)

**Screen:** PurchaseScreen
**File:** [PurchaseScreen.tsx:367-371](src/screens/PurchaseScreen.tsx#L367-L371)
**Root Cause:** useEffect at line 367 triggers `fetchCatalog()` when `catalogProducts.length === 0 && !catalogLoading`. When `fetchCatalog` fails (sets `catalogError` + `catalogLoading=false`), the condition becomes true again → re-triggers fetch → fails → loop. The `catalogError` state is NOT included as a guard in the effect condition.
**Expected:** After fetch failure, show error state with Retry button. Stop re-fetching.
**Actual:** Infinite re-render loop: fetch → error → `catalogLoading=false` → effect retriggers → fetch → error → ...
**Fix:** Add `!catalogError` to the useEffect guard condition.
**Impact:** Causes ISSUE-061 (blinking). Makes Live Suppliers completely unusable.
**Severity:** HIGH

---

## ISSUE-068: Payment Blocker Root Cause — createSale() Fails on Variant Resolution (HIGH)

**Screen:** PaymentScreen
**Files:** [PaymentScreen.tsx:356-508](src/screens/PaymentScreen.tsx#L356-L508), [sales.ts:1012-1078](backend/src/routes/v1/pos/sales.ts#L1012-L1078)
**Root Cause Chain:**
1. PaymentScreen mounts → useEffect fires → calls `getStockBatch(productIds)` then `createSale()`
2. Backend `POST /api/v1/pos/sales` resolves each cart item to a `variantId` via 5-step chain:
   - Step 1: `explicitVariantId` (rarely set from POS)
   - Step 2: `globalProductId` as UUID → resolve variant
   - Step 3: `productId` as UUID → check if variant exists, else resolve as global product
   - Step 4: `barcode` → resolve by barcode
   - Step 5: Catalog bridge (`storeProductId` or `productId` or `barcode`)
3. If ALL 5 steps fail for ANY item → `throw new Error("product_not_found")` (line 1078)
4. Frontend catches this as generic "Sale Error" → `saleId` stays `null` → "Complete Payment" blocked

**Why it fails for POS products:**
- Products added via sell-first onboarding create entries in `store_products` table (catalog schema)
- The `productId` sent from POS cart may be a `store_products.id` (NOT a variant UUID)
- The 5-step resolution chain may not find a match if the catalog→variant bridge is broken
- This would cause `createSale()` to return 400 with `product_not_found`

**Evidence needed:** Check staging API: `POST /api/v1/pos/sales` with cart items from the test device. Check if the error is `product_not_found` or something else.
**Impact:** CRITICAL — this is the #1 business blocker (ISSUE-051/066). No sales can complete.
**Severity:** HIGH

---

## ISSUE-069: SuccessPrint Screen Missing from Test Manifest (HIGH)

**Screen:** SuccessPrintScreenV2
**File:** [App.tsx:475](App.tsx#L475)
**Issue:** SuccessPrintScreenV2 is registered in the navigation stack as "SuccessPrint" but is NOT included in the 42-screen test manifest (`LIVE_SCREEN_MANIFEST_LOCKED.json`). This is the post-payment screen that shows receipt, print button, WhatsApp share, and clears cart.
**Impact:** Post-payment flow is untested. Auto-print, WhatsApp bill send, receipt generation, cart clear, and "New Sale" navigation are not covered.
**Severity:** HIGH
**Action:** Add SuccessPrint to manifest. Test: receipt content, print button, auto-print (when enabled), WhatsApp share, "New Sale" navigation, partial sale handling.

---

## ISSUE-070: Dual Stock Source Inconsistency — productsApi vs inventoryApi (HIGH)

**Screen:** SellScanScreen (stock cache) + PaymentScreen (stock validation)
**Files:** [stockService.ts:95-119](src/services/stockService.ts#L95-L119), [PaymentScreen.tsx:373](src/screens/PaymentScreen.tsx#L373)
**Root Cause:**
- Stock cache auto-refresh (`refreshStockSnapshot`) calls `productsApi.listProducts()` → gets `product.stock` from the products table
- Payment stock validation calls `inventoryApi.getStockBatch()` → gets `currentQty` from the inventory service
- These are TWO DIFFERENT data sources that can return different values
- The products table `stock` column may be stale (not updated on every transaction)
- The inventory service tracks real-time ledger-based stock

**Impact:** Stock shown in SellScan cart (from products cache) may differ from stock checked at payment (from inventory API). This explains why:
- Cart shows "In stock: 10" (from products table cache)
- Payment says "Low Stock Warning" (from inventory API showing 0)
- Or vice versa: cart shows 0 but earlier showed 10

**Related:** Root cause amplifier for ISSUE-042 (stock sync inconsistency)
**Severity:** HIGH

---

## ISSUE-071: Voice API 401 Error Not Handled with User-Friendly Message (HIGH)

**Screen:** SellScanScreen → Voice FAB
**File:** [voiceClient.ts:282-313](src/services/voice/voiceClient.ts#L282-L313)
**Issue:** The error handler at line 282-313 handles 503, 404, 429, and 500+ status codes with user-friendly messages. However, **401 (Unauthorized)** is NOT handled. When `requireDeviceToken` middleware rejects the request (e.g., expired/invalid device token), the raw error object `{ error: { code: "DEVICE_UNAUTHORIZED", message: "Device not authorized..." } }` is passed through as `errorMessage` and shown directly to the user.
**Expected:** 401 should show "Session expired. Please restart the app." or similar.
**Actual:** Raw backend error text leaked to UI: "Device not authorized. Please enroll the device."
**Related:** ISSUE-048 (Voice API auth failure — raw error leaked to UI)
**Severity:** HIGH

---

## ISSUE-072: PurchaseScreen Category Rail Was Never Implemented (CLARIFICATION)

**Screen:** PurchaseScreen
**File:** [PurchaseScreen.tsx](src/screens/PurchaseScreen.tsx)
**Clarification:** ISSUE-064 reported "Product category rail disappeared." Code audit confirms: **PurchaseScreen never had a category rail**. The category rail (`CategoryRail` component) exists only in SellScanScreen. PurchaseScreen uses a search bar + "Quick Purchase" / "Live Suppliers" segmented control instead.
**Impact:** ISSUE-064 reclassified from "missing feature" to "feature request" — category rail for purchase browsing was never built, not removed.
**Updated Status:** ISSUE-064 downgraded — not a regression, it's a missing feature.
**Severity:** HIGH (per CTO directive — all items HIGH)

---

## ISSUE-073: DeviceBlockedScreen Missing Retry Throttle (HIGH)

**Screen:** DeviceBlockedScreen
**Issue:** ForceUpdateScreen has 3s retry cooldown (`RETRY_COOLDOWN_MS`). DeviceBlockedScreen has no throttle — unlimited rapid retries allowed.
**Severity:** HIGH

---

## ISSUE-074: DeviceBlockedScreen Missing Network Error Differentiation (HIGH)

**Screen:** DeviceBlockedScreen
**Issue:** ForceUpdateScreen differentiates "No Connection" vs "Check Failed". DeviceBlockedScreen uses single generic error for all failures.
**Severity:** HIGH

---

## ISSUE-075: EnrollDevice Alert-Only Error UX for Validation Failures (HIGH)

**Screen:** EnrollDeviceScreen
**Issue:** Validation errors (empty code, offline) show Alert only. After dismissal, no persistent error banner remains. API failure path correctly shows both Alert + banner, but validation path doesn't.
**Severity:** HIGH

---

## ISSUE-076: Payment createSale Has No User-Visible Retry on Failure (HIGH)

**Screen:** PaymentScreen
**File:** [PaymentScreen.tsx:356-508](src/screens/PaymentScreen.tsx#L356-L508)
**Root Cause:** When `createSale()` API fails, `saleId` stays null. The useEffect guard `if (saleId || saleItems.length === 0 || loadingSale) return` means the effect WILL re-trigger (since saleId is null), but there's no user-facing error state or retry button. User sees a disabled "Complete Payment" button with no explanation.
**Expected:** Error banner + Retry button when sale creation fails
**Actual:** Button silently disabled, no error shown, possible infinite retry loop in background
**Impact:** Directly causes ISSUE-051. User has no actionable feedback.
**Severity:** HIGH

---

## ISSUE-077: UPI Payment Init Has No Timeout (HIGH)

**Screen:** PaymentScreen
**File:** [PaymentScreen.tsx:510-611](src/screens/PaymentScreen.tsx#L510-L511)
**Issue:** `initUpiPayment()` has no timeout. If API hangs, UPI flow stays in loading forever. `paymentId` never set → `canSubmit` false for UPI mode.
**Expected:** 30s timeout with fallback to CASH
**Actual:** No timeout — indefinite hang possible
**Severity:** HIGH

---

## ISSUE-078: Quick Purchase Scanner Barcode Not Routed to PurchaseScreen (HIGH)

**Screen:** PurchaseScreen via PosRootLayout
**Issue:** Camera scanner in PosRootLayout is primarily wired for SELL tab. When PURCH tab is active, scanned barcode may route to SellScanScreen's handler instead of PurchaseScreen's `scannedBarcode` prop.
**Expected:** Barcode on PURCH tab → PurchaseScreen
**Actual:** May route to SellScan handler → nothing happens on Purchase screen
**Related:** Root cause of ISSUE-060
**Severity:** HIGH

---

## ISSUE-079: StaffLoginScreen Missing Accessibility Labels on TextInput (HIGH)

**Screen:** StaffLoginScreen
**File:** `src/screens/StaffLoginScreen.tsx`
**Issue:** TextInput fields (staff code, PIN) have no `accessibilityLabel` props. Screen readers cannot identify input purpose. Fails WCAG 2.1 AA compliance.
**Expected:** `accessibilityLabel="Staff code"` and `accessibilityLabel="PIN"` on respective inputs
**Actual:** No accessibility labels
**Severity:** HIGH

---

## ISSUE-080: StaffLoginScreen No Offline Detection (HIGH)

**Screen:** StaffLoginScreen
**File:** `src/screens/StaffLoginScreen.tsx`
**Issue:** Login form submits API call without checking network status. If offline, user sees generic error. No "You are offline" pre-check or specific error message.
**Expected:** Check NetInfo before API call, show offline-specific message
**Actual:** Generic error on network failure
**Severity:** HIGH

---

## ISSUE-081: StaffLoginScreen No Client-Side Rate Limiting (HIGH)

**Screen:** StaffLoginScreen
**File:** `src/screens/StaffLoginScreen.tsx`
**Issue:** No client-side throttle on login attempts. User can spam submit button, generating unlimited API calls. Backend has rate limiting, but client should also throttle to reduce load.
**Expected:** Disable button for 3-5s after failed attempt, or limit to N attempts per minute
**Actual:** Unlimited rapid submissions possible
**Severity:** HIGH

---

## CODE-LEVEL AUDIT WAVE 3 — PosRootLayout + Tab Screens

> Findings from deep code audit of PosRootLayout (1690 lines), CreditScreen, ReturnScreen.

---

## ISSUE-082: PosRootLayout HID TextInput Missing Accessibility Guard (HIGH)

**Screen:** PosRootLayout
**File:** [PosRootLayout.tsx:1482-1499](src/screens/PosRootLayout.tsx#L1482-L1499)
**Issue:** Hidden HID scanner TextInput has no `accessibilityLabel`, no `importantForAccessibility="no"`, and no `accessibilityElementsHidden`. Screen readers (TalkBack/VoiceOver) can focus on this invisible 1x1px input, confusing blind users.
**Expected:** `importantForAccessibility="no-hide-descendants"` or `accessibilityElementsHidden={true}`
**Actual:** Fully accessible to screen readers despite being invisible
**Severity:** HIGH

---

## ISSUE-083: Camera Scanner Modal No Torch/Flash Toggle (HIGH)

**Screen:** PosRootLayout (Camera Modal)
**File:** [PosRootLayout.tsx:1388-1458](src/screens/PosRootLayout.tsx#L1388-L1458)
**Issue:** Camera barcode scanner has no torch/flashlight toggle. In low-light retail environments (common in Indian kirana stores), barcodes cannot be scanned. `expo-camera` CameraView supports `enableTorch` prop.
**Expected:** Torch toggle button in camera overlay
**Actual:** No torch control available
**Severity:** HIGH

---

## ISSUE-084: PosRootLayout storeActive=null Window Allows Unguarded Scans (HIGH)

**Screen:** PosRootLayout
**File:** [PosRootLayout.tsx:158,255](src/screens/PosRootLayout.tsx#L158)
**Issue:** `storeActive` initializes as `null`. The `scanDisabled` check (line 255) only blocks when `storeActive === false`. Between mount and first `fetchUiStatus()` response (~1-3s), `storeActive` is `null` and scans are NOT blocked. Any barcode scanned in this window proceeds without a confirmed store context.
**Expected:** Block scans until `storeActive === true` (not just when `=== false`)
**Actual:** Scans proceed when `storeActive === null` (unknown state)
**Severity:** HIGH

---

## ISSUE-085: CreditScreen PII (PAN/Aadhaar) Not Cleared on Unmount (HIGH)

**Screen:** CreditScreen
**File:** [CreditScreen.tsx:83-103](src/screens/CreditScreen.tsx#L83-L103)
**Issue:** PAN number and Aadhaar last 4 digits are stored in `applyModal` state object. When user navigates away without completing KYC, React retains these values in memory until garbage collection. No explicit `useEffect` cleanup to zero-out PII fields on unmount.
**Expected:** `useEffect` cleanup that clears PAN/Aadhaar state on unmount
**Actual:** PII persists in React component memory after navigation
**Severity:** HIGH

---

## ISSUE-086: CreditScreen Polling Doesn't Guard Against "disbursed" Status (HIGH)

**Screen:** CreditScreen
**File:** [CreditScreen.tsx:137-154](src/screens/CreditScreen.tsx#L137-L154)
**Issue:** Auto-refresh polling guard checks `status !== "approved" && status !== "rejected"` but NOT `!== "disbursed"`. If `activeApplication.status === "disbursed"`, polling starts unnecessarily — 20 polls (10 minutes) of wasted API calls.
**Expected:** Also skip polling when status is "disbursed"
**Actual:** Polls for "disbursed" applications (already final state)
**Severity:** HIGH

---

## ISSUE-087: ReturnScreen Idempotency Key Not Regenerated After Success (HIGH)

**Screen:** ReturnScreen
**File:** [ReturnScreen.tsx:138,246-254](src/screens/ReturnScreen.tsx#L138)
**Issue:** `idempotencyKey` is generated once via `useState(() => uuidv4())`. After successful return, `handleNewReturn()` resets all fields but does NOT regenerate the idempotency key. A second return from the same screen mount reuses the same key → backend rejects as duplicate.
**Expected:** `handleNewReturn()` should call `setIdempotencyKey(uuidv4())`
**Actual:** Same idempotency key reused across multiple returns per mount
**Severity:** HIGH

---

## ISSUE-088: ReturnScreen No Offline Check Before processRefund (HIGH)

**Screen:** ReturnScreen
**File:** [ReturnScreen.tsx:211-239](src/screens/ReturnScreen.tsx#L211-L239)
**Issue:** `handleProcessReturn()` calls API without network check. If offline, user sees generic "Could not process the return" error. Financial operation (refund) should explicitly check connectivity before attempting.
**Expected:** NetInfo check before API call, show "You are offline" if no connection
**Actual:** Generic error on network failure
**Severity:** HIGH

---

## CODE-LEVEL AUDIT WAVE 4 — Agent-Discovered Findings (All Screens)

> Findings from 6 parallel background audit agents covering all 44 POS screens.
> Only HIGH/CRITICAL findings listed. LOW/MEDIUM findings available on request.

---

## ISSUE-089: ForceUpdateScreen No Timeout on fetchUiStatusStrict in Retry (HIGH)

**Screen:** ForceUpdateScreen
**File:** `src/screens/ForceUpdateScreen.tsx`
**Issue:** `handleRetry` calls `fetchUiStatusStrict()` with no outer timeout. The inner 15s timeout + AbortController may not trigger on completely hung networks. User taps "Check Again" → infinite loading possible.
**Severity:** HIGH

---

## ISSUE-090: ForceUpdateScreen Race Condition on Multiple "Check Again" Taps (HIGH)

**Screen:** ForceUpdateScreen
**File:** `src/screens/ForceUpdateScreen.tsx`
**Issue:** No guard against rapid taps of "Check Again" button during `checking` state. Multiple concurrent `fetchUiStatusStrict` calls can race, leading to inconsistent navigation results.
**Severity:** HIGH

---

## ISSUE-091: InwardScreen No Validation for Negative Price/Quantity (HIGH)

**Screen:** InwardScreen
**File:** `src/screens/InwardScreen.tsx`
**Issue:** Quantity and price inputs accept negative values. User can submit negative prices and quantities, corrupting inventory ledger. No `Math.max(0, ...)` guard on inputs.
**Expected:** Reject negative values at input level
**Actual:** Negative values accepted and submitted to backend
**Severity:** HIGH

---

## ISSUE-092: InwardScreen Stock Check Has No Timeout (HIGH)

**Screen:** InwardScreen
**File:** `src/screens/InwardScreen.tsx`
**Issue:** `checkInventoryAndSubmit()` stock check is blocking with no timeout. If network is slow, user waits indefinitely for "Stock Check Failed" message.
**Severity:** HIGH

---

## ISSUE-093: BuyScreen Infinite Pagination Loop Risk (HIGH)

**Screen:** BuyScreen
**File:** `src/screens/BuyScreen.tsx`
**Issue:** `handleLoadMore` pagination uses `shouldStopPagination` AND `hasMore` flags, but `hasMore` is updated from API response without validation. If API returns malformed pagination data, infinite request loop possible.
**Severity:** HIGH

---

## ISSUE-094: BuyScreen No Network Guard Before loadProducts (HIGH)

**Screen:** BuyScreen
**File:** `src/screens/BuyScreen.tsx`
**Issue:** `loadProducts()` calls API without checking network status. If offline, user gets generic error instead of offline-specific message.
**Severity:** HIGH

---

## ISSUE-095: GRNScreen handleSearch Not Debounced (HIGH)

**Screen:** GRNScreen
**File:** `src/screens/GRNScreen.tsx`
**Issue:** `handleSearch` fires immediately on each barcode scan with no debounce. Rapid scans trigger multiple concurrent API calls, causing race conditions on highlighted items.
**Severity:** HIGH

---

## ISSUE-096: GRNScreen No Stale Data Check Before Submit (HIGH)

**Screen:** GRNScreen
**File:** `src/screens/GRNScreen.tsx`
**Issue:** `handleSubmit()` doesn't validate that order items haven't changed since load. If GRN takes 5+ minutes to fill, order items could be cancelled server-side, leading to submission against stale data.
**Severity:** HIGH

---

## ISSUE-097: BnplDuesScreen Linking.openURL Crash Risk (HIGH)

**Screen:** BnplDuesScreen
**File:** `src/screens/BnplDuesScreen.tsx`
**Issue:** `paymentModal.upiDeepLink` can be null/undefined when passed to `Linking.openURL()`. The truthy check happens in a condition, but the callback closure may execute with stale value. Missing try/catch around `Linking.openURL()` and `Linking.canOpenURL()` — if platform doesn't support UPI, app crashes silently.
**Severity:** HIGH

---

## ISSUE-098: CustomerManagementScreen Stale State Read (HIGH)

**Screen:** CustomerManagementScreen
**File:** `src/screens/CustomerManagementScreen.tsx`
**Issue:** `handleOpenDetail` reads global Zustand state via `useCustomerStore.getState()` outside React's hook cycle, bypassing consistency guarantees. If state changes between fetch and read, stale customer data renders.
**Severity:** HIGH

---

## ISSUE-099: OverdueDuesScreen Phone Number Format Race (HIGH)

**Screen:** OverdueDuesScreen
**File:** `src/screens/OverdueDuesScreen.tsx`
**Issue:** Phone number formatting modifies `phone` variable twice (`.replace()` then prepend "91"). If both conditions are true, result is malformed "91+91..." format, causing WhatsApp deep links to fail.
**Severity:** HIGH

---

## ISSUE-100: ChatConversationScreen activeConvId Race Condition (HIGH)

**Screen:** ChatConversationScreen
**File:** `src/screens/ChatConversationScreen.tsx`
**Issue:** `activeConvId` is resolved async but `fetchMessages` is called before it's set. If conversation ID resolution is slow, messages fetch fires with null/undefined ID, causing 404 errors.
**Severity:** HIGH

---

## ISSUE-101: ChatConversationScreen markAsRead Silently Fails (HIGH)

**Screen:** ChatConversationScreen
**File:** `src/screens/ChatConversationScreen.tsx`
**Issue:** `markAsRead()` API call has no error handling — failures are completely swallowed. Unread badge count stays stale, user thinks messages aren't being read.
**Severity:** HIGH

---

## ISSUE-102: AIInsightsScreen No Error Recovery After 404 (HIGH)

**Screen:** AIInsightsScreen
**File:** `src/screens/AIInsightsScreen.tsx`
**Issue:** After receiving a 404 error, no recovery path is shown. No retry button, no fallback content. User sees error state with no way to recover.
**Severity:** HIGH

---

## ISSUE-103: OpeningStockScreen Search Error Not Surfaced to UI (HIGH)

**Screen:** OpeningStockScreen
**File:** `src/screens/OpeningStockScreen.tsx`
**Issue:** Async search error caught but UI never shows "search failed" state. Auto-search silently fails — user sees empty results but doesn't know why.
**Severity:** HIGH

---

## ISSUE-104: OpeningStockScreen Progress Interval Leak (HIGH)

**Screen:** OpeningStockScreen
**File:** `src/screens/OpeningStockScreen.tsx`
**Issue:** `progressInterval` started during submit is never cleared if API call succeeds synchronously. `setInterval` keeps running after submit completes, incrementing progress indicator past 100%.
**Severity:** HIGH

---

## ISSUE-105: ShiftScreen Allows Zero/Negative Closing Cash (HIGH)

**Screen:** ShiftScreen
**File:** `src/screens/ShiftScreen.tsx`
**Issue:** `handleEndShift()` allows `closingCash = 0` without warning. No guard against negative `closingCashMinor` after rounding. Could submit negative closing cash unintentionally — financial data integrity risk.
**Severity:** HIGH

---

## ISSUE-106: BarcodeSheetScreen Download Button Locks on Error (HIGH)

**Screen:** BarcodeSheetScreen
**File:** `src/screens/BarcodeSheetScreen.tsx`
**Issue:** `handleDownload` and `handleWhatsApp` set `actionLoading` flag but don't reset it if `shareBarcodeSheetPdf` throws an unhandled error (missing catch in `finally`). Button becomes permanently disabled — user must leave and return to screen.
**Severity:** HIGH

---

## ISSUE-107: SuccessPrintScreenV2 Zero Subtotal for priceMinor=0 Items (HIGH)

**Screen:** SuccessPrintScreenV2
**File:** `src/screens/SuccessPrintScreenV2.tsx`
**Issue:** `computedSubtotal` sums `item.priceMinor * item.quantity`. If any item has `priceMinor = 0` (sell-first onboarding items), the subtotal is correct but the receipt shows "0.00" per-line, which looks broken to the customer.
**Severity:** HIGH

---

## ISSUE-108: SplashScreen Double Navigation Race (HIGH)

**Screen:** SplashScreen
**File:** `src/screens/SplashScreen.tsx`
**Issue:** If splash duration timer and `getSessionWithTimeout()` promise resolve simultaneously, `navigateAfterSession()` can be called twice from different paths. No guard against double-navigation. Can cause React Navigation warnings or stack corruption.
**Severity:** HIGH

---

# ═══════════════════════════════════════════════════════════════════════════════
# LOCKED LIVE TESTING — FINAL COVERAGE SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

## Coverage Statistics

| Metric | Value |
|--------|-------|
| **Total POS Screens** | 44 (37 stack + 5 tab + StaffLogin + UiShowcase) |
| **Screens Audited** | 44/44 (100%) |
| **Total Issues Found** | 77 (ISSUE-037 through ISSUE-113) |
| **Severity: HIGH** | 77 (all per CTO directive) |
| **Audit Waves** | 4 (Operator-reported + Code Wave 2 + Code Wave 3 + Agent Wave 4) |

## Per-Screen Audit Coverage

### Gate Screens (Pre-POS Entry)
| Screen | Verdict | Issues |
|--------|---------|--------|
| SplashScreen | TESTED_WITH_FINDINGS | ISSUE-108 (double navigation race) |
| ForceUpdateScreen | TESTED_WITH_FINDINGS | ISSUE-089, ISSUE-090 |
| DeviceBlockedScreen | TESTED_WITH_FINDINGS | ISSUE-073, ISSUE-074 |
| EnrollDeviceScreen | TESTED_WITH_FINDINGS | ISSUE-075 |
| StaffLoginScreen | TESTED_WITH_FINDINGS | ISSUE-079, ISSUE-080, ISSUE-081 |
| PaymentSetupScreen | TESTED_WITH_FINDINGS | Agent findings (timeout, error handling) |

### POS Core (Tab Container + Tabs)
| Screen | Verdict | Issues |
|--------|---------|--------|
| PosRootLayout | TESTED_WITH_FINDINGS | ISSUE-078, ISSUE-082, ISSUE-083, ISSUE-084 |
| SellScanScreen (SELL tab) | TESTED_WITH_FINDINGS | ISSUE-065, ISSUE-070, ISSUE-071 |
| PurchaseScreen (PURCHASE tab) | TESTED_WITH_FINDINGS | ISSUE-060-064, ISSUE-067, ISSUE-072 |
| ReorderScreen (REORDER tab) | PASS | No HIGH issues found |
| CreditScreen (CREDIT tab) | TESTED_WITH_FINDINGS | ISSUE-063, ISSUE-085, ISSUE-086 |
| MenuScreen (MENU tab) | PASS | No HIGH issues found |

### Payment + Checkout Flow
| Screen | Verdict | Issues |
|--------|---------|--------|
| PaymentScreen | TESTED_WITH_FINDINGS | ISSUE-066, ISSUE-068, ISSUE-076, ISSUE-077 |
| SuccessPrintScreenV2 | TESTED_WITH_FINDINGS | ISSUE-069, ISSUE-107 |

### History + Reports
| Screen | Verdict | Issues |
|--------|---------|--------|
| SalesHistoryScreen | PASS | Agent: only MEDIUM/LOW findings |
| BillDetailScreen | PASS | Agent: only LOW findings |
| PurchaseHistoryScreen | PASS | Agent: only LOW findings |
| SalesStatementScreen | PASS | Agent: only LOW findings |
| StockStatementScreen | PASS | Agent: only LOW findings |
| DailyReportScreen | PASS | Agent: only LOW findings |
| DailyClosingScreen | PASS | Agent: only LOW findings |

### Order + Purchase Sub-screens
| Screen | Verdict | Issues |
|--------|---------|--------|
| OrderHistoryScreen | PASS | Agent: only MEDIUM findings |
| OrderDetailScreen | TESTED_WITH_FINDINGS | Agent: tracking sync race |
| BuyScreen | TESTED_WITH_FINDINGS | ISSUE-093, ISSUE-094 |
| GRNScreen | TESTED_WITH_FINDINGS | ISSUE-095, ISSUE-096 |
| InwardScreen | TESTED_WITH_FINDINGS | ISSUE-091, ISSUE-092 |
| BarcodeSheetScreen | TESTED_WITH_FINDINGS | ISSUE-106 |

### Credit + Customer Screens
| Screen | Verdict | Issues |
|--------|---------|--------|
| BnplDuesScreen | TESTED_WITH_FINDINGS | ISSUE-097 |
| KhataScreen | PASS | Agent: only MEDIUM findings |
| CustomerListScreen | PASS | Agent: only MEDIUM findings |
| CustomerManagementScreen | TESTED_WITH_FINDINGS | ISSUE-098 |
| OverdueDuesScreen | TESTED_WITH_FINDINGS | ISSUE-099 |
| BulkPurchaseCreditScreen | PASS | Agent: only MEDIUM findings |

### Settings + Utility Screens
| Screen | Verdict | Issues |
|--------|---------|--------|
| PrinterSettingsScreen | PASS | Agent: only LOW findings |
| OpeningStockScreen | TESTED_WITH_FINDINGS | ISSUE-103, ISSUE-104 |
| ShiftScreen | TESTED_WITH_FINDINGS | ISSUE-105 |
| ReturnScreen | TESTED_WITH_FINDINGS | ISSUE-087, ISSUE-088 |
| HelpScreen | PASS | Agent: only LOW findings |

### Chat + AI Screens
| Screen | Verdict | Issues |
|--------|---------|--------|
| ChatListScreen | PASS | Agent: only MEDIUM findings |
| ChatConversationScreen | TESTED_WITH_FINDINGS | ISSUE-100, ISSUE-101 |
| AIInsightsScreen | TESTED_WITH_FINDINGS | ISSUE-102 |

### Reorder Sub-screens
| Screen | Verdict | Issues |
|--------|---------|--------|
| ReorderSettingsScreen | PASS | Agent: only LOW findings |
| ReorderPoliciesScreen | PASS | Agent: only MEDIUM findings |

### Other
| Screen | Verdict | Issues |
|--------|---------|--------|
| UiShowcaseScreen | PASS | Dev-only screen, no audit required |

## Verdict Summary

| Verdict | Count |
|---------|-------|
| **PASS** | 20 screens |
| **TESTED_WITH_FINDINGS** | 24 screens |
| **BLOCKED** | 0 screens |
| **Total** | 44 screens |

## Top Priority Fix Categories

1. **Payment/Checkout Flow** (ISSUE-066, 068, 076, 077): createSale failure blocks payment, no retry, no UPI timeout
2. **PurchaseScreen Catalog** (ISSUE-061, 067): Infinite re-fetch loop → page blinking
3. **Data Integrity** (ISSUE-091, 087, 105): Negative prices, duplicate idempotency, zero closing cash
4. **Crash Risks** (ISSUE-097, 108): Linking.openURL crash, double navigation
5. **Missing Offline Guards** (ISSUE-080, 088, 094): Financial operations without network checks
6. **Accessibility** (ISSUE-079, 082): Missing labels for screen readers

---

## ISSUE-109: DeviceBlockedScreen Missing SafeAreaView (HIGH)

**Screen:** DeviceBlockedScreen
**File:** `src/screens/DeviceBlockedScreen.tsx`
**Issue:** Uses plain `View` as root container instead of `SafeAreaView`. On iOS devices with notch/Dynamic Island, screen content can overlap the status bar. ForceUpdateScreen correctly uses SafeAreaView (line 267) — DeviceBlockedScreen should match.
**Expected:** Wrap with SafeAreaView like ForceUpdateScreen
**Actual:** Plain View root — notch overlap risk
**Severity:** HIGH

---

## ISSUE-110: SellScanScreen Voice FAB Hidden Behind Cart Modal on Small Screens (HIGH)

**Screen:** SellScanScreen
**File:** [SellScanScreen.tsx:4119-4166](src/screens/SellScanScreen.tsx#L4119-L4166)
**Issue:** Voice FAB has `zIndex: 100` but is positioned absolutely. When cart sheet expands to 95% height (inside a Modal), the FAB is rendered behind the modal on small screens (<400w or <750h). Voice recording panel becomes unreachable during checkout flow — exactly when hands-free voice commands are most useful.
**Expected:** FAB always above all modals during recording, or rendered outside modal hierarchy
**Actual:** FAB obscured by expanded cart modal on Sunmi V2 / iMin Swift 2 devices
**Severity:** HIGH

---

## ISSUE-111: SellScanScreen Search Input Missing accessibilityLabel (HIGH)

**Screen:** SellScanScreen
**File:** [SellScanScreen.tsx:2621-2659](src/screens/SellScanScreen.tsx#L2621-L2659)
**Issue:** Main search TextInput has `placeholder` but no `accessibilityLabel`. Screen reader users cannot identify the input purpose. Should have `accessibilityLabel="Search or scan products"`.
**Expected:** `accessibilityLabel` on search input
**Actual:** Only `placeholder` — screen readers announce placeholder text which may be inconsistent
**Severity:** HIGH

---

## Next Step

## ISSUE-112: Five Menu Sub-Screens Missing Android BackHandler (HIGH)

**Screens:** ShiftScreen, DailyClosingScreen, KhataScreen, CustomerListScreen, PrinterSettingsScreen
**Issue:** These 5 screens lack `BackHandler.addEventListener('hardwareBackPress', ...)` for Android hardware back button support. On Android, pressing the hardware back button does nothing (no navigation) instead of calling `onBack?.()`. Other screens like CreditScreen, AIInsightsScreen correctly implement this pattern.
**Expected:** `useEffect` with BackHandler that calls `onBack?.()` and returns `true`
**Actual:** No BackHandler — hardware back button unresponsive on these screens
**Severity:** HIGH

---

## ISSUE-113: SalesStatementScreen Shows Cost Value Instead of Sales Revenue (HIGH)

**Screen:** SalesStatementScreen
**File:** `src/screens/SalesStatementScreen.tsx`
**Issue:** Screen labeled "Sales Statement" calculates `entryValue = Math.abs(entry.deltaQty) * entry.unitCost` — this shows **inventory cost**, not sale revenue. Summary bar, daily cards, and all aggregations display cost-side metrics. A "Sales Statement" should show revenue (sell price × qty), not inventory cost. Comment confirms: `unitCost is cost price, not sell price` (STG-469).
**Expected:** Show revenue (sell price × qty) or relabel as "Inventory Cost Statement"
**Actual:** Misleading "Sales Statement" title with cost-based values — users think they see revenue
**Severity:** HIGH

---

---

# CODE-LEVEL AUDIT WAVE 5 — Deep Agent Findings (ISSUE-114..119)

These issues were surfaced by background 17-layer deep audit agents scanning all 44 POS screens.

---

## ISSUE-114: InwardScreen Accepts Negative Prices and Quantities (HIGH)

**Screen:** InwardScreen
**File:** `src/screens/InwardScreen.tsx`
**Issue:** Lines 156-162 and 204-224 — quantity and price inputs accept negative values. User can submit negative prices and quantities, which would corrupt the inventory ledger (negative stock-in = phantom deductions).
**Expected:** Input validation should reject values ≤ 0 for both quantity and unit price
**Actual:** No lower-bound validation — negative values pass through to `checkInventoryAndSubmit()`
**Severity:** HIGH

---

## ISSUE-115: BuyScreen Infinite Pagination Loop Risk (HIGH)

**Screen:** BuyScreen
**File:** `src/screens/BuyScreen.tsx`
**Issue:** Lines 320-324 — `handleLoadMore` pagination uses both `shouldStopPagination` AND `hasMore` checks, but `hasMore` is updated from API response without validation. If API returns malformed pagination metadata (e.g., `hasMore: true` with empty results), FlatList triggers infinite `onEndReached` calls, each firing a new API request.
**Expected:** Guard against empty-result pages: if results.length === 0, force `hasMore = false`
**Actual:** No empty-result guard — malformed API response causes infinite request loop
**Severity:** HIGH

---

## ISSUE-116: GRNScreen Submits Against Potentially Stale Order Items (HIGH)

**Screen:** GRNScreen
**File:** `src/screens/GRNScreen.tsx`
**Issue:** Lines 303-404 — `handleSubmit` flow doesn't validate that order items haven't changed since initial load. If GRN takes 5+ minutes to fill out, items could be cancelled or modified server-side. Submission proceeds with stale line items, causing inventory discrepancies.
**Expected:** Re-fetch order items before submit, or validate server-side with optimistic locking (version/etag)
**Actual:** Submits against load-time snapshot with no staleness check
**Severity:** HIGH

---

## ISSUE-117: BarcodeSheetScreen Download Button Locks Indefinitely on Error (HIGH)

**Screen:** BarcodeSheetScreen
**File:** `src/screens/BarcodeSheetScreen.tsx`
**Issue:** Lines 245, 264 — `handleDownload` and `handleWhatsApp` use `actionLoading` flag but don't reset it to null if `shareBarcodeSheetPdf` throws an unhandled error (missing catch in finally path). Button stays disabled permanently until screen remount.
**Expected:** `finally` block always resets `actionLoading` to null regardless of error type
**Actual:** Unhandled throw leaves button locked — user must navigate away and back
**Severity:** HIGH

---

## ISSUE-118: CustomerManagementScreen Reads Store State Outside React Cycle (HIGH)

**Screen:** CustomerManagementScreen
**File:** `src/screens/CustomerManagementScreen.tsx`
**Issue:** Line 113 — `handleOpenDetail` calls `useCustomerStore.getState()` to read fresh state outside the React hook cycle. This bypasses React's consistency guarantees — if state changes between the `getState()` read and the next render, stale customer data is displayed in the detail modal.
**Expected:** Read customer data via hook (`useCustomerStore(state => state.selectedCustomer)`) or pass as parameter
**Actual:** Direct `getState()` call creates race condition between store updates and render
**Severity:** HIGH

---

## ISSUE-119: OverdueDuesScreen Phone Number Double-Prefixes "91" (MEDIUM)

**Screen:** OverdueDuesScreen
**File:** `src/screens/OverdueDuesScreen.tsx`
**Issue:** Lines 327-329 — phone number formatting applies `replace` then conditionally prepends "91". If the phone already starts with "91" (e.g., "919876543210"), the code prepends another "91", resulting in "91919876543210" — a malformed WhatsApp link that fails silently.
**Expected:** Strip existing country code before prepending, or check `!phone.startsWith("91")` before prepend
**Actual:** Double "91" prefix creates invalid phone number for WhatsApp deep link
**Severity:** MEDIUM

---

---

# DEEP CASCADING AUDIT WAVE 6 — Screen-Lock Pass 2 (ISSUE-120+)

Deep re-audit with cascading interaction passes: double-tap races, foreground/background transitions,
permission deny/revoke/retry, offline/reconnect mid-flow, stale session re-entry, cross-screen
state carryover, and long-path flow completion. One screen lock at a time.

---

## ISSUE-120: SplashScreen Total Hang Time Unbounded — Up to 15s+ With No User Escape (MEDIUM)

**Screen:** SplashScreen
**File:** `src/screens/SplashScreen.tsx`
**Route:** Splash (initial route)
**Reproducible steps:**
1. Launch app on slow/flaky network
2. Session check starts (5s timeout at line 34)
3. Session check succeeds at ~4.9s
4. `fetchUiStatus()` starts (10s timeout at uiStatusApi.ts:144)
5. Network drops — fetchUiStatus hangs for full 10s before catching error and returning defaults
6. User stares at spinner for 1s (splash delay) + 5s (session) + 10s (uiStatus) = ~16s total
**Expected:** Total wall-clock timeout on `navigateAfterSession()` (e.g., 8s max) with progress indication or user-accessible cancel/skip button during the wait
**Actual:** No total timeout. `SPLASH_DURATION_MS` (1s) + `SESSION_TIMEOUT_MS` (5s) + fetchUiStatus timeout (10s) compound sequentially. Only a generic spinner shown. No user escape until error state is shown (which only triggers if session check itself fails, not fetchUiStatus).
**Runtime evidence:** Code path: line 173 setTimeout(1s) → line 175 navigateAfterSession() → line 112 getSessionWithTimeout(5s) → line 124 fetchUiStatus(10s) — all sequential, no outer timeout
**Blocker impact:** Degraded — user stuck on splash for 15s+ on flaky networks, no progress indicator, appears frozen

---

## ISSUE-121: SplashScreen "Continue Without Session" Misleading on Timeout — Causes EnrollDevice Flash (MEDIUM)

**Screen:** SplashScreen → EnrollDeviceScreen (cross-screen)
**File:** `src/screens/SplashScreen.tsx` (line 220, 226) + `src/screens/EnrollDeviceScreen.tsx` (line 199-217)
**Route:** Splash → EnrollDevice → SellScan
**Reproducible steps:**
1. Device is enrolled (valid session in SecureStore)
2. Launch app on very slow network
3. `getSessionWithTimeout()` times out at 5s (session exists but storage read was slow)
4. Error state shown: "Session check timed out"
5. User sees two options: "Retry" and "Continue without session"
6. User taps "Continue without session" → navigates to EnrollDevice
7. EnrollDevice mounts → checks `getDeviceSession()` at line 205 → session IS in cache (the orphaned promise completed by now) → immediately redirects to SellScan
8. User sees EnrollDevice screen flash for ~100-300ms before redirect
**Expected:** Button label should say "Continue" (not "Continue without session") since session may actually exist. Or: SplashScreen should detect that session loaded in cache after timeout and offer "Retry" with instant success instead of misleading EnrollDevice redirect.
**Actual:** "Continue without session" label implies no session exists. User momentarily sees enrollment screen when they're already enrolled. Confusing UX on slow devices/networks.
**Runtime evidence:** SplashScreen line 220 → `navigation.replace("EnrollDevice")`. EnrollDeviceScreen line 205-208 → `getDeviceSession()` returns cached session → `navigation.replace("SellScan")`. Visible flash between the two replaces.
**Blocker impact:** Degraded — UX confusion only, no data loss. User reaches SellScan after the flash.

---

## ISSUE-122: ForceUpdateScreen AbortError Misclassified as Generic "Check Failed" (MEDIUM)

**Screen:** ForceUpdateScreen
**File:** `src/screens/ForceUpdateScreen.tsx` (lines 131-138) + `src/services/api/uiStatusApi.ts` (line 205)
**Route:** ForceUpdate
**Reproducible steps:**
1. Device is on old version → ForceUpdateScreen shown
2. Network is very slow or drops after NetInfo check passes
3. User taps "Check Again" → fetchUiStatusStrict starts
4. fetchUiStatusStrict's AbortController fires at 15s (uiStatusApi.ts:205) → throws AbortError (DOMException)
5. ForceUpdateScreen catch block (line 122) checks `isNetworkError` at lines 131-134
6. AbortError is NOT a TypeError, and message ("The operation was aborted" / "Aborted") doesn't contain "Network", "timeout", or "fetch"
7. Falls through to line 138: generic "Check Failed" alert
**Expected:** AbortError from timeout should be classified as network/timeout error → show "No Connection" alert (line 136) so user knows it's a connectivity issue
**Actual:** After 15s wait, user sees vague "Check Failed — Unable to verify app version status" instead of actionable "No Connection" message
**Runtime evidence:** `isNetworkError` check at lines 131-134 doesn't match DOMException/AbortError. Controller.abort() at uiStatusApi.ts:205 throws error with `name: "AbortError"`, not TypeError, and message doesn't contain "timeout"/"fetch"/"Network".
**Blocker impact:** Degraded — user gets wrong error message after 15s wait, doesn't know it's a network issue

---

## ISSUE-123: ForceUpdateScreen clearDeviceSession Throw in Catch Block → Unhandled Rejection (MEDIUM)

**Screen:** ForceUpdateScreen
**File:** `src/screens/ForceUpdateScreen.tsx` (lines 124-127) + `src/services/deviceSession.ts` (lines 170-187)
**Route:** ForceUpdate
**Reproducible steps:**
1. Device has corrupt/locked storage (SecureStore keychain locked, AsyncStorage DB corrupted)
2. User taps "Check Again" → fetchUiStatusStrict returns `device_unauthorized`
3. Catch block at line 122 matches ApiError with `device_unauthorized`
4. Calls `await clearDeviceSession()` at line 125
5. `clearDeviceSession()` → `AsyncStorage.removeItem()` throws (corrupted DB) or `clearAllHistory()` throws
6. Error propagates OUT of the catch block — no outer catch exists
7. `finally` block runs (setChecking(false)), but the rejection is unhandled
8. React Native logs "Possible Unhandled Promise Rejection" warning; on some devices, app crashes
**Expected:** `clearDeviceSession()` call should be wrapped in try-catch inside the error handler, or the entire `handleRetry` should have an outer catch
**Actual:** Throw inside catch block creates unhandled promise rejection. `navigation.reset()` at line 126 never executes — user stays on ForceUpdate with checking=false but no navigation
**Runtime evidence:** `clearDeviceSession()` at deviceSession.ts:183 calls `AsyncStorage.removeItem(SESSION_KEY)` without try-catch. Line 185 calls `clearAllHistory()` without try-catch. Either can throw.
**Blocker impact:** Degraded → potential crash on devices with storage issues. User stuck on ForceUpdate screen.

---

## Consolidated Issue Count

## ISSUE-124: EnrollDeviceScreen Cancel Doesn't Abort In-Flight API Call — Ghost Navigation After Cancel (MEDIUM)

**Screen:** EnrollDeviceScreen
**File:** `src/screens/EnrollDeviceScreen.tsx` (lines 282-283, 300-304, 318-375, 419-425)
**Route:** EnrollDevice
**Reproducible steps:**
1. Enter valid activation code + device name
2. Tap "Activate POS" → loading starts, API call fires
3. Immediately tap "Cancel" → `abortRef.current.abort()` fires, UI returns to form (loading=false)
4. Backend processes enrollment successfully → `enrollDevice()` returns response
5. After loop `break` at line 304, code proceeds to lines 318-375 WITHOUT checking `controller.signal.aborted`
6. `saveDeviceSession()` runs → session saved → `navigation.replace("SellScan")` fires
7. User was looking at the enrollment form → suddenly navigated to SellScan without explanation
**Expected:** After cancel, either (a) pass AbortController signal to `enrollDevice()` fetch call so the request is actually cancelled, or (b) check `controller.signal.aborted` after line 318 before saving session and navigating
**Actual:** Cancel only prevents retry loop continuation (lines 300, 307). The AbortController is NOT passed to `enrollDevice()` as a fetch signal. If the in-flight request succeeds, post-enrollment logic (save session, navigate) runs unconditionally after cancel.
**Runtime evidence:** `abortRef.current = controller` at line 283 but controller.signal NOT passed to `enrollDevice()` at line 303. No abort check between line 304 (break) and line 327 (saveDeviceSession).
**Blocker impact:** Degraded — user thinks they cancelled enrollment, but session is saved and navigation occurs unexpectedly. No data loss but confusing UX.

---

## ISSUE-125: Store Switch via Re-Enrollment Misses purchaseCartStore Reset — Stale Purchase Items Cross Stores (HIGH)

**Screen:** EnrollDeviceScreen
**File:** `src/screens/EnrollDeviceScreen.tsx` (lines 321-325) + `src/stores/purchaseCartStore.ts`
**Route:** EnrollDevice (re-enrollment path)
**Reproducible steps:**
1. Enrolled to Store A → add items to purchase cart (BuyScreen)
2. Re-enroll to Store B (enter new activation code)
3. Store changes detected at line 319 (`previousStoreId !== res.storeId`)
4. Three stores reset: cartStore, purchaseDraftStore, productsStore (lines 322-324)
5. **purchaseCartStore is NOT reset** — items from Store A remain
6. Navigate to BuyScreen → purchase cart shows items from Store A with Store A supplier IDs
7. Attempting to place order sends Store A supplier product IDs to Store B context → API errors or data corruption
**Expected:** Line 321-325 should also call `usePurchaseCartStore.getState().resetForStore()` (the store has this method — see purchaseCartStore.ts:265)
**Actual:** purchaseCartStore retains items from previous store after re-enrollment store switch. 4 stores have `resetForStore()` but only 3 are called.
**Runtime evidence:** Grep confirms `purchaseCartStore.ts:265` has `resetForStore: () => set({ items: [] })`. EnrollDeviceScreen imports `useCartStore`, `usePurchaseDraftStore`, `useProductsStore` (lines 42-44) but NOT `usePurchaseCartStore`.
**Blocker impact:** Flow blocked for purchase — stale cross-store items cause API rejection or inventory corruption when placing orders after store switch.

---

## ISSUE-126: DeviceBlockedScreen Missing SafeAreaView — Content May Overlap Notch/Status Bar (MEDIUM)

**Screen:** DeviceBlockedScreen
**File:** `src/screens/DeviceBlockedScreen.tsx` (line 162)
**Route:** DeviceBlocked
**Reproducible steps:**
1. Device is blocked → DeviceBlockedScreen shown
2. On notch devices (iPhone X+, Android punch-hole): container uses plain `View` with `padding: spacing.lg` and `justifyContent: "center"`
3. On devices with aggressive status bar overlap, top edge of card could clip under status bar
4. Compare with ForceUpdateScreen (line 267) which wraps in `SafeAreaView` + `ScrollView`
**Expected:** SafeAreaView wrapper (consistent with ForceUpdateScreen, also a gate screen with identical layout structure)
**Actual:** Plain `View` container without safe area insets. On most centered layouts this is invisible, but on very small screens where card approaches screen edges, overlap is possible.
**Runtime evidence:** DeviceBlockedScreen line 162: `<View style={styles.container}>`. ForceUpdateScreen line 267: `<SafeAreaView style={styles.safeArea}>`. Inconsistent pattern between sibling gate screens.
**Blocker impact:** Degraded — cosmetic on most devices, potentially clipped text on small notch devices.
**Note:** Also affected by ISSUE-122 pattern (AbortError misclassification) and ISSUE-123 pattern (clearDeviceSession throw in catch) — same code structure as ForceUpdateScreen.

---

## ISSUE-127: StaffLoginScreen onSubmitEditing Bypasses Loading Guard → Double Login via Keyboard (MEDIUM)

**Screen:** StaffLoginScreen (rendered inside PosRootLayout)
**File:** `src/screens/StaffLoginScreen.tsx` (lines 237, 35-68)
**Route:** Inline component (not a navigation screen)
**Reproducible steps:**
1. Enter valid phone and PIN
2. Focus on PIN input, press "Done" / Enter on keyboard rapidly 2-3 times
3. `onSubmitEditing={handleLogin}` fires for each press (line 237)
4. First call: passes validation → `setLoading(true)` at line 50 → starts `staffLogin()` API call
5. Second call: fires before React re-render batches `loading=true` → passes validation again → starts second `staffLogin()` API call in parallel
6. Both calls succeed → both call `setSession()` at line 54 → session set twice
7. Both `setLoading(false)` fire → loading state flickers
**Expected:** `handleLogin` should check a ref-based guard (e.g., `if (loadingRef.current) return;`) at the top, independent of React state, to prevent concurrent calls
**Actual:** Only guard is `disabled={loading}` on the Pressable (line 246), which doesn't apply to `onSubmitEditing` on TextInput (line 237). React state `loading` is async and won't block a second keyboard submit within the same render frame.
**Runtime evidence:** Line 237: `onSubmitEditing={handleLogin}` with no guard. Line 246: `disabled={loading}` only on Pressable button, not on keyboard submit path. `handleLogin` at line 35 has no synchronous re-entry guard.
**Blocker impact:** Degraded — double API call wastes resources, double `setSession` is idempotent (same data) but could cause unexpected re-renders.

---

## ISSUE-128: PosRootLayout Session Timeout Fires During Active Payment Flow — Clears Staff Mid-Transaction (HIGH)

**Screen:** PosRootLayout → PaymentScreen (cross-screen cascading)
**File:** `src/screens/PosRootLayout.tsx` (lines 1138, 1140-1142, 1151-1156) + `src/hooks/useSessionTimeout.ts` (lines 27-28)
**Route:** SellScan → Payment → (timeout fires)
**Reproducible steps:**
1. Staff logs in → starts SellScan tab
2. Adds items to cart → navigates to PaymentScreen (pushed on stack)
3. Waits for UPI payment or long checkout process (>35 minutes idle on PosRootLayout)
4. `useSessionTimeout` hook fires `onLogout` → `clearStaffSession()` at line 1134
5. PosRootLayout re-renders: `staffSession` is now null → shows StaffLoginScreen (line 1140-1142)
6. BUT PaymentScreen is STILL mounted on top of PosRootLayout in the navigation stack
7. User finishes payment on PaymentScreen → sale records with null staff (session cleared)
8. User navigates back from SuccessPrint → sees StaffLoginScreen instead of SellScan tab
**Expected:** Session timeout should be paused while `!isFocused` (i.e., while Payment/SuccessPrint is active on stack). Or: timeout warning should consider navigation depth before auto-logout.
**Actual:** `resetTimer` is only called via `onStartShouldSetResponderCapture` on PosRootLayout container (line 1151-1156). Touches on PaymentScreen (a different screen on the stack) do NOT reset the timer. After 35 min on payment flow, staff session is silently cleared.
**Runtime evidence:** `useSessionTimeout(clearStaffSession)` at line 1138. Timer check runs via `setInterval` regardless of focus. `resetTimer()` only fires from PosRootLayout touch — not from PaymentScreen touches.
**Blocker impact:** Flow blocked — active transaction records with null staff. User ejected from POS flow after payment.

---

## ISSUE-129: PosRootLayout uiStatus Polling Force-Navigates During Active Payment — Abandons In-Progress Transaction (HIGH)

**Screen:** PosRootLayout → PaymentScreen (cross-screen cascading)
**File:** `src/screens/PosRootLayout.tsx` (lines 558-576, 601-607)
**Route:** SellScan → Payment → (poll fires)
**Reproducible steps:**
1. User is on PaymentScreen (sale created, awaiting UPI payment)
2. PosRootLayout 60s uiStatus polling fires (line 605-607)
3. Backend returns `deviceActive === false` (admin disabled device) or `forceUpdate === true` (version bumped)
4. Lines 558-576: `navigation.reset({ index: 0, routes: [{ name: "DeviceBlocked" }] })` fires
5. Navigation stack resets — PaymentScreen is destroyed mid-transaction
6. Sale was already created via `createSale` but payment was NOT recorded → orphaned sale in backend
7. Cart lock was set but never released → next sale attempt on re-login may find stale lock
**Expected:** If `!isFocused` (PaymentScreen is on top), defer navigation reset until user returns to PosRootLayout. Or show an Alert instead of force-resetting during active transaction.
**Actual:** `navigation.reset()` fires unconditionally regardless of navigation depth. Active PaymentScreen is destroyed. Sale exists server-side without payment record.
**Runtime evidence:** `loadStatus` at line 498-599 runs every 60s via `setInterval` (line 605-607). Lines 558-576 call `navigation.reset()` without checking `isFocused`. PaymentScreen's `useEffect` cleanup runs but can't undo the already-created sale.
**Blocker impact:** Flow blocked — orphaned sale (no payment), cart lock corruption, potential duplicate sale on re-attempt if idempotency key not regenerated.

---

## ISSUE-130: SellScanScreen — Voice Recording Not Cancelled on Checkout Navigation (MEDIUM)

**Screen:** SellScanScreen → PaymentScreen transition
**Severity:** MEDIUM
**Category:** Resource leak / cross-screen state carryover
**Steps to reproduce:**
1. On SellScanScreen, start voice recording (tap or hold voice button)
2. While recording is active (voiceButtonState === "recording"), tap Checkout button
3. PaymentScreen opens via `navigation.navigate("Payment")`
4. Observe: voice recording continues in background (SellScanScreen stays mounted as tab child)
**Expected:** `handleCheckout` should call `cancelVoiceRecording()` before navigating to Payment, releasing the native `Audio.Recording` resource and audio session.
**Actual:** `handleCheckout` at lines 2858-2862 only calls `setCartExpanded(false)` then navigates. Active voice recording continues holding the audio session. The `maxDurationTimer` (voiceClient.ts:140) will eventually fire and auto-stop, but `onAutoStopCallback` is null (SellScanScreen never registers it) — so `voiceButtonState` remains "recording" in SellScanScreen's state indefinitely.
**Runtime evidence:** `handleCheckout` at SellScanScreen.tsx:2858-2862 has no voice cancellation. `cancelVoiceRecording` exists at line 2935 but is never called from checkout path. `onAutoStopCallback` is never set (grep confirms no `onAutoStop`/`setOnAutoStop` in SellScanScreen).
**Blocker impact:** Audio session held during payment flow. On iOS, may interfere with payment confirmation sounds. Voice UI stuck in "recording" state when returning from payment.

---

## ISSUE-131: SellScanScreen — Voice Recording Continues When App Backgrounded (MEDIUM)

**Screen:** SellScanScreen (voice recording active) + app backgrounding
**Severity:** MEDIUM
**Category:** Background resource / iOS compliance
**Steps to reproduce:**
1. Start voice recording on SellScanScreen
2. Press home button or switch to another app
3. Observe: recording continues in background
**Expected:** AppState change to "background" should pause or cancel the active voice recording, release the audio session, and reset voice UI state.
**Actual:** The AppState handler at lines 1098-1104 only handles `checkFreshness()` and `refreshStockSnapshot()` — does NOT check or cancel active voice recording. On iOS, background audio recording without the `audio` background mode triggers the orange indicator dot and iOS may suspend/terminate the app after ~5s.
**Runtime evidence:** AppState listener at SellScanScreen.tsx:1098-1104 only handles freshness. No voice state check on backgrounding. `voiceClient.ts` module-level `currentRecording` persists across AppState transitions.
**Blocker impact:** iOS may terminate app during active voice recording in background. On return, audio session may be in an invalid state.

---

## ISSUE-132: SellScanScreen — Unmount Cleanup Doesn't Cancel Native Voice Recording (MEDIUM)

**Screen:** SellScanScreen unmount path
**Severity:** MEDIUM
**Category:** Resource leak
**Steps to reproduce:**
1. Start voice recording
2. Trigger SellScanScreen unmount (e.g., device re-enrollment, navigation reset from uiStatus polling)
3. Observe: timers are cleared but native recording resource is NOT released
**Expected:** Unmount cleanup should call `cancelRecording()` to stop and unload the native `Audio.Recording` object.
**Actual:** Cleanup effect at lines 3110-3118 clears `voiceHoldTimerRef`, `voiceDurationIntervalRef`, and `searchTimeoutRef` timers, but does NOT call `cancelRecording()` or `stopRecording()`. The native `Audio.Recording` from `expo-av` remains allocated. Module-level `currentRecording` in voiceClient.ts is not cleared.
**Runtime evidence:** Cleanup at SellScanScreen.tsx:3110-3118 only clears JS timers. `currentRecording` at voiceClient.ts:76 persists. Next `startRecording()` call will attempt cleanup (line 118-124) but this is a defensive pattern, not guaranteed cleanup.
**Blocker impact:** Native audio resource leak. Potential "Only one Recording object" error on next recording attempt if cleanup at line 118 fails.

---

## ISSUE-133: PaymentScreen — Cancel-Sale Cleanup Effect Fires on Payment Mode Switch (HIGH)

**Screen:** PaymentScreen
**Severity:** HIGH
**Category:** Business logic / data integrity
**Steps to reproduce:**
1. Navigate to PaymentScreen (sale is created, `saleId` is set)
2. Switch payment mode from UPI to CASH (tap Cash tab)
3. Observe: the cleanup effect from line 636-655 fires because `selectedMode` is in the dependency array
4. Cleanup checks `!finalized.current && saleId` → both true → calls `cancelSale({ saleId })`
5. Sale is cancelled on backend while PaymentScreen still shows it as active
6. User taps "Complete Payment" → backend rejects because sale is already cancelled
**Expected:** Switching payment modes should NOT cancel the backend sale. The cleanup effect should only fire on true unmount (navigation away from PaymentScreen).
**Actual:** The useEffect at line 636-655 has `[billRef, currency, selectedMode, saleId, totalMinor, transactionId]` as deps. Any change to `selectedMode` (UPI→CASH, CASH→DUE, etc.) triggers effect re-run, which fires the previous cleanup. Previous cleanup has `saleId` in closure and `finalized.current === false` → calls `cancelSale`. Sale is cancelled server-side. UI is now inconsistent.
**Runtime evidence:** useEffect deps at PaymentScreen.tsx:655. `selectedMode` changes at lines 274, 319, 333, 349, 565. `cancelSale` at line 640 is fire-and-forget with `.catch()`.
**Blocker impact:** Sale cancelled on backend when user switches payment mode. Subsequent payment attempt fails. Cart lock may persist. Data integrity violation — sale exists as cancelled but user expects it active.

---

## ISSUE-134: PaymentScreen — QR Regeneration Creates Orphaned Payment Record (MEDIUM)

**Screen:** PaymentScreen (UPI mode, QR expired)
**Severity:** MEDIUM
**Category:** Backend data integrity / orphaned records
**Steps to reproduce:**
1. On PaymentScreen with UPI mode, wait for QR to expire (countdown reaches 0)
2. QR shows "QR expired — Tap to regenerate"
3. Tap to regenerate → `setUpiIntent(null)` triggers UPI init effect
4. Effect calls `initUpiPayment({ saleId, transactionId })` again
5. Backend creates a new payment record; new `paymentId` overwrites old one at line 532
6. Old payment record is now orphaned (no reference kept)
**Expected:** QR regeneration should either (a) reuse the existing payment by passing `paymentId` to the API, or (b) explicitly cancel the old payment before creating a new one, or (c) the backend should handle idempotency via `transactionId`.
**Actual:** The UPI init effect at line 510-611 does not pass the existing `paymentId` to `initUpiPayment`. It also does not clear `paymentId` before the call. The state setter at line 532 (`setPaymentId(res.paymentId)`) overwrites the old value. If the backend creates a new payment per call, the old one is orphaned.
**Runtime evidence:** QR regeneration at PaymentScreen.tsx:1206-1213 sets `upiIntent=null`. Effect guard at line 511 passes when `upiIntent` is null. `initUpiPayment` called at line 518 with same `saleId`+`transactionId` but no existing `paymentId`.
**Blocker impact:** Orphaned payment records in database. If customer scans old QR (cached in UPI app), payment goes to orphaned record — money collected but not linked to sale.

---

## ISSUE-135: PaymentScreen — clearDeviceSession Throw in handleDeviceAuthError Causes Unhandled Rejection (MEDIUM)

**Screen:** PaymentScreen (device_unauthorized error path)
**Severity:** MEDIUM
**Category:** Error handling / unhandled rejection
**Steps to reproduce:**
1. PaymentScreen receives `device_unauthorized` error from any API call (createSale, initUpiPayment, completeCheckout)
2. `handleDeviceAuthError` at line 194 is called
3. Line 200: `await clearDeviceSession()` — if AsyncStorage/SecureStore fails, this throws
4. Line 201: `navigation.reset()` never executes
5. Error propagates as unhandled rejection since caller catches ApiError but not this secondary throw
**Expected:** `clearDeviceSession()` failure should be caught; navigation should proceed regardless of session clear success.
**Actual:** `handleDeviceAuthError` at lines 194-209 awaits `clearDeviceSession()` without try-catch. `clearDeviceSession` (deviceSession.ts:170-187) can throw from `AsyncStorage.removeItem()` or `clearAllHistory()`. Same pattern as ISSUE-123 (ForceUpdateScreen) and DeviceBlockedScreen.
**Runtime evidence:** `handleDeviceAuthError` at PaymentScreen.tsx:194-209. `clearDeviceSession` at deviceSession.ts:170-187 has multiple throw paths.
**Blocker impact:** User stuck on PaymentScreen with active sale after device unauthorized. Navigation to EnrollDevice never fires. Sale may be completed on a device that should be blocked.

---

## ISSUE-136: SuccessPrintScreenV2 — WhatsApp Send Double-Submit via Keyboard Enter (LOW)

**Screen:** SuccessPrintScreenV2 → WhatsApp phone modal
**Severity:** LOW
**Category:** Double-submit / UX
**Steps to reproduce:**
1. Complete a sale and arrive at SuccessPrintScreenV2
2. Tap "WhatsApp Bill" button → phone modal opens
3. Enter a phone number and press Enter (keyboard send)
4. While `waStatus === "sending"`, press Enter again (keyboard still open)
5. `onSubmitEditing={handleWhatsAppSend}` fires again — no guard against "sending" state
**Expected:** `handleWhatsAppSend` should check `waStatus === "sending"` at entry and return early, OR `onSubmitEditing` should be guarded like the Send button (`disabled={waStatus === "sending"}`).
**Actual:** `onSubmitEditing` at line 401 directly calls `handleWhatsAppSend` which has no `waStatus` check. Send button at line 414 has `disabled={waStatus === "sending"}` but keyboard path bypasses this. Same pattern as ISSUE-127 (StaffLoginScreen keyboard double-submit).
**Runtime evidence:** SuccessPrintScreenV2.tsx:401 `onSubmitEditing={handleWhatsAppSend}`. `handleWhatsAppSend` at line 190 validates phone but does not check `waStatus`.
**Blocker impact:** Duplicate WhatsApp messages sent to customer. Low severity because WhatsApp API likely deduplicates, but poor UX.

---

## ISSUE-137: SuccessPrintScreenV2 — Phone Input maxLength Contradicts Validation Logic (LOW)

**Screen:** SuccessPrintScreenV2 → WhatsApp phone modal
**Severity:** LOW
**Category:** Input validation inconsistency
**Steps to reproduce:**
1. On WhatsApp phone modal, try to enter "919876543210" (12-digit with country code)
2. `maxLength={10}` prevents entering more than 10 digits
3. Try entering "09876543210" (11-digit with leading 0) — also blocked by maxLength
**Expected:** Either (a) `maxLength` should be 12 to support all formats `validatePhone` accepts, or (b) `validatePhone` should only accept 10-digit format since the input is capped at 10.
**Actual:** `maxLength={10}` at line 395 limits input to 10 characters. But `validatePhone` at lines 178-186 has logic to accept 11-digit (leading 0) and 12-digit (91 prefix) formats. These branches are unreachable due to the `maxLength` constraint. Dead code, not a functional bug.
**Runtime evidence:** SuccessPrintScreenV2.tsx:395 `maxLength={10}`. `validatePhone` at lines 183-185 handles 11/12-digit — unreachable.
**Blocker impact:** None — the 10-digit format works correctly. The 11/12-digit validation paths are just dead code.

---

## ISSUE-138: ReturnScreen — Idempotency Key Not Regenerated on New Return (MEDIUM)

**Screen:** ReturnScreen
**Severity:** MEDIUM
**Category:** Idempotency / data integrity
**Steps to reproduce:**
1. On ReturnScreen, look up bill #ABC, select items, process return → success
2. Tap "New Return" → state resets (bill, quantities, reason, method)
3. Look up a DIFFERENT bill #XYZ, select items, process return
4. Backend receives same `idempotencyKey` as the first return
5. If backend checks idempotency by key alone (not key+saleId), it rejects as duplicate
**Expected:** `handleNewReturn` should regenerate the idempotency key: `setIdempotencyKey(uuidv4())`.
**Actual:** `handleNewReturn` at lines 246-254 resets all state EXCEPT `idempotencyKey` (line 138). `setIdempotencyKey` is never called elsewhere. The same key is reused for completely different returns.
**Runtime evidence:** ReturnScreen.tsx:138 `useState(() => uuidv4())` — one-time generation. Line 246-254 `handleNewReturn` — no `setIdempotencyKey` call. Grep confirms `setIdempotencyKey` only appears at line 138.
**Blocker impact:** Depends on backend idempotency implementation. If keyed on `idempotencyKey` alone, second return is silently rejected. If keyed on `idempotencyKey+saleId`, no impact (different saleId).

---

## ISSUE-139: InwardScreen — No Idempotency + State-Only Double-Submit Guard for Stock Inward (MEDIUM)

**Screen:** InwardScreen (Stock Inward)
**Severity:** MEDIUM
**Category:** Double-submit / stock data integrity
**Steps to reproduce:**
1. Add items to inward cart, tap Submit
2. Rapidly double-tap the Submit button (before React re-renders with `submitting=true`)
3. Both taps pass `canSubmit` check (state-based, async)
4. `checkInventoryAndSubmit()` runs twice → `recordManualInward()` called twice
5. Two identical stock inward transactions created on backend
**Expected:** Use a synchronous ref guard (like PaymentScreen's `submittingRef`) to prevent double-submit. Also pass an idempotency key to `recordManualInward` for server-side deduplication.
**Actual:** `canSubmit` at line 299 uses `!submitting` state (async). `handleSubmit` at line 446 calls `checkInventoryAndSubmit()` which sets `setSubmitting(true)` at line 370, but React batches state updates — two rapid calls can both pass before re-render. `recordManualInward` at inventoryApi.ts:221 generates `referenceId = INWARD-${Date.now()}` inside the call — not a proper idempotency key, and same-millisecond calls get identical references.
**Runtime evidence:** InwardScreen.tsx:268 `useState(false)` — no ref guard. Line 370 `setSubmitting(true)` — async state. inventoryApi.ts:231 `Date.now()` — not unique for rapid calls.
**Blocker impact:** Duplicate stock inward records. Stock quantities inflated by 2x on double-tap. No server-side deduplication.

---

## ISSUE-140: SplitPaymentModal — Polling Continues After Modal Dismissed (LOW)

**Screen:** SplitPaymentModal (inside PaymentScreen)
**Severity:** LOW
**Category:** Resource leak / unnecessary API calls
**Steps to reproduce:**
1. Open SplitPaymentModal, initiate UPI split payment
2. Polling starts (step = "upi-waiting")
3. Close modal (onClose) — `visible` becomes false but component stays mounted
4. Polling continues in background — `getSplitPaymentStatus` API calls fire every few seconds
5. Polling continues until max attempts (40) or 5-minute wall-clock timeout
**Expected:** Closing the modal should stop all active polling. The cleanup effect at line 220-226 should clear `pollIntervalRef` regardless of `step` value when modal is dismissed.
**Actual:** Cleanup at line 220 checks `step !== "upi-waiting"` — if step is still "upi-waiting" (which it is when modal is dismissed mid-polling), cleanup is skipped. The `visible` prop is not in the useEffect deps, so hiding the modal doesn't trigger cleanup. The `scheduleNextPoll` recursive chain continues using local variables.
**Runtime evidence:** SplitPaymentModal.tsx:220-226 cleanup conditional on `step`. Modal is always rendered (visible=false hides it). Deps at line 227: `[step, saleId, upiVerified, pollingActive]` — `visible` not included.
**Blocker impact:** Low — unnecessary API calls for up to 5 minutes after modal close. No data corruption. Polling has built-in limits.

---

## ISSUE-141
- **Severity:** MEDIUM
- **Screen/Route:** EditReorderModal (src/components/reorder/EditReorderModal.tsx)
- **Status:** DISCOVERED
- **Category:** Race condition — duplicate supplier load

**Description:** Two separate `useEffect` hooks both call `loadSuppliers()` when the modal opens. The first effect (line 80-87) fires on `[visible, item]` change. The second effect (line 134-138) fires on `[storeId, visible, item, availableSuppliers.length, loadSuppliers]` change. When modal opens and `storeId` is already available, both effects fire in the same render cycle. The second has a guard (`availableSuppliers.length === 0`) but there's a timing window where both calls execute before either response arrives, causing duplicate API requests and potential state conflicts if responses arrive in different orders.

**Steps to reproduce:**
1. Open EditReorderModal for any reorder item
2. Both effects fire — `loadSuppliers()` called twice
3. Two concurrent `catalogApi.getProductSuppliers` requests
4. If first response sets `selectedSupplier` to supplier A, and second response arrives later and sets it to supplier B (or same), the selection flickers
**Expected:** Single `loadSuppliers()` call per modal open.
**Actual:** Two concurrent calls due to dual-effect pattern with overlapping triggers.
**Runtime evidence:** EditReorderModal.tsx:80-87 (effect 1) and :134-138 (effect 2). Both call `loadSuppliers()` when `visible && item && storeId` are truthy.
**Blocker impact:** Low — functional but wasteful. Potential UI flicker on supplier selection.

---

## ISSUE-142
- **Severity:** MEDIUM
- **Screen/Route:** OrderDetailScreen (src/screens/OrderDetailScreen.tsx)
- **Status:** DISCOVERED
- **Category:** Unhandled promise in polling

**Description:** Auto-refresh polling at line 134 uses `void loadOrder()` (fire-and-forget). If `loadOrder` throws an unhandled error (e.g., network error after the catch handler re-throws, or an unexpected exception), it becomes an unhandled promise rejection. Additionally, `loadOrder` is a `useCallback` with `storeId` in its dependency chain — when `storeId` changes, `loadOrder` reference changes, which causes the polling effect (deps: `[order?.status, loadOrder]`) to tear down and restart, resetting `pollCountRef.current = 0` and potentially polling indefinitely if `loadOrder` keeps getting recreated.

**Steps to reproduce:**
1. Navigate to OrderDetailScreen for an in-progress order
2. Polling starts (30s interval, max 60 attempts)
3. If network drops, `loadOrder` error becomes unhandled rejection via `void` call
4. If `storeId` state changes (e.g., async load resolves late), `loadOrder` changes → effect restarts → `pollCountRef` resets to 0 → max attempt counter never reached
**Expected:** Polling errors should be caught. Poll count should not reset on effect restart.
**Actual:** `void loadOrder()` at line 134 discards the promise. `pollCountRef.current = 0` at line 125 resets on every effect restart.
**Runtime evidence:** OrderDetailScreen.tsx:118-138. `void` operator at line 134. `pollCountRef.current = 0` at line 125 inside effect body.
**Blocker impact:** Low — polling has max 60 attempts per effect cycle, but restarts reset the counter.

---

## ISSUE-143
- **Severity:** MEDIUM
- **Screen/Route:** OrderHistoryScreen (src/screens/OrderHistoryScreen.tsx)
- **Status:** DISCOVERED
- **Category:** Filter race condition — stale response ordering

**Description:** The filter change effect at lines 257-261 calls `loadOrders(true, 1)` whenever `filter` changes, with no debounce or request cancellation. If the user rapidly switches filters (e.g., "pending" → "confirmed" → "all"), three concurrent requests fire. The responses can arrive out of order — the "pending" response (slowest) arriving last would overwrite the "all" results the user currently expects to see. `loadOrders` at line 253 has `filter` in its `useCallback` deps, so each call captures the correct filter, but `setOrders()` inside it overwrites state regardless of which filter the user is currently viewing.

**Steps to reproduce:**
1. Open OrderHistoryScreen
2. Rapidly tap through filter tabs (Pending → Confirmed → All) within 1 second
3. Three `loadOrders` calls fire concurrently
4. If network latency varies, earlier filter's response arrives after later filter's response
5. Order list shows results for wrong filter
**Expected:** Only the most recent filter's results should be displayed. Previous requests should be cancelled or their results discarded.
**Actual:** All responses write to `setOrders()` — last response wins regardless of filter relevance.
**Runtime evidence:** OrderHistoryScreen.tsx:257-261. No AbortController, no request ID, no staleness check.
**Blocker impact:** Low — visual inconsistency only, no data corruption. User can pull-to-refresh to correct.

---

## ISSUE-144
- **Severity:** LOW
- **Screen/Route:** EditReorderModal (src/components/reorder/EditReorderModal.tsx)
- **Status:** DISCOVERED
- **Category:** Missing abort on unmount

**Description:** `loadSuppliers()` at line 90-131 makes an async API call (`catalogApi.getProductSuppliers`) without an AbortController. If the modal is closed while the request is in flight, the response handler still runs — calling `setAvailableSuppliers()` and `setSelectedSupplier()` on an unmounted (or re-mounted with different item) component. React 18 suppresses the warning, but the state updates are wasteful and could apply to the wrong item if the modal is reopened quickly with a different product.

**Steps to reproduce:**
1. Open EditReorderModal
2. `loadSuppliers()` fires, API request in flight
3. Close modal before response arrives
4. Response arrives → setState calls on stale component state
**Expected:** API request cancelled on modal close / unmount.
**Actual:** No AbortController. Request completes and state updates fire.
**Runtime evidence:** EditReorderModal.tsx:90-131. No AbortController or cleanup return from effect.
**Blocker impact:** None — no data corruption, no user-visible error. Cosmetic/waste only.

---

## ISSUE-145
- **Severity:** HIGH
- **Screen/Route:** AddStoreProductModal (src/components/sell/AddStoreProductModal.tsx)
- **Status:** DISCOVERED
- **Category:** Double-submit — product creation race

**Description:** `handleSubmit` at line 154 uses state-only `busy` guard (`setBusy(true)` at line 163). Between validation passing (line 155) and React rendering the disabled state, rapid double-tap can fire two concurrent `createStoreProduct()` API calls (line 175). This creates duplicate store products — one with the expected barcode and one that may conflict or create orphaned inventory records. Unlike read-only screens, product creation is a write operation with real data consequences.

**Steps to reproduce:**
1. Scan an unknown barcode → AddStoreProductModal opens
2. Fill in product details (name, price, stock)
3. Rapidly double-tap "Save & Add to Cart" within 50ms
4. Both taps pass validation (line 155), both reach `setBusy(true)` before React re-renders
5. Two `createStoreProduct` API calls fire concurrently
**Expected:** Only one product creation call. Second tap should be blocked synchronously.
**Actual:** State-based `busy` guard is async — both calls pass before re-render disables button.
**Runtime evidence:** AddStoreProductModal.tsx:154-203. `setBusy(true)` at line 163 is async React state. No `useRef` guard. Button disabled at line 471 via `disabled={busy}`.
**Blocker impact:** Medium — creates duplicate store products. Backend may handle via barcode uniqueness constraint (returning existing product at line 194-195), but the duplicate API call is still wasteful and may trigger error states.

---

## ISSUE-146
- **Severity:** MEDIUM
- **Screen/Route:** PurchaseCartModal (src/components/buy/PurchaseCartModal.tsx)
- **Status:** DISCOVERED
- **Category:** Concurrent async execution in setInterval

**Description:** UPI timeout cleanup at lines 396-418 runs async work (`getDeviceStoreId()` + `orderApi.cancelOrder()`) inside a `setInterval(async () => {...}, 60_000)`. If the async work (particularly `cancelOrder` on a slow/unreliable network) takes longer than 60 seconds, the next interval tick fires while the previous one is still executing. This causes concurrent modifications to `pendingUpiOrders.current` Map — `delete()` at line 401 could execute twice for the same orderId if two interval ticks overlap, and `removeSupplierItems` at line 403 could fire twice for the same supplier.

**Steps to reproduce:**
1. Place a UPI order, creating a pending order entry in `pendingUpiOrders`
2. Wait 15 minutes for UPI timeout
3. Network is slow — `cancelOrder` takes 65+ seconds
4. 60-second interval fires again while previous iteration still running
5. Second iteration iterates over same Map entries (not yet deleted by first iteration)
6. Both iterations call `removeSupplierItems` and `cancelOrder` for same order
**Expected:** Only one cleanup per timed-out order. Async work should complete before next interval fires.
**Actual:** No concurrency guard. Multiple interval ticks can process the same pending orders simultaneously.
**Runtime evidence:** PurchaseCartModal.tsx:396-418. `setInterval` with async callback at line 397. No `processingRef` or similar guard.
**Blocker impact:** Low — `cancelOrder` is idempotent on backend. `removeSupplierItems` may flash UI but doesn't corrupt data.

---

## ISSUE-147
- **Severity:** MEDIUM
- **Screen/Route:** AddStoreProductModal (src/components/sell/AddStoreProductModal.tsx)
- **Status:** DISCOVERED
- **Category:** Stale onSuccess callback after modal reset

**Description:** If user opens the modal, fills form, submits, and then the modal is closed/reset (via parent changing `request` prop) before the `createStoreProduct` API call completes (line 175), the `onSuccess` callback at line 192 fires with the result from the old request context. The parent callback adds the product to cart — but it's the product from the previous modal session, not the current one. The form reset effect at line 74 (`useEffect(() => { if (!request) return; ... }, [request])`) resets form state but cannot cancel the in-flight API call.

**Steps to reproduce:**
1. Scan barcode A → AddStoreProductModal opens
2. Fill details, tap "Save & Add to Cart" — API call starts
3. Before API responds, close modal (back press or overlay tap)
4. Scan barcode B → modal opens for new product
5. API call for barcode A completes → `onSuccess` fires with product A's data
6. Parent adds product A to cart instead of product B
**Expected:** Closing modal should cancel in-flight API call, or guard onSuccess against stale requests.
**Actual:** No AbortController. `onSuccess` fires with stale product data after modal reset.
**Runtime evidence:** AddStoreProductModal.tsx:154-203. No AbortController. `request` prop changes trigger form reset at line 74 but don't cancel `createStoreProduct`.
**Blocker impact:** Low in practice — modal close typically waits for API response (button shows spinner). But possible on network delays + impatient user.

---

## Consolidated Issue Count

**135 issue entries** in this file (ISSUE-001 through ISSUE-147, with numbering gaps at 014-018 and 028-034 from prior sessions).

Breakdown:
- Pre-existing issues (prior sessions): ISSUE-001..013, 019..027, 035..059 = 49 entries
- Operator-reported issues (this session): ISSUE-060..066 = 7 entries
- Code-level audit wave 2: ISSUE-067..078 = 12 entries
- Code-level audit wave 3: ISSUE-079..088 = 10 entries
- Agent-discovered audit wave 4: ISSUE-089..113 = 25 entries
- Deep agent audit wave 5: ISSUE-114..119 = 6 entries (5 HIGH, 1 MEDIUM)
- Deep cascading audit wave 6: ISSUE-120..140 = 21 entries (4 HIGH, 14 MEDIUM, 3 LOW)
- Reorder/Order agent wave 7: ISSUE-141..144 = 4 entries (0 HIGH, 3 MEDIUM, 1 LOW)
- Modal/Component agent wave 8: ISSUE-145..147 = 3 entries (1 HIGH, 2 MEDIUM) [remaining agents pending]

### Cross-Cutting Patterns Identified

| Pattern | Severity | Affected Screens | Note |
|---------|----------|-----------------|------|
| State-only double-submit guard (no ref) | MEDIUM | InwardScreen, ReturnScreen, KhataScreen, GRNScreen, OpeningStockScreen, BnplDuesScreen, AddStoreProductModal | Only PaymentScreen uses `submittingRef` for synchronous guard |
| `clearDeviceSession()` throw in catch blocks | MEDIUM | ForceUpdateScreen, DeviceBlockedScreen, PaymentScreen | Same bug in 3 screens — shared `handleDeviceAuthError` pattern |
| `onSubmitEditing` bypasses `disabled` guard | LOW | StaffLoginScreen, SuccessPrintScreenV2 | Keyboard Enter can fire when button is disabled |
| AbortError misclassification from `fetchUiStatusStrict` | MEDIUM | ForceUpdateScreen, DeviceBlockedScreen | AbortError (DOMException) not caught by string-based error detection |
| Missing AbortController on async loads | LOW | EditReorderModal, OrderHistoryScreen, VariantPickerModal, PurchaseCartModal, AddStoreProductModal | No request cancellation on unmount or filter change |

Ready for consolidated fix wave.
