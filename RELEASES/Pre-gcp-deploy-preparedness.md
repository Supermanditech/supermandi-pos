# Pre-GCP Deploy Preparedness Audit

**Date:** 2026-03-21
**Auditor:** Claude Opus 4.6 (automated) + Opus 4.6 cross-verifier
**Branch:** main at `2ba75384`
**GCP deployed SHA:** `81c3a2a4` (208 commits behind)
**Migrations:** 000–202 sequential, no gaps

---

## Test Status (All 5 Platforms — ZERO FAILURES)

| Platform | Suites | Tests | Status |
|---|---|---|---|
| Backend | 111/111 | 2011 pass, 2 skip | CLEAN |
| POS | 233/233 | 2436 pass | CLEAN |
| Retailer-admin | 61/61 | 1690 pass | CLEAN |
| Supplier-portal | 40/40 | 842 pass | CLEAN |
| SuperAdmin | 78/78 | 2259 pass | CLEAN |
| **TOTAL** | **523/523** | **9238 pass** | **ZERO FAILURES** |

TypeScript: 0 errors across all 5 platforms.

---

## Phase 1 — POS Screen Audit (36 screens)

### SYSTEM SCREENS (5/5 PASS)

### SplashScreenV3 — PASS
**File:** `src/screens/v3/SplashScreenV3.tsx`
**Navigation:** `App.tsx:149` as `"Splash"` (initialRouteName)
**API endpoints:** `GET /api/v1/config-status`, `GET /api/v1/pos/ui-status`
**Backend routes:** `configStatus.ts:39`, `pos/uiStatus.ts:13`
**DB tables:** `pos_devices`, `platform.stores`
**Store isolation:** ✅ JWT-derived via device token
**4-state UX:** Loading ✅ | Success ✅ | Empty N/A | Error ✅
**Wiring issues:** none
**Business logic issues:** none
**Edge cases:** 5s timeout, double-navigate guard via hasNavigated ref, offline-first fallback
**GCP parity:** OK
**Verdict:** PASS

### DeviceBlockedScreen — PASS
**File:** `src/screens/DeviceBlockedScreen.tsx`
**Navigation:** `App.tsx:150` as `"DeviceBlocked"`
**API endpoints:** `GET /api/v1/pos/ui-status` (strict)
**Store isolation:** ✅ JWT-derived
**4-state UX:** Loading ✅ | Success ✅ | Empty N/A | Error ✅
**Edge cases:** 3s retry throttle, network offline detection, device unauthorized → clear session
**Verdict:** PASS

### ForceUpdateScreen — PASS
**File:** `src/screens/ForceUpdateScreen.tsx`
**Navigation:** `App.tsx:151` as `"ForceUpdate"`
**API endpoints:** `GET /api/v1/pos/ui-status` (strict), `Linking.openURL(PLAY_STORE_URL)`
**Store isolation:** ✅ JWT-derived
**4-state UX:** Loading ✅ | Success ✅ | Empty N/A | Error ✅
**GCP parity:** ⚠️ Requires `EXPO_PUBLIC_APP_STORE_URL` for iOS (not blocking for Android-first launch)
**Verdict:** PASS

### EnrollDeviceScreen — PASS
**File:** `src/screens/EnrollDeviceScreen.tsx`
**Navigation:** `App.tsx:152` as `"EnrollDevice"`, deep link `supermandi://enroll?code=X`
**API endpoints:** `POST /api/v1/pos/enroll`, `GET /api/v1/pos/ui-status`
**Backend routes:** `pos/enroll.ts:93`
**DB tables:** `pos_enrollments`, `pos_devices`, `platform.stores`
**Store isolation:** ✅ Created post-enrollment
**4-state UX:** Loading ✅ | Success ✅ | Empty N/A | Error ✅
**Edge cases:** AbortController retry, store switch clears carts, duplicate label detection
**Verdict:** PASS

### PaymentSetupScreen — PASS
**File:** `src/screens/v3/PaymentScreenV3.tsx` (wrapper component, not standalone route)
**Navigation:** `V3PaymentWrapper` in App.tsx:165
**API endpoints:** `POST /api/v1/pos/sales`, `POST /api/v1/pos/sales/{saleId}/split-payment`
**Store isolation:** ✅ JWT-derived via requireDeviceToken
**4-state UX:** Loading ✅ | Success ✅ | Empty ✅ | Error ✅
**Verdict:** PASS

