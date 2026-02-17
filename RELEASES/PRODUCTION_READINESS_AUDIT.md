# SuperMandi — Production Readiness Audit (Phase 13)

> **Created:** 2026-02-17 | **Scope:** Full cross-platform + cross-function audit
> **Goal:** Every screen, every API call, every cross-system flow works production-grade before GCP deploy
> **Execution Model:** One ticket = one branch = one PR = one tag

---

## Claude Session Rules (Read EVERY Time)

### Before Starting ANY Ticket

```
1. Read this file (RELEASES/PRODUCTION_READINESS_AUDIT.md)
2. Read RELEASES/CLAUDE_CURRENT_STATE.json → find current ticket
3. git log --oneline -5 && git status → verify clean main
4. Announce: "Starting PRA-XXX: [description]"
5. Create branch: fix/PRA-XXX-slug
```

### During EVERY Ticket

```
- Read the actual source files before changing anything
- Test the FULL chain: UI → API call → Gateway routing → Backend handler → DB query → Response → UI render
- Verify store isolation (storeId from JWT, never from client)
- Check error states: loading, success, empty, error for every screen
- Check auth: token refresh, expired token, unauthorized access
- Run typecheck after every change: pnpm -r typecheck
```

### After EVERY Ticket

```
1. git diff → verify only intended files changed
2. pnpm -r typecheck → zero errors
3. Relevant build passes (portal build / POS typecheck)
4. Update this file: mark ticket DONE
5. Update CLAUDE_CURRENT_STATE.json: mark ticket DONE
6. Commit with: fix(PRA-XXX): <description>
7. Create PR → merge → tag: prestage-PRA-XXX-YYYY-MM-DD_HHMMIST
8. NEVER start next ticket until current PR merged + tagged
```

### Git Discipline Checklist (EVERY ticket)

| Rule | Check |
|------|-------|
| Clean main before branch | `git status` shows clean |
| Branch from main | `git checkout main && git pull && git checkout -b fix/PRA-XXX-slug` |
| Semantic commit | `fix(PRA-XXX): description` |
| One PR per ticket | Never bundle tickets |
| Prestage tag after merge | `prestage-PRA-XXX-YYYY-MM-DD_HHMMIST` |
| No direct push to main | Always via PR |
| No --force push | Never |
| No --no-verify | Never |
| PR description has scope | List files changed + what was tested |

---

## Part A: Retailer Admin Portal Audit (PRA-001 → PRA-015)

### PRA-001: Audit Retailer Auth Flow End-to-End
- **Priority:** P0
- **Scope:** Login → JWT → cookie → refresh → logout → expired redirect
- **Files:** `retailer-admin/src/lib/AuthContext.tsx`, `retailer-admin/src/lib/api.ts`
- **Check:** Login with phone OTP works, token stored in HttpOnly cookie, auto-refresh 5min before expiry, logout clears all state, expired token redirects to `/retailer/login`, storeCode in URL validated against JWT storeCode (GL-CRIT-0023)
- **Cross-function:** POS staff who also use retailer web — same store, different auth mechanism
- **Status:** DONE — All 12 audit checks pass. HttpOnly cookies, SameSite+Secure, mutex-protected refresh, GL-CRIT-0023 URL validation, idle timeout with warning. Production-ready.

### PRA-002: Audit Retailer Dashboard Data Loading
- **Priority:** P0
- **Scope:** DashboardPage → fetchDailySummary → fetchProducts → fetchCategories
- **Files:** `retailer-admin/src/pages/DashboardPage.tsx`, `retailer-admin/src/api/store.ts`
- **Check:** Dashboard loads with real API data, loading/empty/error states render correctly, category filter works, daily summary shows correct date, product count matches DB
- **Cross-function:** POS sales should reflect in retailer dashboard daily summary
- **Status:** DONE — All checks pass. Loading/empty/error states present, IST timezone correct, store isolation via JWT, POS sales reflected in daily summary, 45 tests. Production-ready.

### PRA-003: Audit Retailer Products Page Full CRUD
- **Priority:** P0
- **Scope:** List → search → create → edit → delete → barcode → price
- **Files:** `retailer-admin/src/pages/ProductsPage.tsx`, `retailer-admin/src/api/store.ts`
- **Check:** Product list paginates, search filters correctly, create product with barcode, edit price (paise conversion uses Math.floor not Math.round), delete product, categories load
- **Cross-function:** Products created here must appear in POS app catalog scan and sell
- **Status:** PENDING

### PRA-004: Audit Retailer Inventory Page
- **Priority:** P0
- **Scope:** Inventory list → stock levels → ledger → low stock alerts
- **Files:** `retailer-admin/src/pages/InventoryPage.tsx`, `retailer-admin/src/api/store.ts`
- **Check:** Inventory shows current stock, ledger history correct, low stock flagged, stock matches what POS reports
- **Cross-function:** POS stock-in/sale changes must reflect here in real-time
- **Status:** PENDING

### PRA-005: Audit Retailer Supplier Management
- **Priority:** P1
- **Scope:** Supplier list → link → unlink → supplier catalog browse → request
- **Files:** `retailer-admin/src/pages/SuppliersPage.tsx`, `retailer-admin/src/pages/SupplierCatalogPage.tsx`
- **Check:** Suppliers linked to store load correctly, can browse supplier catalog, can request new supplier, unlink works, store isolation enforced
- **Cross-function:** Supplier portal sees linked retailers, POS can order from linked suppliers
- **Status:** PENDING

### PRA-006: Audit Retailer Purchase Orders + Invoices
- **Priority:** P1
- **Scope:** Create PO → track status → receive GRN → invoice generated
- **Files:** `retailer-admin/src/pages/PurchaseOrdersPage.tsx`, `retailer-admin/src/pages/InvoicesPage.tsx`
- **Check:** PO creation flow works, status transitions correct, GRN receipt updates inventory, invoice auto-generated, amounts match
- **Cross-function:** Supplier sees order in their portal, POS GRN screen syncs with web
- **Status:** PENDING

### PRA-007: Audit Retailer Analytics + Reports
- **Priority:** P1
- **Scope:** Sales analytics → date range → category breakdown → export
- **Files:** `retailer-admin/src/pages/AnalyticsPage.tsx`, `retailer-admin/src/api/store.ts`
- **Check:** Analytics loads with date range filter, sales breakdown by category correct, data matches POS sales records
- **Cross-function:** POS daily closing data feeds into retailer analytics
- **Status:** PENDING

### PRA-008: Audit Retailer Settings + Payments Config
- **Priority:** P1
- **Scope:** Store settings → UPI config → payment methods → staff
- **Files:** `retailer-admin/src/pages/SettingsPage.tsx`, `retailer-admin/src/pages/PaymentsPage.tsx`
- **Check:** Settings save correctly, UPI VPA config persists, payment method toggle reflects in POS
- **Cross-function:** Payment config set here controls POS payment options
- **Status:** PENDING

