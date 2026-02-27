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

### STG-009: Supplier Portal — Products page "Failed to load products" (missing `pending_mrp` column)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/products/`)
- **Page**: Products list
- **Symptom**: "Failed to load products / Request failed" with Retry button. No products load for any supplier.
- **Root Cause**: Backend `GET /api/v1/supplier/products` query selects `pending_mrp` column (line 229) that doesn't exist in `catalog.supplier_products`. Migration 146 adds `pending_purchase_price` but never adds `pending_mrp`. PostgreSQL throws "column does not exist" → 500 error.
- **Fix**: Add migration to create `pending_mrp BIGINT` column on `catalog.supplier_products` (same pattern as `pending_purchase_price`)
- **Files**: `backend/src/routes/v1/supplier/products.ts:229,264,606,633,657,696`, migration needed
- **Status**: DIAGNOSED

### STG-010: Supplier Portal — "+ Add Product" button enabled despite API failure
- **Portal**: Supplier
- **Page**: Products list
- **Symptom**: "+ Add Product" button is blue and clickable even when products API fails. Clicking will also fail since the same schema gap affects product creation.
- **Root Cause**: Button has no guard for API health or supplier verification status (same pattern as STG-008 Quick Actions)
- **Files**: `supplier-portal/src/app/(dashboard)/products/page.tsx`
- **Status**: DIAGNOSED

### STG-011: Supplier Portal — "Partial_received" tab label has underscore
- **Portal**: Supplier (`staging.supermandi.tech/supplier/orders/`)
- **Page**: Orders list
- **Symptom**: Status filter tab shows "Partial_received" with raw underscore instead of "Partially Received"
- **Root Cause**: Line 336 uses naive `charAt(0).toUpperCase() + slice(1)` which doesn't handle underscores. Should use a display label map.
- **Fix**: Add status display label mapping (e.g., `{ partial_received: 'Partially Received' }`) or replace underscores with spaces
- **Files**: `supplier-portal/src/app/(dashboard)/orders/page.tsx:336`
- **Status**: DIAGNOSED

### STG-012: Supplier Portal — Clicking Notifications logs user out (missing auth middleware)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/notifications/`)
- **Page**: Notifications
- **Symptom**: Clicking "Notifications" in sidebar immediately logs the user out and redirects to login page
- **Root Cause**: `supplierNotificationsRouter` routes don't use `requireSupplierAuth` middleware. They manually check `(req as any).supplierId` (line 44-46) but this property is never set without the middleware → returns 401 → frontend `handle401Response()` clears token and redirects to `/supplier/login`. All 6 notification endpoints are affected.
- **Fix**: Add `requireSupplierAuth` middleware to all notification route handlers (same pattern as products, orders, KYC routes)
- **Files**: `backend/src/routes/v1/supplier/notifications.ts:13,29,43,83,103,119`
- **Status**: DIAGNOSED

### STG-013: Supplier Portal — "Unable to send OTP" on login page (Firebase Phone Auth)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/login/`)
- **Page**: Login page
- **Symptom**: Entering phone number and clicking "Send OTP" shows red error: "Unable to send OTP. Please try again."
- **Root Cause**: Firebase `signInWithPhoneNumber` fails. Likely causes: (1) `staging.supermandi.tech` not added to Firebase Console → Authentication → Settings → Authorized Domains, (2) `NEXT_PUBLIC_FIREBASE_*` env vars not set in supplier-portal Cloud Run build, (3) reCAPTCHA verifier failing on staging domain. Error is the generic fallback at `firebase.ts:172`.
- **Fix**: (infra) Add `staging.supermandi.tech` to Firebase authorized domains. Verify `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` are set in the supplier-portal service env vars.
- **Files**: `supplier-portal/src/lib/firebase.ts:14-21,143-185` (code is correct, issue is config)
- **Status**: DIAGNOSED