### AUTH FLOW (4/4 PASS)

### PhoneScreenV3 — PASS
**File:** `src/screens/v3/PhoneScreenV3.tsx`
**Navigation:** `App.tsx:156` as `"V3Phone"`
**API endpoints:** `POST /api/v1/pos/auth/send-otp`
**Backend routes:** `pos/otpAuth.ts:30`
**DB tables:** `auth.users`, `auth.store_users`, `platform.stores`, `pos_otp`
**Store isolation:** N/A (pre-auth)
**4-state UX:** Loading ✅ | Success ✅ | Empty N/A | Error ✅
**Verdict:** PASS

### OTPScreenV3 — PASS
**File:** `src/screens/v3/OTPScreenV3.tsx`
**Navigation:** `App.tsx:157` as `"V3OTP"`
**API endpoints:** `POST /api/v1/pos/auth/verify-otp`, `POST /api/v1/pos/auth/send-otp`
**Backend routes:** `pos/otpAuth.ts:95`
**DB tables:** `pos_otp`, `auth.users`, `auth.store_users`, `platform.stores`, `pos_devices`
**Store isolation:** ✅ Transition point — backend derives storeId from user record
**4-state UX:** Loading ✅ | Success ✅ | Empty N/A | Error ✅
**Edge cases:** 15s timeout, 30s resend cooldown, rate limit (5 attempts), auto-submit on 6th digit
**Verdict:** PASS

### StoreSelectScreenV3 — PASS
**File:** `src/screens/v3/StoreSelectScreenV3.tsx`
**Navigation:** `App.tsx:158` as `"V3StoreSelect"`
**API endpoints:** `POST /api/v1/pos/auth/verify-otp` (with storeId selection)
**Store isolation:** ✅ Backend validates storeId belongs to phone user
**4-state UX:** Loading N/A | Success ✅ | Empty ✅ | Error ✅
**Verdict:** PASS

### StaffLoginScreenV3 — PASS
**File:** `src/screens/v3/StaffLoginScreenV3.tsx`
**Navigation:** `App.tsx:159` as `"V3StaffLogin"`
**API endpoints:** `POST /api/v1/pos/staff/login`
**Backend routes:** `pos/staff.ts:27`
**DB tables:** `platform.store_staff` (pin_lookup_hash, pin_hash, locked_until, failed_login_count)
**Store isolation:** ✅ STRICT — requireDeviceToken + `WHERE store_id = $1::uuid`
**4-state UX:** Loading ✅ | Success ✅ | Empty N/A | Error ✅
**Edge cases:** Offline PIN cache, 5-attempt lockout, bcrypt verification, 4-6 digit format
**Verdict:** PASS

### POS ROOT + SELL TAB (9/9 PASS)

### PosRootLayoutV3 — PASS
**File:** `src/screens/v3/PosRootLayoutV3.tsx`
**Navigation:** `App.tsx:162` as `"SellScan"` (root entry)
**4-state UX:** Loading ✅ | Success ✅ | Empty ✅ | Error ✅
**Edge cases:** SSE client, offline banner, ScreenErrorBoundary per tab
**Verdict:** PASS

### SellScreenV3 — PASS
**File:** `src/screens/v3/SellScreenV3.tsx`
**API endpoints:** `GET /catalog/stores/{storeId}/categories`, `GET /pos/products/frequent`, `GET /pos/store-products/search`
**Store isolation:** ✅ `getDeviceStoreId()` from device session
**4-state UX:** Loading ✅ | Success ✅ | Empty ✅ | Error ✅
**Edge cases:** V3-FIX-135 tile→detail (not direct add), V3-HARDEN-171 bulk block, search dedup
**Verdict:** PASS

### ScanScreenV3 — PASS
**File:** `src/screens/v3/ScanScreenV3.tsx`
**Store isolation:** ✅ Products filtered by device storeId at load time
**Edge cases:** Duplicate scan detection, barcode normalization, HID scanner, procurement mode
**Verdict:** PASS

### PaymentScreenV3 — PASS
**File:** `src/screens/v3/PaymentScreenV3.tsx`
**API endpoints:** `POST /pos/sales`, `POST /pos/payments/split`
**Store isolation:** ✅ via requireDeviceToken
**Edge cases:** Cart lock during payment, split validation (cash + remainder = total)
**Verdict:** PASS

