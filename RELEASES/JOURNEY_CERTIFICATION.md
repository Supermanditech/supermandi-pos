# Journey Certification Framework
# Created: 2026-03-09 | Owner: CLAUDE + OPERATOR
# Supplemental framework overlay. Canonical execution truth remains:
# RELEASES/CLAUDE_CURRENT_STATE.json + RELEASES/JOURNEY_MAP.json + RELEASES/CCC_FRAMEWORK.md
# Rule: Nothing ships until its journey is PARK-READY at code level and later runtime-certified through the required gates.

---

## PROCESS RULES (NON-NEGOTIABLE)

1. **One journey at a time.** No parallel journey work. Finish → certify → next.
2. **8-gate certification.** Every journey must pass the code-level gates before `PARK-READY`, then runtime gates before live certification.
3. **Build LAST.** APK/portal builds happen ONLY after the active journey or approved journey cluster is `PARK-READY` at code level.
4. **Operator tests PARK-READY candidates only.** No more "try this APK and see."
5. **Regression = journey decertification.** If a fix in Journey X breaks Journey Y, Journey Y loses `PARK-READY` or `CERTIFIED` status.
6. **Fix forward, never skip.** Every gate failure becomes a ticket, fixed before certification.
7. **Evidence required.** Each gate needs specific proof (curl output, screenshot, test pass log).

### Canonical Truth Rule

- This file is a supplemental per-journey certification overlay.
- It does **not** override `CLAUDE_CURRENT_STATE.json`, `JOURNEY_MAP.json`, or `CCC_FRAMEWORK.md`.
- Current execution order, active journey, lifecycle phase, and blocker truth always come from those canonical files.
- If this file conflicts with canonical repo truth, canonical repo truth wins.

---

## THE 8 GATES

| Gate | Name | What It Tests | Evidence |
|------|------|---------------|----------|
| G1 | **UI Elements** | All buttons, fields, labels, headers, footers render correctly | Screenshot or component test |
| G2 | **UX States** | Loading, success, empty, error states all handled | Screenshot of each state |
| G3 | **Navigation** | Entry → screens → back → exit all work; no dead ends | Navigation trace log |
| G4 | **Wiring** | Every UI action → correct API call → correct state update | Network trace or test |
| G5 | **Business Logic** | Domain invariants hold (stock, price, isolation, idempotency) | Unit/integration test |
| G6 | **API Contract** | Request/response shapes match, error codes correct, auth enforced | Contract test + curl |
| G7 | **DB Integrity** | Correct rows created/updated, constraints hold, no orphans | SQL query proof |
| G8 | **Cross-Portal** | Data created in portal A is correctly visible/usable in portal B | Cross-check proof |

---

## MVP JOURNEYS (Priority Order)

These are the minimum journeys needed for a working system. Each depends on prior ones.

### LAYER 1: Foundation (must work first)

#### J1: SuperAdmin Login + Store Management
- **Actor**: SuperAdmin operator
- **Surface**: supermandi-superadmin portal
- **Flow**: Login → #stores → #staff → #applications → #suppliers
- **Why first**: All other journeys depend on SuperAdmin being able to approve/manage

#### J2: Retailer Registration → Approval → First Login
- **Actor**: New retailer + SuperAdmin
- **Surface**: retailer-admin + supermandi-superadmin + backend
- **Flow**: Register (phone→OTP→details→KYC→submit) → SA approve → First login → Dashboard
- **Dependencies**: J1 (SuperAdmin must work)

### LAYER 2: POS Setup (depends on Layer 1)

#### J3: POS Device Enrollment + Staff Login
- **Actor**: Store staff with device
- **Surface**: POS app + supermandi-superadmin (staff creation)
- **Flow**: Install → Enroll (code) → Staff login (phone+PIN) → Menu screen
- **Dependencies**: J2 (store must exist)

### LAYER 3: Core Commerce (depends on Layer 2)

#### J4: POS Sell Flow (JOURNEY-02)
- **Actor**: Store staff (SALES or MANAGER)
- **Surface**: POS app + backend
- **Flow**: Scan/search → product found with stock → add to cart → checkout → receipt → stock decremented
- **Dependencies**: J3 (POS must be set up), stock must exist

