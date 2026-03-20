# LIVE-TEST-001 — Staging Live Testing & Issue Discovery

## Machine State

```
Branch:          main at c5ad5f69 (or latest after CI fix)
GCP Staging:     staging.supermandi.tech (SHA being deployed)
Migrations:      000-202 applied on Cloud SQL
Output file:     RELEASES/post-gcp-staging-issues-20-03-2026.md
Operator phone:  7737914383 (for OTP)
Operator email:  supermanditech@gmail.com (for email verification)
Prototype:       https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html
```

---

## ABSOLUTE RULES — MACHINE-ENFORCED, NO EXCEPTIONS

**RULE 1 — SCREEN LOCK:** You MUST NOT exit a screen until you have tested EVERY interactive element on that screen. Every button press, every input field, every swipe, every tap, every long-press, every pull-to-refresh. If a screen has 12 buttons, you test all 12. If it has 5 input fields, you fill all 5 with valid AND invalid data. No skipping. No "this looks fine." No moving on after testing 3 of 8 elements.

**RULE 2 — PROVE IT LIVE:** Every test must be executed against the LIVE staging environment. No "I expect this works." No "based on code review." You MUST click it, see the response, screenshot it, and record the result. If you cannot test it live, mark it `BLOCKED: [reason]` — do NOT mark it PASS.

**RULE 3 — FULL LAYER DEPTH:** For every interaction, trace ALL layers:

```
USER ACTION → UI RESPONSE → API CALL (check Network tab) → HTTP STATUS →
RESPONSE BODY → STATE UPDATE → UI FEEDBACK TO USER
```

If ANY layer fails, it's a finding. Record the exact layer that broke.

**RULE 4 — 4-STATE MANDATORY:** For every screen, you MUST verify all 4 states:

```
LOADING:  What does the user see while data loads? Spinner? Skeleton? Nothing?
SUCCESS:  Does the screen render correctly with real data?
EMPTY:    What happens when there's no data? (empty store, no products, no sales)
ERROR:    What happens when the API fails? (kill network, send bad request)
```

Mark each state ✅ or ❌ with evidence.

**RULE 5 — EVERY FINDING GETS AN ID:** Format: `LIVE-NNN` starting at `LIVE-001`. Every finding goes into the output file immediately — do NOT batch them.

**RULE 6 — SEVERITY CLASSIFICATION:**

```
CRITICAL:  App crashes, data loss, security breach, payment error, wrong amount
HIGH:      Feature completely broken, navigation dead end, API 500, wrong data shown
MEDIUM:    UI mismatch vs prototype, missing loading state, poor error message
LOW:       Cosmetic (alignment, color, spacing), minor UX friction
```

**RULE 7 — NO SILENT PASSES:** When a screen PASSES, you still log it with evidence:

```
### [Screen] — PASS
**Elements tested:** [count] buttons, [count] inputs, [count] navigation actions
**API calls verified:** [list with HTTP status codes]
**4-state:** Loading ✅ | Success ✅ | Empty ✅ | Error ✅
**Screenshot:** [description of what you saw]
```

**RULE 8 — AUDIT DEPTH PER ELEMENT:** Every element tested across all layers:

```
UI:          Every visible element (buttons, inputs, labels, icons, headers, footers)
UX:          4-state check (loading/success/empty/error) + accessibility
Wiring:      Every button/action → handler → API call → state update → UI feedback
Navigation:  Every navigation.navigate() call → target screen exists + params correct
API:         Every API call → endpoint exists in backend → correct HTTP method/path/body
Backend:     Route handler → service → DB query → correct table/columns
DB:          Tables + columns exist in migrations → migration is sequential + applied
Migrations:  Referenced columns exist, FK constraints valid, indexes present
GCP parity:  Backend env vars, secrets, Cloud SQL schema matches migrations
Business:    Edge cases (zero amount, negative qty, duplicate submission, concurrent access)
Dependencies: External APIs (Razorpay, Firebase, GCS, WhatsApp) — graceful degradation
Store isolation: storeId derived from JWT, never from client
```

---

## TESTING PROTOCOL PER SCREEN

For EACH screen, execute this exact checklist in order:

