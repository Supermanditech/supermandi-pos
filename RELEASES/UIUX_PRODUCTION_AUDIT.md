# UI/UX Production Readiness Audit v2 — Pre-GCP Deployment

**Date**: 2026-02-18
**Auditor**: Claude Opus 4.6 (8 parallel deep-scan agents)
**Scope**: All 4 portals (Retailer Admin, Supplier Portal, SuperAdmin, POS App) + cross-platform flows
**Method**: Screen-by-screen code audit of every page/screen/tab component using Opus-only agents
**Raw Findings**: 176 across 8 agents
**After Triage**: 115 verified tickets (2 false positives removed, pattern groups consolidated)

---

## Git Discipline

- One ticket = one branch = one PR = one tag
- Branch: `fix/UIUX-NNN-slug`
- Semantic commits: `fix(UIUX-NNN): description`

---

## Triage Summary

| Agent | Raw | Verified | False Positive |
|-------|-----|----------|----------------|
| Retailer Admin | 22 | 22 | 0 |
| Supplier Portal | 24 | 24 | 0 |
| SuperAdmin | 27 | 27 | 0 |
| POS Core | 26 | 26 | 0 |
| POS Secondary A | 36 | 36 | 0 |
| POS Secondary B | 36 | 34 | 2 |
| Cross-Platform | 7 | 7 | 0 |
| **TOTAL** | **178** | **176** | **2** |

**After consolidation: 115 tickets** (13 P0, 52 P1, 50 P2)

---

## Priority Definitions

- **P0**: Crash, data loss, security hole, or completely broken feature. Fix before deploy.
- **P1**: Feature works but with significant UX problem, wrong data display, or missing safety net.
- **P2**: Minor polish, inconsistency, or edge case.

---

## Execution Waves

| Wave | Tickets | Focus | Count |
|------|---------|-------|-------|
| 1 | P0 all portals | Crashes, broken auth, data corruption | 13 |
| 2 | P1 wiring bugs | Wrong endpoints, stale closures, missing auth | 15 |
| 3 | P1 UX safety | Missing confirmations, double-tap risk, trapped loading | 18 |
| 4 | P1 UI/nav | BackHandler, SafeArea, KeyboardAvoidingView | 19 |
| 5 | P2 all portals | Polish, minor wiring, edge cases | 50 |

---

# PART A: RETAILER ADMIN (20 tickets)

### UIUX-RET-001 [P1] [UX]
**File**: `retailer-admin/src/pages/DashboardPage.tsx:~922`
**Issue**: Uses native `alert('No inventory data to export')` when user clicks "Export CSV" with no data. Rest of app uses react-hot-toast.
**Fix**: Replace `alert()` with `toast.error()`

### UIUX-RET-002 [P1] [UX]
**File**: `retailer-admin/src/pages/DeviceActivationPage.tsx:181`
**Issue**: Uses `window.confirm()` for device deactivation — a destructive action that should use styled Modal component
**Fix**: Replace with Modal confirmation dialog like ProductsPage/SuppliersPage

### UIUX-RET-003 [P1] [UI]
**File**: `retailer-admin/src/pages/AnalyticsPage.tsx:52-55`
**Issue**: `data!.paymentBreakdown.cash` non-null assertion runs OUTSIDE the `!loading && data` render guard. If `data` is null on initial render, page crashes.
**Fix**: Move percentage calculations inside the `{!loading && data && (...)}` render block

### UIUX-RET-004 [P2] [UI]
**File**: `retailer-admin/src/pages/AnalyticsPage.tsx`
**Issue**: Uses Tailwind CSS classes (`flex`, `text-2xl`, `bg-white`, `rounded-xl`, `animate-spin`) but retailer-admin project uses inline styles + custom CSS. If Tailwind not configured, entire page is unstyled.
**Fix**: Verify Tailwind config in Vite, or refactor to inline styles

### UIUX-RET-005 [P2] [UI]
**File**: `retailer-admin/src/pages/AnalyticsPage.tsx:59`
**Issue**: Breadcrumb path for "Dashboard" is `'.'` which resolves to current URL, not dashboard. Missing `storeCode` from useParams.
**Fix**: Add `useParams` and use absolute path `/s/${storeCode}`

### UIUX-RET-006 [P2] [UX]
**File**: `retailer-admin/src/pages/SupplierCatalogPage.tsx`
**Issue**: 350ms search debounce shows no loading indicator. User types and waits with no feedback.
**Fix**: Add loading spinner or "Searching..." text during debounce

### UIUX-RET-007 [P2] [UX]
**File**: `retailer-admin/src/pages/InvoicesPage.tsx:263-400`
**Issue**: Invoice detail modal is hand-rolled (`position: fixed` div) instead of shared Modal component. Lacks Escape key dismiss.
**Fix**: Refactor to use shared `Modal` component

