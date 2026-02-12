# SuperMandi Cross-Platform Audit Backlog

> **Generated:** 2026-02-12 | **Total Issues:** 320 | **Audited by:** 5 parallel agents
> **Scope:** Retailer Admin + Supplier Portal + SuperAdmin + POS Mobile + Backend API

---

## Executive Summary

| Portal | Total | P0 | P1 | P2 | P3 |
|--------|-------|----|----|----|----|
| Retailer Admin | 68 | 2 | 19 | 47 | 0 |
| Supplier Portal | 65 | 6 | 20 | 38 | 1 |
| SuperAdmin | 64 | 2 | 20 | 42 | 0 |
| POS Mobile | 60 | 3 | 16 | 41 | 0 |
| Backend API | 63 | 7 | 14 | 42 | 0 |
| **TOTAL** | **320** | **20** | **89** | **210** | **1** |

---

## P0 ISSUES (20) — Must Fix Before Go-Live

### Backend API P0s (7)

| ID | Summary | File | Impact |
|----|---------|------|--------|
| AUDIT-API-001 | SQL template literal interpolation in enroll.ts — `${tableName}` in query string | `backend/src/routes/v1/pos/enroll.ts` | SQL injection risk |
| AUDIT-API-002 | SQL template literal interpolation in tokenSecurity.ts | `backend/src/routes/v1/pos/tokenSecurity.ts` | SQL injection risk |
| AUDIT-API-003 | JWT_SECRET first 10 chars logged to console in production | `backend/services/api-gateway/src/middleware/jwtAuth.ts:168` | Secret leak in logs |
| AUDIT-API-004 | Hardcoded `sm_payout_dev_key` fallback for payout API key | `backend/src/routes/v1/webhooks.ts:334,374` | Auth bypass in production |
| AUDIT-API-005 | Demo seed endpoint has no auth — publicly accessible data wipe | `backend/src/routes/v1/demo.ts` | Unauthenticated data destruction |
| AUDIT-API-006 | Voice endpoint bypasses store isolation — missing storeId filter | `backend/src/routes/v1/pos/voice.ts` | Cross-store data access |
| AUDIT-API-007 | `dev-secret-change-in-prod` fallback in 5+ JWT/gateway files | Multiple files | Auth bypass if env vars missing |

### Supplier Portal P0s (6)

| ID | Summary | File | Impact |
|----|---------|------|--------|
| AUDIT-SUP-001 | `/supplier/onboard` page accessible without auth — leaks registration form | `supplier-portal/src/app/(auth)/onboard/page.tsx` | Unauth access |
| AUDIT-SUP-002 | Dead `forgot-password` link in login page — page doesn't exist | `supplier-portal/src/app/(auth)/login/page.tsx` | 404 in production |
| AUDIT-SUP-003 | `error.tsx` shows raw error message + stack trace in production | `supplier-portal/src/app/error.tsx` | Info leak |
| AUDIT-SUP-004 | `global-error.tsx` shows full error details in production | `supplier-portal/src/app/global-error.tsx` | Info leak |
| AUDIT-SUP-005 | Root `/supplier/` page shows loading state forever (no auth redirect) | `supplier-portal/src/app/page.tsx` | Broken UX |
| AUDIT-SUP-006 | Upload page exists at `/supplier/upload` but is not linked anywhere | `supplier-portal/src/app/(dashboard)/upload/page.tsx` | Orphan page |

### POS Mobile P0s (3)

| ID | Summary | File | Impact |
|----|---------|------|--------|
| AUDIT-POS-001 | PurchaseHistoryScreen uses placeholder `deltaQty * 10000` for value display | `src/screens/PurchaseHistoryScreen.tsx` | Wrong monetary values shown |
| AUDIT-POS-002 | PurchaseScreen "Review Order" button has no handler — dead button | `src/screens/PurchaseScreen.tsx` | Feature doesn't work |
| AUDIT-POS-003 | BnplDuesScreen dispute shows success toast on API error | `src/screens/BnplDuesScreen.tsx` | Financial/legal risk — false confirmation |