```
STEP 1 — NAVIGATE: Open the screen. Screenshot it. Record load time.

STEP 2 — VISUAL AUDIT:
  □ Does the layout match the prototype? (headers, footers, element placement)
  □ Are all labels/text correct? (no placeholder text, no "Lorem ipsum", no "TODO")
  □ Are icons rendering? (no broken image icons, no ?)
  □ Is the screen responsive? (resize browser / rotate device)
  □ Dark/light mode handling (if applicable)

STEP 3 — ENUMERATE EVERY INTERACTIVE ELEMENT:
  List every: button, link, input field, dropdown, toggle, checkbox,
  radio button, slider, tab, swipe gesture, pull-to-refresh,
  long-press target, search bar, filter, sort control, pagination

  Record the count: "Screen has N interactive elements"

STEP 4 — TEST EACH ELEMENT (do NOT skip any):
  For each button/link:
    □ Tap/click it
    □ Check Network tab — what API call was made?
    □ Check response — 200? 400? 500?
    □ Check UI — did feedback appear? (spinner, toast, navigation, modal)
    □ Check state — did the data update correctly?
    □ Double-tap — is there a guard against duplicate submission?

  For each input field:
    □ Enter valid data → submit → check result
    □ Enter empty/blank → submit → check validation message
    □ Enter invalid data (wrong format, too long, special chars, SQL injection, XSS)
    □ Enter boundary values (0, -1, 999999, very long string)
    □ Check: is the input sanitized in the UI AND in the API?

  For each dropdown/select:
    □ Open it — does it load options?
    □ Select each option — does it update correctly?
    □ Is there a default selection?

  For each navigation action:
    □ Does it go to the correct screen?
    □ Does the back button return correctly?
    □ Are params passed correctly?
    □ Deep link test (if applicable)

STEP 5 — 4-STATE TEST:
  □ LOADING: Refresh the page/screen. What appears during load?
  □ SUCCESS: Verify data matches what's in the database
  □ EMPTY: Test with a store/user that has no data
  □ ERROR: Test with network disconnected / bad auth token

STEP 6 — BUSINESS LOGIC:
  □ Are calculations correct? (totals, tax, discounts, change)
  □ Are constraints enforced? (min/max qty, required fields, permissions)
  □ Is store isolation working? (can you see another store's data?)
  □ Are duplicates prevented? (double submit, duplicate entries)

STEP 7 — RECORD RESULT:
  Write the full entry to RELEASES/post-gcp-staging-issues-20-03-2026.md
  If issues found: create LIVE-NNN entries with severity
  If pass: record evidence of what was tested
```

---

## TESTING ORDER — STRICT SEQUENTIAL

### PHASE 1 — POS App (32 screens)

**Prerequisites:**
- POS app installed on test device (APK from latest SHA)
- Device connected: `TG8HCYTGGQT885OF`
- Test store: SuperMandi Test Store (SU260305-003)
- Staff: Raju Manager (MANAGER role)

**Auth flow (test FIRST — everything depends on this):**

```
1.  SplashScreenV3        → App launch, connection check, version check
2.  PhoneScreenV3          → Enter 7737914383, request OTP
    ⚠️ ASK OPERATOR: "I need the OTP sent to 7737914383. Please provide it."
3.  OTPScreenV3            → Enter OTP, verify, handle timeout/resend
4.  StoreSelectScreenV3    → Select test store (if multi-store)
5.  StaffLoginScreenV3     → Enter Raju Manager PIN, verify login
```

**SELL tab (main business flow — test THOROUGHLY):**

```
6.  SellScreenV3           → Product grid, categories, search, voice overlay
    TEST: search for product, tap product tile, add to cart, change qty,
    remove from cart, clear cart, voice input trigger, barcode scan trigger
    WIRING: every product tap → API lookup → cart state → total update

7.  ScanScreenV3           → Camera scan, HID scan, manual barcode entry
    TEST: scan valid barcode, scan invalid barcode, scan same barcode twice

8.  NewProductScreenV3     → Manual product creation
    TEST: fill all fields, submit, verify in product list
    TEST: submit with missing required fields → validation errors

9.  PaymentScreenV3        → Payment method selection
    TEST: tap Cash, tap UPI, tap Udhar, tap Split Payment
    TEST: verify cart total shown correctly
    TEST: STG-503 zero-amount guard — try with empty cart

10. CashScreenV3           → Cash amount entry, change calculation
    TEST: enter exact amount, enter overpayment (change due), enter underpayment
    TEST: quick-amount preset buttons
    TEST: complete sale → verify sale recorded in DB

11. UpiScreenV3            → QR display, payment confirmation
    TEST: generate QR, wait for timeout (5 min), manual confirm
    TEST: Razorpay integration (if configured in staging)

12. UdharScreenV3           → Credit sale, customer selection
    TEST: select customer, confirm credit sale, verify in khata
    TEST: new customer inline creation

13. SuccessScreenV3         → Receipt display, print, share, void
    TEST: print receipt (if printer connected), share via WhatsApp
    TEST: void sale → verify reversal in DB
    TEST: navigate back to sell screen
```