### PRA-009: Audit Retailer CSV Import Flow
- **Priority:** P1
- **Scope:** Upload CSV → validate → preview → import → polling status
- **Files:** `retailer-admin/src/pages/ImportPage.tsx`
- **Check:** CSV upload accepts valid file, validation errors shown, import progress polls correctly, imported products appear in product list, polling cleanup on unmount (FIX-016 fix verified)
- **Cross-function:** Imported products must appear in POS scan catalog
- **Status:** PENDING

### PRA-010: Audit Retailer Compliance Page
- **Priority:** P2
- **Scope:** Compliance status → FSSAI → GST → documents
- **Files:** `retailer-admin/src/pages/CompliancePage.tsx`
- **Check:** Compliance data loads, status indicators correct, document links work
- **Cross-function:** SuperAdmin sees compliance status for this store
- **Status:** PENDING

### PRA-011: Audit Retailer Credit + Reconciliation
- **Priority:** P1
- **Scope:** Credit dashboard → BNPL dues → reconciliation
- **Files:** `retailer-admin/src/pages/CreditDashboardPage.tsx`, `retailer-admin/src/pages/ReconciliationPage.tsx`
- **Check:** Credit balance loads, BNPL dues list accurate, reconciliation matches transactions
- **Cross-function:** POS BNPL sales appear here, supplier invoice discounting reflects
- **Status:** PENDING

### PRA-012: Audit Retailer Customer Management
- **Priority:** P2
- **Scope:** Customer list → purchase history → credit book
- **Files:** `retailer-admin/src/pages/CustomersPage.tsx`
- **Check:** Customer list from POS sales, purchase history accurate, credit balance correct
- **Cross-function:** POS Khata/credit data syncs with web customer page
- **Status:** PENDING

### PRA-013: Audit Retailer Reorder + Notifications
- **Priority:** P1
- **Scope:** Reorder suggestions → approve/dismiss → notification center
- **Files:** `retailer-admin/src/pages/ReorderPage.tsx`, `retailer-admin/src/pages/NotificationsPage.tsx`
- **Check:** Reorder suggestions based on stock level, approve creates PO, dismiss works, notifications load with correct types
- **Cross-function:** POS reorder screen shows same suggestions, supplier gets order notification
- **Status:** PENDING

### PRA-014: Audit Retailer Device Activation
- **Priority:** P1
- **Scope:** Device enrollment code generation → POS device pairs
- **Files:** `retailer-admin/src/pages/DeviceActivationPage.tsx`
- **Check:** Generate enrollment code, code expires correctly, POS device can enroll with code
- **Cross-function:** POS EnrollDevice screen uses this code, SuperAdmin sees enrolled device
- **Status:** PENDING

### PRA-015: Audit Retailer LimitedModeGuard + Admin Routes
- **Priority:** P0
- **Scope:** Application status gates → admin-only routes → 404 handling
- **Files:** `retailer-admin/src/App.tsx`, `retailer-admin/src/components/ProtectedRoute.tsx`
- **Check:** Pending store shows limited mode, active store shows all pages, admin routes require admin role, unknown routes show 404, error boundary catches chunk load failures
- **Cross-function:** SuperAdmin store status change reflects in retailer limited mode
- **Status:** PENDING

---

## Part B: Supplier Portal Audit (PRA-016 → PRA-028)

### PRA-016: Audit Supplier Auth Flow End-to-End
- **Priority:** P0
- **Scope:** Register → phone OTP → email verify → login → refresh → logout
- **Files:** `supplier-portal/src/lib/auth.tsx`, `supplier-portal/src/lib/api.ts`
- **Check:** Registration with GSTIN check, phone OTP (Firebase), email verification, login with password, login with phone OTP, cookie-based auth check (not in-memory), auto-refresh, 30-min idle timeout, logout clears SSE + state, 401 redirect uses `/supplier/login` basePath
- **Cross-function:** SuperAdmin approves supplier registration, retailer can then link supplier
- **Status:** DONE — Cookie-based auth (HttpOnly), 30-min idle timeout with warning, token refresh with failure toast, 401 redirect to /supplier/login, GSTIN validation, verification status gates. All design-level.

### PRA-017: Audit Supplier Product CRUD + CSV Upload
- **Priority:** P0
- **Scope:** List → create → edit → delete → image upload → CSV bulk upload
- **Files:** `supplier-portal/src/app/(dashboard)/products/page.tsx`, `supplier-portal/src/lib/api.ts`
- **Check:** Product list with pagination (URL-synced, not useState), create with image (blob URL cleaned up), edit saves, delete works, CSV upload validates, bulk upload < 5s for 1000 products (FIX-009 verified), status filter has aria-pressed
- **Cross-function:** Products appear in retailer supplier catalog, SuperAdmin can approve/reject
- **Status:** DONE — All 6 checks pass. Pagination URL-synced, image upload via readAsDataURL (no blob leak), CSV with drag-drop and validation, status filter with aria-pressed, memory leak prevention confirmed.

### PRA-018: Audit Supplier Order Management
- **Priority:** P0
- **Scope:** Order list → detail → status update → shipment → delivery confirm → SSE real-time
- **Files:** `supplier-portal/src/app/(dashboard)/orders/page.tsx`, `supplier-portal/src/lib/api.ts`
- **Check:** Orders from retailers load, status transitions work (confirmed → shipped → delivered), shipment tracking updates, delivery confirmation, SSE stream connects and closes on logout (FIX-028 verified), quantity debounce cleanup (FIX-025 verified), order notes and events load
- **Cross-function:** Retailer PO creates order here, POS GRN triggers status change
- **Status:** PENDING

### PRA-019: Audit Supplier Invoices + Earnings
- **Priority:** P1
- **Scope:** Invoice list → detail → payout summary → payout history
- **Files:** `supplier-portal/src/app/(dashboard)/invoices/page.tsx`, `supplier-portal/src/app/(dashboard)/earnings/page.tsx`
- **Check:** Invoices match orders, amounts correct (paisa arithmetic), payout summary accurate, payout detail shows orders included
- **Cross-function:** Retailer invoice matches supplier invoice, SuperAdmin sees payment records
- **Status:** PENDING

### PRA-020: Audit Supplier KYC Flow
- **Priority:** P0
- **Scope:** IFSC verify → bank verify → document upload → KYC status
- **Files:** `supplier-portal/src/app/(dashboard)/kyc/page.tsx`, `supplier-portal/src/lib/api.ts`
- **Check:** IFSC code validates, bank account verification works, document upload with progress (FIX-065 verified), KYC status reflects correctly, documents viewable
- **Cross-function:** SuperAdmin documents tab shows KYC for review/approve/reject
- **Status:** DONE — All 5 checks pass. IFSC format validation with auto-uppercase, bank account 9-18 digits with confirmation, document upload with retry on failure (AUDIT-SUP-017), KYC status checklist, stale request handling via latestIfscRef.