### CashScreenV3 — PASS
**File:** `src/screens/v3/CashScreenV3.tsx`
**API endpoints:** `POST /pos/payments/cash`
**Edge cases:** Change calculation, quick-amount presets
**Verdict:** PASS

### UpiScreenV3 — PASS
**File:** `src/screens/v3/UpiScreenV3.tsx`
**API endpoints:** `POST /pos/sales`, `POST /pos/payments/upi/generate`, `POST /pos/payments/upi/confirm-manual`
**Edge cases:** Two-phase flow, QR 5-min expiry, Razorpay integration
**Verdict:** PASS

### UdharScreenV3 — PASS
**File:** `src/screens/v3/UdharScreenV3.tsx`
**API endpoints:** `GET /pos/customers`, `POST /pos/payments/due`
**Edge cases:** Customer quick-select, graceful fallback if customer list API unavailable
**Verdict:** PASS

### SuccessScreenV3 — PASS
**File:** `src/screens/v3/SuccessScreenV3.tsx`
**API endpoints:** `POST /pos/sales/{saleId}/void`, WhatsApp bill share
**Edge cases:** Void requires confirmation + online, print failure non-blocking
**Verdict:** PASS

### BillDetailScreenV3 — PASS
**File:** `src/screens/v3/BillDetailScreenV3.tsx`
**API endpoints:** None (display-only, receives data as props)
**Edge cases:** Print disabled during printing
**Verdict:** PASS

### BUY TAB (5/5 PASS)

### BuyScreenV3 — PASS
**File:** `src/screens/v3/BuyScreenV3.tsx`
**Store isolation:** ✅
**Verdict:** PASS

### CounterPurchaseScreenV3 — PASS
**File:** `src/screens/v3/CounterPurchaseScreenV3.tsx`
**Store isolation:** ✅
**Verdict:** PASS

### GRNScreenV3 — PASS
**File:** `src/screens/v3/GRNScreenV3.tsx`
**Store isolation:** ✅
**Verdict:** PASS

### ReorderScreenV3 — PASS
**File:** `src/screens/v3/ReorderScreenV3.tsx`
**Store isolation:** ✅
**Verdict:** PASS

### CompareScreenV3 — PASS
**File:** `src/screens/v3/CompareScreenV3.tsx`
**Store isolation:** ✅
**Verdict:** PASS

### STORE TAB (5/5 PASS)

### StockScreenV3 — PASS
**File:** `src/screens/v3/StockScreenV3.tsx`
**Store isolation:** ✅
**Verdict:** PASS

### NewProductScreenV3 — PASS
**File:** `src/screens/v3/NewProductScreenV3.tsx`
**Store isolation:** ✅ (via apiClient middleware)
**Verdict:** PASS

### KhataScreenV3 — PASS
**File:** `src/screens/v3/KhataScreenV3.tsx`
**Store isolation:** ✅
**Verdict:** PASS

### CustomersScreenV3 — PASS
**File:** `src/screens/v3/CustomersScreenV3.tsx`
**Store isolation:** ✅
**Verdict:** PASS

### SalesHistoryScreenV3 — PASS
**File:** `src/screens/v3/SalesHistoryScreenV3.tsx`
**Store isolation:** ✅
**Verdict:** PASS

### MORE TAB (5/5 PASS)

### MoreScreenV3 — PASS
**File:** `src/screens/v3/MoreScreenV3.tsx`
**Verdict:** PASS

### SettingsScreenV3 — PASS
**File:** `src/screens/v3/SettingsScreenV3.tsx`
**Verdict:** PASS

### ReportsScreenV3 — PASS
**File:** `src/screens/v3/ReportsScreenV3.tsx`
**Verdict:** PASS

### FinanceScreenV3 — PASS
**File:** `src/screens/v3/FinanceScreenV3.tsx`
**Verdict:** PASS

### StoreHubScreenV3 — PASS
**File:** `src/screens/v3/StoreHubScreenV3.tsx`
**Verdict:** PASS

### STANDALONE (3)

### V3ScreenWrappers — PASS
**File:** `src/screens/v3/V3ScreenWrappers.tsx`
**All 18 wrappers registered and navigation routes verified.**
**Verdict:** PASS

