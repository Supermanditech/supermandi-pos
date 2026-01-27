# SUPERMANDI GO-LIVE USER WORKFLOW AUDIT REPORT

**Audit Date:** 2026-01-28
**Branch:** main
**Commit:** b6c2257
**Auditor:** Claude (Automated Audit)

---

## EXECUTIVE SUMMARY

This comprehensive audit identified **67 workflow gaps** across all SuperMandi applications that could block Go-Live for 10,000 stores/users.

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 18 | Go-Live blockers requiring immediate fix |
| HIGH | 29 | Significant issues affecting core workflows |
| MEDIUM | 20 | Operational issues affecting user experience |

---

## 1. USER WORKFLOW MAPS

### 1.1 RETAILER JOURNEY (POS Mobile App)

```
Retailer Login
    ├── Device Enrollment ✓
    │   └── Scan QR → Enter Label → Enroll
    │       ✓ Screen exists
    │       ✓ Submit handler works
    │       ⚠ No duplicate label detection
    │
    ├── Sell Flow ✓
    │   └── Scan → Add Item → Payment → Receipt
    │       ✓ Barcode scanning works
    │       ✓ Cart management works
    │       ⚠ Price resolution errors not shown
    │       ❌ Split payment doesn't verify success
    │
    ├── Buy Flow ⚠
    │   └── Browse Catalog → Add to Cart → Checkout
    │       ✓ Product browsing works
    │       ✓ Cart management works
    │       ❌ Add to Order button non-functional (LiveSuppliersView)
    │       ❌ Checkout flow incomplete from cart modal
    │
    ├── Payment Flows ⚠
    │   ├── Cash ✓ Complete
    │   ├── UPI ⚠ UTR manual entry, no verification
    │   ├── Due ✓ Complete
    │   └── BNPL ⚠ Manual UTR entry required
    │
    ├── Store Settings ❌
    │   └── ❌ No settings page in retailer-admin
    │   └── ❌ Cannot configure UPI VPA, tax, preferences
    │
    └── Ledger & Summary ⚠
        ├── Inventory Ledger ✓ Works
        └── Daily Summary ⚠ API exists but UI doesn't call it
```

### 1.2 SUPPLIER JOURNEY (Supplier Portal)

```
Supplier Registration
    ├── Account Creation ⚠
    │   ├── ✓ Multi-step form works
    │   ├── ⚠ GSTIN optional but validated
    │   └── ❌ No email verification step
    │
    ├── Login ⚠
    │   ├── ✓ Authentication works
    │   └── ❌ No password reset flow
    │
    ├── Product Creation ⚠
    │   ├── ✓ Manual creation works
    │   ├── ✓ CSV upload works
    │   ├── ❌ No barcode format validation
    │   ├── ❌ MRP < Purchase price not prevented
    │   └── ❌ Category is free-text, not dropdown
    │
    ├── Approval Visibility ⚠
    │   ├── ✓ Pending count shown
    │   ├── ❌ No rejection reason displayed
    │   └── ❌ No re-submission workflow
    │
    ├── Order Management ⚠
    │   ├── ✓ Order list works
    │   ├── ✓ Status updates work
    │   ├── ❌ No item-level tracking
    │   └── ❌ No shipment integration
    │
    └── Bank Details ❌
        ├── ✓ Form exists
        ├── ❌ No account verification
        ├── ❌ IFSC format not validated
        └── ❌ No payout readiness indicator
```

### 1.3 SUPERADMIN JOURNEY (Control Plane)

```
Admin Login
    └── ✓ Token-based auth works

Supplier Approval ✓
    └── ✓ Approve/Reject/Link workflows work

Product Approval ❌
    └── ❌ COMPLETELY MISSING - No UI, No API endpoints

Margin/BNPL/Credit Controls ❌
    └── ❌ COMPLETELY MISSING - No UI, No API endpoints

Analytics ✓
    └── ✓ Read-only dashboards work

Store Management ⚠
    ├── ✓ Create store works
    ├── ✓ UPI VPA config works
    └── ⚠ No bulk operations

User Management ⚠
    ├── ✓ Status change works
    └── ❌ No user creation/deletion
```

### 1.4 CROSS-APP WORKFLOWS

```
Supplier Product → Admin Approval → Retailer Visibility → POS
    ├── Step 1: Supplier Creates ✓
    ├── Step 2: Admin Approves ✓
    ├── Step 3: ❌ BREAK - Retailer cannot see approved products
    └── Step 4: ❌ BREAK - POS never receives products

Retailer Config → POS Behavior
    ├── UPI VPA ✓ Works end-to-end
    ├── BNPL Flag ✓ Syncs correctly
    └── Credit Flag ❌ BREAK - Not in POS ui-status endpoint

POS Action → Retailer Dashboard
    ├── Sale Creation ✓ Works
    ├── Inventory Ledger ⚠ Partial - data drift possible
    └── Stock Sync ❌ BREAK - stock_balances vs store_products not synced

Admin Action → Supplier/Retailer Impact
    ├── Supplier Approval ✓ Visible in portal
    └── Store Settings ⚠ Partial - credit flag not propagated
```

---

## 2. GAP MATRIX (GLOBAL)

