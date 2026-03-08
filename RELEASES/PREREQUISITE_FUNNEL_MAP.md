# Prerequisite Funnel Map — Real-User Flow Audit
# Created: 2026-03-08 | Owner: CLAUDE | Phase: PHASE_3_CODE_FIX_CLUSTER
# This file is repo truth. Private memory files are not authoritative.

## PURPOSE

Before JOURNEY-02 (sell-scan -> payment) can be certified, a real user must
be able to reach the sell-scan screen through a stable prerequisite funnel.
This document maps every step of that funnel, every scenario, every known
blocker, and the regression gates required before deploy.

---

## FUNNEL DEPENDENCY CHAIN

```
FLOW-A: Retailer Registration
    |
    v
FLOW-F: SuperAdmin Approval/Activation
    |
    v
FLOW-B: Retailer Login (first time, post-approval)
    |
    v
FLOW-H: Stock Add (via Retailer Admin or POS Opening Stock)
    |
    v
FLOW-G: POS Sell-Scan (JOURNEY-02)
```

Parallel (not blocking JOURNEY-02 but must be stabilized):
```
FLOW-D: Supplier Registration
FLOW-E: Supplier Login
```

---

## RUNTIME STATUS (updated 2026-03-08, post-staging-wipe + funnel test)

Evidence source: Operator ran full retailer funnel on staging after DB wipe.
Phone: +917737914383 | Store: SU260308-001 | Application: 571e3cf5

