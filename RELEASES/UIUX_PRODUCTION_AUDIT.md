# UI/UX Production Readiness Audit — Pre-GCP Deployment

**Date**: 2026-02-18
**Auditor**: Claude (5 parallel deep-scan agents)
**Scope**: All 4 portals + cross-platform interactions
**Method**: Screen-by-screen code audit of every page component
**Raw Findings**: 122 across 5 agents
**After Triage**: 52 verified tickets (70 false positive / minor / duplicate dropped)

---

## Git Discipline

- One ticket = one branch = one PR = one tag
- Branch: `fix/UIUX-NNN-slug`
- Semantic commits: `fix(UIUX-NNN): description`

---

## Cross-Platform Triage Summary

| Agent | Raw | Real | False Positive | Reason |
|-------|-----|------|----------------|--------|
| Retailer Admin | 25 | 14 | 11 | UX polish P3, already handled, or speculative |
| Supplier Portal | 22 | 11 | 11 | Same patterns as above |
| SuperAdmin | 35 | 13 | 22 | Mostly P3 polish, some speculative |
| POS App | 30 | 12 | 18 | RN patterns already handled, speculative |
| Cross-Platform | 10 | 2 | 8 | Haiku agent missed routes in monolith |
| **TOTAL** | **122** | **52** | **70** | |

---

## PART A: RETAILER ADMIN (14 tickets)

### UIUX-RET-001 [P1_HIGH] [WIRING]
**File**: `retailer-admin/src/pages/admin/SupplierQueuePage.tsx:43`
**Issue**: Path mismatch — frontend calls `/api/v1/retailer-admin/admin/suppliers/pending` but backend admin routes are at `/api/v1/admin/suppliers/*` with `requireAdminToken` auth
**Fix**: Create retailer-admin-scoped admin routes at `/retailer-admin/admin/suppliers/*` using JWT auth + store isolation, OR change frontend to call correct `/admin/` path with admin token

### UIUX-RET-002 [P1_HIGH] [WIRING]
**File**: `retailer-admin/src/pages/admin/ProductQueuePage.tsx:85`
**Issue**: Frontend calls `/api/v1/admin/products/pending` which requires `requireAdminToken` — retailer JWT won't authenticate
**Fix**: Same approach as UIUX-RET-001 — needs store-scoped product approval routes under retailer-admin namespace

### UIUX-RET-003 [P1_HIGH] [UX_GAP]
**File**: `retailer-admin/src/pages/ProductsPage.tsx:167`
**Issue**: Supplier fetch error silently fails — if supplier list API fails, user can create products with no supplier selected, causing confusion later
**Fix**: Display `supplierFetchError` to user with retry button; disable product creation form when suppliers can't load

### UIUX-RET-004 [P1_HIGH] [UX_GAP]
**File**: `retailer-admin/src/pages/ChatPage.tsx:49-52`
**Issue**: No empty state when conversation list is empty — blank screen shown
**Fix**: Add EmptyState component with message "No conversations yet" and icon

### UIUX-RET-005 [P1_HIGH] [UX_GAP]
**File**: `retailer-admin/src/pages/SupplierCatalogPage.tsx:89`
**Issue**: 350ms search debounce shows no loading indicator — user types and waits with no feedback
**Fix**: Add loading spinner or "Searching..." text during debounce interval

### UIUX-RET-006 [P1_HIGH] [UX_GAP]
**File**: `retailer-admin/src/pages/DeviceActivationPage.tsx:181`
**Issue**: Device deactivation uses native `window.confirm()` — inconsistent with styled Modal pattern
**Fix**: Replace with styled Modal confirmation dialog

### UIUX-RET-007 [P1_HIGH] [UX_GAP]
**File**: `retailer-admin/src/pages/InventoryPage.tsx:199`
**Issue**: Refresh button has no loading state during fetch — can be double-clicked
**Fix**: Add disabled state + spinner during refresh

### UIUX-RET-008 [P2_MEDIUM] [UX_GAP]
**File**: `retailer-admin/src/pages/ImportPage.tsx:154`
**Issue**: CSV validation errors truncated after 5 rows — no way to see all errors
**Fix**: Add expand/collapse for full error list or downloadable error report