| App | Workflow | Step | Status | Issue |
|-----|----------|------|--------|-------|
| POS | Sell | Payment (Split) | PARTIAL | Split payment success not verified |
| POS | Sell | Price Display | PARTIAL | Price resolution errors not shown |
| POS | Buy | Checkout | BROKEN | PurchaseCartModal has no checkout path |
| POS | Buy | Add to Order | BROKEN | LiveSuppliersView button non-functional |
| POS | Payment | UPI Verify | MISSING | UTR never verified with backend |
| POS | Payment | Credit | BROKEN | Items removed before payment confirmed |
| POS | BNPL | Payment | PARTIAL | Manual UTR entry required |
| POS | State | Cart Lock | MISSING | Lock state not persisted |
| POS | State | Inward Store | MISSING | No persistence, lost on restart |
| POS | Offline | Stock | BROKEN | Returns 0 stock when offline |
| POS | Offline | Inventory TX | BROKEN | Transactions silently fail offline |
| POS | Service | Printing | STUB | All printer methods are stubs |
| Retailer | Settings | UPI/Tax | MISSING | No settings page exists |
| Retailer | Settings | Store Config | MISSING | No configuration UI |
| Retailer | Products | BNPL Toggle | MISSING | Cannot toggle BNPL per product |
| Retailer | Credit | Customer Dues | MISSING | No customer credit page |
| Retailer | Summary | Daily Sales | UNUSED | API exists but UI doesn't call |
| Retailer | Compliance | Doc Upload | MOCK | Handler just resets form |
| Retailer | Export | Data Export | MISSING | Button exists, no handler |
| Retailer | Admin | Role Check | MISSING | Admin routes accessible to all |
| Supplier | Register | Email Verify | MISSING | No verification step |
| Supplier | Login | Password Reset | MISSING | No recovery flow |
| Supplier | Products | Barcode Valid | MISSING | No GTIN format validation |
| Supplier | Products | Price Valid | MISSING | MRP < Price allowed |
| Supplier | Products | Category | PARTIAL | Free-text instead of dropdown |
| Supplier | Products | Re-submit | MISSING | No workflow for rejected items |
| Supplier | Products | Rejection | MISSING | No reason displayed |
| Supplier | Orders | Item Track | MISSING | No per-item status |
| Supplier | Orders | Shipment | MISSING | No tracking integration |
| Supplier | Bank | Verification | MISSING | No account validation |
| Supplier | Bank | IFSC | MISSING | No format validation |
| Supplier | Bank | Account# | MISSING | No format validation |
| Supplier | Payout | Readiness | MISSING | No checklist/status |
| Supplier | Payout | History | MISSING | No earnings page |
| Supplier | KYC | Documents | MISSING | No upload workflow |
| Supplier | Security | Token | RISK | Stored in localStorage |
| Supplier | Security | CSRF | MISSING | No CSRF protection |
| Supplier | Config | API URL | CRITICAL | Localhost fallback in prod |
| Admin | Products | Approval | MISSING | No endpoints, no UI |
| Admin | Margin | Controls | MISSING | No configuration UI |
| Admin | BNPL | Controls | MISSING | No configuration UI |
| Admin | Credit | Limits | MISSING | No configuration UI |
| Admin | Users | Create | MISSING | Cannot create new users |
| Admin | Users | Delete | MISSING | Cannot delete users |
| Admin | Audit | Trail | MISSING | No action logging |
| Backend | Response | Format | INCONSISTENT | No standard envelope |
| Backend | Validation | Library | MISSING | Inline validation only |
| Backend | Error | Codes | INCONSISTENT | Format varies by service |
| Cross-App | Catalog | Sync | BROKEN | Approved products not visible to retailers |
| Cross-App | Stock | Sync | BROKEN | POS stock not in retailer dashboard |
| Cross-App | Credit | Flag | BROKEN | Not in POS ui-status |
| Cross-App | Settings | Propagation | PARTIAL | Some settings don't sync |

---

## 3. GO-LIVE MICRO-TICKETS

### CRITICAL SEVERITY (18 Tickets)

---

#### GL-WF-001
**App:** POS
**Workflow:** Sell → Payment
**Step:** Split Payment Confirmation
**Problem:** Split payment success callback in PaymentScreen.tsx (lines 732-749) doesn't verify `result.paymentStatus`. Payment marked complete without backend confirmation.
**Impact:** Users see success even if payment failed. Financial reconciliation impossible.
**Acceptance Criteria:**
- UI: Add `if (!result.paymentStatus === 'completed') return;` guard before completing sale
- API: Return clear payment status in split payment response
- DB: Ensure payment_status column is set correctly
**Severity:** CRITICAL

---

#### GL-WF-002
**App:** POS
**Workflow:** Buy → Checkout
**Step:** Add to Order Button
**Problem:** LiveSuppliersView.tsx line 318-320 - "Add to Order" button has NO `onPress` handler. Button is decorative only.
**Impact:** Users cannot add supplier products to purchase order. Buy workflow completely broken.
**Acceptance Criteria:**
- UI: Implement `onPress` handler that adds selected items to purchase cart
- API: Call appropriate order creation endpoint
- DB: Order record created with selected items
**Severity:** CRITICAL

---

