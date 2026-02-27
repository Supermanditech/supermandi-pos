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

### STG-053:
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
| DIAGNOSED | 47 |
| FOUND | 0 |
| VERIFIED | 0 |
| WONTFIX | 1 |
| **Total** | **52** |

---

## Redeploy Checklist (run after all issues FIXED)

- [ ] `pnpm -r typecheck` — 0 errors
- [ ] `pnpm -r build` — all services build
- [ ] `git push origin main`
- [ ] CI 20/20 green
- [ ] Tag new deploy-ready SHA
- [ ] Trigger staging deploy
- [ ] Verify all FIXED issues are VERIFIED on staging
