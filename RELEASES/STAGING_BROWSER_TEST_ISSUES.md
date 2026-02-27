# Staging Browser Test Issues Tracker

> **Created**: 2026-02-28
> **Deployed SHA**: `e63dba14` (tag: `deploy-ready-mega-batch-2026-02-27`)
> **Purpose**: Collect ALL issues found during operator browser testing of staging, fix in batch, redeploy once.

---

## Workflow

```
1. COLLECT  — Operator tests all portals, reports issues here (up to 100)
2. IMPLEMENT — Claude fixes all issues in code
3. TEST     — Run typecheck + build + CI gates
4. DEPLOY   — Single GCP staging redeploy with all fixes
```

---

## Issue Status Legend

| Status | Meaning |
|--------|---------|
| FOUND | Reported, not yet investigated |
| DIAGNOSED | Root cause identified |
| FIXED | Code fix committed locally |
| VERIFIED | Fix confirmed working after redeploy |
| WONTFIX | Not a bug / by design / deferred |

---

## Issues

### STG-001: SuperAdmin — 429 rate limit blocks entire panel
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/`)
- **Page**: Events tab (`#events`)
- **Symptom**: "Failed to fetch POS events (429)"
- **Root Cause**: `adminRateLimiter` shared config with auth brute-force (5/min). Fresh staging DB has many failing endpoints (missing tables), quickly exhausting the limit for ALL admin routes.
- **Fix**: Added separate `adminPanelRateLimitMax` config (default 60/min) in `backend/services/api-gateway/src/config.ts` and `rateLimiter.ts`.
- **Commit**: `4bbd914a`
- **Status**: FIXED

### STG-002: SuperAdmin — Monitoring page crashes with "Something went wrong"
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/`)
- **Page**: Monitoring tab (`#monitoring`)
- **Symptom**: React error boundary — "An unexpected error occurred"
- **Root Cause**: When STG-001's 429 kicks in, the monitoring health endpoint returns rate-limit JSON instead of health JSON. `Object.entries(health.checks)` on undefined crashes React.
- **Fix**: Added response validation in `supermandi-superadmin/src/api/monitoring.ts` — throws clean error on non-health responses instead of crashing.
- **Commit**: `4bbd914a`
- **Status**: FIXED

### STG-003: Retailer Portal — OTP verification failed (409)
- **Portal**: Retailer (`staging.supermandi.tech/retailer/`)
- **Page**: Registration → Phone Verify step
- **Symptom**: "OTP verification failed (409)" after phone OTP
- **Root Cause**: `verify-otp` endpoint does `UPDATE SET firebase_uid = $1` but a stale DRAFT application from a previous attempt already has that `firebase_uid` → unique constraint `ux_applications_firebase_uid_entity` fires → global error handler converts 23505 to 409.
- **Fix**: Added stale `firebase_uid` cleanup before update in `backend/src/routes/v1/retailer-admin/registration.ts` (same pattern supplier registration already uses).
- **Commit**: `4bbd914a`
- **Status**: FIXED

### STG-004: SuperAdmin — SMTP email sending failed on login
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/`)
- **Page**: Login page
- **Symptom**: "Failed to send verification email. Please try again."
- **Root Cause**: `smtp-password` GCP secret didn't have a valid Gmail App Password.
- **Fix**: Updated secret via `gcloud secrets versions add smtp-password` with valid App Password. Restarted main-backend (revision `main-backend-00112-db8`).
- **Status**: FIXED (infra fix, no code change needed)

### STG-005: ALL PORTALS — Remove "Made in India" from footer across all pages
- **Portal**: ALL (Supplier, Retailer, SuperAdmin, POS, Landing)
- **Page**: Every page with footer
- **Symptom**: Footer shows "© 2026 SuperMandi Tech Pvt Ltd · Made in India" — operator wants "Made in India" removed
- **Root Cause**: Hardcoded in 17 locations across all portals
- **Files**: `supplier-portal/src/app/(dashboard)/layout.tsx:445`, `supplier-portal/src/app/register/layout.tsx:32`, `supplier-portal/src/app/help/page.tsx:57`, `supplier-portal/src/app/help/layout.tsx:32`, `supplier-portal/src/app/(auth)/layout.tsx:40`, `retailer-admin/src/components/ProtectedLayout.tsx:318`, `retailer-admin/src/components/HelpPageContent.tsx:131`, `retailer-admin/src/pages/RegisterPage.tsx:1119`, `retailer-admin/src/pages/LoginPage.tsx:730`, `retailer-admin/src/pages/ForgotPasswordPage.tsx:641`, `retailer-admin/src/pages/ResetPasswordPage.tsx:261`, `retailer-admin/src/pages/HelpPage.tsx:37`, `supermandi-superadmin/src/App.tsx:3490`, `supermandi-superadmin/src/components/LoginGate.tsx:191`, `src/screens/HelpScreen.tsx:226`
- **Status**: DIAGNOSED

### STG-006: ALL PORTALS — Hardcoded copyright year 2026 will go stale
- **Portal**: ALL
- **Page**: Every page with footer
- **Symptom**: Footer shows `© 2026` — hardcoded, will be wrong in 2027
- **Root Cause**: Hardcoded year string in same 17 locations as STG-005
- **Fix**: Replace `2026` with dynamic `new Date().getFullYear()` (React) / `{new Date().getFullYear()}` (JSX)
- **Status**: DIAGNOSED

### STG-007: Supplier Portal — Dashboard orders/products queries missing loading states
- **Portal**: Supplier (`staging.supermandi.tech/supplier/dashboard/`)
- **Page**: Dashboard
- **Symptom**: "No orders yet." shows immediately even while API is still loading. No skeleton/spinner.
- **Root Cause**: `useQuery` for orders and products doesn't destructure `isLoading`/`isError`. Recent Orders section treats "not loaded" same as "empty".
- **Files**: `supplier-portal/src/app/(dashboard)/dashboard/page.tsx:66-75`
- **Status**: DIAGNOSED

### STG-008: Supplier Portal — Quick Actions don't check supplier verification status
- **Portal**: Supplier
- **Page**: Dashboard → Quick Actions
- **Symptom**: "Add Product", "Upload CSV" buttons are enabled even for unverified suppliers — clicking leads to API permission error
- **Root Cause**: Quick action `<Link>` components don't check `supplier.verificationStatus`. Layout has `LimitedModeBanner` but buttons aren't disabled.
- **Files**: `supplier-portal/src/app/(dashboard)/dashboard/page.tsx:174-191`
- **Status**: DIAGNOSED

---

## Pending Issues (add new issues below)

### STG-009:
- **Portal**:
- **Page**:
- **Symptom**:
- **Root Cause**:
- **Fix**:
- **Status**: FOUND

---

## Summary

| Status | Count |
|--------|-------|
| FIXED | 4 |
| DIAGNOSED | 4 |
| FOUND | 0 |
| VERIFIED | 0 |
| WONTFIX | 0 |
| **Total** | **8** |

---

## Redeploy Checklist (run after all issues FIXED)

- [ ] `pnpm -r typecheck` — 0 errors
- [ ] `pnpm -r build` — all services build
- [ ] `git push origin main`
- [ ] CI 20/20 green
- [ ] Tag new deploy-ready SHA
- [ ] Trigger staging deploy
- [ ] Verify all FIXED issues are VERIFIED on staging