#### GL-WF-003
**App:** POS
**Workflow:** Buy → Checkout
**Step:** Cart to Order
**Problem:** PurchaseCartModal (line 252) calls `removeSupplierItems()` BEFORE payment confirmation. If payment API fails, items already removed from cart with no rollback.
**Impact:** Data loss - cart cleared even when payment fails. Users must re-add all items.
**Acceptance Criteria:**
- UI: Only remove items AFTER payment succeeds
- API: Return clear success/failure status
- DB: Transaction should be atomic
**Severity:** CRITICAL

---

#### GL-WF-004
**App:** POS
**Workflow:** Buy → Payment
**Step:** Credit Payment
**Problem:** PurchaseCartModal line 276 shows success alert but `creditApi.deductCredit()` is NEVER called. Credit payment is UI-only.
**Impact:** Credit balance never deducted. Financial loss for platform.
**Acceptance Criteria:**
- UI: Call credit deduction API before showing success
- API: Implement credit deduction endpoint if missing
- DB: Credit balance updated, transaction logged
**Severity:** CRITICAL

---

#### GL-WF-005
**App:** POS
**Workflow:** State Management
**Step:** Inward Store Persistence
**Problem:** inwardStore.ts has NO `persist()` middleware. Manual stock inward cart lost on app restart.
**Impact:** Users lose all scanned items when app restarts. Must re-scan entire stock.
**Acceptance Criteria:**
- UI: Cart persists across app restarts
- API: N/A (local state)
- DB: Local storage saves inward cart state
**Severity:** CRITICAL

---

#### GL-WF-006
**App:** POS
**Workflow:** Offline
**Step:** Stock Lookups
**Problem:** inventoryApi.ts lines 68-75, 99-110 return `currentQty: 0` when offline instead of using stockCache.
**Impact:** Cart normalization removes ALL items when offline. Cannot use POS without network.
**Acceptance Criteria:**
- UI: Show cached stock when offline
- API: Fall back to stockCache instead of returning 0
- DB: stockCache properly updated when online
**Severity:** CRITICAL

---

#### GL-WF-007
**App:** POS
**Workflow:** Offline
**Step:** Inventory Transactions
**Problem:** inventoryApi.ts lines 138-141, 165-167 return empty success `{ entries: [] }` when offline. Transactions silently lost.
**Impact:** Stock changes made offline never sync. Inventory data permanently wrong.
**Acceptance Criteria:**
- UI: Queue transactions for later sync
- API: Enqueue to outbox for async sync
- DB: Transactions eventually applied when online
**Severity:** CRITICAL

---

#### GL-WF-008
**App:** Supplier Portal
**Workflow:** Bank Details
**Step:** Account Verification
**Problem:** No bank account verification API called. Any account number accepted without validation.
**Impact:** Payouts may fail or go to wrong accounts. Legal/compliance risk.
**Acceptance Criteria:**
- UI: Show verification status, implement micro-deposit or IFSC lookup
- API: Call bank verification service before saving
- DB: Store verification status with bank details
**Severity:** CRITICAL

---

#### GL-WF-009
**App:** Supplier Portal
**Workflow:** Configuration
**Step:** API Base URL
**Problem:** api.ts line 2 falls back to `localhost:3000` if env vars missing in production.
**Impact:** Production portal makes requests to localhost. Complete service failure.
**Acceptance Criteria:**
- UI: Remove localhost fallback, fail explicitly if not configured
- API: N/A
- DB: N/A
**Severity:** CRITICAL

---

#### GL-WF-010
**App:** SuperAdmin
**Workflow:** Product Approval
**Step:** Entire Workflow
**Problem:** Product approval workflow COMPLETELY MISSING. No UI tab, no API endpoints, no database operations.
**Impact:** Cannot approve supplier products. Core marketplace functionality blocked.
**Acceptance Criteria:**
- UI: Add Products tab with pending list, approve/reject buttons
- API: Implement GET /pending, POST /approve, POST /reject endpoints
- DB: Update approval_status, log approver info
**Severity:** CRITICAL

---

#### GL-WF-011
**App:** SuperAdmin
**Workflow:** Margin Controls
**Step:** Configuration UI
**Problem:** Margin/BNPL/Credit controls COMPLETELY MISSING. No endpoints, no UI.
**Impact:** Cannot configure business parameters. Platform margins not controllable.
**Acceptance Criteria:**
- UI: Add Controls tab with margin %, BNPL settings, credit limits
- API: Implement CRUD endpoints for all control types
- DB: Store settings per store/supplier with audit trail
**Severity:** CRITICAL

---

#### GL-WF-012
**App:** Cross-App
**Workflow:** Supplier → Retailer
**Step:** Approved Product Visibility
**Problem:** retailer-admin products endpoint queries `store_products` only. NO mechanism to see approved `supplier_products`.
**Impact:** Retailers cannot discover or add approved supplier products. Supply chain broken.
**Acceptance Criteria:**
- UI: Add "Supplier Catalog" tab in retailer-admin showing approved products
- API: Add GET /retailer-admin/suppliers/catalog endpoint
- DB: Query supplier_products WHERE approval_status='approved'
**Severity:** CRITICAL

---

#### GL-WF-013
**App:** Cross-App
**Workflow:** POS → Retailer
**Step:** Stock Synchronization
**Problem:** POS updates `inventory.stock_balances`. Retailer-admin reads `catalog.store_products.current_stock`. No sync between them.
**Impact:** Retailer dashboard shows stale inventory. Stock discrepancies across apps.
**Acceptance Criteria:**
- UI: Stock values consistent between POS and retailer-admin
- API: Trigger sync after POS sale completion
- DB: Update store_products.current_stock from stock_balances
**Severity:** CRITICAL