### Retailer Admin P0s (2)

| ID | Summary | File | Impact |
|----|---------|------|--------|
| AUDIT-RET-003 | LoginPage firebase-otp-login fetch missing `credentials: 'include'` | `retailer-admin/src/pages/LoginPage.tsx:408` | Auth cookies silently ignored |
| AUDIT-RET-030 | DeviceActivationPage uses `useState` as side-effect launcher | `retailer-admin/src/pages/DeviceActivationPage.tsx:106-110` | Breaks in React concurrent mode |

### SuperAdmin P0s (2)

| ID | Summary | File | Impact |
|----|---------|------|--------|
| AUDIT-SA-001 | Entire 6,256-line portal in single App.tsx monolith | `supermandi-superadmin/src/App.tsx` | Unmaintainable, performance |
| AUDIT-SA-008 | No responsive/mobile layout — completely unusable on tablet/phone | `supermandi-superadmin/src/App.tsx` | Zero mobile support |

---

## P1 ISSUES (89) — Should Fix Before Go-Live

### Backend API P1s (14)

| ID | Summary | File |
|----|---------|------|
| AUDIT-API-008 | csvImport.ts: 4 `pool.connect()` but only 2 `client.release()` — connection leak | `backend/src/routes/v1/retailer-admin/csvImport.ts` |
| AUDIT-API-009 | Supplier registration `POST /create` missing phone format validation | `backend/src/routes/v1/supplier/registration.ts` |
| AUDIT-API-010 | BNPL payment: status always set to `paid` even for partial payments | `backend/src/routes/v1/pos/bnpl.ts:273-301` |
| AUDIT-API-011 | Stock-in endpoint missing idempotency key — double-submit creates duplicate stock | `backend/src/routes/v1/retailer-admin/stockIn.ts` |
| AUDIT-API-012 | Webhook Razorpay signature verification has timing-unsafe comparison | `backend/src/routes/v1/webhooks.ts` |
| AUDIT-API-013 | 67 pool.connect() vs 65 client.release() across entire backend — 2 leaks | Cross-cutting (AUDIT-XC-002) |
| AUDIT-API-014 | All security env vars have `dev-secret` fallbacks instead of fail-fast | Cross-cutting (AUDIT-XC-001) |
| AUDIT-API-015 | Admin audit logs store full request bodies with PII (PAN, Aadhaar) | `backend/src/routes/v1/admin/audit.ts:95` |
| AUDIT-API-016 | DUE split payment allows null customer_phone — unrecoverable dues | `backend/src/routes/v1/pos/payments.ts:528-534` |
| AUDIT-API-017 | Store isolation missing on BNPL buy_payment UPDATE queries | `backend/src/routes/v1/pos/bnpl.ts:282-285,402-405` |
| AUDIT-API-018 | UPI payment status check missing store_id filter | `backend/src/routes/v1/pos/payments.ts:650-654` |
| AUDIT-API-019 | Gateway trusts x-user-id headers without JWT if backend accessed directly | `backend/src/middleware/validateGatewayHeaders.ts` |
| AUDIT-API-020 | Sale creation SERIALIZABLE transaction returns generic 500 on conflict | `backend/src/routes/v1/pos/sales.ts` |
| AUDIT-API-021 | Voice endpoint stores temp files without cleanup on process crash | `backend/src/routes/v1/pos/voice.ts:34-60` |

### Retailer Admin P1s (19)

