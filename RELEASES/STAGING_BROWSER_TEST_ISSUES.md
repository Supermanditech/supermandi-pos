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
- **Symptom**: ALL GST queries will 500 — entire module is coded against wrong schema. Currently shows "No GST data for 2026-02" with zeros (error caught, empty state shown).
- **Root Cause**: The entire `gstCompliance.ts` was written against column names that don't match `invoicing.invoices` (migration 134). Every column is wrong: `store_id` (doesn't exist), `taxable_amount` (actual: `taxable_amount_minor`), `cgst_amount` (actual: `cgst_minor`), `sgst_amount` (actual: `sgst_minor`), `igst_amount` (actual: `igst_minor`), `cess_amount` (doesn't exist), `total_amount` (actual: `total_amount_minor`), `buyer_state` (doesn't exist), `seller_state` (doesn't exist). Also: `LEFT JOIN platform.suppliers` should be `supplier.suppliers` (line 100).
- **Fix**: Rewrite all SQL queries in `gstCompliance.ts` to use correct column names from migration 134. Use `seller_id` with `seller_type` filter instead of `store_id`. Use `_minor` suffix columns. Add `buyer_state`/`seller_state` columns via new migration OR remove state breakdown.
- **Files**: `backend/src/routes/v1/admin/gstCompliance.ts` (entire file — lines 54-108, 165-220, 271-310)
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

### STG-023: SuperAdmin — Enrollment code "Resend" fails — reads wrong phone column
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#stores`)
- **Page**: Stores → QR Enrollment → Resend button
- **Symptom**: Clicking "Resend" on an enrollment code returns "No phone number found for this store" even when the store has a contact phone set via the admin panel.
- **Root Cause**: `deviceEnrollments.ts:346` queries `s.phone` (old column from migration 001, usually NULL) instead of `s.contact_phone` (column from migration 038, populated by admin panel). Same issue with `s.email` vs `s.contact_email`. The admin panel saves contact info into `contact_phone`/`contact_email`, but the resend endpoint reads from the legacy `phone`/`email` columns.
- **Fix**: Change line 346 from `s.phone as store_phone, s.email as store_email` to `COALESCE(s.contact_phone, s.phone) as store_phone, COALESCE(s.contact_email, s.email) as store_email` — falls back to legacy columns if contact columns are empty.
- **Files**: `backend/src/routes/v1/admin/deviceEnrollments.ts:346`
- **Status**: DIAGNOSED

### STG-024: SuperAdmin — Quality tab crashes with "Something went wrong" then logs out
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#quality`)
- **Page**: Quality Dashboard
- **Symptom**: Clicking Quality tab shows error boundary "Something went wrong. An unexpected error occurred." with Try Again / Go Home buttons. After the crash, the user gets logged out.
- **Root Cause**: `QualityDashboardTab.tsx:314` renders `renderToolCard("Database Tests", "💾", overview.tools.databaseTests)` but the backend (`qualityDashboard.ts:103-112`) does NOT include `databaseTests` in the `tools` response. `overview.tools.databaseTests` is `undefined` → `renderToolCard` accesses `tool.status` on undefined → `TypeError: Cannot read properties of undefined (reading 'status')` → React error boundary catches it. The logout happens because subsequent health checks may hit 429 rate limit or the error boundary's "Go Home" clears the session.
- **Fix**: Either (a) add `databaseTests: { installed: true, suites: 5, status: 'configured' }` to backend response tools object, or (b) add null guard in frontend: `overview.tools.databaseTests && renderToolCard(...)`.
- **Files**: `supermandi-superadmin/src/tabs/QualityDashboardTab.tsx:314`, `backend/src/routes/v1/admin/qualityDashboard.ts:103-112`
- **Status**: DIAGNOSED

### STG-025: SuperAdmin — WhatsApp CTA Config shows "[object Object]" error
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#whatsapp`)
- **Page**: WhatsApp → Landing Page WhatsApp CTA Config
- **Symptom**: CTA Config section shows red text **"[object Object]"** with a "Retry" link. After retry, config loads correctly showing numbers and messages.
- **Root Cause**: `whatsapp.ts:40` — `parseErrorBody()` returns `body?.error` which can be an object (`{ code: "...", message: "..." }`) instead of a string. When passed to `new Error(obj)`, `err.message` becomes `"[object Object]"` which renders in the UI at `WhatsAppTab.tsx:307-308`.
- **Fix**: Change `parseErrorBody` to always return a string: `typeof body?.error === 'string' ? body.error : (body?.error?.message || body?.message || \`HTTP ${res.status}\`)`.
- **Files**: `supermandi-superadmin/src/api/whatsapp.ts:37-44`, `supermandi-superadmin/src/tabs/WhatsAppTab.tsx:307`
- **Status**: DIAGNOSED

### STG-026: SuperAdmin — AI alerts engine queries wrong table for overdue payments
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#ai-insights` → Jobs → Run Alert Analysis)
- **Page**: AI Intelligence → Jobs tab
- **Symptom**: "Run Alert Analysis" job will fail with 500 when processing overdue payment checks — no payment alerts generated.
- **Root Cause**: `alertsEngine.ts:142-153` queries `payments.sell_payments` with columns that don't exist: `customer_phone`, `due_date`, `amount`, `paid_amount`, status value `'due'`. The correct table is `payments.customer_dues` (migration 049) which has `customer_phone`, `due_date`, `amount_minor`, `paid_amount_minor`, status `'pending'`.
- **Fix**: Change query to use `payments.customer_dues` table with correct column names (`amount_minor`, `paid_amount_minor`) and status value (`'pending'` instead of `'due'`).
- **Files**: `backend/src/services/ai/alertsEngine.ts:142-153`
- **Status**: DIAGNOSED

### STG-027: SuperAdmin — Device ID filter crashes query (UUID ILIKE mismatch)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#devices`)
- **Page**: Devices → Device ID filter
- **Symptom**: Typing any text into the device ID filter crashes the device listing — 500 error "operator does not exist: uuid ~~* text"
- **Root Cause**: `devices.ts:45` uses `d.id ILIKE $N` but after migration 163, `pos_devices.id` was converted from TEXT to UUID. PostgreSQL does not support ILIKE on UUID columns.
- **Fix**: Cast to text: change `d.id ILIKE $N` to `d.id::text ILIKE $N` at line 45 (and same for the COUNT query using the same conditions).
- **Files**: `backend/src/routes/v1/admin/devices.ts:45`
- **Status**: DIAGNOSED

### STG-028: SuperAdmin — Staff "Stock-Ins" column always shows 0
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#staff`)
- **Page**: Staff → Staff table → Stock-Ins column
- **Symptom**: Every staff member shows "0" in the Stock-Ins column, regardless of how many stock-ins they performed.
- **Root Cause**: `staff.ts:31` subquery searches `inventory.inventory_ledger.notes LIKE '%' || s.id::text || '%'` — but the stock-in route (`pos/stockIn.ts:287`) never writes the staff UUID into the `notes` field. The `inventory_ledger` table has no `staff_id` column at all.
- **Fix**: Either (a) add `staff_id` column to `inventory.inventory_ledger` and populate from stock-in route, or (b) remove the Stock-Ins column from the staff table until data pipeline supports it.
- **Files**: `backend/src/routes/v1/admin/staff.ts:31`, `backend/src/routes/v1/pos/stockIn.ts:287`
- **Status**: DIAGNOSED

### STG-029: SuperAdmin — Invoice View/Download fails for supplier invoices (wrong column)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#invoices`)
- **Page**: Invoices → View or Download button
- **Symptom**: Clicking View or Download on any purchase/commission invoice returns 500 error — "column phone does not exist"
- **Root Cause**: `invoiceService.ts:507` queries `SELECT phone FROM supplier.suppliers` but the actual column name is `primary_phone` (migration 003 line 28). This crashes for any invoice where the seller is a supplier.
- **Fix**: Change `SELECT phone` to `SELECT primary_phone AS phone` at `invoiceService.ts:507`.
- **Files**: `backend/src/services/invoiceService.ts:507`
- **Status**: DIAGNOSED

### STG-030: SuperAdmin — Document preview returns 403 (admin can't review documents)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#documents`)
- **Page**: Documents → Click "Review" on any document
- **Symptom**: Document preview modal shows "Failed to load document (403)" — admin cannot see documents they're approving/rejecting.
- **Root Cause**: `fetchDocumentBlob` calls `GET /api/v1/documents/:id` (non-admin path). Gateway's `adminAuthMiddleware` skips non-`/admin/` paths, so no `x-admin-token` is injected. Backend authorization check fails: `isValidAdminRequest(req)` = false, `actorType === 'ADMIN'` = false. Returns 403.
- **Fix**: Either (a) route document blob fetch through `/api/v1/admin/documents/:id/blob`, or (b) make the gateway inject admin token for `/api/v1/documents/` paths too, or (c) add a dedicated admin document proxy endpoint.
- **Files**: `supermandi-superadmin/src/api/documents.ts:198-213`, `backend/src/routes/v1/documents.ts:388-400`, `backend/services/api-gateway/src/middleware/adminAuth.ts:100,148`
- **Status**: DIAGNOSED

### STG-031: SuperAdmin — Document approve/reject loses admin identity (verified_by = NULL)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#documents`)
- **Page**: Documents → Approve or Reject button
- **Symptom**: Document is approved/rejected successfully but `verified_by` column is always NULL — no audit trail of WHO approved it.
- **Root Cause**: `documents.ts:204,276` reads `(req as any).adminUserId || (req as any).userId` but middleware sets `req.adminId`. Neither `adminUserId` nor `userId` is populated → `undefined` → NULL.
- **Fix**: Change to `(req as any).adminId` at lines 204 and 276.
- **Files**: `backend/src/routes/v1/admin/documents.ts:204,276`
- **Status**: DIAGNOSED

### STG-032: SuperAdmin — Application detail always returns empty documents array
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#applications`)
- **Page**: Applications → View application detail
- **Symptom**: Application documents section shows empty even if documents were uploaded.
- **Root Cause**: `applications.ts:183-189` queries `auth.documents` table which doesn't exist (correct table is `platform.documents`), and uses column `file_url` which should be `file_path`. Silently caught and returns empty array.
- **Fix**: Change `auth.documents` to `platform.documents` and `file_url` to `file_path`.
- **Files**: `backend/src/routes/v1/admin/applications.ts:183-189`
- **Status**: DIAGNOSED

### STG-033: SuperAdmin — Supplier approve/auto-approve/publish ALL blocked ('verified' vs 'ACTIVE')
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#suppliers`)
- **Page**: Suppliers → Approve product, Toggle auto-approve, Batch approve, Publish
- **Symptom**: Every product approval returns "supplier_not_verified". Auto-approve toggle returns error. Publish fails.
- **Root Cause**: Migration 097 changed all `verification_status = 'verified'` to `'ACTIVE'`, but `suppliers.ts` still checks `!== 'verified'` at lines 514, 829, 1144, 1388. No supplier will ever have status `'verified'` post-migration.
- **Fix**: Replace all `'verified'` checks with `'ACTIVE'` in `suppliers.ts` at lines 134, 514, 829, 1144, 1388.
- **Files**: `backend/src/routes/v1/admin/suppliers.ts:134,514,829,1144,1388`
- **Status**: DIAGNOSED

### STG-034: SuperAdmin — Batch reject always fails (field name mismatch)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#suppliers`)
- **Page**: Suppliers → Select products → "Reject Selected"
- **Symptom**: Batch reject always returns "rejectionReason is required" even when reason is entered.
- **Root Cause**: Frontend sends `{ reason }` (`api/suppliers.ts:431`) but backend destructures `{ rejectionReason }` (`suppliers.ts:1050-1053`). `rejectionReason` is always `undefined`.
- **Fix**: Change frontend to send `rejectionReason` instead of `reason`, or change backend to read `reason`.
- **Files**: `supermandi-superadmin/src/api/suppliers.ts:431`, `backend/src/routes/v1/admin/suppliers.ts:1050-1053`
- **Status**: DIAGNOSED

### STG-035: SuperAdmin — Batch approve progress shows "undefined approved, undefined failed"
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#suppliers`)
- **Page**: Suppliers → Select products → "Approve Selected"
- **Symptom**: After batch approve completes, progress message shows "Done: undefined approved, undefined failed".
- **Root Cause**: Backend returns `{ success: true, data: { processed, failed, errors } }` (nested under `data`, no `succeeded` field). Frontend reads `result.succeeded` and `result.failed` at top level — both undefined.
- **Fix**: Either unwrap `data` in frontend response parsing, or flatten backend response. Add `succeeded: processed - failed` to response.
- **Files**: `supermandi-superadmin/src/api/suppliers.ts:406-411`, `supermandi-superadmin/src/tabs/SuppliersTab.tsx:192`, `backend/src/routes/v1/admin/suppliers.ts:1253-1260`
- **Status**: DIAGNOSED

### STG-036: SuperAdmin — Auto-approve toggle and Publish crash (approval_logs constraint violation)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#suppliers`)
- **Page**: Suppliers → Toggle auto-approve ON/OFF, or Publish product
- **Symptom**: Toggle crashes with PostgreSQL constraint violation. Publish crashes similarly.
- **Root Cause**: Backend inserts `entity_type = 'supplier_auto_approve'` and `action = 'enable_auto_approve'` into `supplier.approval_logs` (line 528-531), but CHECK constraint only allows `entity_type IN ('supplier','product','bank_change')` and `action IN ('approve','reject','suspend','reactivate','edit','submit')`. Also `product_publish`/`publish` at line 1660.
- **Fix**: Add `'supplier_auto_approve','product_publish'` to entity_type constraint and `'enable_auto_approve','disable_auto_approve','publish'` to action constraint via migration.
- **Files**: `backend/src/routes/v1/admin/suppliers.ts:528-531,1660`, migration `048_supplier_verification_schema.sql`
- **Status**: DIAGNOSED

### STG-037: SuperAdmin — Self-registered suppliers invisible in pending queue
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#suppliers`)
- **Page**: Suppliers → Pending tab
- **Symptom**: Self-registered suppliers (from auth.applications) don't appear in the pending list.
- **Root Cause**: Backend returns self-registered suppliers with status `'KYC_SUBMITTED'`/`'PAYMENTS_SUBMITTED'`, but frontend filters `s.status === "pending"` at `SuppliersTab.tsx:265,272`, which excludes them.
- **Fix**: Update frontend filter to include `'KYC_SUBMITTED'` and `'PAYMENTS_SUBMITTED'` statuses, or map them to `'pending'` in the API response.
- **Files**: `supermandi-superadmin/src/tabs/SuppliersTab.tsx:265,272`
- **Status**: DIAGNOSED

### STG-038: SuperAdmin — Verify/Reject self-registered supplier returns 404
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#suppliers`)
- **Page**: Suppliers → Verify or Reject a self-registered supplier
- **Symptom**: "Supplier request not found or already processed" — 404 error.
- **Root Cause**: Verify endpoint at `suppliers.ts:219-224` only queries `supplier.supplier_requests`, but self-registered suppliers come from `auth.applications`. No lookup exists for application-based suppliers.
- **Fix**: Add fallback to check `auth.applications` when `supplier_requests` returns no rows.
- **Files**: `backend/src/routes/v1/admin/suppliers.ts:219-224`
- **Status**: DIAGNOSED

### STG-039: SuperAdmin — Supplier status history always empty
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#suppliers`)
- **Page**: Suppliers → View supplier → Status History section
- **Symptom**: Status history section always shows empty/no data.
- **Root Cause**: Frontend reads `data.history` (`api/suppliers.ts:399`) but backend returns `{ status_history: [...] }` (`suppliers.ts:2099`). Key mismatch → always returns empty array.
- **Fix**: Change frontend to read `data.status_history` or change backend to return `{ history: [...] }`.
- **Files**: `supermandi-superadmin/src/api/suppliers.ts:399`, `backend/src/routes/v1/admin/suppliers.ts:2099`
- **Status**: DIAGNOSED

### STG-040: SuperAdmin — Pending products never show images (missing columns in query)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#suppliers`)
- **Page**: Suppliers → Pending Products list
- **Symptom**: Product cards always show placeholder icon, never actual product images.
- **Root Cause**: Backend pending products query (`suppliers.ts:724-748`) doesn't SELECT `sp.image_url` or `sp.thumbnail_url` columns (which exist per migration 138). Frontend renders `product.thumbnailUrl || product.imageUrl` — both always undefined.
- **Fix**: Add `sp.image_url as "imageUrl", sp.thumbnail_url as "thumbnailUrl"` to the SELECT at line 724.
- **Files**: `backend/src/routes/v1/admin/suppliers.ts:724-748`, `supermandi-superadmin/src/tabs/SuppliersTab.tsx:634-665`
- **Status**: DIAGNOSED

### STG-041: SuperAdmin — Create store/supplier user always fails 400 (missing actor_id)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#users`)
- **Page**: Users → Create User → Type: store or supplier
- **Symptom**: "actor_id_required_for_store_or_supplier" — 400 error on submit.
- **Root Cause**: Create User form has no `actor_id` field. Backend requires `actor_id` for store/supplier types at `users.ts:206-208`. Only platform-type users can be created.
- **Fix**: Add store/supplier selector (dropdown populated from store directory or supplier list) to the Create User form when type is store/supplier.
- **Files**: `supermandi-superadmin/src/tabs/UsersTab.tsx:59-64`, `backend/src/routes/v1/admin/users.ts:206-208`
- **Status**: DIAGNOSED

### STG-042: SuperAdmin — Analytics Dues tab shows wrong amounts (field name mismatch)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#analytics`)
- **Page**: Analytics → Dues Tracking
- **Symptom**: Due amounts show as ₹0.00 for every row. Customer name column shows "-".
- **Root Cause**: Backend returns `total_minor` but frontend reads `amount_minor` at `AnalyticsTab.tsx:586`. Backend doesn't SELECT `customer_name` despite column existing. Frontend `d.customer_name` always undefined.
- **Fix**: (a) Add `customer_name` to backend SQL SELECT at `analyticsService.ts:1265`. (b) Either rename backend field to `amount_minor` or change frontend to read `total_minor`.
- **Files**: `backend/src/services/analytics/analyticsService.ts:1263-1275,1304-1311`, `supermandi-superadmin/src/tabs/AnalyticsTab.tsx:584-586`
- **Status**: DIAGNOSED

### STG-043: SuperAdmin — Analytics Margin Analysis crashes 500 (non-existent table)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#analytics`)
- **Page**: Analytics → Margin Analysis
- **Symptom**: "Failed to load margin data" — 500 error on every load.
- **Root Cause**: `analytics.ts:323,352` joins `catalog.store_taxonomies` which doesn't exist in any migration. Correct table is `catalog.fmcg_taxonomy`.
- **Fix**: Change `catalog.store_taxonomies` to `catalog.fmcg_taxonomy` and verify column names match.
- **Files**: `backend/src/routes/v1/admin/analytics.ts:323,352`
- **Status**: DIAGNOSED

### STG-044: SuperAdmin — Analytics error messages show "[object Object]"
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#analytics`)
- **Page**: Analytics → Any failing endpoint
- **Symptom**: Error banner shows "[object Object]" instead of readable message.
- **Root Cause**: Backend returns `{ error: { code: "...", message: "..." } }` (object), but frontend `analytics.ts:28-31` does `String(data.error)` which yields "[object Object]". Should extract `.message` from the error object.
- **Fix**: Change to `typeof data.error === 'string' ? data.error : data.error?.message || 'Unknown error'`.
- **Files**: `supermandi-superadmin/src/api/analytics.ts:27-31`
- **Status**: DIAGNOSED

### STG-045: SuperAdmin — Settings double confirmation dialog when killing feature flag
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#settings`)
- **Page**: Settings → Feature Flags → Click "KILL" on enabled flag
- **Symptom**: User must click through TWO separate confirmation dialogs to kill one flag.
- **Root Cause**: SettingsTab.tsx:147 shows its own ConfirmDialog, then the handler `confirmedToggleGlobalFlag` (App.tsx:2634) shows a second one. Enable only shows one (correct).
- **Fix**: Remove the SettingsTab-level confirmation for disable/kill, keep only the App.tsx level one.
- **Files**: `supermandi-superadmin/src/tabs/SettingsTab.tsx:147`, `supermandi-superadmin/src/App.tsx:2634`
- **Status**: DIAGNOSED

### STG-046: SuperAdmin — Credit application approve/reject both crash (missing columns)
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#credit-providers`)
- **Page**: Finance → Credit Applications → Approve or Reject
- **Symptom**: Both approve and reject crash with PostgreSQL "column does not exist" error.
- **Root Cause**: `credit.ts:111-115` (approve) and `credit.ts:182-186` (reject) SET `updated_at = NOW()` but `payments.credit_applications` has no `updated_at` column (migration 049). Reject also writes to `rejection_reason` column which doesn't exist. Migration 055 adds `pan_number`, `aadhaar_last4`, `approved_amount_minor` but NOT these columns.
- **Fix**: Add migration with `ALTER TABLE payments.credit_applications ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW(), ADD COLUMN rejection_reason TEXT`.
- **Files**: `backend/src/routes/v1/admin/credit.ts:111-115,182-186`, migration `049_payments_schema.sql`
- **Status**: DIAGNOSED

### STG-047: SuperAdmin — Credit applications status constraint blocks entire workflow
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#credit-providers`)
- **Page**: Finance → Credit Applications list (empty) + POS credit flow
- **Symptom**: Credit application list always empty. POS credit `kyc_verified` update crashes with CHECK constraint violation.
- **Root Cause**: Backend filters by `status = 'kyc_verified'` (credit.ts:25) and checks for `'pending'` (line 102), but `chk_credit_app_status` constraint only allows `('submitted','processing','approved','disbursed','rejected')`. Neither `'kyc_verified'` nor `'pending'` are valid. POS route `credit.ts:544` tries `SET status = 'kyc_verified'` → constraint violation.
- **Fix**: Add migration to expand constraint: `ALTER TABLE payments.credit_applications DROP CONSTRAINT chk_credit_app_status, ADD CONSTRAINT chk_credit_app_status CHECK (status IN ('submitted','processing','approved','disbursed','rejected','kyc_verified','pending'))`.
- **Files**: `backend/src/routes/v1/admin/credit.ts:25,102`, `backend/src/routes/v1/pos/credit.ts:544`, migration `049_payments_schema.sql:256`
- **Status**: DIAGNOSED

### STG-048: SuperAdmin — Manual audit log entries silently lost (no POST endpoint)
- **Portal**: SuperAdmin (all tabs that log admin actions)
- **Page**: Cross-cutting — affects user status changes, document approvals, device updates
- **Symptom**: Frontend `logAdminAction()` calls fire but are silently dropped — no error shown, no audit records created.
- **Root Cause**: Frontend calls `POST /api/v1/admin/audit` (`api/audit.ts:107-108`) but backend `admin/audit.ts` only has GET handlers (line 52: GET `/audit`, line 154: GET `/audit/stats`). No POST handler exists. Error is caught and suppressed at `audit.ts:120-123`.
- **Fix**: Add POST handler to `backend/src/routes/v1/admin/audit.ts` that accepts `{ action, resourceType, resourceId, details }` and inserts into `admin.audit_log`.
- **Files**: `supermandi-superadmin/src/api/audit.ts:107-108`, `backend/src/routes/v1/admin/audit.ts`
- **Status**: DIAGNOSED

### STG-049: SuperAdmin — Enrollment expiry shows time only, no date
- **Portal**: SuperAdmin (`staging.supermandi.tech/admin/#registrations`)
- **Page**: Registrations → Send Enrollment → Success modal
- **Symptom**: Enrollment expiry shows "3:00:00 PM" with no date — misleading when codes expire 24h+ later.
- **Root Cause**: `ConfirmDialog.tsx:84` uses `toLocaleTimeString()` instead of `toLocaleString()`.
- **Fix**: Change `toLocaleTimeString()` to `toLocaleString()`.
- **Files**: `supermandi-superadmin/src/components/ConfirmDialog.tsx:84`
- **Status**: DIAGNOSED

### STG-050: SuperAdmin — AI Copilot "Explain last hour" queries last 30 days instead
- **Portal**: SuperAdmin (AI Copilot sidebar panel)
- **Page**: SM AI Assistant → Click "Explain last hour" → Ask AI
- **Symptom**: AI response covers 30 days of data instead of the last hour, giving misleading analysis.
- **Root Cause**: `askSuperMandiAI.ts:49-65` `extractRange()` only recognizes `"today"` and `/last\s+(\d+)\s+days/`. "Last hour" matches neither → falls through to 30-day default.
- **Fix**: Add hour matching: `if (lower.includes("last hour")) { return { from: oneHourAgo, to: now } }` and `/last\s+(\d+)\s+hours?/` pattern.
- **Files**: `backend/src/services/ai/askSuperMandiAI.ts:49-65`
- **Status**: DIAGNOSED

### STG-051: SuperAdmin — AI Copilot quick actions don't auto-submit (require 2 clicks)
- **Portal**: SuperAdmin (AI Copilot sidebar panel)
- **Page**: SM AI Assistant → Click any quick action button
- **Symptom**: Clicking "Explain last hour" / "Payment issues?" / "Summarize today" only fills the text field — user must click "Ask AI" separately. Defeats the purpose of "quick" actions.
- **Root Cause**: `AiPanel.tsx:59-67` buttons only call `setAiQuestion(text)` without triggering `askAi()`.
- **Fix**: Have quick action buttons call `askAi(text)` directly in addition to setting the question text.
- **Files**: `supermandi-superadmin/src/components/AiPanel.tsx:59-67`
- **Status**: DIAGNOSED

### STG-052: SuperAdmin — AI Copilot response shows raw markdown instead of formatted text
- **Portal**: SuperAdmin (AI Copilot sidebar panel)
- **Page**: SM AI Assistant → Ask any question → View response
- **Symptom**: AI response shows literal `## Summary`, `**bold**`, `- bullet` markdown symbols instead of formatted headings, bold text, and lists.
- **Root Cause**: `AiPanel.tsx:110` renders `{aiAnswer}` as plain text in a `<div>`. OpenAI GPT returns markdown-formatted responses.
- **Fix**: Use `react-markdown` or `dangerouslySetInnerHTML` with a markdown-to-HTML converter to render formatted output.
- **Files**: `supermandi-superadmin/src/components/AiPanel.tsx:110`
- **Status**: DIAGNOSED

### STG-053: Retailer — Login token lacks actorId, gateway rejects ALL authenticated requests
- **Portal**: Retailer (`staging.supermandi.tech/retailer/`)
- **Page**: Post-login — every authenticated page
- **Symptom**: User can log in and select a store, but every subsequent API call returns 401 — nothing loads (products, inventory, orders all fail).
- **Root Cause**: OTP login (`auth.ts:555-561`) and password login (`auth.ts:887-892`) generate JWT access tokens without `actorId` field. Gateway `jwtAuth.ts:244` rejects tokens missing `actorId`. No `/auth/select-store` endpoint exists to issue a store-specific JWT after store selection.
- **Fix**: Add `actorId: store.id` to JWT payload when store is known (single-store users), or add a `/auth/select-store` endpoint that issues a new JWT with `actorId` after store selection.
- **Files**: `backend/src/routes/v1/retailer-admin/auth.ts:555-561,887-892`, `backend/services/api-gateway/src/middleware/jwtAuth.ts:244`
- **Status**: DIAGNOSED

### STG-054: Retailer — Token refresh fails after 24h (missing storeId in refresh token)
- **Portal**: Retailer
- **Page**: Any page after 24h session
- **Symptom**: User gets silently logged out after access token expires (24h). Refresh fails, triggers logout.
- **Root Cause**: OTP login (`auth.ts:570-574`) and password login (`auth.ts:900-904`) generate refresh tokens without `storeId`. Refresh endpoint (`auth.ts:1324-1329`) queries `WHERE u.id = $1 AND su.store_id = $2` with `decoded.storeId` = undefined → returns no rows → 401.
- **Fix**: Include `storeId` in refresh token payload when store is selected, or modify refresh endpoint to handle missing `storeId` by looking up user's active store.
- **Files**: `backend/src/routes/v1/retailer-admin/auth.ts:570-574,900-904,1324-1329`
- **Status**: DIAGNOSED

### STG-055: Retailer — Email password reset never sends the email
- **Portal**: Retailer (`staging.supermandi.tech/retailer/forgot-password`)
- **Page**: Forgot Password → Email reset flow
- **Symptom**: User clicks "Send Reset Link", sees "Check Your Email", but no email arrives. Password reset via email is completely non-functional.
- **Root Cause**: `auth.ts:1152-1166` generates JWT reset token but never calls `sendPasswordResetEmail()`. Token is only returned as `devToken` in non-production environments. The `emailService.sendPasswordResetEmail()` function exists but is never imported or called.
- **Fix**: Import `sendPasswordResetEmail` from emailService and call it with the generated token and user email before sending the response.
- **Files**: `backend/src/routes/v1/retailer-admin/auth.ts:1152-1166`, `backend/src/services/emailService.ts:456`
- **Status**: DIAGNOSED

### STG-056: Retailer — Registration /clear endpoint wrong phone normalization, never matches
- **Portal**: Retailer (`staging.supermandi.tech/retailer/login`)
- **Page**: Login → "Change Phone Number" button
- **Symptom**: DRAFT applications are never cleared, potentially blocking re-registration with same GSTIN.
- **Root Cause**: `registration.ts:989` normalizes phone with `.trim().replace(/\s+/g, '')` (only strips whitespace) instead of using `normalizePhoneNumber()` which adds `+91` prefix. DB stores E.164 format (`+919876543210`), query never matches.
- **Fix**: Use `normalizePhoneNumber()` at line 989 instead of the manual trim/replace.
- **Files**: `backend/src/routes/v1/retailer-admin/registration.ts:989-994`
- **Status**: DIAGNOSED

### STG-057: Retailer — Registration resume flow broken (application_id never returned)
- **Portal**: Retailer (`staging.supermandi.tech/retailer/register`)
- **Page**: Register → Resume from incomplete registration
- **Symptom**: Users with incomplete registrations redirected from login always start fresh instead of resuming.
- **Root Cause**: `RegisterPage.tsx:323-326` reads `lookup.application_id` from lookup API response, but backend (`registration.ts:237-242`) never includes `application_id` in response (per DR-009: no internal IDs for unauthenticated callers).
- **Fix**: Either return `application_id` in the lookup response (after verifying caller is authenticated via OTP), or redesign resume flow to work without application_id.
- **Files**: `retailer-admin/src/pages/RegisterPage.tsx:323-326`, `backend/src/routes/v1/retailer-admin/registration.ts:237-242`
- **Status**: DIAGNOSED

### STG-058: Retailer — Dashboard sales may exclude split payments (SPLIT status not in constraint)
- **Portal**: Retailer (`staging.supermandi.tech/retailer/`)
- **Page**: Dashboard → Daily Summary cards
- **Symptom**: Sales with split payments may be excluded from daily totals, or split payment inserts may crash.
- **Root Cause**: `inventory.ts:132,148,164,269,270,301` filters `status IN ('completed','PAID_CASH','PAID_UPI','DUE','SPLIT')` but DB constraint `chk_sale_status` (migration 078) does NOT include `'SPLIT'`. Either split payment inserts crash (if POS sets status='SPLIT') or the SPLIT filter is dead code.
- **Fix**: Add `'SPLIT'` to the CHECK constraint via migration, or verify POS never sets `status='SPLIT'` and remove from queries.
- **Files**: `backend/src/routes/v1/retailer-admin/inventory.ts:132,148,164`, migration `078_go_live_batch5_inventory_ledger.sql:190-197`
- **Status**: DIAGNOSED

### STG-059: Retailer — Inventory date filter excludes same-day entries for IST users
- **Portal**: Retailer
- **Page**: Inventory → Date range filter
- **Symptom**: Filtering by today's date shows incomplete results — entries after 5:30 AM IST are excluded.
- **Root Cause**: `inventory.ts:625-628` converts `endDate = '2026-02-28'` to `new Date('2026-02-28').toISOString()` = `'2026-02-28T00:00:00.000Z'` (midnight UTC = 5:30 AM IST). Everything after 5:30 AM IST on the selected date is excluded.
- **Fix**: Interpret endDate as end-of-day: append `T23:59:59.999Z` or use `< next_day` instead of `<=`.
- **Files**: `backend/src/routes/v1/retailer-admin/inventory.ts:625-628`
- **Status**: DIAGNOSED

### STG-060: Retailer — Inventory INWARD filter misses sale_return and opening_stock types
- **Portal**: Retailer
- **Page**: Inventory → Click "INWARD" filter
- **Symptom**: Clicking INWARD filter shows fewer entries than the green "INWARD" badges visible in "All" view.
- **Root Cause**: Frontend INWARD filter only sends `transactionType=purchase_received` (`InventoryPage.tsx:95-96`) but `getDisplayType()` classifies `sale_return` and `opening_stock` as INWARD too (lines 50-62). Backend only accepts single `transactionType` parameter.
- **Fix**: Send all INWARD types: `purchase_received,sale_return,opening_stock`, and update backend to accept comma-separated values with `IN (...)`.
- **Files**: `retailer-admin/src/pages/InventoryPage.tsx:95-96`, `backend/src/routes/v1/retailer-admin/inventory.ts:606-609`
- **Status**: DIAGNOSED

### STG-061: Retailer — Dashboard purchase/sell totals only reflect first 50 products
- **Portal**: Retailer
- **Page**: Dashboard → Inventory overview cards
- **Symptom**: Total Purchase Value and Total Sell Revenue show lower numbers for stores with >50 products.
- **Root Cause**: `inventory.ts:530-531` sums `totalPurchaseValue` and `totalSellRevenue` from paginated `data` array (default limit 50), not from a store-wide aggregate query. `totalProducts` and `totalStockQty` are correctly computed from separate COUNT/SUM.
- **Fix**: Add `SUM(...)` aggregations to the separate count query (lines 469-478) for purchase value and sell revenue across all products.
- **Files**: `backend/src/routes/v1/retailer-admin/inventory.ts:530-531,469-478`
- **Status**: DIAGNOSED

### STG-062: Retailer — Supplier Catalog shows deactivated products (missing is_active filter)
- **Portal**: Retailer
- **Page**: Supplier Catalog → Browse products
- **Symptom**: Deactivated supplier products appear in catalog and can be added to store.
- **Root Cause**: `suppliers.ts:774` WHERE clause filters on `approval_status = 'approved'` and `s.status = 'active'` but does NOT filter `sp.is_active = true`. `catalog.supplier_products.is_active` column exists per migration 004.
- **Fix**: Add `AND sp.is_active = true` to WHERE clause at line 774 and the count query at lines 804-809.
- **Files**: `backend/src/routes/v1/retailer-admin/suppliers.ts:774,804-809`
- **Status**: DIAGNOSED

### STG-063: Retailer — Credit Dashboard crashes 500 (queries non-existent platform.suppliers)
- **Portal**: Retailer (`staging.supermandi.tech/retailer/`)
- **Page**: Credit & Finance Dashboard
- **Symptom**: "Failed to load credit data" — 500 error on page load.
- **Root Cause**: `creditDashboard.ts:36,53,71` all JOIN `platform.suppliers` which doesn't exist. Correct table is `supplier.suppliers`.
- **Fix**: Change `platform.suppliers` to `supplier.suppliers` on lines 36, 53, and 71.
- **Files**: `backend/src/routes/v1/retailer-admin/creditDashboard.ts:36,53,71`
- **Status**: DIAGNOSED

### STG-064: Retailer — Purchase Orders list/detail crash (wrong supplier phone column)
- **Portal**: Retailer
- **Page**: Purchase Orders → List and Detail views
- **Symptom**: "Failed to load purchase orders" — 500 error. Detail modal also fails.
- **Root Cause**: `purchaseOrders.ts:62,115` queries `s.phone as "supplierPhone"` but `supplier.suppliers` column is `primary_phone` (migration 003).
- **Fix**: Change `s.phone` to `s.primary_phone` on lines 62 and 115.
- **Files**: `backend/src/routes/v1/retailer-admin/purchaseOrders.ts:62,115`
- **Status**: DIAGNOSED

### STG-065: Retailer — Reconciliation refund amounts always ₹0 (wrong column + status)
- **Portal**: Retailer
- **Page**: Reconciliation → Refund summary
- **Symptom**: Refund amounts always show ₹0.00 even when refunds exist.
- **Root Cause**: Two bugs: (1) `reconciliation.ts:110` queries `rr.amount_minor` but correct column is `refund_amount` (migration 152). (2) `reconciliation.ts:113` filters `status IN ('approved','completed')` but 'approved' is not a valid status — constraint allows `('initiated','processing','completed','failed','cancelled')`.
- **Fix**: Change `rr.amount_minor` to `rr.refund_amount` and change `'approved'` to `'processing'` or remove it.
- **Files**: `backend/src/routes/v1/retailer-admin/reconciliation.ts:110,113`
- **Status**: DIAGNOSED

### STG-066: Retailer — Customer search crashes backend (SQL parameter mismatch)
- **Portal**: Retailer
- **Page**: Customers → Search by name/phone
- **Symptom**: Typing in the search box crashes with 500 — "bind message supplies 2 parameters, but prepared statement requires 4".
- **Root Cause**: `customers.ts:59-64` count query reuses `searchClause` containing `$4` but only passes 2 params `[storeId, '%search%']`. Data query correctly uses 4 params `[storeId, limit, offset, '%search%']`.
- **Fix**: Build a separate count searchClause using `$2` instead of `$4`.
- **Files**: `backend/src/routes/v1/retailer-admin/customers.ts:59-64`
- **Status**: DIAGNOSED

### STG-067: Retailer — Notifications always return 401 (missing store context middleware)
- **Portal**: Retailer
- **Page**: Notifications → All endpoints
- **Symptom**: "Failed to load notifications" — every notification endpoint returns 401 even for authenticated users.
- **Root Cause**: `notifications.ts:57-59` checks `(req as any).storeId` and `(req as any).userId` but `requireStoreContext` middleware is NOT applied to the notifications router. The global retailer-admin middleware chain sets `req.headers['x-actor-id']` and `req.headers['x-user-id']` but NOT `req.storeId`/`req.userId`.
- **Fix**: Either add `requireStoreContext` middleware to the notifications router, or change checks to read from `req.headers['x-actor-id']` and `req.headers['x-user-id']`.
- **Files**: `backend/src/routes/v1/retailer-admin/notifications.ts:57-59` (and lines 22, 112, 136, 157)
- **Status**: DIAGNOSED

### STG-068: Retailer — Chat support conversations invisible (missing store_id)
- **Portal**: Retailer
- **Page**: Messages → Create support conversation
- **Symptom**: After creating a support conversation, it disappears from the conversation list.
- **Root Cause**: `ChatPage.tsx:123-127` creates conversation with `{ displayName: 'Store Owner' }` but doesn't send `storeId`. Backend inserts `store_id = null`. List query filters `c.store_id = $4` (from x-actor-id header), excluding conversations with null store_id.
- **Fix**: Include `storeId` from auth context in the POST body, or have backend fall back to `req.headers['x-actor-id']`.
- **Files**: `retailer-admin/src/pages/ChatPage.tsx:123-127`, `backend/src/routes/v1/chat.ts:130-137`
- **Status**: DIAGNOSED

### STG-069: Retailer — Device reactivation permanently broken (token_revoked_at never cleared)
- **Portal**: Retailer
- **Page**: Devices → Deactivate then Reactivate a device
- **Symptom**: After deactivating and reactivating a device, it permanently shows "REVOKED". Reactivate button becomes a no-op.
- **Root Cause**: `devices.ts:310-311` sets `token_revoked_at = NOW()` on deactivate but line 313-314 explicitly does NOT clear it on reactivate. Response computes `isActive: device.active && !device.revokedAt` — always false once revokedAt is set.
- **Fix**: When `active = true`, also clear `token_revoked_at = NULL` in the SQL updates.
- **Files**: `backend/src/routes/v1/retailer-admin/devices.ts:304-315,247,362`
- **Status**: DIAGNOSED

### STG-070: Retailer — Settings save error shows "[object Object]"
- **Portal**: Retailer
- **Page**: Settings → Save Settings (validation error)
- **Symptom**: Error banner shows "[object Object]" instead of the actual validation error message.
- **Root Cause**: `SettingsPage.tsx:226` does `setSaveError(data.error || 'Failed to save settings')` but `data.error` is an object `{ code, message, errors }`, not a string. React renders it as "[object Object]".
- **Fix**: Change to `setSaveError(data.error?.message || 'Failed to save settings')`.
- **Files**: `retailer-admin/src/pages/SettingsPage.tsx:226`
- **Status**: DIAGNOSED

### STG-071: Retailer — Password change succeeds but silently invalidates session
- **Portal**: Retailer
- **Page**: Settings → Change Password
- **Symptom**: After successful password change, user sees "Password changed successfully!" but gets unexpectedly logged out on the next navigation.
- **Root Cause**: `auth.ts:1543-1545` revokes all tokens after password change (`SET tokens_revoked_at = NOW()`). Frontend shows custom success message but does NOT log user out or redirect. Next API call hits 401 → silent logout.
- **Fix**: After successful password change, explicitly call `logout()` and redirect to login with a "Password changed, please log in again" message.
- **Files**: `retailer-admin/src/pages/SettingsPage.tsx:266-271`, `backend/src/routes/v1/retailer-admin/auth.ts:1536-1546`
- **Status**: DIAGNOSED

### STG-072: Supplier — Registration document upload sends wrong field names (all uploads 400)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/onboard`)
- **Page**: Registration → Step 4: KYC Document Upload
- **Symptom**: Every document upload fails with 400 — "entity_type, entity_id, and document_type are required".
- **Root Cause**: `api.ts:1364-1368` sends camelCase field names (`documentType`, `entityType`, `entityId`) but backend `documents.ts:161` destructures snake_case (`document_type`, `entity_type`, `entity_id`). Also `entityType: 'supplier_application'` is not a valid value — should be `'application'`.
- **Fix**: Change to `form.append('document_type', ...)`, `form.append('entity_type', 'application')`, `form.append('entity_id', ...)`.
- **Files**: `supplier-portal/src/lib/api.ts:1364-1368`, `backend/src/routes/v1/documents.ts:161,174`
- **Status**: DIAGNOSED

### STG-073: Supplier — Registration document type keys wrong (PAN vs pan_card)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/onboard`)
- **Page**: Registration → Step 4: KYC Document Upload
- **Symptom**: Even after fixing STG-072, document types will be rejected — "INVALID_DOC_TYPE".
- **Root Cause**: `onboard/page.tsx:325-331` sends types `'PAN'`, `'GSTIN_CERTIFICATE'`, `'ADDRESS_PROOF'` (uppercase) but backend only accepts lowercase: `'pan_card'`, `'gstin_certificate'`, `'address_proof'`.
- **Fix**: Change to `'pan_card'`, `'gstin_certificate'`, `'address_proof'`.
- **Files**: `supplier-portal/src/app/(auth)/onboard/page.tsx:325-331`, `backend/src/routes/v1/documents.ts:82-96`
- **Status**: DIAGNOSED

### STG-074: Supplier — Register page missing required documents (submit-kyc fails)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/register`)
- **Page**: Registration → Documents step → Submit Application
- **Symptom**: Submit always fails — "MISSING_DOCUMENTS" for address_proof and cancelled_cheque.
- **Root Cause**: Register page (`register/page.tsx:36-41`) only has upload fields for gstin_certificate, pan_card, business_license, owner_photo. Missing `address_proof` (required) and `cancelled_cheque` (required per migration 103).
- **Fix**: Add address_proof and cancelled_cheque upload fields to the register page document step.
- **Files**: `supplier-portal/src/app/register/page.tsx:36-41`, migration `103_reg_auth_document_storage.sql:108-116`
- **Status**: DIAGNOSED

### STG-075: Supplier — Suspended suppliers bypass OTP login check (case mismatch)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/login`)
- **Page**: Login → OTP flow → Verify & Sign In
- **Symptom**: Suspended suppliers can successfully log in via OTP (should be blocked).
- **Root Cause**: `auth.ts:1826` checks `verification_status === 'suspended'` (lowercase) but migration 097 standardized to `'SUSPENDED'` (uppercase). Check never matches. Password login at line 611 correctly uses `'SUSPENDED'`.
- **Fix**: Change `'suspended'` to `'SUSPENDED'` at line 1826.
- **Files**: `backend/src/routes/v1/supplier/auth.ts:1826`
- **Status**: DIAGNOSED

### STG-076: Supplier — Password login never returns PASSWORD_NOT_SET for OTP-only accounts
- **Portal**: Supplier (`staging.supermandi.tech/supplier/login`)
- **Page**: Login → Password mode → Sign In
- **Symptom**: OTP-only suppliers see generic "Invalid email or password" instead of helpful "switch to OTP" guidance.
- **Root Cause**: `auth.ts:582-587` returns `INVALID_CREDENTIALS` when `!supplier.password_hash`, but frontend (`login/page.tsx:272-273`) has a handler for `PASSWORD_NOT_SET` that never fires.
- **Fix**: Return `PASSWORD_NOT_SET` error code when supplier exists but `password_hash` is null.
- **Files**: `backend/src/routes/v1/supplier/auth.ts:582-587`, `supplier-portal/src/app/(auth)/login/page.tsx:272-273`
- **Status**: DIAGNOSED

### STG-077: Supplier — Password reset email says "24 hours" but token expires in 1 hour
- **Portal**: Supplier (`staging.supermandi.tech/supplier/forgot-password`)
- **Page**: Forgot Password → Email channel
- **Symptom**: User waits 2+ hours, clicks reset link, gets "expired token" despite email saying 24h.
- **Root Cause**: Email template (`emailService.ts:503`) says "expires in 24 hours" but `auth.ts:873` sets `resetExpiry = Date.now() + 60*60*1000` (1 hour).
- **Fix**: Either change email text to "1 hour" or extend token expiry to 24 hours.
- **Files**: `backend/src/services/emailService.ts:503`, `backend/src/routes/v1/supplier/auth.ts:873`
- **Status**: DIAGNOSED

### STG-078: Supplier — Order status/shipment updates crash (non-existent orders.outbox table)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/orders`)
- **Page**: Orders → Detail modal → Update status, Add shipment, Confirm delivery
- **Symptom**: Updating order status shows error even though data is partially saved (inconsistent state).
- **Root Cause**: `orders.ts:37` writes to `orders.outbox` but table doesn't exist — correct table is `orders.event_outbox` (migration 006). Error propagates because outbox INSERT is not in try/catch. Status UPDATE succeeds but response returns 500.
- **Fix**: Change `orders.outbox` to `orders.event_outbox` at line 37.
- **Files**: `backend/src/routes/v1/supplier/orders.ts:37`
- **Status**: DIAGNOSED

### STG-079: Supplier — "Partial_received" status button shown but always rejected by backend
- **Portal**: Supplier (`staging.supermandi.tech/supplier/orders`)
- **Page**: Orders → Detail modal → Status dropdown on shipped orders
- **Symptom**: Clicking "Partial_received" fails — "Status must be one of: submitted, confirmed, shipped, delivered, cancelled".
- **Root Cause**: Frontend `orders/page.tsx:38-48` offers `partial_received` as valid transition from `shipped`, but backend `orders.ts:507` only accepts `['submitted','confirmed','shipped','delivered','cancelled']`.
- **Fix**: Either add `'partial_received'` to backend validStatuses or remove from frontend statusFlow.
- **Files**: `supplier-portal/src/app/(dashboard)/orders/page.tsx:38-48`, `backend/src/routes/v1/supplier/orders.ts:507`
- **Status**: DIAGNOSED

### STG-080: Supplier — Product image upload succeeds but URL never saved to database
- **Portal**: Supplier (`staging.supermandi.tech/supplier/products`)
- **Page**: Products → Add/Edit product with image
- **Symptom**: Image uploads successfully, preview shows, but after save + refresh the image is gone.
- **Root Cause**: Frontend sends `imageUrl` in product data (`products/page.tsx:352-367`), but backend CREATE (`products.ts:288-299`) and UPDATE (`products.ts:433-444`) do NOT destructure or INSERT/UPDATE `image_url`. Column exists per migration 138.
- **Fix**: Add `imageUrl` to backend destructure and include `image_url` in INSERT/UPDATE queries.
- **Files**: `supplier-portal/src/app/(dashboard)/products/page.tsx:352-367`, `backend/src/routes/v1/supplier/products.ts:288-299,433-444`
- **Status**: DIAGNOSED

### STG-081: Supplier — Product description field silently dropped (no DB column)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/products`)
- **Page**: Products → Add/Edit product → Description textarea
- **Symptom**: User types description, saves, it disappears on reload.
- **Root Cause**: Frontend has description textarea, backend destructures `description` but never uses it in INSERT or UPDATE. `catalog.supplier_products` table (migration 004) has no `description` column.
- **Fix**: Either add `description TEXT` column via migration and include in queries, or remove the description field from the frontend form.
- **Files**: `supplier-portal/src/app/(dashboard)/products/page.tsx:591-601`, `backend/src/routes/v1/supplier/products.ts:290,350-391`
- **Status**: DIAGNOSED

### STG-082: Supplier — Products search/filter only works within current page
- **Portal**: Supplier (`staging.supermandi.tech/supplier/products`)
- **Page**: Products → Search bar + Status filter
- **Symptom**: Searching for "Rice" only finds products on the current page. Products matching on other pages are invisible.
- **Root Cause**: Frontend fetches paginated data without search/status params (`products/page.tsx:101-102`), then applies client-side filter (`lines 398-408`). Pagination shows total from unfiltered backend response.
- **Fix**: Pass search and status filter as query params to backend API and filter server-side.
- **Files**: `supplier-portal/src/app/(dashboard)/products/page.tsx:101-102,398-408`
- **Status**: DIAGNOSED

### STG-083: Supplier — Payout history always shows empty (apiFetch double-unwrap)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/earnings`)
- **Page**: Earnings → Payout History table
- **Symptom**: Table always shows "No payouts yet" even when payouts exist.
- **Root Cause**: `apiFetch` (`api.ts:271`) does `data.data ?? data` which unwraps the envelope. Backend returns `{ data: [...payouts], pagination: {...} }`. After unwrap, frontend gets the array directly. `payoutsData?.data` on the array is `undefined` → always empty.
- **Fix**: Change `getPayouts` to not double-unwrap, or access the response correctly.
- **Files**: `supplier-portal/src/lib/api.ts:271,975-981`, `supplier-portal/src/app/(dashboard)/earnings/page.tsx:63-64`
- **Status**: DIAGNOSED

### STG-084: Supplier — Invoice list always shows empty (apiFetch double-unwrap)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/invoices`)
- **Page**: Invoices list
- **Symptom**: Table always shows "No invoices yet" even when invoices exist.
- **Root Cause**: Same `apiFetch` double-unwrap as STG-083. `getSupplierInvoices` (`api.ts:1214-1221`) types return as `{ data: SupplierInvoice[], total }` but `apiFetch` already unwraps, so `invoicesData?.data` is `undefined`.
- **Fix**: Remove the extra `.data` access in the consuming code or fix the `apiFetch` unwrap logic.
- **Files**: `supplier-portal/src/lib/api.ts:1214-1221`, `supplier-portal/src/app/(dashboard)/invoices/page.tsx:35-37`
- **Status**: DIAGNOSED

### STG-085: Supplier — Invoice detail modal always blank (double-unwrap)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/invoices`)
- **Page**: Invoices → Click "View" on any invoice
- **Symptom**: Detail modal opens but shows nothing — content guard prevents rendering.
- **Root Cause**: `getSupplierInvoiceDetail` (`api.ts:1223-1226`) does `return result.data` after `apiFetch` already unwrapped. `result` IS the invoice object, `.data` is undefined.
- **Fix**: Change to `return apiFetch<SupplierInvoiceDetail>(...)` without the extra `.data` access.
- **Files**: `supplier-portal/src/lib/api.ts:1223-1226`, `supplier-portal/src/app/(dashboard)/invoices/page.tsx:211`
- **Status**: DIAGNOSED

### STG-086: Supplier — Revenue and Available Balance always show ₹0 (wrong SQL tables)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/earnings`)
- **Page**: Earnings → Summary cards (Total Revenue, Available Balance)
- **Symptom**: Revenue and balance always ₹0.00 despite having delivered orders.
- **Root Cause**: `payouts.ts:134-141` queries non-existent tables: `orders.orders` (should be `orders.purchase_orders`), `orders.order_items` (should be `orders.purchase_order_items`), `supplier.supplier_products` (should be `catalog.supplier_products`). Error silently caught, returns 0.
- **Fix**: Change to correct table names and column references.
- **Files**: `backend/src/routes/v1/supplier/payouts.ts:134-141`
- **Status**: DIAGNOSED

### STG-087: Supplier — KYC "Profile Verified" requirement always shows incomplete
- **Portal**: Supplier (`staging.supermandi.tech/supplier/kyc`)
- **Page**: KYC → Payout Readiness card → Requirements checklist
- **Symptom**: "Profile Verified" checkbox always shows incomplete (circle) even for active suppliers.
- **Root Cause**: `kyc.ts:444` checks `verification_status === 'verified'` but migration 097 changed to `'ACTIVE'`. Value `'verified'` can never exist. Same pattern as STG-033.
- **Fix**: Change to `verification_status === 'ACTIVE'`.
- **Files**: `backend/src/routes/v1/supplier/kyc.ts:444`
- **Status**: DIAGNOSED

### STG-088: Supplier — Profile bankName silently dropped on save
- **Portal**: Supplier (`staging.supermandi.tech/supplier/profile`)
- **Page**: Profile → Bank Details tab → Save Bank Details
- **Symptom**: User fills "Bank Name", saves successfully, but value is empty on reload.
- **Root Cause**: Frontend sends `bankName` in PATCH body, but `profile.ts:204-225` only handles `accountNumber`, `ifscCode`, `accountName` — ignores `bankName`. GET also doesn't SELECT `bank_name`. DB column exists (migration 060) but profile route never reads/writes it.
- **Fix**: Add `bankName`/`bank_name` to both PATCH handler and GET SELECT query in profile.ts.
- **Files**: `backend/src/routes/v1/supplier/profile.ts:204-225,29-53`
- **Status**: DIAGNOSED

### STG-089: Supplier — BNPL Orders pagination broken (no total in response)
- **Portal**: Supplier (`staging.supermandi.tech/supplier/bnpl-orders`)
- **Page**: BNPL Orders → Pagination controls
- **Symptom**: Only first 20 BNPL orders visible. Next button never enabled.
- **Root Cause**: Backend response has no `total` field at root level (`bnplVisibility.ts:65-89`). Frontend falls back to `json.orders?.length` (max 20) → `totalPages = 1`.
- **Fix**: Add `total: parseInt(summary.total)` to backend response, or frontend reads `json.summary.totalOrders`.
- **Files**: `backend/src/routes/v1/supplier/bnplVisibility.ts:65-89`, `supplier-portal/src/app/(dashboard)/bnpl-orders/page.tsx:50`
- **Status**: DIAGNOSED

### STG-090: Supplier — CSV Upload "View Products" link goes to 404
- **Portal**: Supplier (`staging.supermandi.tech/supplier/upload`)
- **Page**: CSV Upload → After successful upload → "View Products" button
- **Symptom**: Clicking "View Products" navigates to `/products` (404) instead of `/supplier/products`.
- **Root Cause**: `upload/page.tsx:296` uses `<a href="/products">` instead of `<Link href="/products">`. Next.js `basePath: '/supplier'` only auto-prepends for `<Link>`, not raw `<a>` tags.
- **Fix**: Change to `<Link href="/products">` (from `next/link`) or hardcode `href="/supplier/products"`.
- **Files**: `supplier-portal/src/app/(dashboard)/upload/page.tsx:296`
- **Status**: DIAGNOSED

### STG-091: Supplier — Password change doesn't invalidate existing sessions
- **Portal**: Supplier (`staging.supermandi.tech/supplier/profile`)
- **Page**: Profile → Change Password tab
- **Symptom**: After changing password, old tokens remain valid — stolen sessions persist.
- **Root Cause**: `auth.ts:817-824` updates `password_hash` but never updates `tokens_revoked_at` or blacklists current token. Compare to retailer (STG-071) which at least revokes tokens (but doesn't redirect).
- **Fix**: Add `UPDATE supplier.suppliers SET tokens_revoked_at = NOW()` after password change, and blacklist current token.
- **Files**: `backend/src/routes/v1/supplier/auth.ts:817-824`
- **Status**: DIAGNOSED

### STG-092:
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
| DIAGNOSED | 86 |
| FOUND | 0 |
| VERIFIED | 0 |
| WONTFIX | 1 |
| **Total** | **91** |

---

## Redeploy Checklist (run after all issues FIXED)

- [ ] `pnpm -r typecheck` — 0 errors
- [ ] `pnpm -r build` — all services build
- [ ] `git push origin main`
- [ ] CI 20/20 green
- [ ] Tag new deploy-ready SHA
- [ ] Trigger staging deploy
- [ ] Verify all FIXED issues are VERIFIED on staging