---

#### GL-WF-014
**App:** Cross-App
**Workflow:** Settings Propagation
**Step:** Credit Flag in POS
**Problem:** pos/uiStatus.ts hard-codes `creditEnabled = false`. Never reads `platform.stores.credit_enabled`.
**Impact:** Credit feature always disabled in POS regardless of admin settings.
**Acceptance Criteria:**
- UI: Credit toggle reflects actual store setting
- API: Include credit_enabled in ui-status response
- DB: Query credit_enabled from platform.stores
**Severity:** CRITICAL

---

#### GL-WF-015
**App:** Retailer
**Workflow:** Store Settings
**Step:** Settings Page
**Problem:** No store settings page exists in retailer-admin. No route, no component, no API calls.
**Impact:** Retailers cannot configure UPI VPA, tax rates, store preferences.
**Acceptance Criteria:**
- UI: Create SettingsPage.tsx with UPI VPA, tax, preference forms
- API: Wire to existing settings endpoints
- DB: Settings persist to platform.stores
**Severity:** CRITICAL

---

#### GL-WF-016
**App:** POS
**Workflow:** Sell → Payment
**Step:** UPI Verification
**Problem:** PaymentOptionsSheet.tsx line 136-140 and SplitPaymentModal.tsx line 138-140 accept manual UTR entry without backend verification.
**Impact:** Users can enter any UTR and mark payment complete. Fraud vector.
**Acceptance Criteria:**
- UI: Add "Verify Payment" step with backend confirmation
- API: Implement payment verification endpoint
- DB: Store verified payment status
**Severity:** CRITICAL

---

#### GL-WF-017
**App:** Supplier
**Workflow:** Products
**Step:** Price Validation
**Problem:** products/page.tsx allows MRP < Purchase Price. No validation at lines 264-275.
**Impact:** Products with impossible pricing (loss on every sale) can be created.
**Acceptance Criteria:**
- UI: Validate MRP >= Purchase Price before submit
- API: Backend validation as second check
- DB: Constraint or trigger to prevent invalid pricing
**Severity:** CRITICAL

---

#### GL-WF-018
**App:** Supplier
**Workflow:** KYC
**Step:** Document Upload
**Problem:** No KYC document upload workflow exists in supplier portal. Required for compliance.
**Impact:** Cannot verify supplier identity. Regulatory compliance blocked.
**Acceptance Criteria:**
- UI: Add KYC tab with document upload forms
- API: Implement document upload and verification endpoints
- DB: Store document references, verification status
**Severity:** CRITICAL

---

### HIGH SEVERITY (29 Tickets)

---

#### GL-WF-019
**App:** POS
**Workflow:** State
**Step:** Cart Lock Persistence
**Problem:** cartStore.ts line 679-682 partialize doesn't include `locked` state. Lock lost on app crash during payment.
**Impact:** Cart can be modified after crash even if payment was in progress.
**Acceptance Criteria:**
- UI: Cart lock persists across app restarts
- API: N/A
- DB: Include `locked` in persisted state
**Severity:** HIGH

---

#### GL-WF-020
**App:** POS
**Workflow:** Sell
**Step:** Price Resolution
**Problem:** SellScanScreen.tsx doesn't show error when `resolveSkuPrice()` returns null.
**Impact:** Users add items without understanding price failures.
**Acceptance Criteria:**
- UI: Show Alert for "Price not available for this product"
- API: N/A
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-021
**App:** POS
**Workflow:** Enrollment
**Step:** Duplicate Detection
**Problem:** EnrollDeviceScreen.tsx lines 259-268 don't check for duplicate device labels.
**Impact:** Same device can be enrolled multiple times with empty labels.
**Acceptance Criteria:**
- UI: Check enrollment history before accepting label
- API: Validate label uniqueness per store
- DB: Unique constraint on store_id + label
**Severity:** HIGH

---

#### GL-WF-022
**App:** POS
**Workflow:** BNPL
**Step:** Payment Confirmation
**Problem:** BnplDuesScreen.tsx lines 445-454 require manual UTR entry. No automatic polling.
**Impact:** Error-prone, users must manually enter transaction reference.
**Acceptance Criteria:**
- UI: Auto-poll payment status after UPI deep link
- API: Implement payment status polling endpoint
- DB: Update payment status via webhook or poll
**Severity:** HIGH

---