#### J5: POS Opening Stock
- **Actor**: Store MANAGER
- **Surface**: POS app + backend
- **Flow**: Opening Stock → search product → enter qty → submit → stock_balances created
- **Dependencies**: J3 (POS must be set up), products must exist in store

### LAYER 4: Supplier (parallel to Layer 3)

#### J6: Supplier Registration → Verification → Login
- **Actor**: New supplier + SuperAdmin
- **Surface**: supplier-portal + supermandi-superadmin + backend
- **Flow**: Register (GSTIN→phone→details→docs→submit) → SA verify → First login → Dashboard
- **Dependencies**: J1 (SuperAdmin must work)

---

## CERTIFICATION STATUS

This table is a planning overlay, not the authoritative journey-state machine.
Canonical status still lives in `RELEASES/JOURNEY_MAP.json`.

| Journey | G1 UI | G2 UX | G3 Nav | G4 Wire | G5 Logic | G6 API | G7 DB | G8 Cross | Status |
|---------|-------|-------|--------|---------|----------|--------|-------|----------|--------|
| J1: SA Login | ? | ? | ? | ? | ? | ? | ? | N/A | **PARK-READY_RUNTIME_PENDING** |
| J2: Retailer Reg→Login | ? | ? | ? | ? | ? | ? | ? | ? | **PARK-READY_RUNTIME_PENDING** |
| J3: POS Setup | ? | ? | ? | ? | ? | ? | ? | ? | **PARK-READY_RUNTIME_PENDING** |
| J4: POS Sell | ? | ? | ? | ? | ? | ? | ? | ? | **PARK-READY_RUNTIME_PENDING (CERT-BLOCKED in canonical)** |
| J5: Opening Stock | ? | ? | ? | ? | ? | ? | ? | ? | **PARK-READY_RUNTIME_PENDING** |
| J6: Supplier Reg→Login | ? | ? | ? | ? | ? | ? | ? | ? | **PARK-READY_RUNTIME_PENDING** |

Legend: ✅ = passed, ❌ = failed (ticket filed), ? = not tested, N/A = not applicable.
`PARK-READY` = code-stable and safe to defer for artifact batching, but not yet runtime-certified.

---

## JOURNEY DETAIL CARDS

### J1: SuperAdmin Login + Store Management

**Entry**: https://staging.supermandi.tech/admin/
**Actor**: SuperAdmin (email OTP login)

#### Screens in scope:
| Screen | File | Purpose |
|--------|------|---------|
| Login | supermandi-superadmin/src/ (hash router) | Email + OTP |
| #stores | StoresTab | View/manage stores |
| #staff | StaffTab | Create/manage staff |
| #applications | ApplicationsTab | Review retailer apps |
| #suppliers | SuppliersTab | Review supplier apps |
| #devices | DevicesTab | View POS devices |