| ID | Summary | File |
|----|---------|------|
| AUDIT-RET-002 | 1,386-line deprecated RetailerOnboardingPage still routed | `retailer-admin/src/pages/RetailerOnboardingPage.tsx` |
| AUDIT-RET-011 | Dashboard inventory table has no pagination — breaks at scale | `retailer-admin/src/pages/DashboardPage.tsx` |
| AUDIT-RET-014 | Debug banner/footer visible in production exposing API URLs and store IDs | `retailer-admin/src/components/ProtectedLayout.tsx` |
| AUDIT-RET-015 | Sidebar uses `<a>` tags instead of `<Link>` — full page reloads on every navigation | `retailer-admin/src/components/ProtectedLayout.tsx` |
| AUDIT-RET-019 | Products page edit modal has no form validation | `retailer-admin/src/pages/ProductsPage.tsx` |
| AUDIT-RET-022 | ImportPage upload has no file size limit on client side | `retailer-admin/src/pages/ImportPage.tsx` |
| AUDIT-RET-039 | Admin queue pages use wrong API prefix — 401s won't trigger auth handler | `retailer-admin/src/pages/admin/SupplierQueuePage.tsx` |
| AUDIT-RET-041 | Direct `response.json()` calls without safeJson in 12+ locations | Multiple pages |
| AUDIT-RET-046 | UPI VPA validation regex differs between SettingsPage and UpiInput component | `retailer-admin/src/pages/SettingsPage.tsx:87` |
| AUDIT-RET-050 | authFetch timeout hardcoded to 30s — CSV imports may timeout | `retailer-admin/src/lib/api.ts:81` |
| AUDIT-RET-051 | Registration API calls missing `credentials: 'include'` | `retailer-admin/src/lib/api.ts:231-331` |
| AUDIT-RET-054 | Token refresh race condition — multiple 401s trigger multiple refreshes | `retailer-admin/src/lib/AuthContext.tsx` |
| AUDIT-RET-057 | Limited mode users can access all pages despite "blocked actions" list | `retailer-admin/src/components/ProtectedLayout.tsx` |
| AUDIT-RET-062 | localStorage stores user/store metadata in plaintext, may persist after logout | `retailer-admin/src/lib/AuthContext.tsx` |
| AUDIT-RET-066 | isActive check for `settings` also matches `settings/payments` — double highlight | `retailer-admin/src/components/ProtectedLayout.tsx:41` |
| AUDIT-RET-052 | Registration API throws raw objects instead of Error instances | `retailer-admin/src/lib/api.ts:240-242` |
| AUDIT-RET-004 | LoginPage has no loading skeleton — white flash on mount | `retailer-admin/src/pages/LoginPage.tsx` |
| AUDIT-RET-008 | DashboardPage stats cards have no empty state | `retailer-admin/src/pages/DashboardPage.tsx` |
| AUDIT-RET-036 | SupplierCatalogPage fetch fires on every keystroke — no debounce | `retailer-admin/src/pages/SupplierCatalogPage.tsx` |

### Supplier Portal P1s (20)

