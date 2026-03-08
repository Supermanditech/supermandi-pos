# Prerequisite Funnel Map — Real-User Flow Audit
# Created: 2026-03-08 | Owner: CLAUDE | Phase: PHASE_3_CODE_FIX_CLUSTER
# This file is repo truth. Private memory files are not authoritative.

## PURPOSE

Before JOURNEY-02 (sell-scan -> payment) can be certified, a real user must
be able to reach the sell-scan screen through a stable prerequisite funnel.
This document maps every step of that funnel, every scenario, every known
blocker, and the regression gates required before deploy.

---

## POS-FIRST EXECUTION LOCK (2026-03-09)

Canonical execution is now POS-first.

- Claude must complete the POS suite before switching primary implementation
  focus to retailer, supplier, or superadmin.
- POS journey order is locked to:
  `JOURNEY-01 -> JOURNEY-07 -> JOURNEY-08 -> JOURNEY-05 -> JOURNEY-02 -> JOURNEY-03 -> JOURNEY-04 -> JOURNEY-06`
- This funnel map remains required dependency truth for POS journeys, but it is
  not permission to jump straight to APK build/runtime.
- For every active POS journey, Claude must trace:
  UI, UX states, navigation, wiring, business logic, edge cases/recovery, API,
  DB tables, migrations, GCP staging dependencies, and cross-platform effects.
- Internal deterministic verification happens before the next POS journey.
- APK build, deploy, and operator runtime are deferred until the full POS suite
  is internally stabilized and marked PARK-READY in repo truth.

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

## RUNTIME STATUS (updated 2026-03-09, PARK-READY state sync)

Evidence source: Operator ran full retailer funnel on staging after DB wipe.
Phone: +917737914383 | Store: SU260308-001 | Application: 571e3cf5