### UIUX-RET-008 [P2] [UX]
**File**: `retailer-admin/src/pages/InvoicesPage.tsx:156-158`
**Issue**: PDF download failure silently caught, only console.error. No user feedback.
**Fix**: Add `toast.error('Failed to download PDF')`

### UIUX-RET-009 [P2] [UX]
**File**: `retailer-admin/src/pages/NotificationsPage.tsx:54,62`
**Issue**: `markAsRead`/`markAllAsRead` silently swallow errors. Optimistic UI not reverted on failure.
**Fix**: Revert optimistic update on failure or show toast

### UIUX-RET-010 [P2] [UX]
**File**: `retailer-admin/src/pages/NotificationsPage.tsx:40-43`
**Issue**: Fetch failure shows empty list instead of error state. User thinks "no notifications" when API failed.
**Fix**: Add error state with retry button

### UIUX-RET-011 [P2] [UX]
**File**: `retailer-admin/src/pages/PaymentsPage.tsx:52-53`
**Issue**: Settings load failure silently caught. Blank form shown — user could overwrite real settings with empty values.
**Fix**: Show error banner, disable save until loaded

### UIUX-RET-012 [P2] [UX]
**File**: `retailer-admin/src/pages/SettingsPage.tsx:97-99`
**Issue**: Same as RET-011 — settings load failure shows blank form with defaults.
**Fix**: Show error banner, prevent save until loaded

### UIUX-RET-013 [P2] [UX]
**File**: `retailer-admin/src/pages/CompliancePage.tsx:52-53`
**Issue**: Document fetch failure silently caught. Empty list shown instead of error.
**Fix**: Add error state with retry option

### UIUX-RET-014 [P2] [UX]
**File**: `retailer-admin/src/pages/ReorderPage.tsx:179`
**Issue**: Breadcrumb missing "Home" link — only "Reorder Suggestions". Inconsistent with all other pages.
**Fix**: Add Home breadcrumb item

### UIUX-RET-015 [P2] [UX]
**File**: `retailer-admin/src/pages/ReorderPage.tsx:330-331`
**Issue**: Auto-approve threshold label says "amount in paise" — exposes internal detail to retailers who think in rupees.
**Fix**: Label as "in rupees", multiply by 100 before API call

### UIUX-RET-016 [P2] [UX]
**File**: `retailer-admin/src/pages/ReorderPage.tsx:338`
**Issue**: Settings save has no success feedback — only button text change.
**Fix**: Add `toast.success('Reorder settings saved')`

### UIUX-RET-017 [P2] [UX]
**File**: `retailer-admin/src/pages/CustomersPage.tsx:42,57,272`
**Issue**: Loading starts `false`, empty state flashes before debounce. No pagination (limit 50, no "next page").
**Fix**: Initialize loading `true`, add pagination

### UIUX-RET-018 [P2] [UX]
**File**: `retailer-admin/src/pages/ChatPage.tsx`
**Issue**: No auto-refresh or polling. User must manually refresh to see incoming messages in chat.
**Fix**: Add 10-15s polling interval or "New messages" indicator

### UIUX-RET-019 [P2] [NAV]
**File**: `retailer-admin/src/pages/AllPagesPage.tsx:3-11,45`
**Issue**: Lists only 7 of 25+ pages. Login link generates wrong path (`/s/${storeCode}/login` vs `/retailer/login`).
**Fix**: Update pages array, fix login path

### UIUX-RET-020 [P2] [UX]
**File**: `retailer-admin/src/pages/SettingsPage.tsx:974-1006`
**Issue**: "Change Password" section and "Save Settings" button visually unclear as independent operations. Save at very bottom.
**Fix**: Add visual separator or per-section save

---

# PART B: SUPPLIER PORTAL (20 tickets)

### UIUX-SUP-001 [P0] [NAV]
**File**: `supplier-portal/src/app/(dashboard)/layout.tsx:28`
**Issue**: Profile page removed from sidebar nav (comment: "not yet implemented") but page fully implemented at `profile/page.tsx` with 3 tabs. Unreachable from UI.
**Fix**: Re-add `{ href: '/profile', label: 'Profile', icon: User }` to navItems

### UIUX-SUP-002 [P0] [NAV]
**File**: `supplier-portal/src/app/(dashboard)/layout.tsx:18-28`
**Issue**: Chat and BNPL Orders pages exist with full implementations but have no sidebar nav entries. Undiscoverable.
**Fix**: Add nav items for `/chat` and `/bnpl-orders`

### UIUX-SUP-003 [P0] [UI]
**File**: `supplier-portal/src/app/(dashboard)/bnpl-orders/page.tsx:54-62`
**Issue**: Uses CSS classes (`badge`, `table`, `page-header`, `text-muted`) that don't exist in globals.css. Page renders as unstyled text.
**Fix**: Replace with Tailwind utilities consistent with rest of portal