| ID | Summary | File |
|----|---------|------|
| AUDIT-SUP-007 | Dashboard page has 5 dead/unused imports (formatDate, PieChart, etc.) | `supplier-portal/src/app/(dashboard)/dashboard/page.tsx` |
| AUDIT-SUP-008 | Profile page shows stale data after save — no query invalidation | `supplier-portal/src/app/(dashboard)/profile/page.tsx` |
| AUDIT-SUP-009 | Orders page pagination not URL-synced — refresh resets to page 1 | `supplier-portal/src/app/(dashboard)/orders/page.tsx` |
| AUDIT-SUP-010 | Products page edit form allows empty product name submission | `supplier-portal/src/app/(dashboard)/products/page.tsx` |
| AUDIT-SUP-011 | Earnings page has no error state for failed API calls | `supplier-portal/src/app/(dashboard)/earnings/page.tsx` |
| AUDIT-SUP-012 | Dashboard layout sidebar has no active state for sub-routes | `supplier-portal/src/app/(dashboard)/layout.tsx` |
| AUDIT-SUP-013 | Bank details form has no IFSC validation | `supplier-portal/src/app/(dashboard)/profile/page.tsx` |
| AUDIT-SUP-014 | Products page allows negative purchase price | `supplier-portal/src/app/(dashboard)/products/page.tsx` |
| AUDIT-SUP-015 | `handle401Response()` redirects to `/login` bypassing basePath `/supplier` | `supplier-portal/src/lib/api.ts:156` |
| AUDIT-SUP-016 | Auth token stored in localStorage — no HttpOnly cookie option | `supplier-portal/src/lib/auth.tsx` |
| AUDIT-SUP-017 | KYC page has no retry mechanism for failed document uploads | `supplier-portal/src/app/(dashboard)/kyc/page.tsx` |
| AUDIT-SUP-018 | Order detail modal item status fires mutation on every keystroke | `supplier-portal/src/app/(dashboard)/orders/page.tsx:517-528` |
| AUDIT-SUP-019 | Dead code: `formatDate` imported but `formatDateTime` used instead | `supplier-portal/src/app/(dashboard)/dashboard/page.tsx` |
| AUDIT-SUP-020 | `formatPrice` returns '-' for zero prices (treats 0 as falsy) | `supplier-portal/src/app/(dashboard)/products/page.tsx:17-20` |
| AUDIT-SUP-021 | Three different price formatters across portal | Orders, Products, lib/formatters |
| AUDIT-SUP-022 | Three different date formatters across portal | Orders, Dashboard, lib/formatters |
| AUDIT-SUP-023 | Verification pending banner AND LimitedModeBanner render simultaneously | `supplier-portal/src/app/(dashboard)/layout.tsx:191-217` |
| AUDIT-SUP-024 | Resubmit loading state is global — all buttons show loading | `supplier-portal/src/app/(dashboard)/products/page.tsx:627-635` |
| AUDIT-SUP-025 | Token refresh retry has no timeout — can hang indefinitely | `supplier-portal/src/lib/api.ts:223-227` |
| AUDIT-SUP-037 | 401 redirect uses `window.location.replace('/login')` not `/supplier/login` | `supplier-portal/src/lib/api.ts:148-157` |

### SuperAdmin P1s (20)

| ID | Summary | File |
|----|---------|------|
| AUDIT-SA-002 | `X-Admin-Token` header sent in every request even when not needed | `supermandi-superadmin/src/api/authToken.ts` |
| AUDIT-SA-003 | `abortActiveRequests()` cancels ALL requests on tab switch | `supermandi-superadmin/src/api/authToken.ts:202-211` |
| AUDIT-SA-004 | Product edit modal allows negative margin values | `supermandi-superadmin/src/App.tsx:800-804` |
| AUDIT-SA-005 | User creation allows admin without email (needed for OTP login) | `supermandi-superadmin/src/App.tsx:817-822` |
| AUDIT-SA-009 | All tabs show "Loading..." text instead of skeletons — layout shifts | `supermandi-superadmin/src/App.tsx` |
| AUDIT-SA-010 | No loading skeleton for any data table | `supermandi-superadmin/src/App.tsx` |
| AUDIT-SA-013 | Supplier suspension uses no confirmation modal | `supermandi-superadmin/src/App.tsx` |
| AUDIT-SA-014 | Document rejection allows single-character reason | `supermandi-superadmin/src/App.tsx:1566-1569` |
| AUDIT-SA-016 | Error states persist across tab switches — stale errors shown | `supermandi-superadmin/src/App.tsx` |
| AUDIT-SA-019 | 100+ useState calls in single component — excessive re-renders | `supermandi-superadmin/src/App.tsx:700-950` |
| AUDIT-SA-022 | Bank verification approval has no confirmation step | `supermandi-superadmin/src/App.tsx` |
| AUDIT-SA-024 | Store search is client-side only — won't scale to 10K stores | `supermandi-superadmin/src/App.tsx` |
| AUDIT-SA-028 | Settings error state has no retry button | `supermandi-superadmin/src/App.tsx` |
| AUDIT-SA-035 | ErrorBoundary import path mismatch between main.tsx and components/ | `supermandi-superadmin/src/main.tsx:5` |
| AUDIT-SA-039 | JWT token expiry hardcoded to 24h, ignoring server-provided expiry | `supermandi-superadmin/src/api/authToken.ts:356-364` |
| AUDIT-SA-043 | No route-level auth guard — 401 race condition shows stale data | `supermandi-superadmin/src/api/authToken.ts:260-271` |
| AUDIT-SA-049 | ErrorBoundary only catches React render errors, not async errors | `supermandi-superadmin/src/components/ErrorBoundary.tsx` |
| AUDIT-SA-053 | parseError duplicated across 6 API modules | `supermandi-superadmin/src/api/*.ts` |
| AUDIT-SA-032 | Error sanitizer logs detection to console (aids attackers) | `supermandi-superadmin/src/api/errorSanitizer.ts:65,84` |
| AUDIT-SA-033 | Staff tab depends on storeDirectory loaded by Stores tab | `supermandi-superadmin/src/App.tsx:5579` |