#### GL-WF-023
**App:** POS
**Workflow:** Menu
**Step:** Placeholder Buttons
**Problem:** MenuScreen.tsx lines 344-355 - Download/Reprint/Share buttons all navigate to goToBills() with no actual handler.
**Impact:** Buttons appear clickable but do nothing. Poor UX.
**Acceptance Criteria:**
- UI: Either implement handlers or disable buttons with explanation
- API: N/A
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-024
**App:** POS
**Workflow:** State
**Step:** Settings Sync
**Problem:** settingsStore.ts lines 34-44 use hard-coded defaults. No `loadSettings()` action to fetch from API.
**Impact:** BNPL/Credit limits not synced with backend. Stale limits used.
**Acceptance Criteria:**
- UI: Call loadSettings() on app start
- API: Fetch current limits from BNPL API
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-025
**App:** POS
**Workflow:** Service
**Step:** Printing
**Problem:** printerService.ts line 19+ - ALL methods are stubs. Always returns `connected: false`.
**Impact:** Receipt printing completely non-functional.
**Acceptance Criteria:**
- UI: Either implement real printer integration or remove from workflows
- API: N/A
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-026
**App:** POS
**Workflow:** State
**Step:** Product Store Error
**Problem:** productsStore.ts lines 93-96 sets both `error` and `products` after failure. Confusing state.
**Impact:** UI shows both error and fallback data simultaneously.
**Acceptance Criteria:**
- UI: Clear error if fallback succeeded, or show fallback message
- API: N/A
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-027
**App:** POS
**Workflow:** State
**Step:** Purchase Draft Validation
**Problem:** purchaseDraftLogic.ts lines 35-50 marks draft COMPLETE without supplier info.
**Impact:** Cannot submit digitized items without supplier selection.
**Acceptance Criteria:**
- UI: Add supplier to COMPLETE check
- API: N/A
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-028
**App:** Retailer
**Workflow:** Session
**Step:** Pre-expiry Warning
**Problem:** AuthContext.tsx has idle timeout (30 min) but no warning before expiration.
**Impact:** Users surprise-logged-out in middle of work.
**Acceptance Criteria:**
- UI: Show 5-minute warning modal before idle timeout
- API: N/A
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-029
**App:** Retailer
**Workflow:** Products
**Step:** BNPL Toggle
**Problem:** No BNPL toggle in ProductsPage.tsx form. Admin-only feature.
**Impact:** Retailers cannot enable BNPL per product.
**Acceptance Criteria:**
- UI: Add "BNPL Eligible" toggle to product form
- API: Include bnpl_eligible in product PATCH
- DB: Update store_products.bnpl_eligible
**Severity:** HIGH

---

#### GL-WF-030
**App:** Retailer
**Workflow:** Summary
**Step:** Daily Summary UI
**Problem:** fetchDailySummary() in store.ts lines 285-299 defined but never called in UI.
**Impact:** Wasted feature. Retailers cannot see daily sales summary.
**Acceptance Criteria:**
- UI: Add Dashboard card calling fetchDailySummary()
- API: Already implemented
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-031
**App:** Retailer
**Workflow:** Export
**Step:** Data Export
**Problem:** DashboardPage.tsx lines 692-719 - Export button has NO `onClick` handler.
**Impact:** Button exists but does nothing. Misleading UI.
**Acceptance Criteria:**
- UI: Implement export handler or remove button
- API: Add CSV export endpoint if needed
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-032
**App:** Retailer
**Workflow:** Compliance
**Step:** Document Upload
**Problem:** CompliancePage.tsx line 44-50 - `handleUpload()` just resets form. No actual upload.
**Impact:** Cannot upload compliance documents. Regulatory risk.
**Acceptance Criteria:**
- UI: Implement real upload logic
- API: Add document upload endpoint
- DB: Store document references
**Severity:** HIGH

---

#### GL-WF-033
**App:** Retailer
**Workflow:** Admin Routes
**Step:** Role Check
**Problem:** App.tsx lines 88-90 - Admin routes accessible without role verification.
**Impact:** Regular retailers can attempt admin actions (backend rejects but UX is broken).
**Acceptance Criteria:**
- UI: Add role checking in ProtectedRoute component
- API: N/A (already enforced)
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-034
**App:** Supplier
**Workflow:** Registration
**Step:** Email Verification
**Problem:** register/page.tsx completes immediately without email verification.
**Impact:** Unverified emails in system. Spam accounts possible.
**Acceptance Criteria:**
- UI: Add verification step post-registration
- API: Send verification email, check verification status
- DB: Track email_verified status
**Severity:** HIGH

---

#### GL-WF-035
**App:** Supplier
**Workflow:** Login
**Step:** Password Reset
**Problem:** No "Forgot Password?" link on login page.
**Impact:** Users cannot recover locked accounts.
**Acceptance Criteria:**
- UI: Add forgot password link and flow
- API: Implement password reset endpoints
- DB: Store reset tokens with expiry
**Severity:** HIGH

---

#### GL-WF-036
**App:** Supplier
**Workflow:** Products
**Step:** Rejection Reason
**Problem:** products/page.tsx line 437-443 shows "rejected" status but no reason.
**Impact:** Users don't know what to fix for re-submission.
**Acceptance Criteria:**
- UI: Display rejection_reason field
- API: Include reason in product response
- DB: Already stored in rejection_reason column
**Severity:** HIGH

---

#### GL-WF-037
**App:** Supplier
**Workflow:** Products
**Step:** Re-submission
**Problem:** Edit flow (lines 108-122) doesn't trigger re-approval workflow.
**Impact:** Unclear if edit triggers re-review. Silent failure after edit.
**Acceptance Criteria:**
- UI: Show "Submit for Re-approval" button after editing rejected product
- API: Reset approval_status to 'pending' on edit
- DB: Track re-submission timestamp
**Severity:** HIGH

---

#### GL-WF-038
**App:** Supplier
**Workflow:** Orders
**Step:** Item-level Tracking
**Problem:** Orders modal shows items (lines 243-286) but no per-item status.
**Impact:** Partial shipments not trackable.
**Acceptance Criteria:**
- UI: Add status per item in order detail
- API: Include item statuses in order response
- DB: Track status per order_item
**Severity:** HIGH