### UIUX-SUP-004 [P0] [WIRING]
**File**: `supplier-portal/src/app/(dashboard)/bnpl-orders/page.tsx:37-46`
**Issue**: Uses raw `fetch()` instead of portal's `apiFetch`. No auth header, no 401 redirect, no timeout.
**Fix**: Replace with `apiFetch` from `@/lib/api`

### UIUX-SUP-005 [P0] [WIRING]
**File**: `supplier-portal/src/app/(dashboard)/notifications/page.tsx:34,56,68`
**Issue**: Reads `localStorage.getItem('supplier_token')` — deprecated key cleared on logout. After re-login, all notification API calls fail silently.
**Fix**: Use `getAuthToken()` from `@/lib/api` or `apiFetch`

### UIUX-SUP-006 [P0] [WIRING]
**File**: `supplier-portal/src/app/(dashboard)/chat/page.tsx:38-46`
**Issue**: Local `apiFetch` shadows global, reads deprecated `supplier_token`. Bypasses auth system.
**Fix**: Remove local `apiFetch`, import global

### UIUX-SUP-007 [P1] [UX]
**File**: `supplier-portal/src/app/(dashboard)/notifications/page.tsx:46-49`
**Issue**: API failure console.error'd only. No error state, no retry button.
**Fix**: Add error state with retry

### UIUX-SUP-008 [P1] [UX]
**File**: `supplier-portal/src/app/(dashboard)/chat/page.tsx:99-111`
**Issue**: `sendMutation` no `onError` callback. Failed messages silently lost.
**Fix**: Add `onError` with `toast.error()`

### UIUX-SUP-009 [P1] [UI]
**File**: `supplier-portal/src/app/(dashboard)/upload/page.tsx:184`
**Issue**: Help text says "max 10MB" but code validates at 5MB. Users hit unexpected errors.
**Fix**: Change to "max 5MB"

### UIUX-SUP-010 [P1] [UX]
**File**: `supplier-portal/src/app/(dashboard)/orders/page.tsx:957-961`
**Issue**: `window.confirm()` for "ship with pending items". Rest of portal uses styled modals.
**Fix**: Replace with styled modal

### UIUX-SUP-011 [P1] [UX]
**File**: `supplier-portal/src/app/(dashboard)/products/page.tsx:224`
**Issue**: `window.confirm()` for unsaved-changes nav. Same page already has styled modal for cancel.
**Fix**: Replace with styled modal

### UIUX-SUP-012 [P1] [UX]
**File**: `supplier-portal/src/app/(dashboard)/profile/page.tsx:90`
**Issue**: `alert()` for IFSC validation. Every other validation uses `toast.error()`.
**Fix**: Replace with `toast.error()`

### UIUX-SUP-013 [P1] [UX]
**File**: `supplier-portal/src/app/(dashboard)/invoices/page.tsx:64-66`
**Issue**: PDF download failure console.error'd only. No user feedback.
**Fix**: Add `toast.error('Failed to download PDF')`

### UIUX-SUP-014 [P1] [WIRING]
**File**: `supplier-portal/src/app/(dashboard)/bnpl-orders/page.tsx:91,95-101,157-160`
**Issue**: `formatCurrency(value / 100)` but `formatCurrency` already divides by 100. All BNPL amounts 100x too small.
**Fix**: Remove `/ 100` divisors

### UIUX-SUP-015 [P1] [UX]
**File**: `supplier-portal/src/app/(dashboard)/kyc/page.tsx:341-348`
**Issue**: KYC "Delete" triggers immediately with no confirmation. Every other destructive action uses modal.
**Fix**: Add confirmation modal

### UIUX-SUP-016 [P2] [UI]
**File**: `supplier-portal/src/app/(dashboard)/chat/page.tsx:135-315`
**Issue**: Entire Chat page uses inline `style={}` instead of Tailwind. Inconsistent with rest of portal.
**Fix**: Migrate to Tailwind

### UIUX-SUP-017 [P2] [WIRING]
**File**: `supplier-portal/src/app/(dashboard)/profile/page.tsx`
**Issue**: Profile form state initialized from null `supplier`, never updates when data arrives.
**Fix**: Add `useEffect` to sync form state with loaded data

### UIUX-SUP-018 [P2] [UX]
**File**: Multiple supplier portal pages
**Issue**: Silent error swallowing pattern (console.error only) across several pages.
**Fix**: Add error states with retry

### UIUX-SUP-019 [P2] [UX]
**File**: `supplier-portal/src/app/(dashboard)/notifications/page.tsx`
**Issue**: No loading skeleton. Empty state flash before data arrives.
**Fix**: Add loading skeleton