### PRA-021: Audit Supplier Profile + Settings
- **Priority:** P1
- **Scope:** Profile view → edit → change password → GSTIN display
- **Files:** `supplier-portal/src/app/(dashboard)/profile/page.tsx`
- **Check:** Profile loads with correct data, edit saves, password change works, GSTIN displayed correctly, phone validation enforces +91 format (FIX-030 verified)
- **Cross-function:** Retailer sees supplier profile data when browsing catalog
- **Status:** PENDING

### PRA-022: Audit Supplier Registration Onboarding
- **Priority:** P0
- **Scope:** Multi-step registration → GSTIN check → OTP verify → KYC submit → pending approval
- **Files:** `supplier-portal/src/app/(auth)/register/page.tsx`, `supplier-portal/src/app/(auth)/onboard/page.tsx`, `supplier-portal/src/app/(auth)/pending-approval/page.tsx`
- **Check:** Full registration flow completes, GSTIN lookup works, OTP verification, KYC document upload during registration, pending-approval screen shows while awaiting SuperAdmin
- **Cross-function:** SuperAdmin registrations tab shows new application, approve triggers supplier activation
- **Status:** PENDING

### PRA-023: Audit Supplier Verification Status Gates
- **Priority:** P1
- **Scope:** Pending supplier → rejected supplier → verified supplier feature access
- **Files:** `supplier-portal/src/lib/auth.tsx`, dashboard layout
- **Check:** Pending supplier sees limited UI, rejected supplier sees rejection reason, verified supplier has full access, status change from SuperAdmin reflects immediately
- **Cross-function:** SuperAdmin verify/reject action changes supplier portal access
- **Status:** PENDING

### PRA-024: Audit Supplier BNPL Orders
- **Priority:** P1
- **Scope:** BNPL order list → status → payment tracking
- **Files:** `supplier-portal/src/app/(dashboard)/bnpl-orders/page.tsx`
- **Check:** BNPL orders load, payment status shows correctly, due dates accurate
- **Cross-function:** Retailer BNPL credit creates these entries, SuperAdmin credit-providers tab tracks
- **Status:** PENDING

### PRA-025: Audit Supplier Chat
- **Priority:** P2
- **Scope:** Chat list → conversation → send/receive messages
- **Files:** `supplier-portal/src/app/(dashboard)/chat/page.tsx`
- **Check:** Chat conversations load, messages send and receive, real-time updates work
- **Cross-function:** Retailer/POS chat connects to same conversation thread
- **Status:** PENDING

### PRA-026: Audit Supplier Notifications
- **Priority:** P2
- **Scope:** Notification center → mark read → notification types
- **Files:** `supplier-portal/src/app/(dashboard)/notifications/page.tsx`
- **Check:** Notifications load with correct types (order, payment, system), mark read works, unread count accurate
- **Cross-function:** Order actions from retailer/POS trigger supplier notifications
- **Status:** PENDING

### PRA-027: Audit Supplier Bulk CSV Upload Flow
- **Priority:** P1
- **Scope:** Upload page → file validation → preview → confirm → status tracking
- **Files:** `supplier-portal/src/app/(dashboard)/upload/page.tsx`
- **Check:** CSV template download works, file validation catches errors, preview shows correct data, upload completes, products created match CSV
- **Cross-function:** Uploaded products go to SuperAdmin pending products queue
- **Status:** PENDING

### PRA-028: Audit Supplier Error Boundaries + Edge Cases
- **Priority:** P1
- **Scope:** Root error boundary → 401 handling → network errors → empty states
- **Files:** `supplier-portal/src/app/layout.tsx`, `supplier-portal/src/lib/api.ts`
- **Check:** Root error boundary catches crashes, 401 redirects to login with basePath, network errors show friendly message, empty product/order lists show proper empty state, formatPrice handles zero correctly (FIX-055 verified)
- **Status:** PENDING

---

## Part C: SuperAdmin Portal Audit (PRA-029 → PRA-044)

### PRA-029: Audit SuperAdmin Auth + Session Management
- **Priority:** P0
- **Scope:** Email OTP login → session JWT → idle timeout → refresh → master token fallback
- **Files:** `supermandi-superadmin/src/api/authToken.ts`, `supermandi-superadmin/src/components/LoginGate.tsx`
- **Check:** Email OTP sends and verifies, session JWT stored, idle timeout triggers re-login, refresh works, master token (x-admin-token) fallback works, login step doesn't advance on OTP send failure (FIX-043 verified), rate limiting (5 failed/min/IP)
- **Status:** DONE — Dual storage (localStorage + HttpOnly cookie), timing-safe master token, 30-min idle timeout, 10-min refresh cycle with 5-failure threshold, email allowlist, CSP meta tag (FIX-063). All checks pass.

### PRA-030: Audit SuperAdmin Stores Management
- **Priority:** P0
- **Scope:** Store list → create → edit → status change (active/suspended/pending)
- **Files:** `supermandi-superadmin/src/tabs/StoresTab.tsx`, `supermandi-superadmin/src/api/stores.ts`
- **Check:** Store CRUD works, status change persists, store isolation maintained (each store has separate data)
- **Cross-function:** Store status change affects retailer portal (limited mode) and POS (device blocked)
- **Status:** DONE — All checks pass. Store CRUD with loading/empty/error states, status change via state machine, feature flag bulk operations, store isolation maintained.

### PRA-031: Audit SuperAdmin Supplier Verification Queue
- **Priority:** P0
- **Scope:** Pending list → verify → reject → bank change review → product approve/reject/edit
- **Files:** `supermandi-superadmin/src/tabs/SuppliersTab.tsx`, `supermandi-superadmin/src/api/suppliers.ts`
- **Check:** Pending suppliers load, verify action works, reject with reason, bank change review, product approval publishes to catalog, "Approve & Publish" awaits approval (no setTimeout race — FIX-047 verified), error boundary on modal (FIX-048 verified), search input sanitized (FIX-062 verified), publish state doesn't leak memory (FIX-050 verified)
- **Cross-function:** Verify triggers supplier portal access, approved products appear in retailer catalog
- **Status:** DONE — All checks pass. FIX-047 async/await verified, FIX-048 ModalErrorBoundary wraps modal content, FIX-050 useEffect clears publishLoading on product refresh, FIX-062 trim() applied in App.tsx, batch operations with proper async/await.