### POS Mobile P1s (16)

| ID | Summary | File |
|----|---------|------|
| AUDIT-POS-004 | RegisterStoreScreen hardcodes `status: 'active'` bypassing approval flow | `src/screens/RegisterStoreScreen.tsx` |
| AUDIT-POS-005 | EnrollDeviceScreen missing retry logic for activation code timeout | `src/screens/EnrollDeviceScreen.tsx` |
| AUDIT-POS-006 | InwardWrapper bypasses store active status check | `src/screens/InwardScreen.tsx` |
| AUDIT-POS-007 | PaymentScreen UPI polling has no maximum retry limit | `src/screens/PaymentScreen.tsx` |
| AUDIT-POS-008 | SellScanScreen barcode handler can fire multiple times for same scan | `src/screens/SellScanScreen.tsx` |
| AUDIT-POS-025 | PurchaseHistoryScreen shows truncated UUIDs instead of product names | `src/screens/PurchaseHistoryScreen.tsx` |
| AUDIT-POS-028 | `ToastAndroid.show()` used directly in 4 files — crashes on iOS | Multiple files |
| AUDIT-POS-032 | apiClient logs device token prefix in production | `src/services/api/apiClient.ts:250` |
| AUDIT-POS-033 | apiClient logs request bodies (PAN, phone, Aadhaar) in production | `src/services/api/apiClient.ts:251` |
| AUDIT-POS-034 | apiClient logs response bodies in production | `src/services/api/apiClient.ts:297` |
| AUDIT-POS-035 | InwardScreen stock check failure silently continues | `src/screens/InwardScreen.tsx` |
| AUDIT-POS-042 | productsStore fallback to hardcoded sample products on error | `src/stores/productsStore.ts` |
| AUDIT-POS-043 | phoneOtp dev bypass accepts "123456" OTP | `src/services/phoneOtp.ts:144-149` |
| AUDIT-POS-049 | No Error Boundary — any render crash kills entire POS app | `App.tsx` |
| AUDIT-POS-009 | MenuScreen role checks inconsistent with backend RBAC | `src/screens/MenuScreen.tsx` |
| AUDIT-POS-010 | BarcodeSheetScreen has no pagination for large barcode sets | `src/screens/BarcodeSheetScreen.tsx` |

---

## P2 ISSUES (210) — Fix After Go-Live / During Hardening

> P2 issues are organized by category across all portals. Full details in the raw agent output files.