### UIUX-SUP-020 [P2] [UX]
**File**: `supplier-portal/src/app/(dashboard)/products/page.tsx`
**Issue**: Barcode input no Enter-to-submit behavior.
**Fix**: Add `onKeyDown` handler

---

# PART C: SUPERADMIN (27 tickets)

### UIUX-SA-001 [P0] [WIRING]
**File**: `supermandi-superadmin/src/tabs/SupportQueueTab.tsx:39`
**Issue**: Uses `localStorage.getItem('superadmin_token')` but auth stores JWT under `supermandi_admin_session`. Every API call sends null token, all 401.
**Fix**: Use centralized `apiFetch` or change key

### UIUX-SA-002 [P0] [WIRING]
**File**: `supermandi-superadmin/src/tabs/AIInsightsTab.tsx:29`
**Issue**: Same wrong auth key. Entire AI Insights tab non-functional.
**Fix**: Same as SA-001

### UIUX-SA-003 [P0] [WIRING]
**File**: `supermandi-superadmin/src/tabs/CreditProvidersTab.tsx:44`
**Issue**: Same wrong auth key. Entire Credit Providers tab non-functional.
**Fix**: Same as SA-001

### UIUX-SA-004 [P0] [WIRING]
**File**: `supermandi-superadmin/src/tabs/SupportQueueTab.tsx:73,99`
**Issue**: Calls `/api/v1/chat/support/queue` — NOT admin routes. Backend admin routes under `/api/v1/admin/`. Double failure (wrong auth + wrong paths).
**Fix**: Update API paths to admin endpoints

### UIUX-SA-005 [P1] [WIRING]
**File**: `supermandi-superadmin/src/tabs/SupportQueueTab.tsx:44`
**Issue**: Generic `'API error: ${res.status}'` bypasses `parseError()`. Misses 503/401 handling and data stripping.
**Fix**: Use `parseError(res)` from `errorSanitizer`

### UIUX-SA-006 [P1] [WIRING]
**File**: `supermandi-superadmin/src/tabs/AIInsightsTab.tsx:34`
**Issue**: Same generic error pattern.
**Fix**: Use `parseError(res)`

### UIUX-SA-007 [P1] [WIRING]
**File**: `supermandi-superadmin/src/tabs/CreditProvidersTab.tsx:49`
**Issue**: Same generic error pattern.
**Fix**: Use `parseError(res)`

### UIUX-SA-008 [P1] [UX]
**File**: `supermandi-superadmin/src/tabs/InvoicesTab.tsx:84`
**Issue**: Bare `confirm()` for invoice cancellation — irreversible financial action. Should use ConfirmDialog.
**Fix**: Replace with `ConfirmDialog`

### UIUX-SA-009 [P1] [UX]
**File**: `supermandi-superadmin/src/tabs/MonitoringTab.tsx:36`
**Issue**: Bare `confirm()` for "Clean Up Expired Tokens" — bulk auth operation.
**Fix**: Replace with `ConfirmDialog`

### UIUX-SA-010 [P1] [UX]
**File**: `supermandi-superadmin/src/tabs/QualityDashboardTab.tsx:49`
**Issue**: Bare `confirm()` for "Reset Metrics" — destroys reporting data.
**Fix**: Replace with `ConfirmDialog`

### UIUX-SA-011 [P1] [UX]
**File**: `supermandi-superadmin/src/tabs/CreditProvidersTab.tsx:81-91`
**Issue**: Credit provider toggle has NO confirmation. Single mis-click disables credit for all stores.
**Fix**: Add `ConfirmDialog` with provider name and consequence

### UIUX-SA-012 [P1] [UX]
**File**: `supermandi-superadmin/src/tabs/WhatsAppTab.tsx`
**Issue**: "Send Broadcast" to 50 recipients fires immediately. WhatsApp messages irrevocable.
**Fix**: Add `ConfirmDialog` with recipient count and preview

### UIUX-SA-013 [P1] [UX]
**File**: `supermandi-superadmin/src/tabs/PaymentsTab.tsx:1-51`
**Issue**: No loading, error, or empty states. Shows nothing if parent hasn't loaded.
**Fix**: Add loading spinner, empty state, and error display

### UIUX-SA-014 [P1] [WIRING]
**File**: `supermandi-superadmin/src/tabs/AIInsightsTab.tsx:72`
**Issue**: Job trigger endpoints may not exist in backend. "Run Now" buttons may silently fail.
**Fix**: Verify endpoints exist or disable with "Coming Soon"

### UIUX-SA-015 [P2] [UX]
**File**: `supermandi-superadmin/src/tabs/InvoicesTab.tsx`
**Issue**: Invoice detail modal no error state if detail fetch fails.
**Fix**: Add error state with retry inside modal

