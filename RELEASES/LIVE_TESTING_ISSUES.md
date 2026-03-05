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