### Security (15 P2s)
- AUDIT-SA-007: Error sanitizer console.warn aids attackers
- AUDIT-SA-031: Error sanitizer logs sensitive pattern type
- AUDIT-SA-056: JWT expiry hardcoded client-side
- AUDIT-SUP-047: Firebase config committed to source control
- AUDIT-SUP-062: Idle timeout uses localStorage (manipulable)
- AUDIT-API-036: Audit logs store request bodies with PII
- AUDIT-API-037: Device metadata update accepts unbounded strings
- AUDIT-API-038: POS events accept any eventType string
- AUDIT-API-043: CSRF protection doesn't exempt webhook paths
- AUDIT-API-047: GRN alerts builds SQL with string concatenation
- AUDIT-API-049: Audit stats endpoint missing permission check
- AUDIT-API-053: Gateway forwards master admin token too broadly
- AUDIT-API-057: In-memory rate limiting resets on restart
- AUDIT-API-062: Backend trusts gateway headers without re-verification
- AUDIT-POS-044: PosStatusBar camera icon uses `as any` cast

### Store Isolation (5 P2s)
- AUDIT-API-046: UPI completion check missing store_id
- AUDIT-API-050: BNPL buy_payment UPDATE missing store_id
- AUDIT-API-051: BNPL cash pay UPDATE missing store_id
- AUDIT-API-040: Credit offers generated without actual store history
- AUDIT-POS-053: BuyScreen stock filtering is client-side only

### Missing Rate Limiting (6 P2s)
- AUDIT-API-035: UPI payment initiation has no rate limit
- AUDIT-API-039: POS sync endpoint has no rate limit
- AUDIT-API-041: Credit application has no rate limit
- AUDIT-API-054: UTR verification has no rate limit
- AUDIT-API-061: Device enrollment missing progressive lockout
- AUDIT-API-063: BNPL dispute has no rate limit

### UX 4-State Coverage (25+ P2s)
- Missing loading skeletons across all portals (SA-009, SA-010, SA-038, RET-004, SUP-041, SUP-043, SUP-052)
- Missing error states (SA-028, SUP-040, SUP-042, RET-008)
- Missing empty states (SA-017, SA-020, SA-026, SA-027, SA-063, RET-008)
- Missing retry buttons (SA-028, SUP-017)
- Stale data after mutations (SA-016, SA-036, SUP-008, SUP-061)

### Accessibility (20+ P2s)
- Missing ARIA labels (SA-011, SA-021, SA-034, SA-042, SA-051, SA-058, SA-060, RET-049, SUP-038, SUP-059)
- No focus management in modals (SA-051)
- Missing color contrast WCAG AA (SUP-059)
- No `prefers-reduced-motion` support (RET-049)
- Screen reader incompatibilities across all portals

### Navigation & Routing (10+ P2s)
- Double redirects (RET-063)
- basePath issues (SUP-015, SUP-037)
- Missing breadcrumbs (RET-058)
- Client-side-only pagination (SA-040, SUP-009, SUP-044)

### Performance & Scalability (15+ P2s)
- Client-side filtering (SA-024, SA-054, POS-053)
- N+1 queries (API-030, API-033, API-042)
- Unbounded in-memory maps (API-031)
- Events table allows 1000 rows (SA-040)
- Missing pagination (API-044, API-045, POS-010)
- 335 console.log calls in POS codebase

### Code Quality & Dead Code (15+ P2s)
- Duplicated code (SA-053, SA-055, SUP-021, SUP-022, POS-027)
- Unused imports/exports (SUP-007, SUP-019, RET-053)
- Deprecated pages still routed (RET-002)
- Feature flags permanently disabled (POS-038)
- Hardcoded values (POS-029, POS-051, API-045)

### Missing i18n (10+ P2s)
- GRNScreen zero i18n coverage (POS-030)
- 10+ screens with partial i18n (POS-031)
- Indian number formatting fallback wrong (POS-059)

### Mobile Responsiveness (5+ P2s)
- SuperAdmin zero mobile support (SA-008 already P0)
- Tables not horizontally scrollable (RET-044)
- Grid responsive breakpoint too aggressive (RET-055)
- No dark mode (SA-062, RET-056)

---

## Implementation Priority Order

Per governance rules (bottom-up, dependency-aware):

### Phase 1: SECURITY (P0 + P1 Security)
> **15 tickets** — Schema/Backend first, must fix before any deploy