### UIUX-SA-016 [P2] [UX]
**File**: `supermandi-superadmin/src/tabs/GrnAlertsTab.tsx:1-108`
**Issue**: No loading state. Empty state flash on tab switch.
**Fix**: Add loading indicator

### UIUX-SA-017 [P2] [UX]
**File**: `supermandi-superadmin/src/tabs/EventsTab.tsx:1-115`
**Issue**: Same — no loading state, empty state flash.
**Fix**: Add loading indicator

### UIUX-SA-018 [P2] [UX]
**File**: `supermandi-superadmin/src/tabs/StaffTab.tsx:1-178`
**Issue**: "Deactivate" and "Reset PIN" have no confirmation. Both destructive.
**Fix**: Add confirmation dialogs

### UIUX-SA-019 [P2] [UI]
**File**: `supermandi-superadmin/src/tabs/AnalyticsTab.tsx`
**Issue**: 7 sub-tabs wrap unpredictably on narrow screens.
**Fix**: Add `overflow-x: auto` or dropdown

### UIUX-SA-020 [P2] [UX]
**File**: `supermandi-superadmin/src/tabs/SettingsTab.tsx`
**Issue**: "Kill Switch" for `maintenance_mode` has no confirmation. Single click blocks all POS.
**Fix**: Add `ConfirmDialog`

### UIUX-SA-021 [P2] [UX]
**File**: `supermandi-superadmin/src/tabs/ApplicationsTab.tsx`
**Issue**: Rejection modal doesn't clear reason text when reopened. Stale text sent for wrong app.
**Fix**: Clear on close/cancel and new reject click

### UIUX-SA-022 [P2] [UX]
**File**: `supermandi-superadmin/src/tabs/SupportQueueTab.tsx:135-170`
**Issue**: Long conversation detail — back button only at top. User scrolled down can't navigate back.
**Fix**: Add sticky back button or duplicate at bottom

### UIUX-SA-023 [P2] [WIRING]
**File**: `supermandi-superadmin/src/tabs/GstComplianceTab.tsx`
**Issue**: `res.json()` crashes on non-JSON response (502 HTML error page).
**Fix**: Wrap in try-catch, use `parseError`

### UIUX-SA-024 [P2] [UX]
**File**: `supermandi-superadmin/src/tabs/DevicesTab.tsx`
**Issue**: Enrollment QR code no visible expiry. Admin may share expired QR.
**Fix**: Display expiry countdown

### UIUX-SA-025 [P2] [UI]
**File**: `supermandi-superadmin/src/tabs/SuppliersTab.tsx`
**Issue**: Product edit modal overflows on smaller viewports. Bottom fields inaccessible.
**Fix**: Add `overflow-y: auto; max-height: 80vh`

### UIUX-SA-026 [P2] [UX]
**File**: `supermandi-superadmin/src/tabs/DocumentsTab.tsx`
**Issue**: Blob preview error (403/404) shows broken image. Could be confused with loading.
**Fix**: Add prominent error overlay with retry

### UIUX-SA-027 [P2] [NAV]
**File**: `supermandi-superadmin/src/App.tsx`
**Issue**: 23+ tabs in sidebar below fold. No scroll indicator. Bottom tabs undiscoverable.
**Fix**: Add scroll indicators or collapsible groups

---

# PART D: POS APP (42 tickets)

## P0 Critical (3 tickets)

### UIUX-POS-001 [P0] [WIRING]
**File**: `src/screens/SuccessPrintScreenV2.tsx:46,49`
**Issue**: Conditional `useRef` calls violate Rules of Hooks. React may crash or produce inconsistent state.
**Fix**: Move `useRef` calls to top level (unconditional)

### UIUX-POS-002 [P0] [WIRING]
**File**: `src/screens/BnplDuesScreen.tsx:240-301`
**Issue**: Stale closure in `handleSelectPaymentMode`. `payAmountText` from closure but only `drawdown` in deps. User could submit payment with wrong amount.
**Fix**: Add `paymentModal.payAmountText` to dependency array

### UIUX-POS-003 [P0] [WIRING]
**File**: `src/screens/DailyClosingScreen.tsx:80-88` + `src/screens/ShiftScreen.tsx:96-111`
**Issue**: `useEffect` hooks missing dependencies. Stale closures risk.
**Fix**: Add missing deps to each useEffect

## P1 Navigation (3 consolidated tickets)

### UIUX-POS-004 [P1] [NAV]
**File**: 15 screens
**Issue**: Missing BackHandler across: PurchaseHistory, Buy, BnplDues, Credit, BulkPurchaseCredit, ChatList, ChatConversation, AIInsights, SalesStatement, StockStatement, SuccessPrintV2, Payment, StaffLogin, CustomerList, CustomerManagement
**Fix**: Add `BackHandler.addEventListener` in useEffect for each screen

