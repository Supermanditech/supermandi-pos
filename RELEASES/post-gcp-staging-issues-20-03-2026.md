# Post GCP Staging Issues — 2026-03-20

**Deployed SHA**: `493b1b1e` → `faa20f61` (with POS enrollment fix)
**Staging URL**: https://staging.supermandi.tech
**Reported by**: Operator (post-deploy smoke test)
**Investigated by**: Claude (live staging endpoint testing + code trace)
**Total Issues**: 4 tickets (GCP-STG-0001 through GCP-STG-0004)

---

## GCP-STG-0001 — GSTIN Locking Before Approval (Critical Registration Bug)

**Ticket ID**: GCP-STG-0001
**Severity**: P0 — CRITICAL (Go-Live Blocker)
**Priority**: 1 of 4
**Affects**: Supplier onboarding / acquisition funnel
**Portal**: Supplier Portal (`/supplier/register`)
**Category**: Business Logic / Database Constraint
**Status**: OPEN

### Problem

When a supplier attempts registration using a GSTIN, the system stores the GSTIN in the database **before** SuperAdmin approval. The GSTIN becomes permanently blocked after the first attempt — even if the application is not approved, incomplete, or failed. The supplier cannot re-register using the same GSTIN.

### Steps to Reproduce

1. Go to `https://staging.supermandi.tech/supplier/register`
2. Fill in registration form with a GSTIN (e.g., `27AABCU9603R1ZM`)
3. Submit the application
4. Application goes to PENDING/DRAFT status
5. Do NOT approve the application from SuperAdmin
6. Attempt to register again with the **same GSTIN**
7. **Result**: "GSTIN already registered" error — blocked permanently

### Observed Behavior

- GSTIN is saved to the database at registration submission time
- Even if application is rejected, abandoned, or incomplete, GSTIN remains locked
- On a second attempt, supplier gets "GSTIN already registered" error
- No self-service recovery — requires manual database intervention

### Why This Is Critical

- GSTIN gets permanently blocked after a single failed/incomplete attempt
- Legitimate suppliers cannot retry onboarding
- Breaks the entire supplier acquisition funnel

### Investigation Findings

**Migration 128** (`128_t001_relax_gstin_draft_uniqueness.sql`) already attempted to fix this:
- Partial unique index on `auth.applications` — only enforces for `KYC_SUBMITTED`, `PAYMENTS_SUBMITTED`, `ACTIVE`
- `check_gstin_uniqueness()` function ignores DRAFT/OTP_VERIFIED
- `expire_stale_drafts()` auto-expires abandoned applications after 48h

**However**, there is ALSO a hard UNIQUE constraint on the `supplier.suppliers` table:
```sql
-- Migration 003, line 54:
CONSTRAINT suppliers_gstin_unique UNIQUE (gstin)
```

**Root cause**: Registration flow may write to `supplier.suppliers` directly (bypassing the `auth.applications` relaxed constraint), or `check_gstin_uniqueness()` checks `supplier.suppliers` with no status filter — any approved supplier blocks all future registrations with that GSTIN.

### Suggested Fix

**Option A** (preferred): Partial unique index on suppliers table
- Replace `CONSTRAINT suppliers_gstin_unique UNIQUE (gstin)` with partial index
- `CREATE UNIQUE INDEX ... ON supplier.suppliers (gstin) WHERE verification_status IN ('verified', 'active')`
- Allows re-registration after rejection

**Option B**: Allow re-registration with state check
- On GSTIN conflict, check if existing application is in PENDING/REJECTED/EXPIRED state
- If yes, allow user to resume or restart
- Supersede old application with new one

### Files to Fix

- `backend/migrations/003_supplier_schema.sql` — hard UNIQUE constraint (line 54)
- `backend/src/routes/v1/supplier/registration.ts` — GSTIN check during registration (line 265-275)
- `backend/migrations/128_t001_relax_gstin_draft_uniqueness.sql` — existing partial fix
- New migration needed to drop hard constraint and add partial unique index

---

## GCP-STG-0002 — SuperAdmin Portal OTP Login Failure (Rate Limit Exhaustion)

**Ticket ID**: GCP-STG-0002
**Severity**: P0 — CRITICAL (Go-Live Blocker)
**Priority**: 2 of 4
**Affects**: SuperAdmin portal access — all admin operations blocked
**Portal**: SuperAdmin Portal (`/admin/`)
**Category**: Auth / Rate Limiting / OTP
**Status**: OPEN

### Environment

- SuperAdmin Portal: https://staging.supermandi.tech/admin/#support
- Backend API: https://staging.supermandi.tech/api/v1/admin/auth/
- Build stamp: `493b1b1` deployed 20/3/2026 10:35:45 pm

### Steps to Reproduce

1. Open SuperAdmin portal: `https://staging.supermandi.tech/admin/`
2. Enter email: `supermanditech@gmail.com`
3. Click "Send OTP"
4. Enter OTP received via email
5. Click Verify

### Observed Behavior

- OTP verification does not proceed
- Login fails — no redirect, stuck state
- No clear error message displayed to user