### PRA-032: Audit SuperAdmin Applications + Registrations
- **Priority:** P0
- **Scope:** Retailer applications → approve/reject → registration events log
- **Files:** `supermandi-superadmin/src/tabs/ApplicationsTab.tsx`, `supermandi-superadmin/src/tabs/RegistrationsTab.tsx`
- **Check:** Applications list with pagination (FIX-049 verified), approve creates store, reject notifies applicant, registration events log shows timeline
- **Cross-function:** Approve triggers retailer portal activation, device enrollment becomes possible
- **Status:** DONE — All checks pass. FIX-049 Load More pagination with offset-based loading, approve/reject with reason validation (min 5 chars), registration events log with source/outcome filters, enrollment code sending with result modal.

### PRA-033: Audit SuperAdmin Device Management
- **Priority:** P1
- **Scope:** Device list → status → enrollment history → block/unblock
- **Files:** `supermandi-superadmin/src/tabs/DevicesTab.tsx`, `supermandi-superadmin/src/api/devices.ts`
- **Check:** Enrolled devices show with status, can block/unblock device, enrollment history accurate
- **Cross-function:** Blocked device shows DeviceBlocked screen in POS app
- **Status:** PENDING

### PRA-034: Audit SuperAdmin Staff Management
- **Priority:** P1
- **Scope:** Staff per store → create → update → reset PIN
- **Files:** `supermandi-superadmin/src/tabs/StaffTab.tsx`, `supermandi-superadmin/src/api/staff.ts`
- **Check:** Staff list per store, create staff with role, update details, PIN reset works
- **Cross-function:** Staff can login on POS with PIN, permissions control POS features
- **Status:** PENDING

### PRA-035: Audit SuperAdmin Analytics Dashboard
- **Priority:** P1
- **Scope:** Overview → devices → products → purchases → consumer sales → activity → dues
- **Files:** `supermandi-superadmin/src/tabs/AnalyticsTab.tsx`, `supermandi-superadmin/src/api/analytics.ts`
- **Check:** All 7 analytics sub-views load, date range filter works, storeId filter doesn't send empty string (FIX-045 verified), 401 dispatches auth-expired event (FIX-044 verified)
- **Cross-function:** Aggregates data from all stores' POS sales, retailer purchases, supplier deliveries
- **Status:** PENDING

### PRA-036: Audit SuperAdmin POS Events Stream
- **Priority:** P1
- **Scope:** Live event feed → filtering → event detail
- **Files:** `supermandi-superadmin/src/tabs/EventsTab.tsx`, `supermandi-superadmin/src/api/posEvents.ts`
- **Check:** Events load in real-time, filtering by store/type works, event detail shows correctly
- **Cross-function:** POS scan/sell/stock-in events appear here live
- **Status:** PENDING

### PRA-037: Audit SuperAdmin Documents (KYC Review)
- **Priority:** P1
- **Scope:** Pending documents → approve → reject → document preview
- **Files:** `supermandi-superadmin/src/tabs/DocumentsTab.tsx`, `supermandi-superadmin/src/api/documents.ts`
- **Check:** Pending documents from suppliers load, can preview document, approve/reject with reason
- **Cross-function:** Supplier KYC upload appears here, approval updates supplier KYC status
- **Status:** PENDING

### PRA-038: Audit SuperAdmin Invoices + Payments + Refunds
- **Priority:** P1
- **Scope:** Invoice management → payment records → refund processing
- **Files:** `supermandi-superadmin/src/tabs/InvoicesTab.tsx`, `supermandi-superadmin/src/tabs/PaymentsTab.tsx`, `supermandi-superadmin/src/tabs/RefundsTab.tsx`
- **Check:** Invoices list with filtering, payment records accurate, refund processing works
- **Cross-function:** Retailer and supplier invoices match, POS refunds appear here
- **Status:** PENDING

### PRA-039: Audit SuperAdmin GRN Alerts
- **Priority:** P1
- **Scope:** Excess quantity alerts → review → update status
- **Files:** `supermandi-superadmin/src/tabs/GrnAlertsTab.tsx`, `supermandi-superadmin/src/api/grnAlerts.ts`
- **Check:** GRN alerts load, excess alerts flagged correctly, can update alert status
- **Cross-function:** POS GRN with excess triggers alert here
- **Status:** PENDING

### PRA-040: Audit SuperAdmin Feature Flags
- **Priority:** P1
- **Scope:** Global flags → per-store overrides → bulk set
- **Files:** `supermandi-superadmin/src/api/featureFlags.ts`
- **Check:** Global flags list, toggle works, per-store override set/remove, bulk set across stores
- **Cross-function:** Feature flags control POS features (buy, reorder), retailer limited mode
- **Status:** PENDING

### PRA-041: Audit SuperAdmin Users + Audit Log
- **Priority:** P1
- **Scope:** User management → admin actions audit trail
- **Files:** `supermandi-superadmin/src/tabs/UsersTab.tsx`, `supermandi-superadmin/src/tabs/AuditTab.tsx`
- **Check:** User list CRUD, audit log records all admin actions with timestamp
- **Status:** PENDING

### PRA-042: Audit SuperAdmin GST Compliance + Quality
- **Priority:** P2
- **Scope:** GST compliance dashboard → quality metrics
- **Files:** `supermandi-superadmin/src/tabs/GstComplianceTab.tsx`, `supermandi-superadmin/src/tabs/QualityDashboardTab.tsx`
- **Check:** GST data loads, quality metrics accurate
- **Cross-function:** Retailer compliance page data matches
- **Status:** PENDING

### PRA-043: Audit SuperAdmin WhatsApp + AI Dashboards
- **Priority:** P2
- **Scope:** WhatsApp integration dashboard → AI insights → support queue
- **Files:** `supermandi-superadmin/src/tabs/WhatsAppTab.tsx`, `supermandi-superadmin/src/tabs/AIInsightsTab.tsx`, `supermandi-superadmin/src/tabs/SupportQueueTab.tsx`
- **Check:** WhatsApp metrics load, AI insights display, support queue with templates
- **Status:** PENDING

### PRA-044: Audit SuperAdmin Monitoring + Settings
- **Priority:** P2
- **Scope:** Cloud monitoring → system settings → credit providers
- **Files:** `supermandi-superadmin/src/tabs/MonitoringTab.tsx`, `supermandi-superadmin/src/tabs/SettingsTab.tsx`, `supermandi-superadmin/src/tabs/CreditProvidersTab.tsx`
- **Check:** Monitoring metrics load, settings save, credit provider data accurate
- **Status:** PENDING

---

## Part D: POS App Audit (PRA-045 → PRA-065)

### PRA-045: Audit POS Device Enrollment + Store Registration
- **Priority:** P0
- **Scope:** Splash → enrollment code → device token → store registration
- **Files:** `App.tsx`, `src/screens/EnrollDeviceScreen.tsx`, `src/screens/RegisterStoreScreen.tsx`, `src/services/api/enrollApi.ts`
- **Check:** Splash checks enrollment status, enrollment code from retailer web works, device token stored in AsyncStorage, store self-registration flow completes, DeviceBlocked screen shows for blocked devices, ForceUpdate for old versions
- **Cross-function:** Retailer web generates enrollment code, SuperAdmin sees enrolled device
- **Status:** DONE — SecureStore token storage, 90-day expiry with refresh, FOR UPDATE row locks on enrollment, idempotent re-enrollment (fingerprint match), DeviceBlocked/ForceUpdate via ui-status polling, demo code support. All checks pass.