---

#### GL-WF-039
**App:** Supplier
**Workflow:** Orders
**Step:** Shipment Integration
**Problem:** No tracking number entry, carrier selection, or label generation.
**Impact:** Manual shipment management required.
**Acceptance Criteria:**
- UI: Add tracking number input, carrier dropdown
- API: Store tracking info, optionally integrate with carrier APIs
- DB: tracking_number, carrier columns on orders
**Severity:** HIGH

---

#### GL-WF-040
**App:** Supplier
**Workflow:** Bank
**Step:** IFSC Validation
**Problem:** profile/page.tsx line 310-318 only does uppercase conversion. No format validation.
**Impact:** Invalid IFSC codes accepted.
**Acceptance Criteria:**
- UI: Validate IFSC format (^[A-Z]{4}0[A-Z0-9]{6}$)
- API: Backend validation as second check
- DB: Store only valid IFSC codes
**Severity:** HIGH

---

#### GL-WF-041
**App:** Supplier
**Workflow:** Bank
**Step:** Account Number Validation
**Problem:** profile/page.tsx line 296-305 has no format validation.
**Impact:** Invalid account numbers accepted.
**Acceptance Criteria:**
- UI: Validate numeric, 9-18 digits
- API: Backend validation
- DB: Store only valid account numbers
**Severity:** HIGH

---

#### GL-WF-042
**App:** Supplier
**Workflow:** Bank
**Step:** Status Indicator
**Problem:** No indicator if bank details are verified/pending/rejected.
**Impact:** Users unsure if payouts will work.
**Acceptance Criteria:**
- UI: Show verification status badge
- API: Include verification_status in profile response
- DB: Track bank_verification_status
**Severity:** HIGH

---

#### GL-WF-043
**App:** Supplier
**Workflow:** Payout
**Step:** Readiness Dashboard
**Problem:** No payout prerequisites checklist on dashboard.
**Impact:** Users don't know requirements for receiving payouts.
**Acceptance Criteria:**
- UI: Add payout readiness checklist card
- API: Return completeness status for each requirement
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-044
**App:** Supplier
**Workflow:** Payout
**Step:** History
**Problem:** No payout history, earnings page, or wallet status.
**Impact:** Users can't track earnings or payment status.
**Acceptance Criteria:**
- UI: Add Earnings/Payouts page
- API: Implement payout history endpoint
- DB: Query payout records
**Severity:** HIGH

---

#### GL-WF-045
**App:** Supplier
**Workflow:** Security
**Step:** Token Storage
**Problem:** api.ts line 18, 23 stores auth token in localStorage.
**Impact:** XSS vulnerability - tokens compromised if XSS found.
**Acceptance Criteria:**
- UI: Move token to HTTP-only secure cookie
- API: Set cookie in auth response
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-046
**App:** Supplier
**Workflow:** Security
**Step:** 401 Handling
**Problem:** No handler for expired token responses.
**Impact:** Silent failures when token expires mid-session.
**Acceptance Criteria:**
- UI: Intercept 401 responses, redirect to login
- API: N/A
- DB: N/A
**Severity:** HIGH

---

#### GL-WF-047
**App:** Admin
**Workflow:** Users
**Step:** User Creation
**Problem:** No user creation UI - admin cannot create new users.
**Impact:** All users must self-register. No admin onboarding.
**Acceptance Criteria:**
- UI: Add "Create User" form in Users tab
- API: Implement POST /admin/users endpoint
- DB: Insert into users table with role
**Severity:** HIGH

---

### MEDIUM SEVERITY (20 Tickets)

---

#### GL-WF-048
**App:** POS
**Workflow:** Sell
**Step:** Validation Feedback
**Problem:** StockInView.tsx line 166 validation allows qty=0 items.
**Impact:** Empty items can be submitted.
**Acceptance Criteria:**
- UI: Require qty > 0 for all items
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-049
**App:** POS
**Workflow:** Buy
**Step:** BNPL Due Date
**Problem:** SupplierCartSection.tsx line 77 uses hardcoded 7-day `bnplMaxDays`.
**Impact:** Dynamic backend value ignored.
**Acceptance Criteria:**
- UI: Read bnplMaxDays from backend
- API: Include in relevant responses
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-050
**App:** POS
**Workflow:** Feature
**Step:** Feature Re-detection
**Problem:** FeatureGate.tsx line 105 calls useFeatureEnabled() once on render. Changes not detected.
**Impact:** Feature flag changes ignored until component remounts.
**Acceptance Criteria:**
- UI: Periodically check feature flags or add retry button
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-051
**App:** POS
**Workflow:** State
**Step:** Stock Cache Expiry
**Problem:** stockCache.ts line 78 returns null when cache expired.
**Impact:** Items may be incorrectly marked as "no stock".
**Acceptance Criteria:**
- UI: Show "stock unknown" instead of removing items
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-052
**App:** POS
**Workflow:** State
**Step:** Mutation History
**Problem:** cartStore.ts line 61, 679-682 - mutationHistory not persisted.
**Impact:** Undo history lost on app restart.
**Acceptance Criteria:**
- UI: Persist mutationHistory (optional)
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-053
**App:** Retailer
**Workflow:** Logout
**Step:** Confirmation
**Problem:** ProtectedLayout.tsx lines 19-21 - no confirmation dialog before logout.
**Impact:** Accidental logouts possible.
**Acceptance Criteria:**
- UI: Add confirmation modal
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-054
**App:** Retailer
**Workflow:** Customer
**Step:** Credit Page
**Problem:** No customer credit accounts page.
**Impact:** Cannot track customer dues.
**Acceptance Criteria:**
- UI: Create CustomerCreditsPage.tsx
- API: Implement customer dues endpoints
- DB: Query customer_dues table
**Severity:** MEDIUM

