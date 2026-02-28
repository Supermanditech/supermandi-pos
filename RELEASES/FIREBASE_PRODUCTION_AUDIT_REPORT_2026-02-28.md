# Firebase Production Audit Report

Date: 2026-02-28
Repo baseline: `34a98968` plus current workspace audit read
Scope: Firebase / Identity Platform readiness for retailer web, supplier web, backend auth verification, and POS Firebase usage

## Verdict

`PRODUCTION-GRADE READY: NO`

Firebase is integrated and partially hardened, but it is not yet closed to production-grade because key console/runtime gates remain unverified or fail current standards.

---

## Evidence Summary

### Repo / Runtime Evidence Collected

Retailer web Firebase client:
- `retailer-admin/src/lib/firebase.ts`

Supplier web Firebase client:
- `supplier-portal/src/lib/firebase.ts`

POS Firebase config:
- `src/config/firebase.ts`

Backend Firebase Admin verification:
- `backend/packages/common/src/firebase/firebaseAdminService.ts`
- `backend/services/auth-service/src/index.ts`
- `backend/services/auth-service/src/routes/retailerAuth.ts`
- `backend/src/routes/v1/supplier/auth.ts`

Deploy/runtime env mapping:
- `.github/workflows/deploy.yml:565`
- `.github/workflows/deploy.yml:566`
- `retailer-admin/Dockerfile`
- `supplier-portal/Dockerfile`
- `retailer-admin/.env.production`
- `supplier-portal/.env.production.example`

Live staging reachability:
- `https://staging.supermandi.tech/retailer/login` -> 200
- `https://staging.supermandi.tech/retailer/register` -> 200
- `https://staging.supermandi.tech/supplier/login` -> 200
- `https://staging.supermandi.tech/supplier/register` -> 200
- `https://staging.supermandi.tech/api/health` -> 200

Console-state evidence provided by operator:
- Identity Platform reCAPTCHA phone auth mode: `AUDIT`
- SMS fraud threshold: `Block some (0.5)`
- Configured platform site keys: `3`
- Assessment count on all configured keys: `0`

---

## Gate Results

### Gate 1: Identity Platform Console

#### 1.1 Sign-in methods

Result: `BLOCKED`

Reason:
- repo indicates phone OTP flows exist for retailer and supplier
- actual enabled provider set in Identity Platform was not verified from console

What is needed:
- explicit sign-in method inventory from console

#### 1.2 Authorized domains

Result: `BLOCKED`

Reason:
- live staging routes are reachable
- but authorized domain list was not captured
- cannot prove `staging.supermandi.tech` and `supermandi.tech` are both correctly authorized

Required verification:
- export or screenshot of exact authorized domains list

#### 1.3 reCAPTCHA SMS defense

Result: `FAIL`

Evidence:
- enforcement mode is `AUDIT`
- all configured keys show `0` assessments

Why this fails:
- production-grade anti-fraud posture is not proven while the system is still only auditing and no assessments are being generated

Required action:
- run real staging OTP attempts
- confirm assessments increase above zero
- validate behavior
- then move from `AUDIT` to `ENFORCE`

#### 1.4 SMS region policy

Result: `BLOCKED`

Reason:
- console page exists, but no actual allow/deny region evidence was captured

#### 1.5 Fraud / policy settings

Result: `BLOCKED`

Reason:
- password policy, quota, blocking functions, and user action settings not yet evidenced

---

## Gate 2: Runtime Configuration

### 2.1 Frontend env alignment

Retailer web:
- Result: `PASS`
- Evidence:
  - `retailer-admin/src/lib/firebase.ts` reads `VITE_FIREBASE_*`
  - `retailer-admin/.env.production` exists with concrete values
  - `retailer-admin/Dockerfile` loads `.env.production` into build

Supplier web:
- Result: `PASS WITH RISK`
- Evidence:
  - `supplier-portal/src/lib/firebase.ts` reads `NEXT_PUBLIC_FIREBASE_*`
  - `supplier-portal/Dockerfile` falls back from `.env.production` to `.env.production.example`
  - `supplier-portal/.env.production.example` contains concrete Firebase public values
- Risk:
  - runtime depends on example-file fallback instead of an explicit production env file
  - acceptable for public client keys, but operationally weak

POS:
- Result: `OUT OF SCOPE`
- Evidence:
  - `src/config/firebase.ts` exists as scaffolding but `isFirebaseReady()` is not imported by any production screen or service
  - POS uses device enrollment + JWT (`deviceSession.ts`) for authentication
  - Firebase phone OTP is not part of POS production auth flow
  - Documented explicitly in code (FIREBASE-HARDENING-E)

### 2.2 Backend Firebase Admin configuration

Result: `PASS`