### STG-014: Supplier Portal — BNPL Orders page "Failed to load BNPL orders" (wrong column names)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/bnpl-orders/`)
- **Page**: BNPL Orders
- **Symptom**: "Failed to load BNPL orders." with Retry button
- **Root Cause**: Backend `GET /api/v1/supplier/bnpl/backed-orders` query at line 39 references `st.store_name, st.store_code` but `platform.stores` table has columns `name` and `code` (not `store_name`/`store_code`). PostgreSQL throws "column does not exist" → caught by blanket `catch` → returns 500.
- **Fix**: Change query to use `st.name AS store_name, st.code AS store_code` in `bnplVisibility.ts:39`
- **Files**: `backend/src/routes/v1/supplier/bnplVisibility.ts:39`
- **Status**: DIAGNOSED

### STG-015: Supplier Portal — Help page loses sidebar navigation (renders outside dashboard)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/help/`)
- **Page**: Help & Support
- **Symptom**: Clicking "Help & Support" in sidebar loses ALL navigation (sidebar, header, dashboard context). Page shows generic content unrelated to supplier portal (Quick Links to retailer portal, POS app download). No dark mode support. "Made in India" appears twice (page body + footer). `/terms` and `/privacy` links navigate away to landing page with no way back.
- **Root Cause**: Dashboard sidebar links to `/help` but `help/page.tsx` is a top-level route outside the `(dashboard)` route group. It uses its own standalone `help/layout.tsx` (designed for pre-login access) instead of the dashboard layout. Content is generic landing-page material, not supplier-specific help.
- **Fix**: Create `(dashboard)/help/page.tsx` with supplier-specific content (FAQ, how-to guides for products/orders/KYC/BNPL). Dashboard sidebar will then render help within the dashboard layout. Keep top-level `help/` for pre-login access. Add dark mode support. Remove redundant "Made in India" (covered by STG-005).
- **Files**: `supplier-portal/src/app/help/page.tsx`, `supplier-portal/src/app/help/layout.tsx`, `supplier-portal/src/app/(dashboard)/layout.tsx:31` (nav item href)
- **Status**: DIAGNOSED

### STG-016: SuperAdmin — Refunds tab broken (wrong table schema + column name)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#refunds`)
- **Page**: Refunds
- **Symptom**: Refunds list will fail with 500 error — "Failed to fetch refunds"
- **Root Cause**: Two bugs in `admin/refunds.ts`: (1) Line 125: `LEFT JOIN stores.stores` should be `LEFT JOIN platform.stores` — `stores.stores` schema doesn't exist. (2) Line 120: `r.refund_amount_minor` column doesn't exist — migration 152 defines column as `refund_amount` (not `refund_amount_minor`). Also frontend status type uses `"processed"` (RefundsTab.tsx:14) but DB constraint uses `"completed"` (migration 152:174-176).
- **Fix**: (1) Change `stores.stores` to `platform.stores` at line 125. (2) Change `r.refund_amount_minor` to `r.refund_amount` at line 120. (3) Update frontend status style/filter from `processed` to `completed`.
- **Files**: `backend/src/routes/v1/admin/refunds.ts:120,125`, `supermandi-superadmin/src/tabs/RefundsTab.tsx:14,120`
- **Status**: DIAGNOSED

### STG-017: SuperAdmin — GST Compliance tab broken (wrong supplier schema + missing columns)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#gst-compliance`)
- **Page**: GST Compliance
- **Symptom**: Supplier breakdown will fail or return NULL values
- **Root Cause**: Two bugs: (1) Line 100: `LEFT JOIN platform.suppliers sp` should be `LEFT JOIN supplier.suppliers sp` — migration 003 creates `supplier.suppliers`, not `platform.suppliers`. (2) Lines 76,87,172,218: References `buyer_state` and `seller_state` columns that do NOT exist in any migration — `invoicing.invoices` has no state columns. State-wise breakdown and GSTR-1 export will fail.
- **Fix**: (1) Change `platform.suppliers` to `supplier.suppliers`. (2) Either add `buyer_state`/`seller_state` columns via migration, or remove state-wise breakdown from GST queries (return 'Unknown' for all).
- **Files**: `backend/src/routes/v1/admin/gstCompliance.ts:76,87,100,172,218`
- **Status**: DIAGNOSED