### PRA-046: Audit POS Scan + Sell Flow (Core Business)
- **Priority:** P0
- **Scope:** Barcode scan → product lookup → add to cart → quantity → stock cap → cart
- **Files:** `src/screens/SellScanScreen.tsx`, `src/services/scan/handleScan.ts`, `src/services/api/scanApi.ts`, `src/stores/cartStore.ts`
- **Check:** Camera scan works, barcode lookup returns product, add to cart respects stock cap (NEVER oversell), quantity increment/decrement, cart total correct (paisa arithmetic), offline scan shows appropriate message (FIX-038 verified), search history clears on store change (FIX-058 verified)
- **Cross-function:** Products from retailer catalog, stock from inventory, prices from catalog service
- **Status:** DONE — All checks pass. Stock cap via Math.min(requested, stock) with unknownStock/outOfStock/capped flags, paisa arithmetic with safe integer math, MAX_SAFE_TOTAL overflow protection, duplicate scan detection, 36+ stock cap tests.

### PRA-047: Audit POS Payment Flow (Critical)
- **Priority:** P0
- **Scope:** Cart → payment screen → cash/UPI/card/split → success → print
- **Files:** `src/screens/PaymentScreen.tsx`, `src/screens/SuccessPrintScreen.tsx`, `src/services/api/posApi.ts`
- **Check:** Payment mode tabs render with ARIA labels (FIX-056 verified), cash payment calculates change, UPI QR generates with accessibility (FIX-057 verified), QR regeneration shows loading (FIX-036 verified), split payment modal keyboard dismiss on close (FIX-035 verified), double-submit prevented (FIX-031 verified), network listener cleanup (FIX-032 verified), stale price warning before payment (FIX-039 verified), success screen prints bill
- **Cross-function:** Sale appears in retailer dashboard daily summary, analytics, SuperAdmin events
- **Status:** DONE — All checks pass. ARIA tabs with accessibilityRole/Label/State, UPI QR accessible wrapper, double-submit via submittingRef, keyboard dismiss on modal close, network subscription cleanup, stale price 4-hour threshold banner, MIN_LOADING_DISPLAY_MS=300.

### PRA-048: Audit POS Offline Mode + Sync
- **Priority:** P0
- **Scope:** Offline sale → queue → sync when online → error visibility
- **Files:** `src/services/offline/sync.ts`, `src/services/api/posApi.ts`, `src/services/api/catalogApi.ts`
- **Check:** Sales work offline with cached catalog, sync queue processes on reconnect, sync errors surface to UI with retry button (FIX-033 + FIX-060 verified), pending sync count visible, no data loss
- **Cross-function:** Synced offline sales appear in retailer dashboard + analytics
- **Status:** DONE — All checks pass. Batch sync (size=20), permanent rejection after 10 attempts, duplicate_ignored handling, SyncStatusWidget with pending count + error details + retry/clear buttons, timer cleanup on unmount.

### PRA-049: Audit POS Staff Login + Permissions
- **Priority:** P0
- **Scope:** Staff PIN login → role permissions → shift management
- **Files:** `src/screens/StaffLoginScreen.tsx`, `src/services/api/staffApi.ts`, `src/screens/ShiftScreen.tsx`
- **Check:** Staff PIN login works, permissions control feature access, shift start/end tracked, shift data in daily closing
- **Cross-function:** SuperAdmin staff management creates accounts, retailer web manages staff
- **Status:** DONE — All checks pass. PIN validation (4-6 digits regex), phone validation (10 digits), staff role tracking in session store, loading state with "Logging in..." text, error handling for STAFF_INVALID_CREDENTIALS, focus management with returnKeyType.

### PRA-050: Audit POS Sales History + Bill Detail
- **Priority:** P1
- **Scope:** Sales list → filter → bill detail → reprint
- **Files:** `src/screens/SalesHistoryScreen.tsx`, `src/screens/BillDetailScreen.tsx`
- **Check:** Sales history loads with date filter, bill detail shows items/amounts/payment, reprint works, return link navigates
- **Cross-function:** Sales match retailer analytics data
- **Status:** PENDING

### PRA-051: Audit POS Stock-In + GRN + Inward
- **Priority:** P0
- **Scope:** Stock-in entry → GRN receive → inward history → ledger update
- **Files:** `src/screens/GRNScreen.tsx`, `src/screens/InwardScreen.tsx`, `src/services/api/stockInApi.ts`
- **Check:** Stock-in creates ledger entry, GRN from purchase order works, excess quantity triggers alert, inward history shows correctly, inventory balances update
- **Cross-function:** GRN updates retailer inventory, triggers SuperAdmin GRN alert if excess, updates supplier order status
- **Status:** DONE — All checks pass. Stock-in creates ledger entry with ledgerEntryId response, GRN initializes receive quantities to 0, excess triggers price warning (>10% above market), inward history with pagination, walk-in supplier with GSTIN support.

### PRA-052: Audit POS Purchase Orders (Buy Flow)
- **Priority:** P1
- **Scope:** Buy catalog → create PO → order history → order detail
- **Files:** `src/screens/BuyScreen.tsx`, `src/screens/OrderHistoryScreen.tsx`, `src/screens/OrderDetailScreen.tsx`, `src/services/api/orderApi.ts`
- **Check:** Buy screen loads supplier catalog (FeatureGate: buy), PO creation works, order history shows all POs, order detail with status and GRN link
- **Cross-function:** PO appears in supplier order list, retailer PO page, SuperAdmin analytics
- **Status:** PENDING

### PRA-053: Audit POS Reorder System
- **Priority:** P1
- **Scope:** Reorder suggestions → approve/dismiss → batch approve → settings → policies
- **Files:** `src/screens/ReorderScreen.tsx`, `src/screens/ReorderSettingsScreen.tsx`, `src/screens/ReorderPoliciesScreen.tsx`, `src/services/api/reorderApi.ts`
- **Check:** Suggestions based on stock level (FeatureGate: reorder), approve creates PO, dismiss works, batch approve, settings configure thresholds, policies per product/category
- **Cross-function:** Reorder matches retailer web suggestions, approved PO goes to supplier
- **Status:** PENDING