**BUY tab:**

```
14. BuyScreenV3            → Supplier grid, supplier selection
    TEST: tap each supplier card, verify navigation

15. CompareScreenV3        → Price comparison across suppliers
    TEST: compare prices, select supplier, add to purchase cart

16. CounterPurchaseScreenV3 → Inbound stock scanning
    TEST: scan product, enter qty, submit counter purchase

17. GRNScreenV3            → Goods Receipt Note
    TEST: "Against PO" tab → select PO → receive line items → submit
    TEST: "Ad-hoc Inward" tab → manual entry → submit
    TEST: quantity validation (can't receive more than ordered)

18. ReorderScreenV3        → Auto-reorder suggestions
    TEST: approve suggestion → creates PO → verify in backend
    TEST: reject suggestion → removed from list
```

**STORE tab:**

```
19. StoreHubScreenV3       → Hub cards (Receive Stock, Stock Report)
    TEST: tap each card → correct navigation

20. StockScreenV3          → Inventory list, search, barcode labels
    TEST: search product, view stock level
    TEST: print barcode labels action
```

**MORE tab:**

```
21. MoreScreenV3           → Morning card, menu items
    TEST: verify yesterday's summary data matches DB
    TEST: tap each menu item → correct navigation

22. KhataScreenV3          → Credit ledger, customer dues
    TEST: view customer dues, record payment, send reminder
    TEST: verify ledger matches sales with method=udhar

23. FinanceScreenV3        → BNPL, loans, bill discounting
    TEST: check BNPL status, apply for credit (if configured)

24. ReportsScreenV3        → Sales analytics
    TEST: daily/weekly/monthly views, date range picker
    TEST: verify report numbers match actual sales data

25. CustomersScreenV3      → Customer directory
    TEST: list customers, add customer, view customer detail
    TEST: customer purchase history

26. SalesHistoryScreenV3   → Bill list, date filter
    TEST: tap bill → BillDetailScreenV3 overlay
    TEST: void sale from history, reprint

27. BillDetailScreenV3     → Bill detail overlay
    TEST: verify items, total, payment method match
    TEST: reprint, share

28. SettingsScreenV3       → Store info, language, printer, logout
    TEST: switch language → verify all text changes
    TEST: printer connection/disconnection
    TEST: logout → clears session → returns to login
```

**System screens (test if reachable):**

```
29. DeviceBlockedScreen    → Block device via superadmin, verify screen shows
30. ForceUpdateScreen      → Set min version higher in DB, verify screen shows
31. EnrollDeviceScreen     → Unenroll device, re-enroll with code
32. PaymentSetupScreen     → Verify payment method setup flow
```

---

### PHASE 2 — Retailer Admin Web (32 pages)

**Base URL:** `https://staging.supermandi.tech/retailer/`
**Tool:** Use `mcp__Claude_Preview__preview_start` to open browser

**Auth flow:**

```
1.  LoginPage              → Enter phone 7737914383
    ⚠️ ASK OPERATOR: "I need the OTP for retailer login on 7737914383"
2.  RegisterPage           → Test registration flow (use test data)
3.  ForgotPasswordPage     → Test reset flow
4.  ResetPasswordPage      → Complete reset
5.  RetailerOnboardingPage → Onboarding wizard steps
```

**Dashboard pages:**