### STG-018: SuperAdmin — Support Queue tab broken (wrong API endpoint paths)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#support`)
- **Page**: Support Queue
- **Symptom**: "Failed to load" — all support operations return 404
- **Root Cause**: Frontend calls `/api/v1/admin/chat/*` (SupportQueueTab.tsx lines 82,93,108,120,134,147) but backend mounts chat routes at `/api/v1/chat/*` (index.ts:253). No `/admin/chat/` route exists anywhere — not in v1 router, not in API gateway. All 6 support endpoints (queue, templates, messages, send, assign, resolve) will 404.
- **Fix**: Change all `/api/v1/admin/chat/` prefixes to `/api/v1/chat/` in SupportQueueTab.tsx (6 occurrences).
- **Files**: `supermandi-superadmin/src/tabs/SupportQueueTab.tsx:82,93,108,120,134,147`
- **Status**: DIAGNOSED

### STG-019: SuperAdmin — AI Intelligence shows "AI not configured" (missing OPENAI_API_KEY)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#ai-intelligence`)
- **Page**: AI Intelligence + AI Copilot panel
- **Symptom**: Red "AI not configured" badge on AI Intelligence tab and AI Copilot sidebar panel. "Ask AI" button disabled.
- **Root Cause**: Backend AI health check (`/api/v1/admin/ai/health`) returns `{ configured: false }` because `OPENAI_API_KEY` env var is not set in the main-backend Cloud Run service.
- **Fix**: (infra) Add `OPENAI_API_KEY` secret to GCP Secret Manager and mount as env var on `main-backend` Cloud Run service. No code change needed.
- **Status**: DIAGNOSED

### STG-020: SuperAdmin — Monitoring tab hardcoded staging domain + stale service list
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#monitoring`)
- **Page**: Monitoring
- **Symptom**: Infrastructure section hardcodes `staging.supermandi.tech` (MonitoringTab.tsx:295). Alert policies and services list are hardcoded arrays (lines 83-105) — won't reflect actual GCP state changes. Port numbers shown (3000, 3010, etc.) are internal container ports, meaningless to operators.
- **Root Cause**: MonitoringTab.tsx has hardcoded data instead of fetching from backend dynamically. Code has TODO comment acknowledging this (lines 79-82).
- **Fix**: Replace hardcoded domain with `window.location.hostname`. For alert policies and services, either fetch from a backend endpoint or at minimum derive from env vars. Remove internal port display.
- **Files**: `supermandi-superadmin/src/tabs/MonitoringTab.tsx:79-105,295`
- **Status**: DIAGNOSED

### ~~STG-021~~: RESOLVED — Build stamps are correct
- All 4 services show `e56f0f4` (commit `e56f0f42` — 2 docs-only commits after deploy tag `e63dba14`). Services are aligned and running latest code.
- **Status**: WONTFIX

### STG-022: SuperAdmin — WhatsApp phone validation mismatch (frontend vs backend)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#whatsapp`)
- **Page**: WhatsApp → CTA Config
- **Symptom**: Frontend accepts phone with +91 prefix (regex `/^(\+?91)?\d{10}$/`) but backend rejects it (regex `/^\d{10,15}$/` — digits only, no + prefix). User enters valid-looking phone → save fails with confusing error.
- **Root Cause**: WhatsAppTab.tsx:131 frontend validation and backend whatsapp.ts:303 validation use incompatible regexes.
- **Fix**: Normalize phone in frontend before sending — strip `+` and `91` prefix: `superadminNumber.replace(/^\+?91/, '')`. Or update backend to accept and normalize +91 prefix.
- **Files**: `supermandi-superadmin/src/tabs/WhatsAppTab.tsx:131`, `backend/src/routes/v1/admin/whatsapp.ts:303`
- **Status**: DIAGNOSED

### STG-023:
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
| DIAGNOSED | 17 |
| FOUND | 0 |
| VERIFIED | 0 |
| WONTFIX | 1 |
| **Total** | **22** |

---

## Redeploy Checklist (run after all issues FIXED)

- [ ] `pnpm -r typecheck` — 0 errors
- [ ] `pnpm -r build` — all services build
- [ ] `git push origin main`
- [ ] CI 20/20 green
- [ ] Tag new deploy-ready SHA
- [ ] Trigger staging deploy
- [ ] Verify all FIXED issues are VERIFIED on staging