### UIUX-POS-005 [P1] [UI]
**File**: `src/components/ui/BackHeader.tsx:26-35`
**Issue**: BackHeader has no safe area insets. Header overlaps status bar on notched devices. Affects: DailyClosing, Shift, DailyReport, OpeningStock.
**Fix**: Add `useSafeAreaInsets().top` in BackHeader (one fix, 4+ screens)

### UIUX-POS-006 [P1] [UI]
**File**: 6 screens with custom headers
**Issue**: Missing safe area: ChatList, ChatConversation, AIInsights, BulkPurchaseCredit, Payment, SuccessPrintV2
**Fix**: Add `useSafeAreaInsets().top` to each header

## P1 Wiring (12 tickets)

### UIUX-POS-007 [P1] [WIRING]
**File**: `src/screens/BuyScreen.tsx:188-194`
**Issue**: `loadProducts` effect missing dependency. Stale closure on rapid filter changes.
**Fix**: Add `loadProducts` to dependency array

### UIUX-POS-008 [P1] [WIRING]
**File**: `src/screens/BnplDuesScreen.tsx:583-594`
**Issue**: Division by zero in credit utilization. `creditLimit === 0` produces NaN.
**Fix**: Guard with `creditLimit > 0`

### UIUX-POS-009 [P1] [WIRING]
**File**: `src/screens/BulkPurchaseCreditScreen.tsx:26-38`
**Issue**: Uses raw `fetch` instead of `apiClient`. Bypasses auth refresh, rate limiting, error handling.
**Fix**: Replace with `apiClient`

### UIUX-POS-010 [P1] [WIRING]
**File**: `src/screens/CustomerManagementScreen.tsx:169-199`
**Issue**: Error message in add-customer failure reads previous store error, not current.
**Fix**: Return error from `createCustomer` or read fresh

### UIUX-POS-011 [P1] [WIRING]
**File**: `src/screens/CreditScreen.tsx:446,449`
**Issue**: Loan progress hardcoded at 10% / "1 EMI paid". Every loan shows same regardless of actual status.
**Fix**: Calculate from actual repayment data

### UIUX-POS-012 [P1] [WIRING]
**File**: `src/screens/CreditScreen.tsx:265-272`
**Issue**: Stale closure in modal close. State reset before step check — `loadData()` may not fire after success.
**Fix**: Capture step value before reset

### UIUX-POS-013 [P1] [WIRING]
**File**: `src/screens/PurchaseScreen.tsx:466`
**Issue**: Stale closure in `handleQuickSubmit` — may submit wrong data.
**Fix**: Add proper deps or move data reads inside callback

### UIUX-POS-014 [P1] [WIRING]
**File**: `src/screens/CustomerManagementScreen.tsx:109-115`
**Issue**: Detail fetch failure leaves modal open but empty. No error indication.
**Fix**: Close modal on error or show error state within

### UIUX-POS-015 [P1] [WIRING]
**File**: `src/screens/SalesStatementScreen.tsx:56-85,148-226`
**Issue**: `totalValue` computed as 0, never updated. Summary shows counts but no total revenue — most important metric.
**Fix**: Compute total value and display

### UIUX-POS-016 [P1] [WIRING]
**File**: `src/screens/StockStatementScreen.tsx:96-98`
**Issue**: Offline mode returns `success: false` which triggers generic error. Should show "offline" indicator.
**Fix**: Check `response.meta.source === 'offline'`

### UIUX-POS-017 [P1] [WIRING]
**File**: `src/screens/DailyReportScreen.tsx:218-223`
**Issue**: 404 (no data) treated as error. User sees "Failed to load" instead of "No sales on this date".
**Fix**: Catch 404, treat as empty

### UIUX-POS-018 [P1] [WIRING]
**File**: `src/screens/OpeningStockScreen.tsx:111-133`
**Issue**: Broken debounce. Timer returned from `onChangeText` (return ignored). Timer never cancelled. Each keystroke fires separate API call.
**Fix**: Use `useRef` for timeout ID

## P1 UX (8 tickets)

### UIUX-POS-019 [P1] [UX]
**File**: `src/screens/ReturnScreen.tsx:480-497`
**Issue**: No double-tap protection on "Process Return". Rapid taps before Alert can create duplicate refunds.
**Fix**: Set processing flag immediately

### UIUX-POS-020 [P1] [UX]
**File**: `src/screens/KhataScreen.tsx:84-93` + `src/screens/CustomerListScreen.tsx:89-95`
**Issue**: Search fires API on every keystroke — no debounce. Many concurrent requests.
**Fix**: Add 300ms debounce