### Investigation Findings (LIVE STAGING TESTS)

**Test 1: Send OTP endpoint**
```
POST /api/v1/admin/auth/send-email-otp
{"email":"supermanditech@gmail.com"}

Response: 429 {"error":{"code":"RATE_LIMITED","message":"Too many requests. Please try again in 35 minutes."}}
```

**Test 2: Verify OTP endpoint**
```
POST /api/v1/admin/auth/verify-email-otp
{"email":"supermanditech@gmail.com","otp":"198956"}

Response: {"error":{"code":"OTP_NOT_FOUND","message":"No verification code found. Please request a new one."}}
```

**Test 3: Email allowlist verification**
```
Cloud Run env: ADMIN_EMAIL_ALLOWLIST = "supermanditech@gmail.com" ✓ (email IS in allowlist)
```

### Root Cause Identified

**PRIMARY**: Rate limiting is too aggressive for staging:
- `RATE_LIMIT_PER_MINUTE = 2` (emailService.ts:561)
- `RATE_LIMIT_PER_HOUR = 5` (emailService.ts:562)
- Plus IP-level rate limiter: 5 requests per minute (adminAuth.ts:23-26)

The operator exhausted the **hourly limit** (5 OTP requests) during testing. Rate limit is stored in **Redis** (survives container restarts). Locked out for ~35 minutes.

**SECONDARY**: OTP verification fails with `OTP_NOT_FOUND` because OTP was never sent (rate limited on send attempt).

**NOT the issue**: Email IS in allowlist, endpoint URLs ARE correct (`send-email-otp`/`verify-email-otp`), frontend calls correct endpoints (verified in `authToken.ts:348`).

### Suggested Fix

**Immediate** (unblock staging now):
- Clear Redis rate limit keys: `email_rl:min:supermanditech@gmail.com` and `email_rl:hr:supermanditech@gmail.com`
- Or restart Redis container to clear all rate limit state

**Code fix** (for staging environment):
- Add `RATE_LIMIT_MULTIPLIER` env var to scale limits for staging
- Staging: 10 per minute, 50 per hour (vs production: 2/min, 5/hour)
- OR: Check `NODE_ENV` / `DEPLOY_TIER` and apply relaxed limits for non-production

**Frontend fix**: Improve error display — currently `LoginGate.tsx` may silently swallow rate limit responses.

### Files to Fix

- `backend/src/services/emailService.ts` — rate limit constants (lines 561-562)
- `backend/src/routes/v1/admin/adminAuth.ts` — IP-level rate limiter (lines 23-26)
- `supermandi-superadmin/src/components/LoginGate.tsx` — needs better error display for rate limit
- `supermandi-superadmin/src/api/authToken.ts` — `sendAdminOtp()` return handling

### Quick Fix Commands (Operator)

```bash
# Option 1: Clear rate limits via Redis CLI
redis-cli -h <redis-host> -a <redis-pass>
DEL email_rl:min:supermanditech@gmail.com
DEL email_rl:hr:supermanditech@gmail.com

# Option 2: Wait ~35 minutes for hourly window to reset

# Option 3: Redeploy with higher rate limits (requires code change)
```

---

## GCP-STG-0003 — POS Fresh Install Shows OTP Error Instead of Enrollment

**Ticket ID**: GCP-STG-0003
**Severity**: P1 — HIGH
**Priority**: 3 of 4
**Affects**: POS app first-time user experience
**Portal**: POS App (Android)
**Category**: Navigation / Auth Flow
**Status**: FIXED

### Problem

Fresh POS app install showed error: "POS phone+OTP login is not yet available on this server. Contact your administrator." instead of the enrollment screen.

### Root Cause