---

#### GL-WF-055
**App:** Retailer
**Workflow:** Import
**Step:** Error Clarity
**Problem:** ImportPage.tsx lines 254-256 - Commit disabled without clear reason.
**Impact:** Users don't know why they can't proceed.
**Acceptance Criteria:**
- UI: Show specific reason why commit is disabled
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-056
**App:** Supplier
**Workflow:** Products
**Step:** Barcode Validation
**Problem:** products/page.tsx lines 226-234 accepts any string as barcode.
**Impact:** Invalid product codes in system.
**Acceptance Criteria:**
- UI: Validate GTIN format (8, 12, 13, or 14 digits)
- API: Backend validation
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-057
**App:** Supplier
**Workflow:** Products
**Step:** Category Dropdown
**Problem:** products/page.tsx line 214-222 - category is free-text.
**Impact:** Inconsistent categorization, filtering issues.
**Acceptance Criteria:**
- UI: Replace with dropdown from backend categories
- API: Provide categories list endpoint
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-058
**App:** Supplier
**Workflow:** Products
**Step:** Visibility Indicator
**Problem:** dashboard/page.tsx line 74-81 doesn't show if pending products visible to retailers.
**Impact:** Users unclear about visibility before approval.
**Acceptance Criteria:**
- UI: Add "Pending products not visible to retailers" message
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-059
**App:** Supplier
**Workflow:** Upload
**Step:** File Size
**Problem:** upload/page.tsx line 170 says "max 10MB" but not enforced.
**Impact:** Large files sent to backend.
**Acceptance Criteria:**
- UI: Check file.size before upload
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-060
**App:** Supplier
**Workflow:** Upload
**Step:** CSV Preview
**Problem:** No client-side CSV format validation before upload.
**Impact:** Errors only shown after upload completes.
**Acceptance Criteria:**
- UI: Parse and preview CSV before upload
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-061
**App:** Supplier
**Workflow:** Logout
**Step:** Confirmation
**Problem:** layout.tsx line 97-102 - logout button has no confirmation.
**Impact:** Accidental logouts.
**Acceptance Criteria:**
- UI: Add confirmation dialog
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-062
**App:** Supplier
**Workflow:** Forms
**Step:** Unsaved Warning
**Problem:** No warning when navigating away with unsaved changes.
**Impact:** Data loss without warning.
**Acceptance Criteria:**
- UI: Add beforeunload handler and route change warning
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-063
**App:** Supplier
**Workflow:** Lists
**Step:** Pagination
**Problem:** orders/page.tsx, products/page.tsx load all records at once.
**Impact:** Performance issues with 1000+ records.
**Acceptance Criteria:**
- UI: Add pagination controls
- API: Support limit/offset parameters
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-064
**App:** Admin
**Workflow:** Login
**Step:** Token Security
**Problem:** Admin token stored in localStorage as plaintext.
**Impact:** Security concern for admin sessions.
**Acceptance Criteria:**
- UI: Use session storage or secure cookie
- API: N/A
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-065
**App:** Admin
**Workflow:** Suppliers
**Step:** Audit Trail
**Problem:** No logging of who approved/rejected suppliers and when.
**Impact:** No accountability for admin actions.
**Acceptance Criteria:**
- UI: Show approver info in supplier details
- API: Log admin_id, timestamp on all actions
- DB: audit_logs table with action details
**Severity:** MEDIUM

---

#### GL-WF-066
**App:** Backend
**Workflow:** API
**Step:** Response Format
**Problem:** Inconsistent response envelope across endpoints.
**Impact:** Frontend must handle variable formats.
**Acceptance Criteria:**
- UI: N/A
- API: Standardize on `{ data, error, meta }` envelope
- DB: N/A
**Severity:** MEDIUM

---

#### GL-WF-067
**App:** Backend
**Workflow:** API
**Step:** Validation Library
**Problem:** No centralized validation - inline validation in every handler.
**Impact:** Code duplication, maintenance burden.
**Acceptance Criteria:**
- UI: N/A
- API: Implement Zod or similar schema validation
- DB: N/A
**Severity:** MEDIUM

---

## 4. EXECUTION PRIORITY