### FLOW-A: Retailer Registration — RUNTIME CONFIRMED WORKING
- Step 1 (Verify Phone): WORKS — Firebase fix deployed (PR #463)
- Step 2 (Business Details): WORKS
- Step 3 (KYC Documents): WORKS — GCS IAM fix applied (BLK-A1)
- Step 4 (Submit KYC): WORKS — "Application Submitted" screen confirmed
- Email notification: WORKS but has copy/content issues (see MICRO-ISSUE LOG)

### FLOW-F: SuperAdmin Approval — RUNTIME CONFIRMED WORKING
- Login: WORKS
- Application review + approve: WORKS
- Store created with retailer_portal_phone: WORKS (BLK-F1 fix, PR #466)
- Activation code generated: WORKS (SM-EF3MYR)
- Approval email sent: WORKS but has copy/content issues (see MICRO-ISSUE LOG)

### FLOW-B: Retailer Login — RUNTIME CONFIRMED WORKING
- Lookup returns LOGIN_ALLOWED: WORKS
- OTP → Firebase token → JWT: WORKS
- auth.store_users auto-created on first login: CONFIRMED (BLK-B1 cleared)
- Retailer portal dashboard: WORKS (SU260308-001 visible)

### POS Enrollment — RUNTIME CONFIRMED WORKING
- Phone number entry → auto-fetch activation code: WORKS
- Store name + ID visible: WORKS (SU260308-001)
- Product visible after adding via portal: WORKS (dal masala appears)

### Stock Sync — NEW BLOCKER
- Retailer portal shows stock qty = 10
- POS app shows Stock: 0 for same product in same store
- Root cause: UNKNOWN — needs investigation (PR-3)

### FLOW-D/E: Supplier Registration/Login — UNTESTED
- Not yet tested on staging — assume broken until proven working

---

## FLOW-A: RETAILER REGISTRATION (new user, first time)

### Routes
| Step | Method | Endpoint | Auth |
|------|--------|----------|------|
| A1 | POST | /api/v1/retailer-admin/registration/create | None |
| A2 | POST | /api/v1/retailer-admin/registration/verify-otp | idToken + applicationId |
| A3 | POST | /api/v1/documents/upload | None (entity_type=application) |
| A4 | POST | /api/v1/retailer-admin/registration/submit-kyc | applicationId |

### Files
- `retailer-admin/src/pages/register/` (frontend steps)
- `backend/src/routes/v1/retailer-admin/registration.ts`
- `backend/src/services/documentService.ts` (GCS upload)
- `backend/src/services/notificationService.ts` (email after submit)

### Scenario Matrix
| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| A-S1 | Happy path: new phone → OTP → details → docs → submit | KYC_SUBMITTED | RUNTIME CONFIRMED |
| A-S2 | Phone already registered → lookup returns LOGIN_ALLOWED | Redirect to login | UNTESTED |
| A-S3 | Phone has pending application → lookup returns PENDING_APPROVAL | Resume flow | UNTESTED |
| A-S4 | Wrong OTP → Firebase error | "Invalid OTP" | UNTESTED |
| A-S5 | OTP expired (>5min) | "OTP expired, resend" | UNTESTED |
| A-S6 | File > 5MB upload | "File too large" | UNTESTED |
| A-S7 | Wrong file format | "Only JPEG/PNG/PDF allowed" | UNTESTED |

### Known Blockers
| ID | Blocker | Status |
|----|---------|--------|
| BLK-A1 | GCS document upload 500 | **RESOLVED** — IAM binding added (2026-03-08) |
| BLK-A2 | Firebase verify-otp checkRevoked | **RESOLVED** — PR #463 deployed |

---

## FLOW-F: SUPERADMIN APPROVAL

### Routes
| Step | Method | Endpoint | Auth |
|------|--------|----------|------|
| F1 | GET | /api/v1/superadmin/applications | Admin JWT |
| F2 | POST | /api/v1/superadmin/applications/:id/approve | Admin JWT |

### Files
- `supermandi-superadmin/src/pages/applications/` (review UI)
- `backend/src/routes/v1/superadmin/applications.ts`
- `backend/src/services/platformService.ts` (store creation)
- `backend/src/services/notificationService.ts` (approval email + WhatsApp)

### Known Blockers
| ID | Blocker | Status |
|----|---------|--------|
| BLK-F1 | Approval INSERT missing retailer_portal_phone | **RUNTIME CONFIRMED FIXED** — PR #466 deployed. Fresh registration on wiped DB confirmed store created with retailer_portal_phone set. Login succeeded. |
| BLK-N1 | WhatsApp welcome notification not delivered | Non-blocking — email works. WhatsApp integration not implemented or misconfigured. |

---

## FLOW-B: RETAILER LOGIN (first time, post-approval)

### Routes
| Step | Method | Endpoint | Auth |
|------|--------|----------|------|
| B1 | GET | /api/v1/retailer-admin/registration/lookup?phone= | None |
| B2 | POST | /api/v1/retailer-admin/auth/firebase-otp-login | Firebase idToken |

### Files
- `retailer-admin/src/pages/login/` (frontend)
- `backend/src/routes/v1/retailer-admin/auth.ts`
- `backend/src/services/authService.ts` (auto-creates auth.users + auth.store_users)

### Known Blockers
| ID | Blocker | Status |
|----|---------|--------|
| BLK-B1 | Retailer login blocked by BLK-F1 | **RUNTIME CONFIRMED CLEARED** — After BLK-F1 fix, operator completed full registration → approval → first login on staging. auth.store_users auto-created on first login. Dashboard loaded with store SU260308-001. |

---

## FLOW-H: STOCK ADD (Opening Stock via POS)

### Routes
| Step | Method | Endpoint | Auth |
|------|--------|----------|------|
| H1 | GET | /api/v1/pos/store-products/search?q= | Device JWT |
| H2 | POST | /api/v1/pos/stock/opening | Device JWT |

### Files
- `src/screens/OpeningStockScreen.tsx` (POS app)
- `backend/src/routes/v1/pos/storeProducts.ts` (search)
- `backend/src/routes/v1/pos/stock.ts` (opening stock)

### Known Blockers

| ID | Blocker | Evidence | Root Cause | Fix |
|----|---------|----------|------------|-----|
| BLK-H1 | OpeningStockScreen crash on search | Screenshot 2026-03-07: "Something went wrong" | response.data vs response.products shape mismatch | **CODE MERGED** to main (PR #470, commit a8b7767f). Pending APK rebuild + operator runtime confirmation. |

---

## FLOW-D/E: SUPPLIER REGISTRATION & LOGIN

### Routes
| Step | Method | Endpoint | Auth |
|------|--------|----------|------|
| D1 | POST | /api/v1/supplier/registration/create | None |
| D2 | POST | /api/v1/supplier/registration/verify-otp | idToken + applicationId |
| D3 | POST | /api/v1/documents/upload | None (entity_type=application) |
| D4 | POST | /api/v1/supplier/registration/submit-kyc | applicationId |
| E1 | GET | /api/v1/supplier/registration/lookup?phone= | None |
| E2 | POST | /api/v1/supplier/auth/firebase-login | Firebase idToken |

### Known Issues
- supplier-portal register Step 3: address_proof + cancelled_cheque upload fields may not render (needs PR-2)
- Full end-to-end: UNTESTED on staging

---

## ORDERED BLOCKER LEDGER (updated 2026-03-08)

| Priority | ID | Flow | Blocker | Impact | Status |
|----------|----|------|---------|--------|--------|
| -- | BLK-A1 | A (reg) | GCS document upload 500 | Blocks ALL registration | **RESOLVED** (2026-03-08): IAM binding added, runtime confirmed via full registration |
| -- | BLK-A2 | A (reg) | Firebase verify-otp | Was blocking OTP step | **RESOLVED** (PR #463) |
| -- | BLK-F1 | F (approval) | Approval INSERT missing retailer_portal_phone | First login always 404 | **RUNTIME CONFIRMED FIXED** (2026-03-08): PR #466 deployed, fresh reg+approval+login succeeded on wiped DB |
| -- | BLK-B1 | B (login) | Retailer login blocked | Blocked by BLK-F1 | **RUNTIME CONFIRMED CLEARED** (2026-03-08): Full login flow succeeded post-BLK-F1 fix |
| **P0** | **BLK-SP1** | **G,H** | **Stock parity: portal=10, POS=0** | **Blocks sell-scan (no stock on POS device)** | **CODE MERGED** (PR #469, commit 10ca3be6). Root cause: syncProductsToOffline() treated any cached stock as a manual pin, blocking server updates to SQLite. 4 regression tests. Pending APK rebuild + runtime confirmation. |
| P1 | BLK-H1 | H (stock) | OpeningStock response shape | Blocks stock seeding via POS | **CODE MERGED** (PR #470, commit a8b7767f). Pending APK rebuild + runtime confirmation. |
| **P0** | **BUILD-BLK-01** | **Build** | **Clean APK build not reproducible** | **Blocks ALL APK rebuilds from clean main** | **ACTIVE** — expo-linear-gradient ^14.0.2 resolves to 14.1.5 (requires expo-module-gradle-plugin not in SDK 52); pnpm-lock.yaml stale (--frozen-lockfile fails); ExpoModulesCorePlugin.gradle components.release AGP 8.6 incompatibility. Fix: pin exact version, regenerate lockfile, patch gradle. |
| P2 | BLK-SUP1 | D (supplier) | Supplier register Step 3 fields | May block supplier KYC upload | Needs PR-2 |
| -- | BLK-N1 | A (reg) | WhatsApp welcome notification | Non-blocking — email works | Needs investigation |

**Critical path**: ~~BLK-A1~~ -> ~~BLK-F1~~ -> ~~BLK-B1~~ -> ~~BLK-SP1 (code-merged)~~ -> ~~BLK-H1 (code-merged)~~ -> **BUILD-BLK-01 (ACTIVE)** -> APK REBUILD + RUNTIME CONFIRM -> JOURNEY-02

---

## MICRO-ISSUE LOG — Funnel Audit (2026-03-08)

Discovered during end-to-end retailer funnel test on staging (post-wipe).
24 issues total: 2 critical, 4 high, 5 medium, 4 low, 4 OK, 1 N/A.

### IMPLEMENT NOW — PR-1: fix/retailer-comms-onboarding (from clean main)
| # | Screen | Issue | Severity |
|---|--------|-------|----------|
| 3 | Registration email | "Dear supermandi retailer test store" — uses STORE NAME not contact name | Copy - High |
| 4 | Registration email | "contact support" has no link/email — should be hello@supermandi.tech | Copy - Medium |
| 5 | Registration email | Steps don't mention POS app, inconsistent with registration page | Copy - Low |
| 8 | Approval email | **"Google Play Store → Search for SuperMandi"** — app NOT on Play Store | Copy - CRITICAL |
| 9 | Approval email | **"Download for Android" link** — dead or wrong link | Link - CRITICAL |
| 10 | Approval email | **iOS mentioned** — no iOS app exists, remove references | Copy - High |
| 11 | Approval email | **No activation code in email** — if POS auto-fetch fails, no fallback | Content - High |
| 12 | Approval email | Name inconsistency — "Dear raju-retailer" vs registration's "Dear supermandi retailer test store" | Copy - Medium |
| 13 | Approval email | "enter the phone number you registered with" — doesn't show which phone | UX - Medium |
| 2 | Registration page | Text says "WhatsApp and Email" but WhatsApp not implemented | Copy - Medium |

### IMPLEMENT NOW — PR-2: fix/supplier-register-step3 (from clean main)
Scope: address_proof + cancelled_cheque upload fields not rendering
File: supplier-portal/src/app/register/page.tsx

### IMPLEMENT NOW — PR-3: fix/stock-parity-investigation (from clean main)
| # | Screen | Issue | Severity |
|---|--------|-------|----------|
| 23 | POS sell screen | **Stock: 0 on POS but 10 on Retailer Portal** — sync broken | Data - High |
Scope: trace portal stock source vs POS stock source, compare APIs, sync timing, refresh, cache

### PARKED — Post go-live polish (do NOT implement now)
| # | Screen | Issue | Severity |
|---|--------|-------|----------|
| 1 | Registration page | "Go to Login" button misleading after submission | UX - Medium |
| 6 | SuperAdmin approval | "Copy Code" button appears greyed out | UX - Low |
| 14 | POS sell screen | Tab labels truncated "PURCH..." "REORDE..." | UX - Medium |
| 15 | POS sell screen | "Scanner not ready" — no guidance on what to do | UX - Low |
| 16 | POS sell screen | "No recent products" — could suggest adding via portal | UX - Low |
| 17 | POS settings | Build ddc0a28a is old — needs APK rebuild (after PR-3) | Build - High |
| 18 | POS settings | No Logout option, only "Switch Store" | UX - Medium |
| 19 | POS settings | Build hash is developer-oriented, not user-friendly | UX - Low |
| 20 | Retailer portal | Store name all lowercase — should be title-cased | UX - Medium |

### OK — No action needed
| # | Screen | Note |
|---|--------|------|
| 7 | SuperAdmin approval | Clean — activation code, phone, sent-to all correct |
| 21 | Retailer portal | Dashboard zero-state correct |
| 22 | Retailer portal | Sidebar nav comprehensive |
| 24 | POS product | Price is test data, not a bug |

---

## REQUIRED ANTI-REGRESSION GATES

### Gate 1: Retailer Registration Contract Test — IMPLEMENTED
File: `backend/tests/contracts/registrationFunnel.unit.test.ts`
```
- lookup returns LOGIN_ALLOWED / REGISTER_REQUIRED / PENDING_APPROVAL / UPLOAD_DOCUMENTS / ACCOUNT_SUSPENDED
- lookup rejects invalid action
- create returns applicationId and status
- verify-otp returns phoneVerified true, rejects false
- document upload returns document_id
- submit-kyc returns KYC_SUBMITTED status
```

### Gate 2: Retailer Auth Contract Test — IMPLEMENTED
```
- firebase-otp-login returns JWT + stores for single/multi-store user
- login response requires accessToken and refreshToken
TODO: First login auto-creates auth.users + auth.store_users (integration test, needs DB)
TODO: POST /auth/refresh + /auth/logout (integration test)
```

### Gate 3: Supplier Registration Contract Test — IMPLEMENTED (shared schemas)
```
- supplier lookup returns valid action
- supplier create returns applicationId
```

### Gate 4: Supplier Auth Contract Test — PARTIAL
```
TODO: POST /supplier/auth/firebase-login response shape (integration test)
TODO: POST /supplier/auth/password-login response shape
```

### Gate 5: SuperAdmin Approval Contract Test — IMPLEMENTED
```
- retailer approval returns approvedEntityId and activationCode
- supplier approval returns approvedEntityId and emailDelivered
- approval response requires success=true
- approval response rejects invalid entityType
- BLK-F1 regression: store record MUST have retailer_portal_phone set (non-null)
- BLK-F1 regression: store with retailer_portal_enabled=false fails contract
```

### Gate 6: POS Build Gate
```
Test: TypeScript compiles clean
Test: API_URL resolves to staging (not localhost)
Test: OpeningStockScreen handles grouped response.data format
```

### Gate 7: Document Upload Service Gate
```
Test: GCS_DOCUMENTS_BUCKET env var is set
Test: Service account has Storage Object Creator role
Test: Upload + download roundtrip works
Test: File size validation (>10MB rejected)
Test: MIME type validation (only JPEG/PNG/PDF)
```

---

## NEXT ACTIONS (strict order, updated 2026-03-08 21:30 IST)

1. ~~BLK-A1 fix~~ — DONE
2. ~~BLK-F1 fix~~ — DONE (PR #466 deployed)
3. ~~BLK-B1 unblock~~ — DONE (runtime confirmed)
4. ~~Full retailer funnel test~~ — DONE (operator completed on staging)
5. ~~Truth-sync BLK-F1/BLK-B1~~ — DONE
6. ~~BLK-SP1 investigation + fix~~ — DONE (PR #469 merged, root cause: sync pinning bug)
7. ~~BLK-H1 fix to main~~ — DONE (PR #470 merged, OpeningStock search shape)
8. ~~PR #468 backend Opening Stock dual-write~~ — DONE (deployed to staging)
9. ~~Merge PR #471 (build gate fix)~~ — DONE (merged, CI green)
10. ~~Truth-sync PR #473~~ — DONE (merged, CI green)
11. **NEXT**: Fix BUILD-BLK-01 — pin expo-linear-gradient to exact 14.0.2, regenerate pnpm-lock.yaml, patch ExpoModulesCorePlugin.gradle components.release (CODE_FIX PR from main)
12. **NEXT**: Create clean worktree from updated main, pnpm install --frozen-lockfile, expo prebuild, build APK
13. **NEXT**: Operator runtime retest (stock parity + Opening Stock flow)
14. PR-1 — retailer comms/onboarding email fixes (Critical + High)
15. PR-2 — supplier register Step 3 field fix
16. Supplier registration/login full audit
17. Return to JOURNEY-02 PHASE_4 certification