### PRA-054: Audit POS Khata (Credit Book) + BNPL
- **Priority:** P1
- **Scope:** Credit sales → customer credit balance → BNPL dues → collection
- **Files:** `src/screens/KhataScreen.tsx`, `src/screens/BnplDuesScreen.tsx`, `src/screens/CreditScreen.tsx`, `src/services/api/creditApi.ts`, `src/services/api/bnplApi.ts`
- **Check:** Credit sale records correctly, customer balance updates, BNPL dues list with polling abort cleanup (FIX-034 verified), overdue dues flagged, collection records payment
- **Cross-function:** Credit data syncs with retailer credit dashboard, SuperAdmin credit-providers tab
- **Status:** PENDING

### PRA-055: Audit POS Customer Management
- **Priority:** P1
- **Scope:** Customer list → add → edit → purchase history → credit balance
- **Files:** `src/screens/CustomerListScreen.tsx`, `src/screens/CustomerManagementScreen.tsx`
- **Check:** Customer CRUD works, purchase history accurate, credit balance correct
- **Cross-function:** Customers visible in retailer web customer page
- **Status:** PENDING

### PRA-056: Audit POS Daily Closing + Reports
- **Priority:** P1
- **Scope:** Z-report → daily closing → daily report → sales statement → stock statement
- **Files:** `src/screens/DailyClosingScreen.tsx`, `src/screens/DailyReportScreen.tsx`, `src/screens/SalesStatementScreen.tsx`, `src/screens/StockStatementScreen.tsx`
- **Check:** Daily closing tallies match sales, report generates correctly, statements export
- **Cross-function:** Daily summary matches retailer dashboard, feeds into analytics
- **Status:** PENDING

### PRA-057: Audit POS Return/Refund Flow
- **Priority:** P1
- **Scope:** Return initiation → refund calculation → inventory restore → ledger
- **Files:** `src/screens/ReturnScreen.tsx`
- **Check:** Return from bill detail works, refund amount correct, inventory restored, ledger entry created
- **Cross-function:** Refund appears in SuperAdmin refunds tab, affects daily closing
- **Status:** PENDING

### PRA-058: Audit POS Voice + AI Features
- **Priority:** P2
- **Scope:** Voice recording → AI command processing → AI insights
- **Files:** `src/services/voice/voiceClient.ts`, `src/screens/AIInsightsScreen.tsx`, `src/services/api/aiApi.ts`
- **Check:** Voice recording with max 60s auto-stop (FIX-040 verified), audio session reset on error (FIX-042 verified), AI insights load, voice commands process
- **Cross-function:** AI insights data from store's sales/inventory
- **Status:** PENDING

### PRA-059: Audit POS Chat
- **Priority:** P2
- **Scope:** Chat list → conversation → send/receive
- **Files:** `src/screens/ChatListScreen.tsx`, `src/screens/ChatConversationScreen.tsx`, `src/services/api/chatApi.ts`
- **Check:** Chat conversations load, messages send and receive
- **Cross-function:** Same thread as supplier portal chat
- **Status:** PENDING

### PRA-060: Audit POS Printer Integration
- **Priority:** P1
- **Scope:** Bluetooth/USB printer → settings → test print → bill print
- **Files:** `src/screens/PrinterSettingsScreen.tsx`, `src/services/printerService.ts`
- **Check:** Printer discovery works, connect/disconnect, test print, bill print format correct, error state clears on recovery (FIX-041 verified)
- **Cross-function:** None (device-local)
- **Status:** PENDING

### PRA-061: Audit POS Barcode Sheet
- **Priority:** P2
- **Scope:** Generate barcode sheet → preview → print
- **Files:** `src/screens/BarcodeSheetScreen.tsx`
- **Check:** Barcode sheet generates for selected products, preview renders, print works
- **Cross-function:** SuperAdmin barcode sheet API
- **Status:** PENDING

### PRA-062: Audit POS Opening Stock
- **Priority:** P1
- **Scope:** First-time stock entry → bulk entry → ledger
- **Files:** `src/screens/OpeningStockScreen.tsx`
- **Check:** Opening stock entry creates initial ledger entries, bulk entry works, stock balances set correctly
- **Cross-function:** Opening stock appears in retailer inventory page
- **Status:** PENDING

### PRA-063: Audit POS Feature Gates + UI Status
- **Priority:** P0
- **Scope:** Feature flags → buy/reorder/credit gates → UI status config
- **Files:** `src/services/api/uiStatusApi.ts`, FeatureGate component
- **Check:** Feature flags load from backend, disabled features hidden from nav, enabled features show correctly
- **Cross-function:** SuperAdmin feature flag toggle controls POS features
- **Status:** DONE — PR #277, fixed buyEnabled hardcoded to true (ignored backend), fixed legacy format missing features fallback to defaults

### PRA-064: Audit POS Rate Limiting + API Client
- **Priority:** P1
- **Scope:** Client-side rate limits → 60/min sales, 30/10s scan, 20/min AI → LRU cap
- **Files:** `src/services/api/apiClient.ts`
- **Check:** Rate limits enforced client-side, LRU map capped at 100 entries (FIX-037 verified), exceeded limit shows friendly message
- **Status:** PENDING

### PRA-065: Audit POS Cart Lock + Background Handling
- **Priority:** P1
- **Scope:** Cart auto-lock timeout → backgrounding → cart preservation
- **Files:** `src/stores/cartStore.ts`
- **Check:** Cart locks after timeout, backgrounding pauses timer (FIX-059 verified), cart preserved on return from background, cart clear on store change
- **Status:** PENDING

---

## Part E: Cross-Function Integration Audit (PRA-066 → PRA-080)

> These tickets verify the data flows BETWEEN systems. Most critical for production.

### PRA-066: POS Sale → Retailer Dashboard Sync
- **Priority:** P0
- **Scope:** POS creates sale → retailer dashboard shows updated daily summary
- **Check:** Create sale in POS → verify retailer dashboard daily summary updates (total sales, transaction count, category breakdown)
- **Endpoints:** `POST /api/v1/pos/sales` → `GET /api/v1/retailer-admin/daily-summary`
- **Status:** DONE — Same tables (sales, sale_items), SERIALIZABLE isolation on write, store isolation on both ends, status mapping includes PAID_CASH/PAID_UPI/DUE/SPLIT, IST timezone correct.

### PRA-067: POS Stock-In → Retailer Inventory Sync
- **Priority:** P0
- **Scope:** POS stock-in entry → retailer inventory page shows updated stock
- **Check:** Stock-in via POS → retailer inventory reflects new balance → ledger shows entry
- **Endpoints:** `POST /api/v1/pos/stock-in` → `GET /api/v1/retailer-admin/inventory`
- **Status:** DONE — Same ledger system (inventory.inventory_ledger + stock_balances), transaction + advisory lock on write, COALESCE fallback on read, store isolation on both ends.