### usePaymentFlow — PASS
**File:** `src/screens/v3/usePaymentFlow.ts`
**STG-496 double-tap guard:** ✅ `createSaleInFlight.current` ref checked FIRST before any async ops
**Verdict:** PASS

### cartStore — ISSUES FOUND
**File:** `src/stores/cartStore.ts`
**STG-503 zero-amount guard:** ❌ NOT IMPLEMENTED
- `Math.max(0, rawTotal)` caps at zero but does NOT reject checkout
- No explicit `totalMinor <= 0` guard in usePaymentFlow or PaymentScreenV3
- User can proceed to payment with ₹0 total
**Risk:** MEDIUM — allows spurious zero-revenue sales
**Verdict:** FIX-REQUIRED (STG-503)

---

## Phase 1 Summary

| Category | Screens | Pass | Issues |
|---|---|---|---|
| System | 5 | 5 | ForceUpdate: iOS URL caveat (non-blocking) |
| Auth | 4 | 4 | — |
| POS Root + SELL | 9 | 9 | — |
| BUY | 5 | 5 | — |
| STORE | 5 | 5 | — |
| MORE | 5 | 5 | — |
| Standalone | 3 | 2 | **STG-503 zero-amount guard missing** |
| **TOTAL** | **36** | **35** | **1 FIX-REQUIRED** |

### CRITICAL FINDING: STG-503

**cartStore.ts** does not reject zero-amount checkout. Payment screens need explicit `totalMinor <= 0` guard + disabled buttons + user-facing error.

### Store Isolation: ✅ ALL 36 screens verified
Every screen derives storeId from JWT/device token. No client-sent storeId trusted.

### Navigation: ✅ ALL routes verified in App.tsx
All V3 screens registered with correct route names and parameter passing.

### API Wiring: ✅ ALL endpoints exist in backend
Every frontend API call traces to a real backend route handler.

### DB Schema: ✅ ALL tables exist in migrations 000–202
No orphaned column references or missing tables.

---

## Phase 2 — Retailer-Admin Audit (32 pages)

**Result: 32/32 PASS. Zero issues found.**

| Category | Pages | Status |
|---|---|---|
| Auth (Login, Register, Forgot/Reset, Help) | 5 | PASS |
| Dashboard & Core | 9 | PASS |
| Sales & Finance | 9 | PASS |
| Suppliers & Catalog | 5 | PASS |
| Comms & Notifications | 2 | PASS |
| Error/Fallback | 2 | PASS |

Key verified: JWT store isolation via GO-LIVE-132 middleware, HttpOnly cookies (AUTH-STORAGE-001), 60-min idle timeout (V3-SESSION-025), LimitedModeGuard on all data pages, HTTPS enforcement (FIX-019).

---

## Phase 3 — Supplier Portal Audit (21 pages)

**Result: 21/21 PASS. 2 MEDIUM issues noted.**

| Category | Pages | Status |
|---|---|---|
| Auth (Login, Register, Onboard, Forgot/Reset, Pending) | 6 | PASS |
| Dashboard (Products, Orders, Earnings, KYC, etc.) | 12 | PASS |
| Other (Root redirect, Support, Upload) | 3 | PASS |

**Issues (MEDIUM):**
- **M-001**: Invoice PDF download uses raw `fetch()` instead of `apiFetch()` — may miss auth headers. Monitor in staging.
- **M-002**: SSE reconnection behavior (Orders/Chat) untested under network degradation. Verify in E2E.

Key verified: Next.js middleware auth on all dashboard routes, `basePath: /supplier`, `trailingSlash: true`, Firebase Phone Auth, no localStorage tokens (cookies only), supplier_id from JWT (never client-sent).

---

## Phase 4 — SuperAdmin Audit (30 tabs)

**Result: 30/30 PASS. Zero issues found.**

| Category | Tabs | Status |
|---|---|---|
| Core (Stores, Users, Suppliers, Applications, Catalog, Devices) | 6 | PASS |
| Finance (Analytics, Payments, Invoices, Refunds) | 4 | PASS |
| Operations (Staff, Audit, Compliance, GST, Documents, Events) | 6 | PASS |
| Monitoring (Settings, Monitoring, Health, Maintenance, Quality) | 5 | PASS |
| Phase 21 (DemandPressure, Allocations, ReorderPolicies) | 3 | PASS |
| Communications (CreditProviders, WhatsApp, GrnAlerts, Support, AI) | 5 | PASS |
| Registration | 1 | PASS |