```
6.  DashboardPage          → Morning brief, charts, quick actions
    TEST: every chart loads, every quick action button works
7.  ProductsPage           → Product CRUD
    TEST: list, add, edit, delete, import, search, filter, pagination
8.  InventoryPage          → Stock movements
9.  SuppliersPage          → Supplier list, invite
10. SupplierCatalogPage    → Browse catalog, add to store
11. StaffPage              → Staff CRUD, PIN management
    TEST: create staff, set PIN, change role, deactivate
12. DevicesPage            → Device activation codes
13. ChatPage               → Supplier messaging (SSE)
14. NotificationsPage      → Notification list, mark read
```

**Sales & Finance:**

```
15. InvoicesPage           → Invoice list, view, download PDF
16. PaymentsPage           → Payment history
17. ReconciliationPage     → Daily closing match
18. PurchaseOrdersPage     → PO CRUD
19. ReorderPage            → Auto-reorder config
20. ImportPage             → Bulk product import (CSV)
21. CreditDashboardPage    → BNPL overview
22. CustomersPage          → Customer directory
23. StockAdjustmentHistoryPage → Adjustment audit trail
```

**Admin & System:**

```
24. CompliancePage         → Compliance status
25. SettingsPage           → Store settings
26. AnalyticsPage          → BI dashboards
27. HelpPage               → Help center
28. HelpDashboardPage      → Guided setup
29. AllPagesPage           → Dev nav (should be hidden in prod?)
30. NotFoundPage           → Navigate to /retailer/nonexistent → 404 page
31. RootLayout             → Sidebar, header, idle timeout (60 min)
32. Route guards            → Access /retailer/dashboard without auth → redirect to login
```

---

### PHASE 3 — Supplier Portal Web (21 pages)

**Base URL:** `https://staging.supermandi.tech/supplier/`

**Auth flow:**

```
1.  login/page             → Supplier login (Firebase Phone Auth)
    ⚠️ ASK OPERATOR: "I need supplier test credentials or OTP for supplier login"
2.  register/page          → New supplier registration
3.  onboard/page           → Onboarding flow
4.  forgot-password/page   → Password reset
5.  reset-password/page    → Complete reset
6.  pending-approval/page  → Show pending status
```

**Dashboard:**

```
7.  dashboard/page         → Home overview
8.  products/page          → Product CRUD, image upload to GCS
9.  orders/page            → Order management, SSE live updates
    TEST: verify SSE connection establishes, test reconnection
10. bnpl-orders/page       → BNPL order tracking
11. invoices/page          → Invoice generation, PDF download
    TEST: download PDF → verify auth header sent (M-001 fix)
12. earnings/page          → Earnings dashboard
13. kyc/page               → KYC document upload (GCS)
    TEST: upload document, verify in GCS bucket
14. profile/page           → Profile edit
15. chat/page              → Retailer messaging (SSE)
16. notifications/page     → Notification center
17. help/page              → Help center
18. upload/page            → Bulk product upload
19. allocations/page       → Demand allocation management
20. support/page           → Support queue
21. layout.tsx             → Sidebar auth guard, SSE connection lifecycle
```

---

### PHASE 4 — SuperAdmin Web (30 tabs)

**Base URL:** `https://staging.supermandi.tech/admin/`

```
1.  StoresTab              → Store CRUD, provisioning, status
    TEST: create store, activate, deactivate, view details
2.  UsersTab               → User management, role assignment
3.  SuppliersTab           → Supplier approval workflow
    TEST: approve pending supplier → verify status change
4.  ApplicationsTab        → Application review
5.  CatalogTab             → Master catalog CRUD
    TEST: add product, edit, delete, search, bulk import
6.  DevicesTab             → Device fleet management
    TEST: view devices, block/unblock device
7.  AnalyticsTab           → Platform analytics
8.  PaymentsTab            → Payment monitoring
9.  InvoicesTab            → Invoice oversight
10. RefundsTab             → Refund management
11. StaffTab               → Cross-store staff oversight
12. AuditTab               → Audit log (verify CSV export, no injection)
13. ComplianceTab          → Compliance monitoring
14. GstComplianceTab       → GST filing status
15. DocumentsTab           → Document management (GCS)
16. EventsTab              → System events
17. SettingsTab            → Platform settings
18. MonitoringTab          → Service health
19. HealthDashboardTab     → Infrastructure health
20. MaintenanceTab         → Maintenance mode toggle
    TEST: enable maintenance → verify POS/retailer show maintenance page
21. ReorderPoliciesTab     → Reorder automation rules
22. DemandPressureTab      → Demand pressure signals
23. AllocationsDashboardTab → Allocation overview
24. QualityDashboardTab    → Quality metrics
25. CreditProvidersTab     → BNPL provider management
26. WhatsAppTab            → WhatsApp config
27. GrnAlertsTab           → GRN alert monitoring
28. SupportQueueTab        → Support tickets
29. AIInsightsTab          → AI insights
30. AiPanel                → AI assistant
```

