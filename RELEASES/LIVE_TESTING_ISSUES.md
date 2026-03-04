# Live Testing Issues — State Machine

> Created during CTO live testing on 2026-03-05
> All issues to be fixed in one batch, then deployed together.

## Issue State Lifecycle

```
DISCOVERED → ANALYZED → SOLUTION_DESIGNED → FIXED → VERIFIED
```

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