### UIUX-RET-009 [P2_MEDIUM] [UX_GAP]
**File**: `retailer-admin/src/pages/NotificationsPage.tsx:75`
**Issue**: No visual distinction between read/unread notifications in list
**Fix**: Add bold font weight or highlight color for unread items

### UIUX-RET-010 [P2_MEDIUM] [UX_GAP]
**File**: `retailer-admin/src/pages/InventoryPage.tsx:74`
**Issue**: Date range filters allow end date before start date with no validation
**Fix**: Validate date range and auto-swap or show error

### UIUX-RET-011 [P2_MEDIUM] [UX_GAP]
**File**: `retailer-admin/src/pages/ReconciliationPage.tsx:56`
**Issue**: CSV export gives no success confirmation after download
**Fix**: Show toast notification confirming download

### UIUX-RET-012 [P2_MEDIUM] [UX_GAP]
**File**: `retailer-admin/src/pages/CustomersPage.tsx:47`
**Issue**: Search debounce (350ms) has no loading indicator — same pattern as SupplierCatalog
**Fix**: Add loading feedback during debounce

### UIUX-RET-013 [P2_MEDIUM] [UX_GAP]
**File**: `retailer-admin/src/pages/AnalyticsPage.tsx:48`
**Issue**: Payment breakdown percentages can sum to >100% due to rounding errors
**Fix**: Use floor/remainder pattern to ensure percentages sum to exactly 100%

### UIUX-RET-014 [P2_MEDIUM] [UX_GAP]
**File**: `retailer-admin/src/pages/InvoicesPage.tsx:140`
**Issue**: Invoice detail modal shows "Loading..." text instead of skeleton matching layout
**Fix**: Add skeleton loader matching invoice structure

---

## PART B: SUPPLIER PORTAL (11 tickets)

### UIUX-SUP-001 [P1_HIGH] [WIRING]
**File**: `supplier-portal/src/app/(dashboard)/notifications/page.tsx:34`
**Issue**: Direct `localStorage.getItem('supplier_token')` instead of auth context — breaks auth state management pattern
**Fix**: Use `useAuth()` hook or API layer for token access

### UIUX-SUP-002 [P1_HIGH] [UX_GAP]
**File**: `supplier-portal/src/app/(dashboard)/notifications/page.tsx:37`
**Issue**: Fetch failure silently caught with no error state rendered — page shows nothing
**Fix**: Add error state with retry button

### UIUX-SUP-003 [P1_HIGH] [UX_GAP]
**File**: `supplier-portal/src/app/(dashboard)/invoices/page.tsx:28`
**Issue**: Invoice detail modal shows "Loading..." text without skeleton UI
**Fix**: Add skeleton loader matching modal content structure

### UIUX-SUP-004 [P1_HIGH] [UX_GAP]
**File**: `supplier-portal/src/app/(dashboard)/kyc/page.tsx:329`
**Issue**: Failed upload state only in React state — lost on page reload. User loses context of what failed.
**Fix**: Re-fetch document status from API on mount to restore failed upload indicators

### UIUX-SUP-005 [P1_HIGH] [UX_GAP]
**File**: `supplier-portal/src/app/(dashboard)/earnings/page.tsx:232`
**Issue**: Payout table rows are clickable but have no `cursor-pointer` visual indication
**Fix**: Add cursor-pointer class to clickable rows

### UIUX-SUP-006 [P2_MEDIUM] [UX_GAP]
**File**: `supplier-portal/src/app/(dashboard)/orders/page.tsx:763`
**Issue**: Shipment date allows today but expected delivery can be rejected if also today — confusing validation
**Fix**: Clarify date validation rules; allow same-day expected delivery

### UIUX-SUP-007 [P2_MEDIUM] [UI_BUG]
**File**: `supplier-portal/src/app/(dashboard)/invoices/page.tsx:178`
**Issue**: Modal uses `pt-[5vh]` offset which can cut off content on small mobile viewports
**Fix**: Use responsive padding or max-height that accounts for all viewport sizes

### UIUX-SUP-008 [P2_MEDIUM] [UX_GAP]
**File**: `supplier-portal/src/app/(dashboard)/upload/page.tsx:184`
**Issue**: Help text says "max 10MB" but code validates 5MB limit — text/code mismatch
**Fix**: Update help text to match actual 5MB validation limit