---

### PHASE 5 — Cross-Platform Live Testing (7 flows)

These tests require multiple platforms open simultaneously:

```
FLOW 1: POS + SuperAdmin — Device Management
  SuperAdmin: block test device → POS: verify DeviceBlockedScreen shows
  SuperAdmin: unblock device → POS: verify normal operation resumes

FLOW 2: POS + SuperAdmin — Store Provisioning
  SuperAdmin: create enrollment code → POS: enroll with code → verify connection

FLOW 3: POS + Retailer — Sale Lifecycle
  POS: create sale (cash) → Retailer: verify sale appears in dashboard/invoices
  POS: void the sale → Retailer: verify void reflected
  Verify: amounts match in both UIs AND in database

FLOW 4: POS + Retailer — Staff Management
  Retailer: create new staff member with PIN
  POS: login with new staff PIN → verify access
  Retailer: deactivate staff → POS: verify login rejected

FLOW 5: Supplier + SuperAdmin — Onboarding
  Supplier: register new account → SuperAdmin: see in ApplicationsTab
  SuperAdmin: approve → Supplier: verify dashboard access
  Supplier: add products → verify in master catalog

FLOW 6: Supplier + Retailer — Catalog Chain
  Supplier: create product with price
  Retailer: browse supplier catalog → add to store
  POS: scan product barcode → verify name, price, unit match

FLOW 7: POS + Retailer + SuperAdmin — Credit Chain
  POS: create udhar sale → customer dues recorded
  Retailer: credit dashboard shows customer due
  POS: record payment against due → verify balance updated
  SuperAdmin: verify in analytics/payments
```

---

## OTP PROTOCOL

When you need OTP or email verification:

```
1. STOP testing
2. Ask operator: "I need the OTP sent to 7737914383 for [context: POS login / retailer login / etc.]"
3. WAIT for operator response
4. Enter OTP and continue
5. If OTP expires before operator responds, request resend
```

---

## OUTPUT FILE FORMAT

Create `RELEASES/post-gcp-staging-issues-20-03-2026.md` with this structure:

```markdown
# Post-GCP Staging Live Test Results

**Date:** 2026-03-20
**Staging URL:** staging.supermandi.tech
**Deployed SHA:** [SHA]
**Tester:** Claude Opus 4.6 (automated)
**Operator:** Available at 7737914383 / supermanditech@gmail.com for OTP/verification

## Issue Registry

| ID | Severity | Phase | Screen | Description | Status |
|---|---|---|---|---|---|
| LIVE-001 | CRITICAL | 1 | PaymentScreenV3 | [description] | OPEN |
| LIVE-002 | HIGH | 2 | ProductsPage | [description] | OPEN |

## Phase 1 — POS App Live Testing

### SplashScreenV3 — [PASS/ISSUES]
**Load time:** Xs
**Elements tested:** N buttons, N labels
**API calls:**
  - GET /api/v1/config-status → 200 (Xms)
  - GET /api/v1/pos/ui-status → 200 (Xms)
**4-state:** Loading ✅ | Success ✅ | Empty ✅ | Error ✅
**Issues:** [LIVE-NNN or none]
**Screenshot evidence:** [description of what was seen at each state]

[... repeat for every screen ...]

## Phase 2 — Retailer Admin Live Testing
[... same format ...]

## Phase 3 — Supplier Portal Live Testing
[... same format ...]

## Phase 4 — SuperAdmin Live Testing
[... same format ...]

## Phase 5 — Cross-Platform Live Testing
[... same format ...]

## Summary
| Platform | Screens | Pass | Issues | Critical | High | Medium | Low |
|---|---|---|---|---|---|---|---|
| POS | 32 | ? | ? | ? | ? | ? | ? |
| Retailer | 32 | ? | ? | ? | ? | ? | ? |
| Supplier | 21 | ? | ? | ? | ? | ? | ? |
| SuperAdmin | 30 | ? | ? | ? | ? | ? | ? |
| Cross-platform | 7 | ? | ? | ? | ? | ? | ? |
| **TOTAL** | **122+7** | ? | ? | ? | ? | ? | ? |
```