`SplashScreenV3.tsx` checked `/api/v1/config-status` endpoint (which doesn't exist on staging) to determine whether to show phone+OTP login. When the endpoint failed or returned `otpAuthEnabled: false`, the app showed an error instead of falling back to device enrollment.

### Fix Applied

Changed splash screen to navigate directly to `EnrollDevice` screen when no device session exists. A fresh install should always show enrollment — not phone OTP check.

```diff
- // V3-FIX-116: Explicit backend capability check
- setStatusText("Checking capabilities...");
- try {
-   const res = await fetch(.../config-status)...
-   if (res?.otpAuthEnabled === true) { safeNavigate("V3Phone"); }
-   else { setErrorState("POS phone+OTP login is not yet available..."); }
- } catch { setErrorState("Could not confirm server capabilities..."); }
+ // No device session — navigate to enrollment
+ setStatusText("Welcome!");
+ safeNavigate("EnrollDevice");
```

### Evidence

- **Before**: Error screen with "Contact your administrator" message
- **After**: Enrollment screen showing "Activate Your POS" with activation code input
- **Verified**: Screenshot on Redmi device confirms enrollment screen loads correctly

### Resolution

- **Commit**: `faa20f61`
- **File**: `src/screens/v3/SplashScreenV3.tsx`
- **APK rebuilt**: Yes, installed on device via ADB
- **Status**: FIXED and verified on device

---

## GCP-STG-0004 — Implement V3 POS Device Onboarding (Phone+OTP → Staff PIN)

**Ticket ID**: GCP-STG-0004
**Severity**: P0 — CRITICAL (Go-Live Blocker)
**Priority**: 4 of 4
**Affects**: POS app first-time device onboarding — entire retailer activation flow
**Portal**: POS App (Android) + Retailer Web + SuperAdmin + Backend
**Category**: Full-stack feature (UI → UX → Wiring → Navigation → API → Backend → DB → GCP Parity)
**Status**: OPEN

### Problem

The POS app currently shows the **legacy `EnrollDeviceScreen`** (activation code flow) on fresh install. The V3 flow (`PhoneScreenV3` → `OTPScreenV3`) exists but is **completely broken** — blocked by 3 cascading failures:

1. **API Gateway** does not proxy `/api/v1/config-status` → app can't detect V3 auth capability
2. **API Gateway** applies `requireDeviceToken` to `/api/v1/pos/auth/send-otp` → returns 401 on unauthenticated devices
3. **Legacy `EnrollDeviceScreen`** uses old design, code-based enrollment — does not match the V3 user journey

### Correct User Journey (End-to-End)

```
RETAILER WEB REGISTRATION
1. Retailer registers on https://staging.supermandi.tech/retailer/ (phone + business details)
2. SuperAdmin approves the retailer application
3. Retailer's store is created (same store used by POS app)

POS APP FIRST LAUNCH (same store as retailer web)
4. User downloads POS app on Android device
5. App shows V3 phone screen (PhoneScreenV3) — "Enter your registered phone number"
6. User enters the SAME phone number registered on retailer web
7. Backend sends OTP via Firebase/WhatsApp to that phone
8. User enters OTP (OTPScreenV3) — 6-digit code, auto-submit
9. Backend verifies OTP → links device to retailer's store → returns device token
10. App saves device session (storeId + deviceToken)

STAFF PIN SETUP (post-login)
11. App navigates to StaffLoginScreenV3
12. Retailer (owner) sets up their PIN (first-time PIN creation)
13. Retailer can also create staff members (CASHIER/STOCK_MANAGER/MANAGER)
14. Both retailer and staff can login via PIN on subsequent launches

KEY CONSTRAINT: Retailer web store and POS app store MUST be the same entity.
The phone number links them — same phone = same store = same data.
```

### What Needs to Be Fixed (Layer by Layer)

#### Layer 1: API Gateway — Route `/api/v1/config-status` and `/api/v1/pos/auth/*`

**Problem**: Gateway doesn't proxy `config-status`. Gateway applies device auth to ALL `/pos/*` routes including the auth endpoints that ARE the authentication.

**Fix**:
- Add `/api/v1/config-status` to gateway route list (public, no auth)
- Ensure `/api/v1/pos/auth/send-otp` and `/api/v1/pos/auth/verify-otp` bypass `requireDeviceToken` in the gateway proxy config
- These are public endpoints — they authenticate the device, so they can't require a device token

**Files**:
- `backend/services/api-gateway/src/config.ts` — add config-status route + pos/auth exclusion

#### Layer 2: Backend — `/api/v1/config-status` Response

**Problem**: Endpoint exists (`configStatus.ts:39`) but gateway doesn't forward it, so app never gets `otpAuthEnabled: true`.

**Fix**:
- Ensure `configStatusRouter` returns `{ otpAuthEnabled: true }` when POS OTP auth is available
- Verify it's mounted before any auth middleware (`v1Router.use("/", configStatusRouter)` at line 143 — already correct)

**Files**:
- `backend/src/routes/v1/configStatus.ts` — verify `otpAuthEnabled` logic
- Gateway config — add route forwarding

#### Layer 3: Backend — POS OTP Send + Verify Endpoints

**Problem**: Endpoints exist (`posOtpAuthRouter`) and work, but return 401 from gateway-level device token check.

**Fix**:
- Verify `/api/v1/pos/auth/send-otp` sends OTP via WhatsApp or Firebase to registered phone
- Verify `/api/v1/pos/auth/verify-otp` returns device token + storeId + storeName
- Verify the phone lookup matches against `auth.users` / `auth.store_users` / `platform.stores`
- The store returned must be the SAME store created during retailer web registration

**Files**:
- `backend/src/routes/v1/pos/otpAuth.ts` — send-otp + verify-otp handlers
- `backend/src/services/whatsappService.ts` — OTP delivery via WhatsApp
- `backend/services/auth-service/` — Firebase OTP if used for POS

#### Layer 4: POS App — SplashScreenV3 Flow Restoration

**Problem**: Splash screen was changed to always go to `EnrollDevice` (GCP-STG-0003 fix). Need to restore the V3 capability check and use `PhoneScreenV3` when backend supports it.

**Fix**:
- SplashScreenV3: Check `/api/v1/config-status` → if `otpAuthEnabled: true` → navigate to `V3Phone`
- If config-status unreachable or `otpAuthEnabled: false` → fallback to `EnrollDevice` (backward compat)
- Remove the hard-coded `EnrollDevice` navigation added in GCP-STG-0003

**Files**:
- `src/screens/v3/SplashScreenV3.tsx` — restore capability check with fallback

#### Layer 5: POS App — PhoneScreenV3 + OTPScreenV3 Verification

**Problem**: Screens exist but were never tested against live backend.

**Fix**:
- `PhoneScreenV3` calls `POST /api/v1/pos/auth/send-otp` — verify this works
- `OTPScreenV3` calls `POST /api/v1/pos/auth/verify-otp` — verify session save works
- After OTP verify → navigate to `V3StaffLogin` for PIN setup
- Multi-store support: if user has multiple stores, show `V3StoreSelect`

**Files**:
- `src/screens/v3/PhoneScreenV3.tsx` — phone entry + send OTP
- `src/screens/v3/OTPScreenV3.tsx` — OTP verify + session save
- `src/screens/v3/StaffLoginScreenV3.tsx` — PIN login/setup
- `src/screens/v3/StoreSelectScreenV3.tsx` — multi-store picker (if exists)

#### Layer 6: Staff PIN Setup + Persistent Session + Idle Soft-Lock

**Problem**: After OTP verification, retailer needs to set up their PIN. Staff creation flow must also work. POS app is used in busy kirana stores — it should NOT log out on its own. Idle timeout should soft-lock (PIN re-entry), not full logout.

**Current state (investigation findings)**:
- `StaffLoginScreenV3.tsx` EXISTS — V3 PIN entry screen with store name, 4-6 digit PIN input, Login button, Switch Store link. Both retailer and staff use the same PIN screen. ✓
- `useSessionTimeout.ts` EXISTS — idle soft-lock hook. BUT:
  - **NOT WIRED** into any screen — idle timeout is completely non-functional today
  - Code has 10-min timeout, but alert message says "30 minutes" (stale text)
  - Hook navigates to `onLogout` callback — caller decides whether PIN re-entry or full logout
- `SettingsScreenV3.tsx` has "Switch Staff" button (→ `V3StaffLogin`) and "Logout" button (→ `Splash`)
- Offline PIN login cached in AsyncStorage (works when no network) ✓

**Fix — Session behavior for kirana POS**:

**A. Persistent device session (NEVER auto-logout)**:
- Device session (storeId + deviceToken) must NEVER expire on its own
- Only explicit "Logout" from Settings clears device session
- App restart → splash → detect device session → go straight to PIN screen (not phone+OTP again)

**B. Idle soft-lock (30 min → PIN re-entry)**:
- After 30 minutes of no user interaction → soft-lock to `V3StaffLogin` (PIN screen)
- This clears the STAFF session only (not the device session)
- Both retailer (owner) and any staff member can enter their PIN to resume
- Warning alert at 25 minutes: "Session expiring — tap to stay logged in"
- Do NOT soft-lock during active payment flow (PaymentScreen focused = treat as active)

**C. PIN re-entry screen requirements**:
- `StaffLoginScreenV3` already has: store name/code display, PIN input (4-6 digits, secure entry), Login button, error display, offline PIN cache
- Needs: "Switch Staff" button visible (so different staff can take over mid-shift)
- After PIN verify → navigate back to `SellScan` (main POS screen), NOT start from scratch

**D. Staff management from POS**:
- After first OTP login → retailer creates their own PIN (becomes owner/MANAGER)
- From Settings → retailer can create additional staff (CASHIER, STOCK_MANAGER, MANAGER)
- Each staff member gets their own PIN
- PIN uniqueness enforced per store (SHA-256 lookup hash)

**E. Wire useSessionTimeout into POS layout**:
- Import `useSessionTimeout` into `PosRootLayoutV3.tsx` or the main POS tab navigator
- `onLogout` callback → `navigation.reset({ routes: [{ name: "V3StaffLogin" }] })` (soft-lock to PIN)
- Change timeout constants: `IDLE_WARNING_MS = 25 * 60 * 1000` (25 min), `IDLE_LOGOUT_MS = 30 * 60 * 1000` (30 min)
- Fix stale alert text: "30 minutes" → match actual constant

**Files**:
- `src/hooks/useSessionTimeout.ts` — change 10min → 30min, fix alert text
- `src/screens/v3/PosRootLayoutV3.tsx` or `src/screens/v3/V3ScreenWrappers.tsx` — wire useSessionTimeout
- `src/screens/v3/StaffLoginScreenV3.tsx` — PIN entry + creation (exists, verify wiring)
- `src/screens/v3/SettingsScreenV3.tsx` — Switch Staff + Logout buttons (exists)
- `src/screens/v3/SplashScreenV3.tsx` — on restart: detect device session → PIN screen (not phone)
- `backend/src/routes/v1/pos/staff.ts` — staff CRUD + PIN verify
- `backend/src/routes/v1/pos/staffManage.ts` — staff management

#### Layer 7: Delete Legacy Conflicting Code

**Problem**: Old enrollment screens and auth flows conflict with V3 flow.

**Fix**:
- Remove or deprecate `src/screens/EnrollDeviceScreen.tsx` (keep as fallback only if config-status returns false)
- Remove `src/screens/SplashScreen.tsx` (old splash, V3 splash is the entry point)
- Remove `src/screens/PaymentSetupScreen.tsx` if no longer used
- Clean up navigator: remove old screen registrations if replaced
- Remove `/api/v1/config-status` capability check error path (replace with clean fallback)

**Files**:
- `src/screens/EnrollDeviceScreen.tsx` — keep as fallback, mark legacy
- `src/screens/SplashScreen.tsx` — verify not used, remove if dead
- `App.tsx` — clean up navigator screen registrations

#### Layer 8: Database — Phone-to-Store Linkage

**Problem**: POS OTP login must link phone number to the correct store. The retailer web registration creates the store — POS must find the same store.

**Fix**:
- Verify `auth.users` table has retailer's phone
- Verify `auth.store_users` links user to store
- Verify `platform.stores` has the store created during retailer web registration
- OTP verify endpoint must return the correct storeId from this linkage
- POS app and retailer web portal MUST operate on the SAME store (same data, same inventory, same sales)

**Files**:
- `backend/src/routes/v1/pos/otpAuth.ts` — phone → store lookup query
- `backend/migrations/002_auth_schema.sql` — auth.users, auth.store_users tables
- `backend/migrations/001_platform_schema.sql` — platform.stores table

#### Layer 9: GCP Parity

**Fix**:
- Ensure all new/changed routes are forwarded by API Gateway in Cloud Run
- Ensure Firebase/WhatsApp OTP delivery works on staging
- Verify CORS allows POS app origin
- Test full flow on staging after deploy

### Acceptance Criteria

**First-time device setup:**
- [ ] Fresh POS install → V3 phone screen (not legacy enrollment)
- [ ] Enter registered retailer phone → OTP sent via Firebase/WhatsApp
- [ ] Enter OTP → device linked to retailer's store → session saved
- [ ] POS store = same store as retailer web (same storeId, same data)
- [ ] After OTP → staff PIN setup screen → retailer creates their own PIN (owner/MANAGER)

**PIN login (daily use):**
- [ ] App restart → splash detects device session → goes to PIN screen (not phone+OTP)
- [ ] Retailer enters PIN → straight to main POS screen (SellScan)
- [ ] Staff enters their own PIN → straight to main POS screen
- [ ] Wrong PIN → error message, retry allowed
- [ ] 5 failed attempts → 15-min lockout (backend enforced)
- [ ] Offline PIN login works (cached in AsyncStorage)

**Idle timeout (kirana store behavior):**
- [ ] App stays logged in during active use — no surprise logouts
- [ ] 30 minutes idle → soft-lock to PIN re-entry screen (NOT full logout)
- [ ] Warning alert at 25 minutes: "Session expiring — tap to stay"
- [ ] During payment flow → idle timer paused (no timeout mid-transaction)
- [ ] After soft-lock → ANY staff/owner can enter PIN to resume (shift handover)
- [ ] Device session persists across soft-locks (no phone+OTP needed again)

**Staff management:**
- [ ] Owner can create additional staff from Settings
- [ ] Each staff gets role (CASHIER/STOCK_MANAGER/MANAGER) + PIN
- [ ] "Switch Staff" button available on PIN screen for shift changes

**Cleanup:**
- [ ] Legacy enrollment still works as fallback (if config-status returns false)
- [ ] No old/conflicting screens in the navigation flow
- [ ] All endpoints work on GCP staging (not just local)

---

## GCP-STG-0005 — POS Session Lifecycle: Two-Layer Auth (OTP + PIN) with Zero Conflicts

**Ticket ID**: GCP-STG-0005
**Severity**: P0 — CRITICAL (Go-Live Blocker)
**Priority**: 5 of 8
**Affects**: POS app daily kirana operations — session persistence, shift changes, device reuse
**Portal**: POS App (Android)
**Category**: Session Management / Auth / Business Logic
**Status**: OPEN

### Problem

The POS app has two auth layers (OTP device registration + staff PIN login) but their interaction is not defined for real-world kirana store usage. Sessions can conflict — idle timeout could force OTP re-entry, app kill could lose device session, and there's no clear boundary between "device logged out" vs "staff locked out".

### Two-Layer Session Model (Definitive)

```
LAYER 1: DEVICE SESSION (OTP-based, long-lived)
├── Created: First-time phone+OTP verification
├── Stored: SecureStore/AsyncStorage (deviceId, storeId, deviceToken)
├── Lifetime: PERMANENT until explicit logout
├── Survives: App restart, app kill, phone reboot, idle timeout, soft-lock
├── Cleared ONLY by: "Logout" button in Settings (user-initiated)
├── After clear: Must re-enter phone + OTP (full re-authentication)
└── Purpose: Binds this physical device to this store

LAYER 2: STAFF SESSION (PIN-based, shift-lived)
├── Created: Staff/owner enters PIN
├── Stored: Zustand in-memory (staffId, name, role, maxDiscountPct)
├── Lifetime: Until idle timeout OR manual switch OR app kill
├── Survives: Navigation between screens, payment flows
├── Cleared by: 30-min idle timeout, "Switch Staff", app kill, "Logout"
├── After clear: PIN re-entry screen (device session intact — no OTP)
└── Purpose: Identifies WHO is operating the POS right now
```

### Real-World Kirana Scenarios (Must All Work)

#### Scenario 1: Normal Daily Operation
```
Morning: Owner opens app → PIN screen → enters PIN → starts billing
All day: Scan → add → checkout → payment → repeat (no interruptions)
Evening: Owner closes app → done (no explicit logout needed)
Next morning: Opens app → PIN screen → enters PIN → continues
```
**Required behavior**: Device session persists across app restarts. Only PIN needed daily.

#### Scenario 2: Idle During Slow Hours
```
Lunch time: No customers for 1 hour
App shows PIN screen (soft-locked after 30 min idle)
Customer arrives: Owner enters PIN → immediately back to billing
```
**Required behavior**: Soft-lock to PIN screen. NO OTP. NO "session expired". Instant resume.

#### Scenario 3: Shift Change (Owner → Staff)
```
Owner working morning shift → taps "Switch Staff" in Settings
PIN screen appears → Staff member enters THEIR PIN
Staff works afternoon shift with their permissions (CASHIER: 10% max discount)
```
**Required behavior**: Device session unchanged. Only staff session switches. PIN screen shows "Switch Staff" option.

#### Scenario 4: App Killed / Phone Restarted
```
Phone runs out of battery → charges → restarts
Opens POS app → PIN screen (not phone+OTP)
Enters PIN → back to POS immediately
```
**Required behavior**: Device session in persistent storage survives app kill. Staff session lost (re-enter PIN).

#### Scenario 5: Explicit Logout (Moving Device to Different Store)
```
Owner decides to use this device for a different store
Settings → Logout → confirms → full OTP flow
Enters different phone number → OTP → new store linked
```
**Required behavior**: BOTH layers cleared. Full phone+OTP required. Device re-bound to new store.

#### Scenario 6: Multiple Failed PIN Attempts
```
Someone enters wrong PIN 5 times
Account locked for 15 minutes (backend enforced)
After 15 min → can try again
Device session NOT cleared — no OTP needed after lockout expires
```
**Required behavior**: PIN lockout does NOT trigger device logout. Only staff session blocked.

#### Scenario 7: Offline Operation
```
Internet goes down during billing
Owner can still login with cached PIN (AsyncStorage)
Billing continues offline (local queue)
When internet returns, outbox syncs
```
**Required behavior**: Cached PIN login works offline. Device session intact.

#### Scenario 8: App Update (New APK Installed)
```
New APK installed via ADB or Play Store
App data preserved (not cleared) → device session intact
Opens app → PIN screen → continues
```
**Required behavior**: APK update preserves AsyncStorage/SecureStore. No re-enrollment needed.

### Edge Cases (Must NOT Happen)

| Edge Case | Wrong Behavior | Correct Behavior |
|---|---|---|
| 30-min idle | OTP screen appears | PIN screen appears |
| App killed during checkout | Device session lost, OTP needed | PIN screen on next launch |
| Staff switches mid-sale | Cart lost, OTP required | Cart persisted, PIN screen, resume |
| Internet drops during PIN verify | Full logout, OTP on reconnect | Offline PIN cache used |
| 5 wrong PINs + wait 15min | Device de-registered, OTP needed | PIN re-entry allowed, device intact |
| Phone rebooted | "Activate Your POS" enrollment screen | PIN entry screen |
| Owner logs out, comes back | PIN screen (wrong) | Phone+OTP screen (correct — explicit logout) |

### Implementation Requirements

**SplashScreenV3 Decision Tree**:
```
App Launch
  ├── Device session exists? (SecureStore check)
  │   ├── YES → navigate to V3StaffLogin (PIN screen)
  │   └── NO → check config-status
  │       ├── otpAuthEnabled: true → V3Phone (phone+OTP)
  │       └── false/error → EnrollDevice (fallback)
  │
  V3StaffLogin
  ├── PIN entered correctly → SellScan (main POS)
  ├── PIN wrong → error, retry
  ├── 5 failures → locked 15min (backend)
  ├── "Switch Staff" → clear staff session, stay on PIN screen
  └── "Logout" → clear BOTH sessions → Splash → V3Phone
```

**useSessionTimeout integration**:
```
PosRootLayout (wraps all POS screens)
  ├── useSessionTimeout(onSoftLock, isFocused)
  ├── onSoftLock = () => {
  │     clearStaffSession();        // Layer 2 only
  │     navigate("V3StaffLogin");   // PIN re-entry
  │   }
  ├── Touch/tap events → resetTimer()
  ├── PaymentScreen focused → timer paused
  └── Constants: WARN=25min, LOCK=30min
```

### Files to Implement

- `src/screens/v3/SplashScreenV3.tsx` — decision tree (device session → PIN, no session → OTP)
- `src/hooks/useSessionTimeout.ts` — change to 30min, wire into layout
- `src/screens/v3/PosRootLayoutV3.tsx` — integrate useSessionTimeout
- `src/screens/v3/StaffLoginScreenV3.tsx` — verify all scenarios work
- `src/screens/v3/SettingsScreenV3.tsx` — Logout clears both layers, Switch Staff clears layer 2 only
- `src/services/deviceSession.ts` — verify persistence across app kill/restart
- `src/stores/staffSessionStore.ts` — verify clear vs persist behavior

---

## GCP-STG-0006 — POS Business Logic Safety: Cart Persistence Across Soft-Lock

**Ticket ID**: GCP-STG-0006
**Severity**: P1 — HIGH (Go-Live Blocker)
**Priority**: 6 of 8
**Affects**: Active sale not lost during idle/shift-change
**Portal**: POS App (Android)
**Category**: Business Logic / State Management
**Status**: OPEN

### Problem

When a cashier is mid-sale (items in cart) and the app soft-locks due to idle timeout or staff switch, the cart state must survive. Losing a customer's cart during billing is unacceptable for kirana stores.

### Requirements

- Cart state persisted in Zustand store (survives navigation, not app kill)
- On soft-lock → PIN screen → same staff re-enters PIN → cart restored, continue checkout
- On staff switch → new staff sees the pending cart (shift handover with active sale)
- On explicit logout → cart cleared (new device = new store = no cart)
- On app kill → cart lost (acceptable — customer still physically present, re-scan is quick)

### Files to Check

- `src/stores/cartStore.ts` — verify persistence behavior
- `src/screens/v3/SellScreenV3.tsx` — cart state source
- `src/screens/v3/StaffLoginScreenV3.tsx` — after PIN verify, navigate to SellScan (cart intact)

---

## GCP-STG-0007 — POS Concurrent Session Prevention

**Ticket ID**: GCP-STG-0007
**Severity**: P1 — HIGH
**Priority**: 7 of 8
**Affects**: Security — prevent same account from dual-operating
**Portal**: POS App (Android) + Backend
**Category**: Security / Business Logic
**Status**: OPEN

### Problem

If the same phone number is used to register a device via OTP on two different physical devices, both devices could operate on the same store simultaneously. This creates:
- Duplicate sales
- Stock count divergence
- Conflicting checkout states

### Requirements

- Backend: When a new device registers via OTP for a store, revoke tokens of previously registered devices for that store
- OR: Allow multi-device but enforce stock locking (complex — defer to post-launch)
- Frontend: On device token revocation, app shows "This device was deregistered. Another device is now active for this store." → navigate to phone+OTP

### Files to Check

- `backend/src/routes/v1/pos/otpAuth.ts` — verify-otp should check existing devices
- `backend/src/middleware/deviceToken.ts` — handle revoked tokens gracefully
- `src/services/api/apiClient.ts` — handle 401 DEVICE_REVOKED response

---

## GCP-STG-0008 — POS Token Expiry + Silent Refresh

**Ticket ID**: GCP-STG-0008
**Severity**: P1 — HIGH
**Priority**: 8 of 8
**Affects**: POS app long-running sessions (device token may expire after 90 days)
**Portal**: POS App (Android) + Backend
**Category**: Auth / Token Management
**Status**: OPEN

### Problem

Device tokens have a 90-day expiry (`token_expires_at` in `pos_devices` table). A kirana store POS runs continuously — after 90 days, API calls start failing with 401. The app must silently refresh the token without requiring phone+OTP re-entry.

### Requirements

- Backend: Token refresh endpoint `POST /api/v1/pos/token/refresh` (exists in apiClient.ts:277)
- On 401 response → attempt silent token refresh using stored device credentials
- If refresh succeeds → retry the failed request transparently
- If refresh fails → soft-lock to PIN screen (try refresh again on next PIN login)
- ONLY if refresh permanently fails (device revoked/deleted) → require phone+OTP

### Edge Case

- Device token expires while app is backgrounded for days
- On next foreground → 401 → refresh → if OK continue, if fail → PIN screen (not OTP)
- Token refresh should NOT require user interaction

### Files to Check

- `src/services/api/apiClient.ts` — 401 handler + refresh logic (line 277)
- `backend/src/routes/v1/pos/enroll.ts` — token refresh endpoint
- `backend/src/middleware/deviceToken.ts` — expired token handling

---

## Summary

| Ticket | Title | Severity | Status | Blocker? |
|---|---|---|---|---|
| GCP-STG-0001 | GSTIN locking before approval | P0 CRITICAL | OPEN | YES |
| GCP-STG-0002 | SuperAdmin OTP rate limit exhaustion | P0 CRITICAL | OPEN | YES |
| GCP-STG-0003 | POS fresh install OTP error | P1 HIGH | FIXED (`faa20f61`) | NO |
| GCP-STG-0004 | V3 POS device onboarding (Phone+OTP → Staff PIN) | P0 CRITICAL | OPEN | YES |
| GCP-STG-0005 | POS session lifecycle: two-layer auth (OTP+PIN) | P0 CRITICAL | OPEN | YES |
| GCP-STG-0006 | Cart persistence across soft-lock/shift-change | P1 HIGH | OPEN | YES |
| GCP-STG-0007 | Concurrent session prevention (multi-device) | P1 HIGH | OPEN | YES |
| GCP-STG-0008 | Device token expiry + silent refresh | P1 HIGH | OPEN | YES |

**Blocking go-live**: GCP-STG-0001, 0002, 0004, 0005, 0006, 0007, 0008
**Resolved this session**: GCP-STG-0003

| Ticket | Title | Severity | Status | Blocker? |
|---|---|---|---|---|
| GCP-STG-0001 | GSTIN locking before approval | P0 CRITICAL | OPEN | YES |
| GCP-STG-0002 | SuperAdmin OTP rate limit exhaustion | P0 CRITICAL | OPEN | YES |
| GCP-STG-0003 | POS fresh install OTP error | P1 HIGH | FIXED (`faa20f61`) | NO |
| GCP-STG-0004 | V3 POS device onboarding (Phone+OTP → Staff PIN) | P0 CRITICAL | OPEN | YES |

**Blocking go-live**: GCP-STG-0001, GCP-STG-0002, GCP-STG-0004
**Resolved this session**: GCP-STG-0003

---

## Resolution Checklist

### GCP-STG-0001 (GSTIN Locking)
- [ ] Create migration to replace hard GSTIN UNIQUE with partial unique index
- [ ] Update registration endpoint to allow re-registration on rejected/expired
- [ ] Test re-registration with same GSTIN after rejection
- [ ] Commit + deploy + verify on staging

### GCP-STG-0002 (SuperAdmin OTP)
- [ ] Clear Redis rate limit keys for `supermanditech@gmail.com`
- [ ] Add staging-aware rate limit multiplier (or increase limits)
- [ ] Verify OTP send + verify flow works after rate limit reset
- [ ] Improve frontend error display for rate limit responses
- [ ] Commit + deploy + verify on staging

### GCP-STG-0003 (POS Enrollment) — DONE
- [x] Fix splash screen navigation (commit `faa20f61`)
- [x] Rebuild APK + install on device
- [x] Verify enrollment screen shows on fresh install

### GCP-STG-0004 (V3 POS Device Onboarding) — 10 layers
- [ ] Layer 1: Add `config-status` + `pos/auth/*` routes to API Gateway (bypass device token)
- [ ] Layer 2: Verify `config-status` returns `otpAuthEnabled: true`
- [ ] Layer 3: Verify POS OTP send + verify endpoints work without device token
- [ ] Layer 4: Restore SplashScreenV3 capability check (V3Phone if enabled, EnrollDevice fallback)
- [ ] Layer 5: Test PhoneScreenV3 → OTPScreenV3 → session save against live backend
- [ ] Layer 6a: Staff PIN setup after first OTP login + staff creation + PIN login
- [ ] Layer 6b: Wire `useSessionTimeout` (30min idle → PIN re-entry, not full logout)
- [ ] Layer 6c: App restart → detect device session → PIN screen (not phone+OTP)
- [ ] Layer 7: Remove/deprecate legacy EnrollDeviceScreen, old SplashScreen
- [ ] Layer 8: Verify phone→store linkage (POS store = retailer web store = same entity)
- [ ] Layer 9: Deploy to GCP staging + test full flow on device

### GCP-STG-0005 (Session Lifecycle) — 8 scenarios
- [ ] Scenario 1: Daily open → PIN → bill → close → next day PIN (no OTP)
- [ ] Scenario 2: 1hr idle → PIN re-entry → instant resume (no OTP)
- [ ] Scenario 3: Shift change → Switch Staff → new PIN → new role applied
- [ ] Scenario 4: App killed / phone restarted → PIN screen (not OTP)
- [ ] Scenario 5: Explicit logout → phone+OTP required (both layers cleared)
- [ ] Scenario 6: 5 wrong PINs → 15min lockout → retry (no OTP, device intact)
- [ ] Scenario 7: Offline → cached PIN login → billing continues
- [ ] Scenario 8: APK update → device session preserved → PIN screen

### GCP-STG-0006 (Cart Persistence)
- [ ] Cart survives idle soft-lock → PIN re-entry → cart restored
- [ ] Cart survives staff switch → new staff sees pending cart
- [ ] Cart cleared on explicit logout (new store = no old cart)

### GCP-STG-0007 (Concurrent Sessions)
- [ ] New device OTP for same store → revoke old device token
- [ ] Old device shows "deregistered" message → phone+OTP to re-register
- [ ] Only one active device per store at a time

### GCP-STG-0008 (Token Expiry)
- [ ] 90-day token expiry → silent refresh on 401
- [ ] Refresh succeeds → retry failed request transparently
- [ ] Refresh fails → PIN screen (not OTP) for retry
- [ ] Only permanent failure (revoked/deleted) → phone+OTP