### PRA-068: Retailer PO → Supplier Order Sync
- **Priority:** P0
- **Scope:** Retailer creates purchase order → supplier sees new order
- **Check:** Create PO from retailer web → supplier portal orders page shows new order → SSE notification fires → status transitions sync bidirectionally
- **Endpoints:** `POST /api/v1/orders/stores/:id/orders` → `GET /api/v1/supplier/orders`
- **Status:** DONE — Same tables (purchase_orders, purchase_order_items), supplier visibility via supplier_products FK, draft orders excluded from supplier view, store isolation on write side.

### PRA-069: POS GRN → Supplier Order Status → Retailer Inventory
- **Priority:** P0
- **Scope:** POS receives goods → supplier order marked delivered → retailer inventory updated
- **Check:** GRN receive on POS → supplier order status changes → retailer inventory balance increases → ledger entry created → excess triggers SuperAdmin alert
- **Endpoints:** `POST /api/v1/orders/stores/:id/orders/:oid/receive` → supplier order status → inventory update
- **Status:** DONE — Atomic SERIALIZABLE transaction updates order items → order status → stock_balances → store_products + event log, all in one commit. Store isolation via getStoreIdFromDevice.

### PRA-070: SuperAdmin Store Status → Retailer Limited Mode → POS Device Block
- **Priority:** P0
- **Scope:** SuperAdmin changes store status → retailer sees limited mode → POS shows blocked
- **Check:** SuperAdmin suspends store → retailer portal shows LimitedModeGuard → POS shows DeviceBlocked screen → reactivate restores access
- **Endpoints:** `PATCH /api/v1/admin/stores/:id` → retailer auth context `applicationStatus` → POS ui-status
- **Status:** DONE — PR #278, fixed retailer auth to include platform.stores.status and override applicationStatus when store is not ACTIVE. POS ui-status already correct. All 3 login endpoints patched.

### PRA-071: SuperAdmin Supplier Verify → Supplier Portal Access → Retailer Catalog
- **Priority:** P0
- **Scope:** SuperAdmin verifies supplier → supplier gains full access → products appear in retailer catalog
- **Check:** SuperAdmin verifies pending supplier → supplier portal shows full dashboard → supplier's approved products browsable by retailer in supplier catalog
- **Endpoints:** `POST /api/v1/admin/pending-suppliers/:id/verify` → supplier auth verificationStatus → retailer catalog
- **Status:** DONE — Verify action creates supplier with verification_status='verified' + status='active'. Supplier auth login checks status='active'. Retailer supplier-catalog endpoint filters by s.verification_status='verified' AND s.status='active'.

### PRA-072: SuperAdmin Feature Flag → POS Feature Gate
- **Priority:** P1
- **Scope:** SuperAdmin toggles feature flag → POS feature gate enables/disables
- **Check:** Toggle `buy` feature OFF in SuperAdmin → POS Buy screen hidden behind FeatureGate → toggle ON → POS Buy screen appears
- **Endpoints:** `POST /api/v1/admin/feature-flags/:flag/toggle` → `GET /api/v1/pos/ui-status`
- **Status:** PENDING

### PRA-073: Retailer Device Enrollment → POS Enrollment
- **Priority:** P1
- **Scope:** Retailer generates enrollment code → POS device enrolls with code
- **Check:** Generate code in retailer web → enter code on POS → device enrolled → SuperAdmin devices tab shows new device
- **Endpoints:** Retailer device page → `POST /api/v1/pos/enroll` → admin devices API
- **Status:** PENDING

### PRA-074: POS BNPL Sale → Retailer Credit Dashboard → SuperAdmin Credit
- **Priority:** P1
- **Scope:** POS credit sale → retailer credit balance → SuperAdmin credit tracking
- **Check:** BNPL sale on POS → retailer credit dashboard shows due → SuperAdmin credit-providers tab tracks → collection on POS clears due
- **Endpoints:** POS credit API → retailer credit API → admin credit API
- **Status:** PENDING

### PRA-075: Supplier Product Upload → SuperAdmin Approval → Retailer Catalog
- **Priority:** P1
- **Scope:** Supplier uploads product → SuperAdmin approves → appears in retailer supplier catalog
- **Check:** Supplier creates product → SuperAdmin pending products shows it → approve → retailer supplier catalog shows product → retailer links product → POS can scan/sell it
- **Endpoints:** `POST /api/v1/supplier/products` → admin pending products → retailer catalog → POS scan
- **Status:** PENDING

### PRA-076: POS Reorder Approve → Retailer PO → Supplier Order
- **Priority:** P1
- **Scope:** POS approves reorder suggestion → creates PO → supplier receives order
- **Check:** Reorder suggestion on POS → approve → PO created → appears in retailer PO page → supplier order list shows it
- **Endpoints:** `POST /api/v1/reorder/.../approve` → order creation → supplier order stream
- **Status:** PENDING

### PRA-077: POS Return → Retailer Refund → SuperAdmin Refund
- **Priority:** P1
- **Scope:** POS processes return → retailer sees refund → SuperAdmin refund tab tracks
- **Check:** Return on POS → inventory restored → refund amount correct → retailer reconciliation shows → SuperAdmin refunds tab tracks
- **Status:** PENDING

### PRA-078: Multi-Store Isolation Verification
- **Priority:** P0
- **Scope:** Two stores cannot see each other's data anywhere
- **Check:** Store A data NEVER visible in Store B's POS, retailer portal, or API responses. Test with: products, inventory, sales, orders, customers, staff, devices
- **Key invariant:** Every query includes `WHERE store_id = $token.storeId`
- **Status:** DONE — PR #266, 47 files audited, 1 LOW fix (order events store_id JOIN)

### PRA-079: Auth Token Cross-Platform Verification
- **Priority:** P0
- **Scope:** Token from one role cannot access another role's endpoints
- **Check:** Retailer JWT cannot access supplier endpoints, supplier JWT cannot access admin endpoints, POS device token cannot access web portal endpoints, expired tokens rejected everywhere, refresh tokens work per platform
- **Status:** DONE — PR #267, 3 findings fixed (actorType in refresh tokens, document upload auth, test route guard)

### PRA-080: Concurrent Operation Safety
- **Priority:** P0
- **Scope:** Simultaneous operations don't corrupt data
- **Check:** Two POS devices selling same product simultaneously → stock never goes negative (stock cap), two users editing same product → no silent overwrite, GRN receive idempotency key prevents double-stock (FIX-008)
- **Status:** DONE — PR #268, 3 findings fixed (advisory lock for stock-in, FOR UPDATE on stock set, CHECK constraint on legacy table)

---

## Part F: API Gateway + Backend Infrastructure Audit (PRA-081 → PRA-090)

### PRA-081: Audit Gateway Route Mapping Completeness
- **Priority:** P0
- **Scope:** Every frontend API call has corresponding gateway route → backend handler
- **Files:** `backend/services/api-gateway/src/config.ts`, `backend/services/api-gateway/src/routes/proxy.ts`
- **Check:** Map every portal/POS API call to its gateway route → backend handler → DB query. No dead routes, no missing routes.
- **Status:** DONE — PR #272, fixed POS chatApi.ts missing /api/v1 prefix on all 8 chat endpoints