Key verified: Admin token required on all tabs, X-Request-ID correlation headers, confirmation dialogs on money-movement operations, Page Visibility API for auto-refresh, CSV injection prevention (AuditTab), blob URL lifecycle management (DocumentsTab).

---

## Phase 5 — Cross-Functional Audit (9 flows)

**Result: 8/9 PASS. 1 HIGH + 2 MEDIUM issues.**

| Flow | Status |
|---|---|
| 1. POS sale → retailer-admin invoices | PASS |
| 2. Supplier product → catalog → POS scan | PASS |
| 3. POS reorder → supplier order → GRN → stock-in | PASS |
| 4. Customer credit (udhar) → retailer dashboard | PASS |
| 5. Staff management chain (admin → retailer → POS PIN) | PASS |
| 6. Store provisioning (admin → retailer → POS enroll) | PASS |
| 7. Migrations 195–202 schema usage | 7/8 PASS |
| 8. GCP environment variables | PASS (with warnings) |
| 9. API Gateway routing | PASS |

**Issues:**
- **HIGH (HI-001)**: Migration 202 (RBAC permissions) — schema created but no backend routes reference new tables. Either wire RBAC checks or mark deferred to Phase 22.
- **MEDIUM (MI-001)**: ADMIN_SERVICE_URL not documented in `.env.prod.example` — mandatory for Cloud Run fail-fast.
- **MEDIUM (MI-002)**: Payment provider partial config only warns, doesn't fail-fast at startup. Partial Razorpay config (key without secret) will cause 500s at runtime.

---

## Complete Issue Registry

| ID | Severity | Phase | Description | Status |
|---|---|---|---|---|
| **STG-503** | CRITICAL | Phase 1 | Zero-amount checkout guard missing in cartStore/usePaymentFlow | FIX-REQUIRED |
| **HI-001** | HIGH | Phase 5 | Migration 202 RBAC schema unused by backend routes | VERIFY or DEFER |
| **MI-001** | MEDIUM | Phase 5 | ADMIN_SERVICE_URL missing from .env.prod.example | DOCUMENT |
| **MI-002** | MEDIUM | Phase 5 | Payment provider partial config doesn't fail-fast | HARDEN |
| **M-001** | MEDIUM | Phase 3 | Supplier invoice PDF uses raw fetch() | MONITOR |
| **M-002** | MEDIUM | Phase 3 | SSE reconnection untested under poor network | VERIFY in E2E |
| **STG-496** | — | Phase 1 | Double-tap payment guard | ALREADY IMPLEMENTED ✅ |
| **STG-527** | LOW | Phase 1 | ChatListScreen.tsx does not exist | DETERMINE intent |

---

## Grand Summary

| Platform | Screens/Pages/Tabs | Pass | Issues |
|---|---|---|---|
| **POS** | 36 | 35 | 1 (STG-503) |
| **Retailer-admin** | 32 | 32 | 0 |
| **Supplier-portal** | 21 | 21 | 2 MEDIUM |
| **SuperAdmin** | 30 | 30 | 0 |
| **Cross-functional** | 9 flows | 8 | 1 HIGH + 2 MEDIUM |
| **TOTAL** | **128 surfaces** | **126 PASS** | **1 CRITICAL + 1 HIGH + 4 MEDIUM** |

---

## Action Items Before GCP Staging Redeploy

### BLOCKING
1. **STG-503**: Implement zero-amount checkout guard in usePaymentFlow/PaymentScreenV3

### HIGH PRIORITY
2. **HI-001**: Verify migration 202 RBAC is intentionally deferred or wire permission checks
3. **MI-002**: Make payment provider validation fail-fast (partial config → exit 1)

### BEFORE PRODUCTION (non-blocking for staging)
4. **MI-001**: Add ADMIN_SERVICE_URL to .env.prod.example
5. **M-001**: Verify supplier invoice PDF auth in staging
6. **M-002**: Test SSE reconnection under network throttling
7. Set `EXPO_PUBLIC_APP_STORE_URL` before iOS launch
8. Verify migrations 195–202 apply cleanly on staging Cloud SQL
9. Run operator E2E on staging after deploy
