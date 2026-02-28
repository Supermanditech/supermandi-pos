# Firebase Production Audit Checklist

## Purpose

Use this checklist to take Firebase / Identity Platform from "working" to production-grade.

This checklist is not a code-only review. It requires:

1. Firebase Console / Identity Platform review
2. repo and runtime configuration review
3. live staging verification
4. explicit evidence capture

Production-grade is reached only when all required gates below are `PASS`.

---

## Scope

This checklist applies to:

1. Retailer web phone OTP flow
2. Supplier web phone OTP flow
3. Backend Firebase Admin token verification
4. POS Firebase usage, if POS relies on Firebase auth in production
5. Identity Platform / Firebase Authentication console settings

---

## Current Known Risk Areas

These are already known and must be rechecked before closure:

1. reCAPTCHA SMS defense is in `AUDIT`, not enforced
2. configured reCAPTCHA site keys show `0` assessments
3. backend Firebase init currently fails soft instead of fail-fast
4. Firebase token verification does not check revoked tokens
5. Firebase verification logs are too verbose for production auth flows
6. authorized domains and SMS region policy must be explicitly audited

---

## Gate 1: Identity Platform Console

### 1.1 Sign-in methods

- [ ] Phone authentication enabled only if required
- [ ] Email/password or email OTP methods align with current product flows
- [ ] Unused providers disabled
- [ ] MFA configuration is intentional, not default/accidental

Evidence:
- screenshot or operator note of enabled providers

### 1.2 Authorized domains

- [ ] `staging.supermandi.tech` present if staging OTP is used
- [ ] `supermandi.tech` present if production OTP is used
- [ ] only required localhost/dev domains remain
- [ ] no stale or unknown domains remain authorized

Minimum review output:
- exact authorized domain list
- mark each as `required` or `remove`

### 1.3 reCAPTCHA SMS defense

- [ ] Phone authentication enforcement mode reviewed
- [ ] if still in `AUDIT`, this is documented as non-final
- [ ] assessment counts are non-zero on active keys
- [ ] staging OTP flow generates assessments successfully
- [ ] switch to `ENFORCE` only after assessment behavior is validated

Pass rule:
- do not call this production-grade while assessment count remains `0`

### 1.4 SMS region policy

- [ ] SMS sending regions are restricted to supported operating countries
- [ ] regions are not globally open without business need
- [ ] restrictions documented

### 1.5 Password policy / anti-abuse settings

- [ ] password policy reviewed if password auth remains enabled
- [ ] sign-up quota reviewed
- [ ] fraud prevention settings reviewed
- [ ] blocking functions reviewed if used

---

## Gate 2: Runtime Configuration

### 2.1 Frontend env alignment

Retailer web:
- [ ] `VITE_FIREBASE_API_KEY`
- [ ] `VITE_FIREBASE_AUTH_DOMAIN`
- [ ] `VITE_FIREBASE_PROJECT_ID`
- [ ] `VITE_FIREBASE_STORAGE_BUCKET`
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `VITE_FIREBASE_APP_ID`

Supplier web:
- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY`
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID`

POS app:
- [ ] confirm whether POS requires Firebase Auth in production
- [ ] if yes, verify `EXPO_PUBLIC_FIREBASE_*` values
- [ ] if no, document POS as out of Firebase auth scope

Pass rule:
- all required values exist in the target runtime environment, not just in example files

### 2.2 Backend Firebase Admin configuration

- [ ] `FIREBASE_ENABLED=true` only where intended
- [ ] `FIREBASE_PROJECT_ID` set correctly
- [ ] `FIREBASE_SERVICE_ACCOUNT_PATH` or ADC path is valid
- [ ] Cloud Run / runtime identity can actually initialize Firebase Admin
- [ ] secret/material location documented

### 2.3 Secret/runtime dependency review

- [ ] Firebase Admin credentials path verified
- [ ] no committed service account JSON in repo
- [ ] runtime credential source documented
- [ ] startup behavior reviewed when credentials are missing or invalid

Current target improvement:
- backend should fail fast or mark health degraded when Firebase is enabled but cannot initialize

---

## Gate 3: Code Hardening Review

### 3.1 Backend verification

- [ ] token verification uses Firebase Admin SDK
- [ ] invalid tokens rejected
- [ ] expired tokens rejected
- [ ] decision made on revoked token handling
- [ ] token verification timeout behavior is acceptable

### 3.2 Logging hygiene

- [ ] no token preview logging in production
- [ ] no phone-number logging beyond minimum operational need
- [ ] no verbose auth internals exposed in logs
- [ ] no sensitive Firebase error details leaked to users

### 3.3 Initialization behavior