### PRA-082: Audit Gateway Auth Enforcement
- **Priority:** P0
- **Scope:** JWT required on all protected routes, public routes correctly open
- **Files:** `backend/services/api-gateway/src/middleware/jwtAuth.ts`, `backend/services/api-gateway/src/middleware/adminAuth.ts`
- **Check:** Protected routes reject requests without valid JWT, public routes (auth, registration, webhooks) accessible without token, admin routes require admin session/master token, correlation ID injected on every request
- **Status:** DONE — PR #273, added /api/v1/chat and /api/v1/credit to JWT_REQUIRED_PREFIXES

### PRA-083: Audit Gateway Rate Limiting
- **Priority:** P1
- **Scope:** General 30/min, auth 5/min, endpoint-specific limits
- **Files:** `backend/services/api-gateway/src/middleware/rateLimiter.ts`
- **Check:** General rate limit enforced, auth endpoint limit stricter, supplier CSV upload limit (FIX-010 verified), rate limit headers returned
- **Status:** PENDING

### PRA-084: Audit Database Migrations (141→159)
- **Priority:** P0
- **Scope:** All 18 new migrations apply cleanly, especially 149 (RLS on 27 tables)
- **Files:** `backend/migrations/`
- **Check:** Migrations apply in order, rollback possible, RLS policies correct, indexes created (FIX-011 refresh_tokens), backup taken before migration 149
- **Status:** DONE — PR #274, fixed migration 160 idempotency + migration 161 adds RLS to 8 missed tables

### PRA-085: Audit Backend Error Handling Chain
- **Priority:** P1
- **Scope:** Backend errors → gateway → frontend → user-friendly message
- **Check:** 400 validation errors return structured JSON, 401 triggers refresh/logout, 403 shown as permission error, 404 on missing resource, 500 logged with correlation ID but not leaked to client, no empty catch blocks (FIX-014 verified)
- **Status:** PENDING

### PRA-086: Audit Backend Transaction Safety
- **Priority:** P0
- **Scope:** Multi-write operations wrapped in transactions
- **Check:** Stock update uses transaction (FIX-007 verified), GRN receive uses transaction + idempotency (FIX-008 verified), sale creation atomic, no partial writes possible
- **Status:** DONE — PR #270, wrapped 4 multi-write operations in transactions (order delete, doc upload, doc verify/reject, app reject)

### PRA-087: Audit Backend Store Isolation Queries
- **Priority:** P0
- **Scope:** Every UPDATE/DELETE includes store_id WHERE clause
- **Check:** All store-scoped UPDATE queries include `AND store_id` (FIX-005 + FIX-006 verified), no cross-store data leaks possible
- **Status:** DONE — PR #271, added store_id EXISTS subquery to order child-table DELETEs

### PRA-088: Audit Backend CORS + Security Headers
- **Priority:** P1
- **Scope:** CORS origin whitelist, CSP headers, HTTPS enforcement
- **Check:** CORS allows only production domains, CSP meta tag on SuperAdmin (FIX-063 verified), HTTPS enforced in production API base URLs (FIX-019 verified)
- **Status:** PENDING

### PRA-089: Audit Backend Secrets + Environment Variables
- **Priority:** P0
- **Scope:** All 9+ secrets in GCP Secret Manager, graceful handling when missing
- **Check:** database-url, postgres-password, jwt-secret, admin-token, smtp-password, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET all exist, code gracefully handles missing optional vars (FIX-002 verified)
- **Status:** DONE — PR #275, fixed timing-safe comparison in 3 payout webhook endpoints

### PRA-090: Audit Cloud Run Service Deployment Config
- **Priority:** P0
- **Scope:** 6 services match GCP names, deploy order correct, health checks pass
- **Check:** Service names exactly: `main-backend`, `api-gateway`, `retailer-admin`, `supplier-portal`, `superadmin`, `landing` (HL-006), deploy order: main-backend → api-gateway → portals parallel (HL-008), health endpoints respond 200
- **Status:** DONE — PR #276, added HEALTHCHECK to main-backend Dockerfile + fixed supplier-portal port

---

## Execution Summary

| Part | Range | Count | P0 | P1 | P2 |
|------|-------|-------|----|----|------|
| A: Retailer Admin | PRA-001 → PRA-015 | 15 | 4 | 8 | 3 |
| B: Supplier Portal | PRA-016 → PRA-028 | 13 | 4 | 6 | 3 |
| C: SuperAdmin | PRA-029 → PRA-044 | 16 | 4 | 8 | 4 |
| D: POS App | PRA-045 → PRA-065 | 21 | 6 | 11 | 4 |
| E: Cross-Function | PRA-066 → PRA-080 | 15 | 7 | 6 | 2 |
| F: Gateway + Backend | PRA-081 → PRA-090 | 10 | 6 | 3 | 1 |
| **TOTAL** | **PRA-001 → PRA-090** | **90** | **31** | **42** | **17** |

## Execution Order

```
Wave 1 (P0 Blockers):  PRA-078→080 (isolation/auth/concurrency safety)
Wave 2 (P0 Infra):     PRA-081→082, PRA-084, PRA-086→087, PRA-089→090
Wave 3 (P0 Auth):      PRA-001, PRA-016, PRA-029, PRA-045, PRA-079
Wave 4 (P0 Core):      PRA-002→003, PRA-017→018, PRA-030→032, PRA-046→049, PRA-063
Wave 5 (P0 Cross):     PRA-066→071
Wave 6 (P1 Features):  PRA-004→009, PRA-019→024, PRA-033→041, PRA-050→057
Wave 7 (P1 Cross):     PRA-072→077
Wave 8 (P1 Infra):     PRA-083, PRA-085, PRA-088
Wave 9 (P2 Polish):    PRA-010→015, PRA-025→028, PRA-042→044, PRA-058→062, PRA-064→065

Gate after each wave: pnpm -r typecheck && relevant builds pass
```

## Git Discipline Rules (Non-Negotiable)

1. **One ticket = one branch = one PR = one tag** — NEVER bundle
2. **Branch naming:** `fix/PRA-XXX-slug` from clean main
3. **Commit format:** `fix(PRA-XXX): description`
4. **Tag format:** `prestage-PRA-XXX-YYYY-MM-DD_HHMMIST` after merge
5. **PR before merge:** Even in Mode A (self-merge), always create PR
6. **No direct push to main:** Always via branch → PR → merge
7. **No --force, --no-verify, --hard:** Never
8. **Sequential execution:** Next ticket ONLY after current PR merged + tagged
9. **State file update:** Update `CLAUDE_CURRENT_STATE.json` after every ticket
10. **This file update:** Mark ticket DONE in this file after every ticket