---

## DEAD CODE & LEGACY CLEANUP AUDIT (MANDATORY PARALLEL TRACK)

**Source of truth:** https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html

While testing each screen, you MUST simultaneously audit for dead code, legacy remnants, and conflicts. The prototype is the FINAL go-live specification. Anything in the codebase that contradicts, duplicates, or is absent from the prototype must be flagged for deletion or resolution.

### RULE 9 — PROTOTYPE IS LAW

The prototype defines what ships. If code exists that is NOT in the prototype and is NOT a required system/infra screen (DeviceBlocked, ForceUpdate, Enroll, PaymentSetup), it is a candidate for deletion. Cross-verify EVERY file before marking for deletion.

### Per-Screen Cleanup Checklist

For EACH screen you test, also check:

```
STEP C1 — PROTOTYPE MATCH:
  □ Is this screen in the prototype? (YES → keep, NO → flag as DELETE CANDIDATE)
  □ Does the screen name/title match the prototype exactly?
  □ Are there UI elements in the code NOT in the prototype? (extra buttons, hidden tabs, debug panels)
  □ Are there UI elements in the prototype NOT in the code? (missing features)

STEP C2 — OLD/LEGACY SCREEN FILES:
  □ Search for old versions of this screen: grep for the screen name without "V3" suffix
  □ Check: src/screens/ (root) for non-v3 versions of the same screen
  □ Check: any file with "old", "legacy", "deprecated", "backup", "v1", "v2" in the name
  □ If old version exists: verify it is NOT imported/referenced anywhere
  □ If old version is unreachable: flag for DELETION

STEP C3 — CONFLICTING NAVIGATION:
  □ Check App.tsx: are there duplicate route names or screen registrations?
  □ Check: can two different files serve the same route?
  □ Check: are there navigation.navigate() calls to screens that don't exist?
  □ Check: are there Stack.Screen entries for deleted/renamed screens?

STEP C4 — DEAD API ENDPOINTS:
  □ For each API endpoint called by this screen: is the endpoint still needed?
  □ Check: are there backend routes that NO frontend screen calls?
  □ Check: are there frontend API calls to endpoints that don't exist in backend?
  □ Check: are there duplicate API functions in the services/ folder?

STEP C5 — DEAD STORE/STATE:
  □ For each Zustand store used by this screen: is every field still used?
  □ Check: are there store fields that no component reads?
  □ Check: are there store actions that no component calls?
  □ Check: are there store files that no screen imports?

STEP C6 — DEAD SERVICES:
  □ For each service file imported by this screen: is it still needed?
  □ Check: are there service files that no screen or route imports?
  □ Check: are there duplicate service files (e.g. scanIntent.ts exists twice at
    src/services/scanIntent.ts AND src/services/scan/scanIntent.ts)?

STEP C7 — DEAD COMPONENTS:
  □ For each component used by this screen: is it still needed?
  □ Check: are there component files in src/components/ that no screen imports?
  □ Check: are there "v2" or legacy components alongside "v3" components?

STEP C8 — DEAD MIGRATIONS:
  □ For each DB table used by this screen: is the table still needed?
  □ Check: are there migrations that create tables no code references?
  □ Check: are there migrations that add columns no code reads/writes?
  □ DO NOT delete migrations — flag them and note which tables/columns are unused

STEP C9 — DEAD TEST FILES:
  □ For each test file related to this screen: does it test current code?
  □ Check: are there test files for deleted/renamed screens?
  □ Check: are there test files that import from files that no longer exist?
  □ Check: are there test files with .skip() or .todo() that should be removed?

STEP C10 — GCP DEAD CONFIG:
  □ Check: are there Cloud Run env vars for features removed from prototype?
  □ Check: are there secrets in Secret Manager for removed integrations?
  □ Check: are there GCS buckets/paths for removed features?
```

### Cleanup Output Format

Add a `## Dead Code & Legacy Cleanup Registry` section to the output file with:

```markdown
## Dead Code & Legacy Cleanup Registry

**Prototype reference:** https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html

### Summary

| Category | Files Found | Action |
|---|---|---|
| Legacy screens (non-V3) | N | DELETE |
| Orphaned components | N | DELETE |
| Dead API services | N | DELETE |
| Dead store fields | N | REMOVE |
| Dead backend routes | N | DELETE |
| Unused migrations (tables) | N | FLAG (do not delete) |
| Dead test files | N | DELETE |
| Conflicting navigation | N | FIX |
| Dead GCP config | N | REMOVE |

### Detailed Findings

#### CLEANUP-001: [filename]
**Type:** Legacy screen / Dead component / Dead service / etc.
**File:** `full/path/to/file.tsx`
**Why delete:** Not in prototype, not imported by any V3 screen, not a system screen
**Cross-verified:**
  - grep for filename across entire codebase: 0 imports
  - grep for component name: 0 references
  - Not in App.tsx route registration
  - Not in any navigation.navigate() call
**Safe to delete:** YES / NO (explain dependency)
**Action:** DELETE / KEEP (explain why)

#### CLEANUP-002: [filename]
[... same format ...]
```

### Cleanup Rules

1. **NEVER delete without cross-verification.** Before flagging any file for deletion:
   - `grep -r "filename" src/ --include="*.tsx" --include="*.ts"` — must return 0 results
   - `grep -r "ComponentName" src/ --include="*.tsx" --include="*.ts"` — must return 0 results
   - Check App.tsx, V3ScreenWrappers.tsx, PosRootLayoutV3.tsx for references
   - Check package.json for any script references
   - Check test files — a test importing it means the source is still "referenced"

2. **NEVER delete migrations.** Migrations are immutable history. Flag unused tables/columns but do NOT create deletion migrations unless explicitly instructed.

3. **Duplicate files get special treatment:**
   - If two files serve the same purpose (e.g. `scanIntent.ts` in two locations):
     - Determine which one is actively imported
     - Flag the other as DELETE CANDIDATE
     - Verify no transitive imports reach the candidate

4. **Legacy screens (src/screens/*.tsx without /v3/):**
   - SplashScreen.tsx (legacy) vs SplashScreenV3.tsx (current) — is legacy still imported?
   - Any screen in src/screens/ root that has a V3 equivalent in src/screens/v3/

5. **Backend route cleanup:**
   - Routes that only the old (non-V3) frontend called
   - Routes for features removed from prototype
   - Routes that duplicate newer routes

6. **Test file cleanup:**
   - Tests that import from deleted screens
   - Tests that reference old component names
   - Tests that are permanently skipped (.skip with no TODO)

7. **The cleanup registry is SEPARATE from the live test findings.** Live test issues get `LIVE-NNN` IDs. Cleanup items get `CLEANUP-NNN` IDs. Both go in the same output file but in different sections.

8. **DO NOT execute deletions during testing.** Only flag and document. Actual deletion is a separate ticket after operator review.

---

## CONSTRAINTS

- Do NOT mark any screen PASS without live evidence
- Do NOT skip any interactive element on any screen
- Do NOT move to next screen until current screen is FULLY tested
- Do NOT move to next phase until current phase is committed
- Do NOT create test data that could corrupt production (use "TEST-" prefixed names)
- Do NOT delete real data on staging
- One commit per phase to `RELEASES/post-gcp-staging-issues-20-03-2026.md`
- Push after each commit
- If you hit a CRITICAL issue: STOP, report it immediately, fix it before continuing
- If you hit a blocker (can't login, can't reach staging): STOP, report, ask operator
- Run `node scripts/fix-guard.js check` before each commit
- For web testing use `mcp__Claude_Preview__preview_start` tools
- For POS testing: describe exact steps for operator to execute on device, or use ADB if available
- **Total coverage target: 122 screens + 7 cross-platform flows = 129 test surfaces. Zero skipped.**
- Prototype (https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html) is the FINAL spec — code must match it
- Every screen tested MUST also run the CLEANUP checklist (Steps C1-C10)
- Cleanup items go into `## Dead Code & Legacy Cleanup Registry` section with CLEANUP-NNN IDs
- Do NOT execute deletions — only flag and document for operator review
- If a file exists in code but NOT in prototype AND is not a system screen: flag as CLEANUP candidate
- Cross-verify every CLEANUP candidate with grep before flagging (zero false positives)