### UIUX-SUP-009 [P2_MEDIUM] [UX_GAP]
**File**: `supplier-portal/src/app/(dashboard)/products/page.tsx:670`
**Issue**: When editing product with existing image, no label distinguishing "current image" vs "new upload"
**Fix**: Add "Current image" / "New image" label in image preview

### UIUX-SUP-010 [P2_MEDIUM] [UX_GAP]
**File**: `supplier-portal/src/app/(dashboard)/orders/page.tsx:860`
**Issue**: Notes section uses text arrows (▼/▶) instead of Lucide icon components — inconsistent
**Fix**: Replace with ChevronDown/ChevronRight lucide-react icons

### UIUX-SUP-011 [P2_MEDIUM] [UX_GAP]
**File**: `supplier-portal/src/app/(dashboard)/kyc/page.tsx:386`
**Issue**: Bank verification completed state shows success but doesn't display which account was verified
**Fix**: Show masked account details (last 4 digits, bank name) in verified state

---

## PART C: SUPERADMIN (13 tickets)

### UIUX-SA-001 [P1_HIGH] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/RegistrationsTab.tsx:217`
**Issue**: Enrollment code send failure shows error banner but no "Retry" button
**Fix**: Add inline retry button in error state

### UIUX-SA-002 [P1_HIGH] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/InvoicesTab.tsx:55`
**Issue**: If invoice detail fetch fails, modal stays open with "Loading invoice..." text indefinitely
**Fix**: Show error state in modal when fetch fails; add close/retry options

### UIUX-SA-003 [P1_HIGH] [WIRING]
**File**: `supermandi-superadmin/src/tabs/CreditProvidersTab.tsx:43`
**Issue**: `apiFetch` shows generic "API error: {status}" for all failures — no user-friendly messages
**Fix**: Map HTTP status codes to user-friendly messages (401 → session expired, 500 → server error, etc.)

### UIUX-SA-004 [P1_HIGH] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/MonitoringTab.tsx:35`
**Issue**: Token cleanup uses `window.confirm()` for destructive action — no undo available
**Fix**: Replace with styled confirmation modal explaining consequences

### UIUX-SA-005 [P2_MEDIUM] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/RefundsTab.tsx:208`
**Issue**: Reject modal doesn't clear rejection reason on close — stale text shows on re-open
**Fix**: Clear `rejectReason` state when modal closes

### UIUX-SA-006 [P2_MEDIUM] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/DocumentsTab.tsx:132`
**Issue**: Modal overlay click closes modal even while user is typing rejection reason — data loss risk
**Fix**: Prevent backdrop close when text input has content, or warn before closing

### UIUX-SA-007 [P2_MEDIUM] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/AIInsightsTab.tsx:201`
**Issue**: AI job execution shows raw JSON response instead of human-readable summary
**Fix**: Parse response and show key metrics/status in formatted view

### UIUX-SA-008 [P2_MEDIUM] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/SuppliersTab.tsx:178`
**Issue**: Batch product rejection modal doesn't show count or list of products being rejected
**Fix**: Show "Rejecting X products" with product names before confirm

### UIUX-SA-009 [P2_MEDIUM] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/AIInsightsTab.tsx:47`
**Issue**: Store ID filter is freetext with no autocomplete or validation — requires exact ID
**Fix**: Add store dropdown or autocomplete with validation

### UIUX-SA-010 [P2_MEDIUM] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/StaffTab.tsx:155`
**Issue**: Reset PIN input has no character counter or real-time validation while typing
**Fix**: Add character count (4-6 digits) and validation indicator

### UIUX-SA-011 [P2_MEDIUM] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/AuditTab.tsx:98`
**Issue**: Date range filter allows From > To with no validation
**Fix**: Validate and prevent invalid ranges

### UIUX-SA-012 [P2_MEDIUM] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/QualityDashboardTab.tsx:133`
**Issue**: Stale data shown while refreshing — no loading overlay or indicator
**Fix**: Show loading overlay or disable interactions during refresh

### UIUX-SA-013 [P2_MEDIUM] [UX_GAP]
**File**: `supermandi-superadmin/src/tabs/SupportQueueTab.tsx:198`
**Issue**: Chat message thread doesn't auto-scroll to bottom on load
**Fix**: Add `scrollToEnd()` on mount and after new messages

---

## PART D: POS APP (12 tickets)