- [ ] if Firebase init fails while enabled, system behavior is explicit
- [ ] health/readiness behavior reflects auth dependency truth
- [ ] no false-green service state for broken phone auth

### 3.4 Frontend reCAPTCHA integration

- [ ] invisible reCAPTCHA is initialized correctly
- [ ] expiry path is handled
- [ ] resend/retry path is handled
- [ ] button/container IDs exist consistently
- [ ] user-facing errors are actionable

---

## Gate 4: Live Staging Verification

These tests must be run on live staging, not inferred from code.

### 4.1 Retailer OTP flow

- [ ] load login/register page without console/runtime auth crash
- [ ] send OTP works
- [ ] verify OTP works
- [ ] backend token exchange works
- [ ] invalid OTP gives correct error
- [ ] expired/used OTP gives correct error
- [ ] too-many-attempts behavior is understandable
- [ ] session after login is valid and stable

### 4.2 Supplier OTP flow

- [ ] load login/register page without auth crash
- [ ] send OTP works
- [ ] verify OTP works
- [ ] backend token exchange works
- [ ] invalid OTP handled correctly
- [ ] approval/pending supplier behavior matches business rules

### 4.3 reCAPTCHA behavior

- [ ] staging OTP attempts increase assessment counts
- [ ] no silent captcha failure
- [ ] captcha failure path gives actionable user message
- [ ] no domain mismatch errors

### 4.4 Failure-mode checks

- [ ] broken Firebase config produces explicit failure, not silent degradation
- [ ] revoked/invalid/expired token handling reviewed
- [ ] unauthorized domain behavior is understood
- [ ] network-failure behavior is understandable

Evidence required:
- screenshots or screen recordings
- exact timestamp
- staging URL
- API/network response if relevant
- updated assessment count or console evidence

---

## Gate 5: Security Review

- [ ] authorized domains minimized
- [ ] SMS region policy minimized
- [ ] Firebase Admin credentials not in repo
- [ ] server verification is authoritative
- [ ] no client-only trust path remains
- [ ] revoked-token stance documented
- [ ] auth logging sanitized
- [ ] no user-facing internal Firebase error leakage

---

## Gate 6: Go / No-Go Rules

### NO-GO if any of the following is true

1. reCAPTCHA assessment count remains `0` after real staging OTP attempts
2. phone auth is still only in `AUDIT` with no validation evidence
3. backend Firebase init can fail while health still appears healthy
4. runtime credentials are missing or ambiguous
5. staging retailer or supplier OTP flow is broken
6. authorized domains are incomplete or stale
7. SMS region policy is too broad for business need
8. auth logs still expose sensitive token/phone details

### GO only when all are true

1. live retailer OTP flow passes
2. live supplier OTP flow passes
3. assessment counts are non-zero
4. reCAPTCHA behavior is validated
5. backend auth initialization/runtime path is verified
6. authorized domains are correct
7. SMS region policy is correct
8. security/logging gaps are closed or explicitly accepted

---

## Required Evidence Package

Before calling Firebase production-grade, capture:

1. authorized domain list
2. sign-in method list
3. reCAPTCHA enforcement mode
4. assessment counts before and after staging OTP tests
5. SMS region policy screenshot or operator record
6. backend runtime env verification
7. one successful retailer OTP login evidence set
8. one successful supplier OTP login evidence set
9. one negative-path OTP evidence set
10. final go/no-go statement

---

## Recommended Follow-up Fixes

These should be treated as production hardening items if not already done:

1. make Firebase Admin init fail-fast or degrade health when enabled but broken
2. remove token preview / sensitive auth logs from production paths
3. decide and implement revoked-token handling policy
4. explicitly document whether POS is in or out of Firebase auth scope
5. validate reCAPTCHA metrics before switching from `AUDIT` to `ENFORCE`

---

## Final Truth Statement Template

Use this exact structure at closure:

```text
Firebase Production Audit Result

Console:
- Sign-in methods: PASS/FAIL
- Authorized domains: PASS/FAIL
- reCAPTCHA SMS defense: PASS/FAIL
- SMS region policy: PASS/FAIL

Runtime:
- Frontend env alignment: PASS/FAIL
- Backend Admin config: PASS/FAIL
- Credential source: PASS/FAIL

Live staging:
- Retailer OTP flow: PASS/FAIL
- Supplier OTP flow: PASS/FAIL
- reCAPTCHA assessments observed: PASS/FAIL

Security:
- Server verification: PASS/FAIL
- Logging hygiene: PASS/FAIL
- Revocation policy: PASS/FAIL

Final verdict:
- PRODUCTION-GRADE READY: YES/NO

Blocking gaps:
- ...
```