Evidence:
- deploy sets:
  - `FIREBASE_ENABLED=true`
  - `FIREBASE_PROJECT_ID=supermandi-pos`
  - `.github/workflows/deploy.yml:565`
- auth service config reads:
  - `FIREBASE_SERVICE_ACCOUNT_PATH`
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_ENABLED`
  - `backend/services/auth-service/src/config.ts`

Hardening applied (FIREBASE-HARDENING-A):
- health endpoint now returns `firebase: "failed"` and HTTP 503 when Firebase is expected but broken
- no false-green service state possible

### 2.3 Secret/runtime dependency review

Result: `PASS`

Evidence:
- no service account JSON found committed in repo
- backend expects runtime credential source via file path or ADC
- Firebase Admin init supports `serviceAccountPath` or `applicationDefault()`

Hardening applied (FIREBASE-HARDENING-D):
- deploy.yml sets `FIREBASE_PROJECT_ID` without `FIREBASE_SERVICE_ACCOUNT_PATH` → code falls through to ADC
- ADC on Cloud Run uses the service's IAM service account — documented in code
- operator must verify Cloud Run service account has `Firebase Authentication Admin` IAM role

---

## Gate 3: Code Hardening Review

### 3.1 Server-side verification

Result: `PASS`

Evidence:
- Firebase Admin verification is implemented:
  - `backend/packages/common/src/firebase/firebaseAdminService.ts:109`
- retailer auth exchange uses verified Firebase token:
  - `backend/services/auth-service/src/routes/retailerAuth.ts:237`
- supplier auth uses server-side Firebase verification:
  - `backend/src/routes/v1/supplier/auth.ts` Firebase register/login paths

Hardening applied (FIREBASE-HARDENING-C):
- `verifyIdToken(idToken, true)` — revoked tokens are now checked
- requires Cloud Run service account to have `Firebase Authentication Admin` IAM role

### 3.2 Logging hygiene

Result: `PASS`

Hardening applied (FIREBASE-HARDENING-B):
- token preview logging removed entirely
- UID and phone number logging removed — success log now shows provider only
- error logging now shows error code only — no raw message (may contain credential details)
- UNKNOWN fallback no longer leaks `firebaseError.message` to return value
- client-side `console.error` in retailer/supplier web is acceptable (browser-only, no server leak)

### 3.3 Initialization behavior

Result: `PASS`

Hardening applied (FIREBASE-HARDENING-A):
- `firebaseAdminService.ts` tracks init status via `getFirebaseHealth()`
- `auth-service/src/index.ts` health endpoint returns HTTP 503 + `firebase: "failed"` when init fails
- service does NOT crash (staff/admin auth still works), but health correctly reports degraded
- Cloud Run / load balancer will detect unhealthy instance

### 3.4 Frontend reCAPTCHA integration

Result: `PASS WITH LIVE-VALIDATION BLOCK`

Evidence:
- retailer and supplier both use `RecaptchaVerifier`
- expiry and re-init logic exists
- user-friendly error mapping exists for:
  - `auth/invalid-app-credential`
  - `auth/captcha-check-failed`
  - `auth/too-many-requests`
  - `auth/network-request-failed`

Block:
- no live evidence yet that staging OTP attempts create reCAPTCHA assessments

---

## Gate 4: Live Staging Verification

### 4.1 Public/auth route reachability

Result: `PASS`

Evidence:
- retailer login/register reachable
- supplier login/register reachable
- staging API health reachable

### 4.2 Retailer OTP flow

Result: `BLOCKED`

Reason:
- not executable from repo-only environment without interactive OTP session

### 4.3 Supplier OTP flow

Result: `BLOCKED`

Reason:
- not executable from repo-only environment without interactive OTP session

### 4.4 reCAPTCHA assessment validation

Result: `FAIL`

Evidence:
- all configured keys show assessment count `0`

---

## Gate 5: Security Review

### Server-side trust model

Result: `PASS`

Evidence:
- server-side verification exists for retailer and supplier Firebase login/register

### Revocation posture

Result: `PASS`

Reason:
- `verifyIdToken(token, true)` now checks revocation (FIREBASE-HARDENING-C)
- existing `auth/id-token-revoked` handler returns `TOKEN_REVOKED` error

### Logging / PII exposure

Result: `PASS`

Reason:
- token preview, UID, phone number logging removed (FIREBASE-HARDENING-B)
- error logging sanitized to code-only

### Client key handling

Result: `PASS WITH NOTE`

Reason:
- client Firebase web config values are public identifiers, not secrets
- but operational restrictions must still be handled in console

---

## Blocking Gaps

### Repo-owned (CLOSED by hardening phase)

3. ~~Firebase init fails soft instead of fail-fast / degraded health~~ → **FIXED** (FIREBASE-HARDENING-A)
4. ~~revoked Firebase tokens are not checked~~ → **FIXED** (FIREBASE-HARDENING-C, `checkRevoked=true`)
5. ~~Firebase auth logging is too verbose for production~~ → **FIXED** (FIREBASE-HARDENING-B)
9. ~~POS Firebase production scope not explicitly verified~~ → **RESOLVED** (FIREBASE-HARDENING-E: POS out of scope — uses device enrollment, not Firebase OTP)

### Repo-owned (CLOSED with documentation)

- Runtime credential source ambiguity → **DOCUMENTED** (FIREBASE-HARDENING-D: ADC on Cloud Run, requires Firebase Authentication Admin IAM role)

### Operator-only (remain open)

1. reCAPTCHA SMS defense remains in `AUDIT`
2. all reCAPTCHA keys still show `0` assessments
6. authorized domains not explicitly verified
7. SMS region policy not explicitly verified
8. retailer/supplier live OTP flows not yet verified end-to-end on staging

---

## Repo Hardening Phase (2026-02-28)

### Changes made

| Phase | File | Change |
|-------|------|--------|
| A | `backend/packages/common/src/firebase/firebaseAdminService.ts` | Added `getFirebaseHealth()` export, init status tracking |
| A | `backend/services/auth-service/src/index.ts` | Health endpoint returns 503 when Firebase expected but broken |
| B | `backend/packages/common/src/firebase/firebaseAdminService.ts` | Removed token preview logging, UID/phone logging, raw error message logging |
| C | `backend/packages/common/src/firebase/firebaseAdminService.ts` | Changed `verifyIdToken(token, false)` → `verifyIdToken(token, true)` |
| D | `backend/packages/common/src/firebase/firebaseAdminService.ts` | Documented ADC production path and IAM requirement |
| E | `src/config/firebase.ts` | Documented POS Firebase as out of scope for production auth |

### Verification

- `backend/packages/common` typecheck: PASS (0 errors)
- `backend/services/auth-service` typecheck: PASS (0 errors)
- POS typecheck: PASS (0 errors)
- No auth route changes — existing retailer/supplier token exchange paths unchanged
- No new dependencies

### IAM requirement for operator

Cloud Run service account needs `Firebase Authentication Admin` IAM role for:
- `checkRevoked=true` token verification
- ADC-based Firebase Admin SDK initialization

---

## Recommended Remediation Order (Updated)

### P0 — ALL CLOSED

1. ~~Make backend Firebase init fail-fast or health-degrading~~ → DONE (FIREBASE-HARDENING-A)
2. ~~Remove token preview / phone / UID logging~~ → DONE (FIREBASE-HARDENING-B)
3. ~~Decide and implement revoked-token handling policy~~ → DONE (FIREBASE-HARDENING-C)

### P1 — Operator-only (unchanged)

4. Run real retailer OTP staging test
5. Run real supplier OTP staging test
6. Confirm reCAPTCHA assessments move above zero
7. Move reCAPTCHA phone auth from `AUDIT` to `ENFORCE` after validation

### P2 — Partially closed

8. Audit and minimize authorized domains — OPERATOR
9. Audit and restrict SMS region policy — OPERATOR
10. ~~Explicitly document POS Firebase production scope~~ → DONE (FIREBASE-HARDENING-E)
11. Replace supplier `.env.production.example` fallback with explicit documented production build input if desired for operational clarity — LOW PRIORITY

---

## Final Truth Statement (Updated)

Firebase Production Audit Result

Console:
- Sign-in methods: BLOCKED (operator)
- Authorized domains: BLOCKED (operator)
- reCAPTCHA SMS defense: FAIL (operator — must verify assessments then switch to ENFORCE)
- SMS region policy: BLOCKED (operator)

Runtime:
- Frontend env alignment: PASS WITH RISK (supplier example-file fallback)
- Backend Admin config: PASS (health endpoint reports Firebase status)
- Credential source: PASS (ADC documented, IAM role requirement stated)

Live staging:
- Retailer OTP flow: BLOCKED (operator)
- Supplier OTP flow: BLOCKED (operator)
- reCAPTCHA assessments observed: FAIL (operator)

Security:
- Server verification: PASS
- Logging hygiene: PASS (token/phone/error details removed)
- Revocation policy: PASS (checkRevoked=true enabled)

POS:
- Firebase scope: OUT OF SCOPE (device enrollment auth, not Firebase OTP)

Final verdict:
- REPO-HARDENED: YES
- PRODUCTION-GRADE READY: NO (awaiting operator verification of console settings + live OTP flows)

Remaining blockers are ALL operator-only:
1. reCAPTCHA assessment validation + AUDIT→ENFORCE
2. Authorized domains audit
3. SMS region policy audit
4. Live retailer OTP flow verification
5. Live supplier OTP flow verification
6. Cloud Run service account IAM role verification (Firebase Authentication Admin)