### FLOW-A: Retailer Registration — RUNTIME CONFIRMED WORKING
- Step 1 (Verify Phone): WORKS — Firebase fix deployed (PR #463)
- Step 2 (Business Details): WORKS
- Step 3 (KYC Documents): WORKS — GCS IAM fix applied (BLK-A1)
- Step 4 (Submit KYC): WORKS — "Application Submitted" screen confirmed
- Email notification: WORKS — copy/content issues FIXED (PR #481)

### FLOW-F: SuperAdmin Approval — RUNTIME CONFIRMED WORKING
- Login: WORKS
- Application review + approve: WORKS
- Store created with retailer_portal_phone: WORKS (BLK-F1 fix, PR #466)
- Activation code generated: WORKS (SM-EF3MYR)
- Approval email sent: WORKS — content issues FIXED (PR #481, activation code + direct link + no iOS)

### FLOW-B: Retailer Login — RUNTIME CONFIRMED WORKING
- Lookup returns LOGIN_ALLOWED: WORKS
- OTP → Firebase token → JWT: WORKS
- auth.store_users auto-created on first login: CONFIRMED (BLK-B1 cleared)
- Retailer portal dashboard: WORKS (SU260308-001 visible)

### POS Enrollment — RUNTIME CONFIRMED WORKING
- Phone number entry → auto-fetch activation code: WORKS
- Store name + ID visible: WORKS (SU260308-001)
- Product visible after adding via portal: WORKS (dal masala appears)

### Stock Sync — CODE-FIXED (PARK-READY)
- Retailer portal shows stock qty = 10, POS showed 0 (2026-03-08)
- Root cause 1: syncProductsToOffline() treated cached stock as pinned (PR #469)
- Root cause 2: PostgreSQL NUMERIC serialized as string, not parsed to number (PR #477)
- Fix: parseStock() on backend (7 locations), Number() coercion on client (7 locations)
- 17 regression tests (stockNumericCoercion + stockCache.regression)
- PENDING: APK rebuild + operator runtime confirmation

### FLOW-D/E: Supplier Registration/Login — CODE-FIXED, UNTESTED ON STAGING
- BLK-SUP-KYC1 fixed: address_proof + cancelled_cheque upload fields added (PR #480)
- Not yet tested on staging — assume broken until proven working
- Needs backend deploy + runtime e2e test

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
- ~~supplier-portal register Step 3: address_proof + cancelled_cheque upload fields~~ — **FIXED** (PR #480)
- Full end-to-end: UNTESTED on staging — needs backend deploy + runtime test

---

## ORDERED BLOCKER LEDGER (updated 2026-03-09 — ALL CODE BLOCKERS RESOLVED)

| Priority | ID | Flow | Blocker | Impact | Status |
|----------|----|------|---------|--------|--------|
| -- | BLK-A1 | A (reg) | GCS document upload 500 | Blocks ALL registration | **RESOLVED** (2026-03-08): IAM binding added, runtime confirmed |
| -- | BLK-A2 | A (reg) | Firebase verify-otp | Was blocking OTP step | **RESOLVED** (PR #463) |
| -- | BLK-F1 | F (approval) | Approval INSERT missing retailer_portal_phone | First login always 404 | **RUNTIME CONFIRMED FIXED** (PR #466) |
| -- | BLK-B1 | B (login) | Retailer login blocked | Blocked by BLK-F1 | **RUNTIME CONFIRMED CLEARED** |
| -- | BLK-SP1 | G,H | Stock parity: portal=10, POS=0 | Blocks sell-scan | **CODE FIXED** (PRs #469, #477). parseStock() + Number() coercion. 17 regression tests. Runtime pending. |
| -- | BLK-H1 | H (stock) | OpeningStock response shape | Blocks stock seeding via POS | **CODE FIXED** (PR #470). Runtime pending. |
| -- | BUILD-BLK-01 | Build | Clean APK build not reproducible | Blocked APK rebuilds | **RESOLVED** (eddb9c61). Expo deps pinned, lockfile regenerated. |
| -- | BLK-POSSTAFF1 | C (POS setup) | No staff after enrollment | Blocks POS staff login | **CODE FIXED** (PR #478). Auto-creates MANAGER. 6 regression tests. Runtime pending. |
| -- | BLK-POS-UX1/UX2 | C (POS setup) | No back button / no pull-to-refresh | UX dead end on staff login | **CODE FIXED** (PR #479). Runtime pending. |
| -- | BLK-SUP-KYC1 | D (supplier) | Supplier register Step 3 fields missing | Blocks supplier KYC upload | **CODE FIXED** (PR #480). Runtime pending. |
| -- | PR-1 | A,F (comms) | Approval email content issues | Dead links, iOS refs, no activation code | **CODE FIXED** (PR #481). 19 regression tests. Runtime pending. |
| -- | BLK-N1 | A (reg) | WhatsApp welcome notification | Non-blocking — SMS + email work | Deferred — not blocking any journey |

**Critical path**: POS journey-by-journey internal stabilization -> full POS suite `PARK-READY` -> retailer/supplier/superadmin post-POS passes -> single bounded deploy/APK/runtime phase -> later JOURNEY-02 PHASE_4 certification

---

## MICRO-ISSUE LOG — Funnel Audit (2026-03-08)

Discovered during end-to-end retailer funnel test on staging (post-wipe).
24 issues total: 2 critical, 4 high, 5 medium, 4 low, 4 OK, 1 N/A.

### RESOLVED — PR-1: fix/retailer-comms-onboarding (PR #481, merged 2026-03-09)
| # | Screen | Issue | Status |
|---|--------|-------|--------|
| 8 | Approval email | "Google Play Store → Search for SuperMandi" | **FIXED** — direct download link |
| 9 | Approval email | "Download for Android" link dead | **FIXED** — uses POS_DOWNLOAD_URL env var |
| 10 | Approval email | iOS mentioned — no iOS app | **FIXED** — removed entirely |
| 11 | Approval email | No activation code in email | **FIXED** — included in WhatsApp/SMS/Email |
| 13 | Approval email | "enter phone" — doesn't show which phone | **FIXED** — masked phone shown |
| 4 | Registration email | "contact support" has no link | **FIXED** — hello@supermandi.tech added |
| 2 | Registration page | "WhatsApp and Email" inaccurate | **FIXED** — changed to "SMS and Email" |
| 3 | Registration email | Uses store name not contact name | Test data issue — code uses ownerName correctly |
| 12 | Approval email | Name inconsistency | Test data issue — code uses owner_name with business_name fallback |
| 5 | Registration email | Steps don't mention POS app | Low — registration email already has "Download POS App" step |
19 contract tests: backend/tests/contracts/welcomeEmailTemplate.unit.test.ts

### RESOLVED — PR-2 / BLK-SUP-KYC1: fix/supplier-register-step3 (PR #480, merged 2026-03-09)
Scope: address_proof + cancelled_cheque upload fields added to supplier registration
File: supplier-portal/src/app/register/page.tsx
Status: **CODE FIXED** — runtime verification pending

### RESOLVED — PR-3 / BLK-SP1: stock parity (PRs #469, #477, merged 2026-03-08/09)
| # | Screen | Issue | Status |
|---|--------|-------|--------|
| 23 | POS sell screen | Stock: 0 on POS but 10 on Retailer Portal | **CODE FIXED** — two root causes: sync pinning bug (#469) + NUMERIC coercion (#477). 17 regression tests. Runtime pending. |

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

## NEXT ACTIONS (strict order, updated 2026-03-09 14:00 IST — ALL CODE BLOCKERS RESOLVED)

1. ~~BLK-A1 fix~~ — DONE
2. ~~BLK-F1 fix~~ — DONE (PR #466 deployed)
3. ~~BLK-B1 unblock~~ — DONE (runtime confirmed)
4. ~~Full retailer funnel test~~ — DONE (operator completed on staging)
5. ~~Truth-sync BLK-F1/BLK-B1~~ — DONE
6. ~~BLK-SP1 investigation + fix~~ — DONE (PRs #469, #477 merged)
7. ~~BLK-H1 fix to main~~ — DONE (PR #470 merged)
8. ~~PR #468 backend Opening Stock dual-write~~ — DONE (deployed to staging)
9. ~~Merge PR #471 (build gate fix)~~ — DONE
10. ~~Truth-sync PR #473~~ — DONE
11. ~~BUILD-BLK-01 fix~~ — DONE (eddb9c61, expo deps pinned)
12. ~~BLK-SP1 NUMERIC coercion fix~~ — DONE (PR #477, 13 regression tests)
13. ~~BLK-POSSTAFF1 staff auto-create~~ — DONE (PR #478, 6 regression tests)
14. ~~BLK-POS-UX1/UX2 login UX~~ — DONE (PR #479)
15. ~~BLK-SUP-KYC1 supplier docs~~ — DONE (PR #480)
16. ~~PR-1 email content fixes~~ — DONE (PR #481, 19 regression tests)
17. ~~PARK-READY state truth-sync~~ — THIS COMMIT
18. **LOCKED NEXT**: Continue `JOURNEY-01` under the canonical POS-first execution lock
19. **LOCKED NEXT**: Trace and stabilize `JOURNEY-01` end-to-end across UI, UX, navigation, wiring, business logic, edge cases, API, DB/tables, migrations, staging, and cross-platform effects
20. **LOCKED NEXT**: Mark `JOURNEY-01` `PARK-READY`, then move to `JOURNEY-07` and continue the locked POS journey order through `JOURNEY-06`
21. **LOCKED NEXT**: After the full POS suite is `PARK-READY`, execute retailer, supplier, and superadmin post-POS passes with the same journey-first discipline
22. **LOCKED NEXT**: Only after all targeted journeys are `PARK-READY` may the single bounded deploy/APK/runtime phase begin