#### Gate Checklist:
- [ ] G1: Login form renders (email field, OTP field, submit button)
- [ ] G1: All tab headers render, sidebar navigation works
- [ ] G2: Login loading state shown during OTP send
- [ ] G2: Login error state shown for wrong OTP
- [ ] G2: Empty state shown when no applications/stores exist
- [ ] G3: Tab switching works (#stores → #staff → #applications)
- [ ] G3: No dead-end screens (every screen has navigation back)
- [ ] G4: Login → POST /admin/auth/login → JWT stored → tabs load
- [ ] G4: #stores → GET /admin/stores → table populated
- [ ] G4: #staff → GET /admin/staff → table populated
- [ ] G5: Admin JWT has correct role/permissions
- [ ] G6: Login API returns { accessToken, user } shape
- [ ] G6: Stores API returns { success, data: [...] } shape
- [ ] G7: admin_users table has correct record
- [ ] G8: N/A (self-contained)

#### Known Blockers: None currently known
#### Fix PRs: (none yet)

---

### J2: Retailer Registration → Approval → First Login

**Entry**: https://staging.supermandi.tech/retailer/register
**Actors**: New retailer (registration) + SuperAdmin (approval) + Retailer (first login)

#### Screens in scope:
| Screen | File | Purpose |
|--------|------|---------|
| Register Step 1 | retailer-admin/src/pages/register/ | Phone + OTP |
| Register Step 2 | retailer-admin/src/pages/register/ | Business details |
| Register Step 3 | retailer-admin/src/pages/register/ | KYC documents |
| Register Step 4 | retailer-admin/src/pages/register/ | Submit |
| Application Submitted | retailer-admin/src/pages/register/ | Confirmation |
| SA #applications | supermandi-superadmin/ | Review + approve |
| Login | retailer-admin/src/pages/login/ | Phone + OTP |
| Dashboard | retailer-admin/src/pages/dashboard/ | Post-login landing |

#### Gate Checklist:
- [ ] G1: All 4 registration steps render correctly
- [ ] G1: Approval email has correct content (no dead links, no iOS refs)
- [ ] G2: OTP loading/error/expired states handled
- [ ] G2: File upload progress shown, size/type errors shown
- [ ] G2: Application Submitted shows clear "under review" message
- [ ] G3: Step 1 → 2 → 3 → 4 navigation, back works on each step
- [ ] G3: Login page → register link works and vice versa
- [ ] G4: Phone → POST /registration/create → OTP → POST /verify-otp → verified
- [ ] G4: Upload → POST /documents/upload → document_id returned
- [ ] G4: Submit → POST /submit-kyc → status=KYC_SUBMITTED
- [ ] G4: SA Approve → POST /applications/:id/approve → store + user created
- [ ] G4: First Login → GET /lookup → LOGIN_ALLOWED → OTP → JWT → Dashboard
- [ ] G5: Store isolation (new store gets unique storeId, activation code)
- [ ] G5: Duplicate phone prevention (re-registration returns PENDING/LOGIN_ALLOWED)
- [ ] G6: All API responses match documented shapes
- [ ] G6: Auth enforced (no unauthenticated access to dashboard)
- [ ] G7: applications row (KYC_SUBMITTED), documents rows, retail_stores row, auth.users row, auth.store_users row
- [ ] G8: Store visible in SA #stores after approval
- [ ] G8: Activation code from SA works in POS enrollment

#### Known Blockers:
| ID | Issue | Status |
|----|-------|--------|
| BLK-A1 | GCS upload 500 | ✅ RESOLVED |
| BLK-A2 | Firebase verify-otp | ✅ RESOLVED |
| BLK-F1 | Missing retailer_portal_phone | ✅ RESOLVED |
| BLK-B1 | Login blocked | ✅ RESOLVED |
| PR-1 | Email content issues (dead links, iOS refs) | ❌ NOT FIXED |

#### Runtime Status: Flows A/F/B RUNTIME CONFIRMED on 2026-03-08. Email content issues remain.

---

### J3: POS Device Enrollment + Staff Login

**Entry**: POS app install → enrollment screen
**Actors**: Retailer (provides code) + Staff (login)

#### Screens in scope:
| Screen | File | Purpose |
|--------|------|---------|
| Splash | src/screens/SplashScreen.tsx | Asset preload |
| Enrollment | src/screens/EnrollDeviceScreen.tsx | Code entry |
| Staff Login | src/screens/StaffLoginScreen.tsx | Phone + PIN |
| Menu | src/screens/MenuScreen.tsx | Main landing |

#### Gate Checklist:
- [ ] G1: Enrollment screen renders (phone input, code input, store name display)
- [ ] G1: Staff login screen renders (phone input, PIN input, login button)
- [ ] G1: Menu screen renders all tabs (Sell, Purchase, Reorder, Credit, Menu)
- [ ] G2: Enrollment loading state during code verification
- [ ] G2: Enrollment error state for invalid code
- [ ] G2: Staff login error state for wrong phone/PIN
- [ ] G2: Staff login empty state (no staff exist → helpful message)
- [ ] G3: Enrollment → Staff Login → Menu (forward flow)
- [ ] G3: Staff Login has back button to enrollment/settings
- [ ] G3: Pull-to-refresh on Staff Login screen
- [ ] G4: Enroll → POST /enrollments/verify → deviceToken stored
- [ ] G4: Login → POST /pos/staff/login → staffSession stored → Menu
- [ ] G5: Device token is store-scoped (cannot access other store's data)
- [ ] G5: Staff PIN validation (bcrypt compare, not plaintext)
- [ ] G6: Enrollment response: { deviceId, storeId, storeName, deviceToken }
- [ ] G6: Staff login response: { staffId, name, role, token }
- [ ] G7: pos_devices row created on enrollment
- [ ] G7: store_staff row exists (via SuperAdmin or auto-create)
- [ ] G8: Staff created in SA → can login on POS
- [ ] G8: Activation code from retailer portal/SA → works in POS enrollment

#### Known Blockers:
| ID | Issue | Status |
|----|-------|--------|
| BLK-POSSTAFF1 | No auto-create staff during enrollment | ✅ CODE FIXED (PR #478). 6 regression tests. Runtime pending. |
| BLK-POS-UX1 | No back button on StaffLoginScreen | ✅ CODE FIXED (PR #479). Runtime pending. |
| BLK-POS-UX2 | No pull-to-refresh on StaffLoginScreen | ✅ CODE FIXED (PR #479). Runtime pending. |

---

### J4: POS Sell Flow (JOURNEY-02)

**Entry**: Menu → SellScan tab
**Actor**: Store staff (SALES or MANAGER)

#### Screens in scope:
| Screen | File | Purpose |
|--------|------|---------|
| SellScan | src/screens/SellScanScreen.tsx | Main sell screen |
| Product Search | (within SellScan) | Text search |
| Cart | (within SellScan) | Item list + totals |
| Payment | src/screens/PaymentScreen.tsx | Payment mode |
| Receipt | src/screens/SuccessPrintScreenV2.tsx | Bill confirmation |

#### Gate Checklist:
- [ ] G1: SellScan renders (search bar, product list, cart, checkout button)
- [ ] G1: Product cards show name, price, stock, quantity controls
- [ ] G2: Search loading spinner, empty "no results" state
- [ ] G2: Cart empty state ("Add products to start")
- [ ] G2: Payment error state (network failure)
- [ ] G3: SellScan → Payment → Receipt → back to SellScan
- [ ] G3: Cart persists across tab switches
- [ ] G4: Search → GET /pos/store-products/search → results displayed
- [ ] G4: **Stock displays as number** (not string, not null, not 0 when server has stock)
- [ ] G4: Add to cart → local state updated
- [ ] G4: Checkout → POST /pos/transactions/checkout → receipt shown
- [ ] G5: Stock >= cart quantity enforced (cannot sell more than available)
- [ ] G5: Price integrity (sell price matches store product sell price)
- [ ] G5: Transaction idempotency (double-tap doesn't create 2 transactions)
- [ ] G6: Search response: { success, data: StoreSearchGroup[], total }
- [ ] G6: **currentStock is number type** in all API responses
- [ ] G6: Checkout response: { success, transactionId, receiptUrl }
- [ ] G7: transactions row created, inventory_ledgers row created
- [ ] G7: store_products.current_stock decremented
- [ ] G8: Stock change visible in retailer portal after POS sale

#### Known Blockers:
| ID | Issue | Status |
|----|-------|--------|
| BLK-SP1 | Stock shows 0 (string coercion) | ✅ CODE FIXED (PRs #469, #477). 17 regression tests. Runtime pending. |

---

### J5: POS Opening Stock

**Entry**: Menu → Opening Stock
**Actor**: Store MANAGER only

#### Screens in scope:
| Screen | File | Purpose |
|--------|------|---------|
| Opening Stock | src/screens/OpeningStockScreen.tsx | Search + enter qty |

#### Gate Checklist:
- [ ] G1: Search bar, product list, quantity input, submit button render
- [ ] G2: Search loading, empty results, success confirmation, error state
- [ ] G3: Menu → Opening Stock → submit → back to Menu
- [ ] G4: Search → GET /pos/store-products/search → grouped results displayed
- [ ] G4: Submit → POST /pos/stock/opening → stock updated
- [ ] G5: Only MANAGER role can access (SALES blocked)
- [ ] G5: Stock quantity must be positive integer
- [ ] G6: Search response handles grouped format (StoreSearchGroup[])
- [ ] G6: Opening stock response: { success, updated: [...] }
- [ ] G7: stock_balances row created/updated, inventory_ledgers row
- [ ] G8: Stock change visible in retailer portal

#### Known Blockers:
| ID | Issue | Status |
|----|-------|--------|
| BLK-H1 | Response shape mismatch | ✅ CODE FIXED (PR #470), runtime retest pending |

---

### J6: Supplier Registration → Verification → Login

**Entry**: https://staging.supermandi.tech/supplier/register
**Actors**: New supplier + SuperAdmin (verification)

#### Screens in scope:
| Screen | File | Purpose |
|--------|------|---------|
| Register | supplier-portal/src/app/(auth)/register/ | Multi-step form |
| Pending | supplier-portal/src/app/(auth)/pending-approval/ | Waiting screen |
| SA #suppliers | supermandi-superadmin/ | Verify supplier |
| Login | supplier-portal/src/app/(auth)/login/ | Phone + OTP |
| Dashboard | supplier-portal/src/app/(dashboard)/ | Post-login landing |

#### Gate Checklist:
- [ ] G1: All registration steps render (GSTIN, phone, details, docs)
- [ ] G1: Document upload fields include ALL required types
- [ ] G2: OTP loading/error states, upload progress, submission confirmation
- [ ] G3: Step navigation (forward/back), login ↔ register links
- [ ] G4: GSTIN check → phone verify → docs upload → submit → KYC_SUBMITTED
- [ ] G4: SA verify → POST /suppliers/:id/verify → status=VERIFIED
- [ ] G4: First login → OTP → JWT → Dashboard loads
- [ ] G5: GSTIN uniqueness enforced, duplicate prevention
- [ ] G6: All API responses match documented shapes
- [ ] G7: suppliers row, documents rows, auth records
- [ ] G8: Verified supplier visible in retailer portal supplier catalog

#### Known Blockers:
| ID | Issue | Status |
|----|-------|--------|
| BLK-SUP-KYC1 | Step 3 missing address_proof + cancelled_cheque fields | ✅ CODE FIXED (PR #480). Runtime pending. |

---

## EXECUTION PLAN

### Phase A: Certify Code (no builds)
Fix all blockers for each journey, run gate checks at code level, and reach `PARK-READY`.
Order shown here is a dependency model, not a permission to override canonical active-journey lock.

### Phase B: Build Candidates
- One APK build (POS app) — after the active POS journey cluster is `PARK-READY`
- Portal builds are automatic (Cloud Run deploy from main)

### Phase C: Runtime Certification
- Install artifact, run each journey gate checklist on real device
- Any failure → back to Phase A for that journey

### Phase D: Operator Test
- Operator runs ONLY `PARK-READY` / runtime-certification candidates
- Results compared against gate checklist
- Pass = PRODUCTION READY for that journey

---

## IMMEDIATE EXECUTION QUEUE (updated 2026-03-09 — PHASE A COMPLETE)

Important:
- This queue must not override the active-journey lock in canonical repo truth.
- Canonical state is locked on `JOURNEY-02`, phase `JOURNEY_02_PHASE3_PARK_READY`.
- Actual next step must come from `CLAUDE_CURRENT_STATE.json` and `JOURNEY_MAP.json`.

### Phase A: COMPLETE — All Code Blockers Resolved

All 6 MVP journeys have reached code-level PARK-READY:

| Blocker | PR | Tests | Status |
|---------|-----|-------|--------|
| BLK-SP1 (stock coercion) | #469, #477 | 17 | ✅ CODE FIXED |
| BLK-H1 (OpeningStock shape) | #470 | — | ✅ CODE FIXED |
| BUILD-BLK-01 (build reproducibility) | eddb9c61 | — | ✅ RESOLVED |
| BLK-POSSTAFF1 (staff auto-create) | #478 | 6 | ✅ CODE FIXED |
| BLK-POS-UX1/UX2 (login UX) | #479 | — | ✅ CODE FIXED |
| BLK-SUP-KYC1 (supplier docs) | #480 | — | ✅ CODE FIXED |
| PR-1 (email content) | #481 | 19 | ✅ CODE FIXED |

### Phase B: NEXT — Build Candidates

1. Deploy backend to staging (PRs #477-481 not yet on staging Cloud Run)
2. Build single APK from main HEAD
3. Portal builds are automatic (Cloud Run deploy from main)

### Phase C: Runtime Certification

1. Install APK on test device
2. Run each journey gate checklist on real device
3. Any failure → back to Phase A for that journey

### Phase D: Operator Test

1. Operator runs ONLY PARK-READY artifacts
2. Results compared against gate checklist
3. Pass = PRODUCTION READY for that journey

---

## ANTI-REGRESSION RULE

When fixing Journey X, before marking CERTIFIED:
1. Re-run J1 gate (if J1 was already certified)
2. Re-run J2 gate (if J2 was already certified)
3. ... for every previously certified journey

If any regression found → that journey loses CERTIFIED status → fix first.