### Phase 1: Critical (Before Go-Live)
| Ticket | Est. Effort | Dependencies |
|--------|------------|--------------|
| GL-WF-012 (Catalog Sync) | 2 days | None |
| GL-WF-010 (Product Approval) | 3 days | GL-WF-012 |
| GL-WF-011 (Margin Controls) | 2 days | None |
| GL-WF-001 (Split Payment) | 0.5 days | None |
| GL-WF-002 (Add to Order) | 1 day | None |
| GL-WF-003 (Cart Rollback) | 1 day | None |
| GL-WF-004 (Credit Payment) | 1 day | None |
| GL-WF-016 (UPI Verify) | 2 days | None |
| GL-WF-013 (Stock Sync) | 1 day | None |
| GL-WF-014 (Credit Flag) | 0.5 days | None |
| GL-WF-015 (Settings Page) | 2 days | None |
| GL-WF-005 (Inward Persist) | 0.5 days | None |
| GL-WF-006 (Offline Stock) | 1 day | None |
| GL-WF-007 (Offline TX) | 1 day | GL-WF-006 |
| GL-WF-008 (Bank Verify) | 2 days | None |
| GL-WF-009 (API URL) | 0.5 days | None |
| GL-WF-017 (Price Valid) | 0.5 days | None |
| GL-WF-018 (KYC Upload) | 3 days | None |

### Phase 2: High Priority (Post Go-Live Sprint 1)
All HIGH severity tickets (GL-WF-019 through GL-WF-047)

### Phase 3: Medium Priority (Post Go-Live Sprint 2)
All MEDIUM severity tickets (GL-WF-048 through GL-WF-067)

---

## 5. APPENDIX: FILES REQUIRING CHANGES

### POS Mobile App
| File | Tickets |
|------|---------|
| src/components/sell/SplitPaymentModal.tsx | GL-WF-001, GL-WF-016 |
| src/components/buy/PaymentOptionsSheet.tsx | GL-WF-016 |
| src/components/buy/PurchaseCartModal.tsx | GL-WF-003, GL-WF-004 |
| src/components/purchase/LiveSuppliersView.tsx | GL-WF-002 |
| src/screens/PaymentScreen.tsx | GL-WF-001, GL-WF-020 |
| src/screens/SellScanScreen.tsx | GL-WF-020 |
| src/screens/EnrollDeviceScreen.tsx | GL-WF-021 |
| src/screens/BnplDuesScreen.tsx | GL-WF-022 |
| src/screens/MenuScreen.tsx | GL-WF-023 |
| src/stores/cartStore.ts | GL-WF-019, GL-WF-052 |
| src/stores/inwardStore.ts | GL-WF-005 |
| src/stores/settingsStore.ts | GL-WF-024 |
| src/stores/productsStore.ts | GL-WF-026 |
| src/stores/purchaseDraftLogic.ts | GL-WF-027 |
| src/services/printerService.ts | GL-WF-025 |
| src/services/api/inventoryApi.ts | GL-WF-006, GL-WF-007 |
| src/services/stockCache.ts | GL-WF-051 |
| src/components/FeatureGate.tsx | GL-WF-050 |

### Retailer Admin
| File | Tickets |
|------|---------|
| src/pages/SettingsPage.tsx (NEW) | GL-WF-015 |
| src/pages/ProductsPage.tsx | GL-WF-029 |
| src/pages/DashboardPage.tsx | GL-WF-030, GL-WF-031 |
| src/pages/CompliancePage.tsx | GL-WF-032 |
| src/App.tsx | GL-WF-033 |
| src/lib/AuthContext.tsx | GL-WF-028 |
| src/components/ProtectedLayout.tsx | GL-WF-053 |

### Supplier Portal
| File | Tickets |
|------|---------|
| src/lib/api.ts | GL-WF-009, GL-WF-045, GL-WF-046 |
| src/app/(auth)/register/page.tsx | GL-WF-034 |
| src/app/(auth)/login/page.tsx | GL-WF-035 |
| src/app/(dashboard)/products/page.tsx | GL-WF-017, GL-WF-036, GL-WF-037, GL-WF-056, GL-WF-057 |
| src/app/(dashboard)/orders/page.tsx | GL-WF-038, GL-WF-039, GL-WF-063 |
| src/app/(dashboard)/profile/page.tsx | GL-WF-008, GL-WF-040, GL-WF-041, GL-WF-042 |
| src/app/(dashboard)/dashboard/page.tsx | GL-WF-043, GL-WF-058 |
| src/app/(dashboard)/upload/page.tsx | GL-WF-059, GL-WF-060 |
| src/app/(dashboard)/layout.tsx | GL-WF-061 |
| src/app/(dashboard)/earnings/page.tsx (NEW) | GL-WF-044 |
| src/app/(dashboard)/kyc/page.tsx (NEW) | GL-WF-018 |

### SuperAdmin Dashboard
| File | Tickets |
|------|---------|
| src/App.tsx | GL-WF-010, GL-WF-011, GL-WF-047, GL-WF-064, GL-WF-065 |
| src/api/products.ts (NEW) | GL-WF-010 |
| src/api/controls.ts (NEW) | GL-WF-011 |

### Backend
| File | Tickets |
|------|---------|
| backend/src/routes/v1/pos/uiStatus.ts | GL-WF-014 |
| backend/src/routes/v1/retailer-admin/products.ts | GL-WF-012 |
| backend/src/routes/v1/retailer-admin/suppliers.ts (NEW) | GL-WF-012 |
| backend/src/routes/v1/admin/products.ts (NEW) | GL-WF-010 |
| backend/src/routes/v1/admin/controls.ts (NEW) | GL-WF-011 |
| backend/src/middleware/responseEnvelope.ts (NEW) | GL-WF-066 |

---

**Report Generated:** 2026-01-28
**Total Issues:** 67
**Critical:** 18 | **High:** 29 | **Medium:** 20
**Estimated Total Effort:** ~50 engineering days for Critical + High priority items