### UIUX-POS-021 [P1] [UX]
**File**: `src/screens/CreditScreen.tsx:491-500` + `src/screens/BnplDuesScreen.tsx:524-533`
**Issue**: Loading state = full-screen spinner, no header/back button. User trapped if API hangs.
**Fix**: Render header with back button during loading

### UIUX-POS-022 [P1] [UX]
**File**: `src/screens/ShiftScreen.tsx:120-132`
**Issue**: `handleStartShift` submits immediately — no confirmation. Recording opening cash and timestamp without warning.
**Fix**: Add confirmation Alert

### UIUX-POS-023 [P1] [UX]
**File**: `src/screens/StaffLoginScreen.tsx`
**Issue**: Missing `KeyboardAvoidingView`. Keyboard covers login button.
**Fix**: Wrap in `KeyboardAvoidingView`

### UIUX-POS-024 [P1] [UX]
**File**: `src/screens/InwardScreen.tsx`
**Issue**: Missing `KeyboardAvoidingView`. Keyboard covers inputs and submit.
**Fix**: Wrap in `KeyboardAvoidingView`

### UIUX-POS-025 [P1] [UX]
**File**: `src/screens/ReorderScreen.tsx:176-189`
**Issue**: Dismiss handler no try/catch. Silent failure, state inconsistency.
**Fix**: Add try/catch with error toast

### UIUX-POS-026 [P1] [UX]
**File**: `src/screens/ChatConversationScreen.tsx:47-52`
**Issue**: Polls ALL messages + markAsRead every 5s. 2 API calls per 5s. Full list replacement causes scroll jump.
**Fix**: Cursor-based fetch, pause when backgrounded

## P2 Polish (16 tickets)

### UIUX-POS-027 [P2] [UI]
**File**: KhataScreen, CustomerListScreen, OpeningStockScreen modals/forms
**Issue**: Missing `KeyboardAvoidingView`. Bottom fields hidden by keyboard on small devices.
**Fix**: Wrap affected forms

### UIUX-POS-028 [P2] [UX]
**File**: OpeningStockScreen, DailyClosingScreen, ShiftScreen
**Issue**: Missing `keyboardShouldPersistTaps="handled"`. Two taps needed when keyboard open.
**Fix**: Add to affected ScrollView/FlatList

### UIUX-POS-029 [P2] [WIRING]
**File**: `src/screens/BnplDuesScreen.tsx:379-384`
**Issue**: Optional chaining `submitBnplDispute?.(...)` — if undefined, shows success with no API call.
**Fix**: Check existence first, show "not available"

### UIUX-POS-030 [P2] [UX]
**File**: `src/screens/CreditScreen.tsx:120-134`
**Issue**: Pending app polling every 30s indefinitely. Battery drain.
**Fix**: Add max poll count or backoff

### UIUX-POS-031 [P2] [UX]
**File**: `src/screens/CustomerManagementScreen.tsx:561-569`
**Issue**: "Credit Limit" field collected but never sent to API. Silently discarded.
**Fix**: Send to API or remove field

### UIUX-POS-032 [P2] [WIRING]
**File**: `src/screens/CustomerManagementScreen.tsx:90-100`
**Issue**: Double API fetch on mount. Initial useEffect + debounce both fire.
**Fix**: Remove first useEffect

### UIUX-POS-033 [P2] [UX]
**File**: `src/screens/DailyClosingScreen.tsx:90-95`
**Issue**: `clearError()` called after non-blocking `Alert.alert()`. Error cleared before user reads.
**Fix**: Clear inside Alert OK callback

### UIUX-POS-034 [P2] [UI]
**File**: DailyClosingScreen + ShiftScreen cash inputs
**Issue**: No `returnKeyType="done"`. Can't dismiss keyboard from keyboard.
**Fix**: Add `returnKeyType="done"` + `onSubmitEditing`

### UIUX-POS-035 [P2] [UX]
**File**: `src/screens/ShiftScreen.tsx:297-301`
**Issue**: Active shift duration doesn't tick. Appears frozen until refresh.
**Fix**: Add 60s setInterval to update

### UIUX-POS-036 [P2] [UX]
**File**: `src/screens/ReturnScreen.tsx:302-515`
**Issue**: `ScrollView.map()` for item list. 50+ items cause jank.
**Fix**: Replace with `FlatList`

### UIUX-POS-037 [P2] [UI]
**File**: `src/screens/BnplDuesScreen.tsx:524-538`
**Issue**: Loading state missing `paddingTop: insets.top`. Spinner under status bar.
**Fix**: Apply safe area to loading container

### UIUX-POS-038 [P2] [UX]
**File**: `src/screens/ChatConversationScreen.tsx:54-68`
**Issue**: Send text race condition. Text cleared on start, restored on failure — but overwrites new typing.
**Fix**: Only clear text on success