### UIUX-POS-001 [P1_HIGH] [WIRING]
**File**: `src/screens/SuccessPrintScreenV2.tsx:200`
**Issue**: No `BackHandler` listener — hardware back button may navigate to removed Payment screen
**Fix**: Add BackHandler that navigates to SellScan or blocks back

### UIUX-POS-002 [P1_HIGH] [UX_GAP]
**File**: `src/screens/MenuScreen.tsx:306`
**Issue**: Switch store warns about pending sync but not about unsaved cart items — data loss risk
**Fix**: Check cart items count and include in warning dialog

### UIUX-POS-003 [P1_HIGH] [UX_GAP]
**File**: `src/screens/ForceUpdateScreen.tsx:79`
**Issue**: "Check Again" button only re-checks version — no link to app store for actual update
**Fix**: Add "Update from Play Store" button with `Linking.openURL()` to store listing

### UIUX-POS-004 [P1_HIGH] [UX_GAP]
**File**: `src/screens/SuccessPrintScreenV2.tsx:239`
**Issue**: WhatsApp share button shown when offline — will fail silently
**Fix**: Disable WhatsApp button with "Requires internet" message when offline

### UIUX-POS-005 [P2_MEDIUM] [UX_GAP]
**File**: `src/screens/PaymentScreen.tsx:922`
**Issue**: Disabled payment method tabs (UPI offline, etc.) show dim but no reason text
**Fix**: Add tooltip or subtitle explaining why method is unavailable

### UIUX-POS-006 [P2_MEDIUM] [UX_GAP]
**File**: `src/screens/PosRootLayout.tsx:1044`
**Issue**: Camera permission denied shows notice but no path to retry or open device settings
**Fix**: Add button to `Linking.openSettings()` for permission re-grant

### UIUX-POS-007 [P2_MEDIUM] [UX_GAP]
**File**: `src/screens/MenuScreen.tsx:536`
**Issue**: Daily summary loading shows "Loading..." text — layout thrashes when data arrives
**Fix**: Show skeleton grid matching final layout structure

### UIUX-POS-008 [P2_MEDIUM] [UX_GAP]
**File**: `src/screens/MenuScreen.tsx:239`
**Issue**: Test print button has no loading/disabled state — can trigger duplicate prints
**Fix**: Add `printing` state to disable button during print operation

### UIUX-POS-009 [P2_MEDIUM] [UX_GAP]
**File**: `src/screens/SuccessPrintScreenV2.tsx:151`
**Issue**: Phone input for WhatsApp share shows no real-time validation — error only on submit
**Fix**: Add inline validation indicator (checkmark at 10 digits, X otherwise)

### UIUX-POS-010 [P2_MEDIUM] [UX_GAP]
**File**: `src/screens/DeviceBlockedScreen.tsx:56`
**Issue**: No auto-retry or countdown — requires manual "Check Again" taps
**Fix**: Add 30-second auto-retry with countdown timer

### UIUX-POS-011 [P2_MEDIUM] [UX_GAP]
**File**: `src/screens/MenuScreen.tsx:478`
**Issue**: Sync status shows pending count but not what's being synced (bills vs inventory)
**Fix**: Show breakdown by type: "3 bills, 2 inventory updates"

### UIUX-POS-012 [P2_MEDIUM] [UX_GAP]
**File**: `src/screens/SalesHistoryScreen.tsx:104`
**Issue**: Empty state "Make Your First Sale" button navigates to SellScan but from SalesHistory context
**Fix**: Navigate to parent SELL tab instead of SellScan sub-screen

---

## PART E: CROSS-PLATFORM (2 tickets)

### UIUX-XPLAT-001 [P1_HIGH] [WIRING]
**File**: `retailer-admin/src/pages/admin/SupplierQueuePage.tsx:43`
**Backend**: `backend/src/routes/v1/admin/suppliers.ts` (different namespace)
**Issue**: Retailer admin SupplierQueuePage calls `/api/v1/retailer-admin/admin/suppliers/*` but backend supplier admin routes are at `/api/v1/admin/suppliers/*` with `requireAdminToken` — path and auth mismatch
**Fix**: Create store-scoped supplier approval routes under `/retailer-admin/admin/suppliers/*` using JWT auth + store isolation