1. AUDIT-API-001/002: Fix SQL template literal interpolation
2. AUDIT-API-003: Remove JWT secret from logs
3. AUDIT-API-004: Remove hardcoded payout key fallback
4. AUDIT-API-005: Add auth to demo seed endpoint
5. AUDIT-API-006: Fix voice endpoint store isolation
6. AUDIT-API-007: Fail-fast on missing security env vars
7. AUDIT-API-008/013: Fix DB connection leaks (csvImport + others)
8. AUDIT-API-017/018/046/050/051: Add store_id to all BNPL/payment queries
9. AUDIT-API-019: Validate gateway trust model
10. AUDIT-POS-032/033/034: Gate apiClient debug logging behind `__DEV__`
11. AUDIT-POS-043: Strengthen OTP dev bypass safeguards
12. AUDIT-SA-032: Remove error sanitizer console.warn
13. AUDIT-SUP-003/004: Strip error details in production
14. AUDIT-API-015: Redact PII from audit logs
15. AUDIT-API-012: Fix webhook signature timing comparison

### Phase 2: BROKEN FUNCTIONALITY (P0 + P1 Functional)
> **20 tickets** — Features that don't work or produce wrong results

1. AUDIT-POS-001: Fix PurchaseHistory placeholder value calculation
2. AUDIT-POS-002: Wire PurchaseScreen "Review Order" button
3. AUDIT-POS-003: Fix BnplDues false success on error
4. AUDIT-RET-003: Add `credentials: 'include'` to login fetch
5. AUDIT-RET-030: Fix DeviceActivation useState anti-pattern
6. AUDIT-SUP-001: Gate onboard page behind auth
7. AUDIT-SUP-002: Fix or remove forgot-password link
8. AUDIT-SUP-005: Fix root page infinite loading
9. AUDIT-POS-049: Add Error Boundary to POS app
10. AUDIT-POS-042: Remove hardcoded sample products fallback
11. AUDIT-POS-028: Replace ToastAndroid with cross-platform showToast
12. AUDIT-POS-025: Show product names instead of truncated UUIDs
13. AUDIT-RET-015: Replace sidebar `<a>` tags with `<Link>` components
14. AUDIT-RET-014: Gate debug banner behind `import.meta.env.DEV`
15. AUDIT-RET-039: Fix admin queue API prefix
16. AUDIT-SUP-015/037: Fix 401 redirect to include basePath
17. AUDIT-RET-057: Add limited mode route guards
18. AUDIT-API-010: Fix BNPL partial payment status
19. AUDIT-API-016: Validate customer_phone for DUE payments
20. AUDIT-API-020: Add retry logic for sale serialization conflicts

### Phase 3: DATA INTEGRITY & AUTH (P1 Auth/Validation)
> **15 tickets** — Prevents data corruption and auth bypass

1. AUDIT-RET-054: Token refresh mutex
2. AUDIT-RET-051: Add credentials to registration API calls
3. AUDIT-SA-039: Use server-provided JWT expiry
4. AUDIT-SA-043: Immediate login gate on 401
5. AUDIT-SA-035: Fix ErrorBoundary import path
6. AUDIT-SA-049: Add global unhandled rejection handler
7. AUDIT-RET-046: Unify UPI VPA validation
8. AUDIT-SUP-013: Add IFSC validation
9. AUDIT-SUP-010: Add product name validation
10. AUDIT-SA-004: Validate margin >= 0
11. AUDIT-SA-005: Require email for admin users
12. AUDIT-SA-014: Minimum 10-char rejection reason
13. AUDIT-API-009: Validate phone format in supplier registration
14. AUDIT-API-011: Add idempotency key to stock-in
15. AUDIT-RET-062: Audit and clean localStorage on logout

### Phase 4: UX & POLISH (P1 UX + Top P2s)
> **25 tickets** — Loading states, empty states, error handling