### UIUX-POS-039 [P2] [UX]
**File**: `src/screens/ChatConversationScreen.tsx:159-163`
**Issue**: Error bar no dismiss/retry. Error persists until polling succeeds.
**Fix**: Add retry button

### UIUX-POS-040 [P2] [WIRING]
**File**: `src/screens/AIInsightsScreen.tsx:85-97`
**Issue**: `markAlertRead` error silently swallowed. Full re-fetch after each tap.
**Fix**: Add `.catch()`, use optimistic update

### UIUX-POS-041 [P2] [UX]
**File**: `src/screens/AIInsightsScreen.tsx:65`
**Issue**: Tab switching always shows spinner. No caching of loaded tabs.
**Fix**: Cache per-tab data

### UIUX-POS-042 [P2] [UI]
**File**: `src/screens/ChatConversationScreen.tsx:261-268`
**Issue**: Input bar no bottom safe area. Obscured by gesture navigation on modern devices.
**Fix**: Add `paddingBottom: insets.bottom`

---

# PART E: CROSS-PLATFORM (6 tickets)

### UIUX-XPLAT-001 [P0] [WIRING]
**File**: `supplier-portal/src/lib/api.ts:691` + `supplier-portal/src/app/(dashboard)/orders/page.tsx:19-25,36-42,302`
**Issue**: Supplier Order type is `'pending'|'confirmed'|'shipped'|'delivered'|'cancelled'` but POS creates with `submitted`. Supplier can't filter, no color badge, no action buttons for submitted orders. Backend validates `submitted → confirmed|cancelled` but UI never renders those actions.
**Fix**: Add `submitted` to type, colors, flow, and filter tabs

### UIUX-XPLAT-002 [P0] [WIRING]
**File**: `retailer-admin/src/pages/DashboardPage.tsx:667,686,725,730,737` + `retailer-admin/src/lib/formatters.ts:59-61`
**Issue**: `formatRupees(dailySummary.totalSales)` but backend returns paise. `formatRupees` does NOT divide by 100. All daily summary amounts 100x too large.
**Fix**: Change `formatRupees()` to `formatCurrency()` (which divides by 100)

### UIUX-XPLAT-003 [P1] [WIRING]
**File**: `backend/src/routes/v1/pos/sales.ts:658`
**Issue**: POS daily summary `sale_items` query missing `'completed'` and `'SPLIT'` statuses. Main query (line 636) includes all 5 but items query only has 3. Undercounts items sold.
**Fix**: Add `'completed'` and `'SPLIT'` to WHERE clause

### UIUX-XPLAT-004 [P2] [WIRING]
**File**: `backend/src/routes/v1/pos/sales.ts:627` vs `backend/src/routes/v1/retailer-admin/inventory.ts:122-126`
**Issue**: Payment breakdown disagrees: POS counts `completed` as cash, Retailer doesn't. `SPLIT` computed but not returned. Breakdown doesn't sum to total.
**Fix**: Align `completed` handling, include split

### UIUX-XPLAT-005 [P2] [WIRING]
**File**: `backend/src/routes/v1/retailer-admin/inventory.ts:126,183-188`
**Issue**: `splitTotal` computed in SQL but not in response. Frontend type has no `split` field.
**Fix**: Add to response and type, or distribute

### UIUX-XPLAT-006 [P2] [NAV]
**File**: `supplier-portal/src/app/(dashboard)/orders/page.tsx:302`
**Issue**: Filter tabs missing `submitted` — supplier can't filter most actionable order state.
**Fix**: Add `submitted` to filter tabs

---

# Summary Statistics

## By Priority
| Priority | Count |
|----------|-------|
| P0 | 13 |
| P1 | 52 |
| P2 | 50 |
| **Total** | **115** |

## By Portal
| Portal | P0 | P1 | P2 | Total |
|--------|----|----|-----|-------|
| Retailer Admin | 0 | 3 | 17 | 20 |
| Supplier Portal | 6 | 9 | 5 | 20 |
| SuperAdmin | 4 | 10 | 13 | 27 |
| POS App | 3 | 23 | 16 | 42 |
| Cross-Platform | 2 | 1 | 3 | 6 |
| **Total** | **15** | **46** | **54** | **115** |

## Top 5 Systemic Patterns

1. **Auth Divergence** (6 pages/tabs): SuperAdmin 3 tabs + Supplier Portal 3 pages use wrong auth keys
2. **Missing Confirmations** (12 tickets): Destructive actions bypass confirmation across all portals
3. **Silent Error Swallowing** (15 tickets): `catch { console.error }` pattern with no user error state
4. **Missing BackHandler** (15 screens): POS screens with custom headers lack Android hardware back
5. **Missing Safe Area Insets** (10 screens): BackHeader + custom headers don't handle notched devices