### UIUX-XPLAT-002 [P1_HIGH] [WIRING]
**File**: `retailer-admin/src/pages/admin/ProductQueuePage.tsx:85`
**Backend**: `backend/src/routes/v1/admin/suppliers.ts:706` (admin namespace)
**Issue**: ProductQueuePage calls `/api/v1/admin/products/*` which requires `requireAdminToken` — retailer JWT won't authenticate against admin middleware
**Fix**: Same as XPLAT-001 — create store-scoped product approval routes under retailer-admin namespace

---

## EXECUTION PLAN

### Wave 1: P1 Wiring Bugs (8 tickets)
UIUX-XPLAT-001, UIUX-XPLAT-002, UIUX-RET-001, UIUX-RET-002,
UIUX-RET-003, UIUX-SUP-001, UIUX-SUP-002, UIUX-POS-001

### Wave 2: P1 UX Gaps (9 tickets)
UIUX-RET-004, UIUX-RET-005, UIUX-RET-006, UIUX-RET-007,
UIUX-SUP-003, UIUX-SUP-004, UIUX-SUP-005,
UIUX-SA-001, UIUX-SA-002

### Wave 3: P1 UX Gaps continued (5 tickets)
UIUX-SA-003, UIUX-SA-004,
UIUX-POS-002, UIUX-POS-003, UIUX-POS-004

### Wave 4: P2 Retailer + Supplier (13 tickets)
UIUX-RET-008 through UIUX-RET-014,
UIUX-SUP-006 through UIUX-SUP-011

### Wave 5: P2 SuperAdmin + POS (17 tickets)
UIUX-SA-005 through UIUX-SA-013,
UIUX-POS-005 through UIUX-POS-012

---

## FALSE POSITIVE LOG (70 dropped)

### Cross-Platform (8 dropped)
- XPLAT-001/009: Device routes exist at `backend/src/routes/v1/retailer-admin/devices.ts`
- XPLAT-004: Chat routes exist at `backend/src/routes/v1/chat.ts`, mounted in index.ts
- XPLAT-005: Analytics routes exist in retailer-admin inventory.ts
- XPLAT-006: Internal setup route — not user-facing
- XPLAT-007: Order lifecycle handled by order-service microservice
- XPLAT-008: 60s CSV timeout is reasonable
- XPLAT-010: Product import routes exist at `retailer-admin/csvImport.ts`

### Retailer (11 dropped)
- Firebase config warning: Firebase handles disabled state already
- Dashboard pagination: Has page X of Y indicator
- Category rename modal: Has close button via Modal component
- PO modal close button: Modal component provides close via actions prop
- Password hints: Only needed on primary field
- Search results z-index: Documented at z-200, sufficient
- OTP expiry styling: Already red + countdown, functional
- Metrics skeleton: Already shows shimmer, acceptable
- Login form guard: Button disabled when Firebase unavailable — sufficient
- Register form guard: Same as login
- Settings save feedback: Success state exists — functional

### Supplier (11 dropped)
- SUP-003: Hardcoded 'en-IN' locale correct for India launch geography
- SUP-009: Delete modal race condition — 15s safeguard is nice-to-have
- SUP-018: OTP expiry text size — functional as-is
- SUP-019: WhatsApp phone sanitization — already checks length
- SUP-020: Status badge unknown status — already has default case
- SUP-021: Category bilingual labels — intended design for India market
- SUP-022: Unread count real-time — updates on refetch, acceptable
- Various minor: Register page upload progress, input focus styling, hamburger positioning, notes scroll

### SuperAdmin (22 dropped)
- Tab label capitalization, service URL format, blob cleanup timing
- QR expiry countdown (has EnrollmentCountdown component)
- Document count no view button (acceptable for admin)
- Provider toggle no confirm (acceptable for admin power users)
- Settings store auto-fetch (manual load is acceptable)
- Filter loading indicators, broadcast dedup, form required markers
- Various other P3 polish items

### POS (18 dropped)
- Cart discard Alert race: Alert is sufficient for normal use
- Payment QR timeout hint: Not user-facing
- Summary error i18n: Has defaultValue fallback
- Bill detail offline: Works with offline queue
- Menu refresh progress: Pull-to-refresh indicator sufficient
- Text overflow: RN handles with flex layout
- Staff session timeout: 35min is generous, no warning needed
- Language persistence: settingsStore has AsyncStorage persistence
- Various: enrollment retry (fields preserved), camera haptics, bill params, stale price warning, offline banner text, tab loading, split payment (handled by PaymentScreen recovery)