1. AUDIT-RET-041: Replace raw response.json with safeJson
2. AUDIT-RET-050: Configurable fetch timeout
3. AUDIT-SA-009/010: Add skeleton loaders to SuperAdmin
4. AUDIT-SA-016: Clear errors on tab switch
5. AUDIT-SA-033: Load storeDirectory independently of Stores tab
6. AUDIT-SUP-008: Invalidate profile query after save
7. AUDIT-SUP-018: Debounce order item status mutation
8. AUDIT-SUP-023: Remove duplicate status banners
9. AUDIT-SUP-024: Per-product resubmit loading state
10. AUDIT-SUP-025: Add timeout to token refresh retry
11. AUDIT-POS-035: Block inward on stock check failure
12. AUDIT-POS-005: Add retry logic to device enrollment
13. AUDIT-POS-007: Add max retry limit to UPI polling
14. AUDIT-POS-008: Debounce barcode scan handler
15. AUDIT-RET-011: Add pagination to dashboard inventory
16. AUDIT-RET-036: Debounce catalog search
17. AUDIT-RET-022: Add client-side file size limit
18. AUDIT-SA-024: Server-side store search
19. AUDIT-SA-040: Server-side events pagination
20. AUDIT-SA-019: Extract per-tab state to reduce re-renders
21. AUDIT-SUP-009/044: URL-sync pagination
22. AUDIT-SUP-040/042: Add error states to Orders and KYC
23. AUDIT-SUP-041/043: Add loading skeletons
24. AUDIT-RET-052: Throw proper Error instances from API
25. AUDIT-RET-066: Fix double-highlight navigation

### Phase 5: HARDENING (P2s)
> **~200 remaining P2 tickets** — Accessibility, i18n, performance, code quality

Grouped into sub-phases:
- 5A: Accessibility (WCAG AA compliance) — ~20 tickets
- 5B: Performance & Scalability (pagination, caching, N+1) — ~15 tickets
- 5C: Code Quality (dedup, dead code, imports) — ~15 tickets
- 5D: i18n Coverage (POS screens) — ~10 tickets
- 5E: Mobile Responsiveness — ~5 tickets
- 5F: Remaining UX polish — ~remaining

---

## Raw Audit Output Files

Full detailed findings with exact line numbers, repro steps, expected vs actual, and acceptance criteria:

| Portal | Output File |
|--------|-------------|
| Retailer Admin (68 issues) | `C:\WINDOWS\TEMP\claude\c--supermandi-pos\tasks\ae863d9.output` |
| Supplier Portal (65 issues) | `C:\WINDOWS\TEMP\claude\c--supermandi-pos\tasks\ac49ed0.output` |
| SuperAdmin (64 issues) | `C:\WINDOWS\TEMP\claude\c--supermandi-pos\tasks\ac4494b.output` |
| POS Mobile (60 issues) | `C:\WINDOWS\TEMP\claude\c--supermandi-pos\tasks\a6defea.output` |
| Backend API (63 issues) | `C:\WINDOWS\TEMP\claude\c--supermandi-pos\tasks\aea40f8.output` |

Each issue in the raw files includes:
- Severity (P0/P1/P2)
- Screen/Endpoint
- Category (UI-ELEMENT, UI-WIRING, NAV-GUARD, UX-4STATE, SECURITY, VALIDATION, etc.)
- Summary
- Repro steps
- Expected vs Actual
- File path with line numbers
- Acceptance criteria

---

## Execution Rules (Non-Negotiable)

Per operator directive:
1. **One ticket = one branch = one PR = one tag** — no mixed scope
2. **Cascading E2E Hardening** — full E2E on production-grade local-prod, fix regressions, re-run until ZERO failures
3. **One-click pre-staging discipline** — `pnpm -r typecheck` + `pnpm -r build` + E2E must all pass
4. **Operator E2E gate mandatory** before merge/push
5. **Promotion only after ALL portals + POS verified** on staging
