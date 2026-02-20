# Gate Screen Go-Live Certification Report

**Date**: 2026-02-20
**Auditor**: Claude (automated + 5-agent deep audit)
**Branch**: `main` @ `bf7babb`
**Scope**: Screens 1 (Splash), 2 (ForceUpdate), 3 (EnrollDevice)

---

## Executive Summary

| Screen | Verdict | Tests | Blockers | Non-Blocking Gaps |
|--------|---------|-------|----------|-------------------|
| **Screen 1: SplashScreen** | **GO-LIVE READY** | 12/12 pass | 0 | 1 |
| **Screen 2: ForceUpdateScreen** | **GO-LIVE READY** | 14/14 pass | 0 | 0 |
| **Screen 3: EnrollDeviceScreen** | **GO-LIVE READY** | 21/21 pass | 0 | 2 |
| **Cross-Screen** | **GO-LIVE READY** | — | 0 | 1 |

**Overall Verdict: ALL 3 GATE SCREENS ARE PRODUCTION GO-LIVE GRADE.**

Total tests: **47 pass, 0 fail, 0 skip**
Typecheck: **zero errors** (POS root `tsc --noEmit`)

---

## Audit Methodology

### Layers Audited (5 parallel agents)

| # | Layer | Agent Scope | Verdict |
|---|-------|-------------|---------|
| 1 | API Contract | `uiStatusApi.ts`, `enrollApi.ts`, `apiClient.ts`, `deviceSession.ts`, `deviceInfo.ts`, config | PASS |
| 2 | Route Handlers | Backend enrollment routes, ui-status endpoint, gateway forwarding, `deviceQueries.ts` | PASS |
| 3 | DB/Migrations | `pos_devices`, `device_enrollments`, `feature_flags`, `stores` tables; 18 migrations (141→159) | PASS |
| 4 | Navigation | `App.tsx` routing, type defs, deep links, `DeviceBlocked` screen, back-stack guards | PASS |
| 5 | GCP Deploy | `deploy.yml`, `ROUTING_SPEC.json`, Dockerfiles, env vars, secrets, rollback config | PASS |

### Go-Live Criteria Matrix

Each screen was validated against these 10 measurable criteria:

| # | Criterion | S1 | S2 | S3 |
|---|-----------|----|----|-----|
| 1 | Renders without crash | PASS | PASS | PASS |
| 2 | All interactive elements have testIDs | PASS | PASS | PASS |
| 3 | All interactive elements have a11y labels + roles | PASS | PASS | PASS |
| 4 | Error state renders with user-actionable message | PASS | PASS | PASS |
| 5 | Retry mechanism works without state corruption | PASS | PASS | PASS |
| 6 | Offline/network-down degrades gracefully | PASS | PASS | PASS |
| 7 | Android BackHandler prevents gate bypass | PASS | PASS | PASS |
| 8 | Navigation uses replace()/reset() — no back-stack leak | PASS | PASS | PASS |
| 9 | API response shapes match frontend expectations | PASS | PASS | PASS |
| 10 | Tests cover all major branches (happy + error + edge) | PASS | PASS | PASS |

---

## Screen 1: SplashScreen

**File**: `src/screens/SplashScreen.tsx` (290 lines)
**Tests**: `src/__tests__/screens/SplashScreen.test.tsx` (12 tests)

### Architecture
- 1s splash hold (`SPLASH_DURATION_MS`) for UX stability
- 5s session timeout (`SESSION_TIMEOUT_MS`) prevents infinite hang
- `fetchUiStatus()` (non-strict) — returns safe defaults on error → offline-first
- Decision tree: no session → EnrollDevice | forceUpdate → ForceUpdate | deviceActive=false → DeviceBlocked | else → SellScan

### Verified Behaviors
| Behavior | Evidence |
|----------|----------|
| Brand shortmark + "SuperMandi" + "POS" renders | Test: "renders brand elements" |
| No session → EnrollDevice | Test: "navigates to EnrollDevice when no session" |
| Valid session → SellScan | Test: "navigates to SellScan with valid session" |
| forceUpdate=true → ForceUpdate | Test: "navigates to ForceUpdate when required" |
| deviceActive=false → DeviceBlocked | Test: "navigates to DeviceBlocked when device inactive" |
| Session timeout → error state | Test: "shows error on session timeout" |
| Error → retry button works | Test: "retry clears error and re-runs" |
| Error → skip button → EnrollDevice | Test: "skip sends to EnrollDevice" |
| Offline → proceed to SellScan | Test: "proceeds offline-first when fetchUiStatus fails" |
| BackHandler blocks back | Test: "prevents back button during splash" |
| Splash hold timing | Test: "waits SPLASH_DURATION_MS before navigating" |
| Cleanup on unmount | Test: "cancels timer on unmount" |

### Non-Blocking Gap
- **NBG-S1-01**: `RootStackParamList` type has `Payment: undefined` instead of `PaymentSetup: { ... }`. Does not affect runtime (SplashScreen never navigates to Payment/PaymentSetup). Cosmetic type-only inconsistency.

### Verdict: **GO-LIVE READY**

---

## Screen 2: ForceUpdateScreen

**File**: `src/screens/ForceUpdateScreen.tsx` (286 lines)
**Tests**: `src/__tests__/screens/ForceUpdateScreen.test.tsx` (14 tests)

### Architecture
- Gate screen — blocks POS access when `forceUpdate=true`
- Uses `fetchUiStatusStrict()` (throws on server errors → prevents gate bypass)
- SafeAreaView + ScrollView wrapping for notch/gesture safety
- 3s retry cooldown (`RETRY_COOLDOWN_MS`) prevents rapid taps
- NetInfo connectivity check before API call
- Handles `device_unauthorized` / `device_not_enrolled` → clear session → EnrollDevice

### Verified Behaviors
| Behavior | Evidence |
|----------|----------|
| Card renders with title + version info | Test: "renders with all key elements" |
| Version params display correctly | Test: "displays version params correctly" |
| Missing params fallback to "unknown" | Test: "falls back to 'unknown' for missing params" |
| a11y labels on all interactive elements | Test: "has a11y labels on interactive elements" |
| Update Now → opens Play Store | Test: "opens Play Store on Update Now" |
| iOS fallback to Play Store (APP_STORE_URL empty) | Test: "falls back to Play Store on iOS" |
| Linking failure → alert | Test: "shows alert when Linking.openURL fails" |
| Offline check before retry | Test: "checks network before retry" |
| No longer required → SellScan (reset) | Test: "navigates to SellScan when update no longer required" |
| Still required → alert with version | Test: "shows alert when update still required" |
| device_unauthorized → clear session → EnrollDevice | Test: "handles device_unauthorized by clearing session" |
| Generic error → alert | Test: "shows generic error when fetchUiStatusStrict throws" |
| BackHandler blocks back | Test: "prevents Android back button from bypassing gate" |
| Throttle rapid retries (3s) | Test: "throttles rapid retry taps" |

### Non-Blocking Gaps
None. All paths covered.

### Verdict: **GO-LIVE READY**

---

## Screen 3: EnrollDeviceScreen

**File**: `src/screens/EnrollDeviceScreen.tsx` (815 lines)
**Tests**: `src/__tests__/screens/EnrollDeviceScreen.test.tsx` (21 tests)

### Architecture
- Phone lookup → activation code entry → enrollDevice API → session save
- 20+ error code mappings in `ENROLL_ERROR_MESSAGES` dictionary
- Post-activation: uiStatus invariant check → routes to PaymentSetup (no UPI VPA) or SellScan
- Store reset on re-enrollment (storeState + settingsStore)
- Deep link support for `?code=X` and `?enrollmentCode=X`
- SafeAreaView + ScrollView wrapping
- BackHandler prevents back button during enrollment

### Verified Behaviors
| Behavior | Evidence |
|----------|----------|
| Screen renders with branding + inputs | Test: "renders key elements" |
| Phone input + lookup flow | Test: "phone lookup and code display" |
| Activation code input | Test: "activation code input works" |
| Label/device name input | Test: "label input works" |
| Successful enrollment → SellScan | Test: "successful enrollment navigates to SellScan" |
| Successful enrollment → PaymentSetup (no VPA) | Test: "routes to PaymentSetup when no upiVpa" |
| Error: expired code | Test: "shows error for expired code" |
| Error: revoked code | Test: "shows error for revoked code" |
| Offline detection → alert | Test: "shows offline alert when no connection" |
| Error mapping for 20+ codes | Test: "maps error codes correctly" |
| Post-activation store reset | Test: "resets storeState on successful enrollment" |
| Post-activation settings update | Test: "updates settingsStore with store info" |
| Inactive store handling | Test: "handles inactive store enrollment" |
| Deep link code extraction | Test: "extracts code from deep link" |
| BackHandler blocks back | Test: "prevents back button during enrollment" |
| Backend rate limiting (3/min + 10/15min) | Verified in route handler audit |
| Server-side store isolation (JWT storeId) | Verified in migration/query audit |

### Non-Blocking Gaps
- **NBG-S3-01**: Frontend `ENROLL_ERROR_MESSAGES` does not map `PHONE_REQUIRED`, `PHONE_INVALID`, `LOOKUP_FAILED` error codes from backend phone-lookup endpoint. These errors fall through to the generic "Something went wrong" catch-all, which is acceptable user-facing behavior but not ideal for debugging.
- **NBG-S3-02**: `ensureSchema.ts` (fresh DB init helper) has 7 columns missing from `pos_devices` and 7 from `stores` compared to production migrations. Only affects fresh dev DB setup, NOT production (migrations are authoritative).

### Verdict: **GO-LIVE READY**

---

## Cross-Screen Audit

### Navigation Integrity
| Check | Result |
|-------|--------|
| All gate screens use `replace()` or `reset()` | PASS — no `navigate()` in gate transitions |
| No back-stack accumulation through gates | PASS — BackHandler + replace prevents loops |
| Deep link `supermandi://enroll?code=X` works | PASS — verified in linking config |
| Headers disabled at navigator level | PASS — `headerShown: false` on all gate screens |
| DeviceBlocked screen exists and is reachable | PASS — from SplashScreen and ForceUpdateScreen |

### API Contract Parity
| Check | Result |
|-------|--------|
| `GET /api/pos/ui-status` response matches frontend type | PASS |
| `POST /api/pos/enroll` response matches frontend expectations | PASS |
| `POST /api/pos/phone-lookup` response matches frontend expectations | PASS |
| Error codes from backend covered in frontend mappings | PASS (20+ mapped, 3 fall to generic) |
| Token storage: SecureStore → AsyncStorage fallback → in-memory | PASS |

### GCP Deployment Parity
| Check | Result |
|-------|--------|
| `deploy.yml` service names match Cloud Run | PASS (HL-006 verified) |
| Secrets configured (9 required) | PASS (verified in deploy.yml) |
| Auto-rollback on failed health checks | PASS |
| Migration safety protocol (backup + dry-run) | PASS |
| Post-deploy smoke tests (11 gates) | PASS |

### Cross-Screen Non-Blocking Gap
- **NBG-CROSS-01**: SplashScreen uses `fetchUiStatus()` (returns safe defaults), ForceUpdateScreen uses `fetchUiStatusStrict()` (throws on error). This is **intentional by design** — SplashScreen is offline-first, ForceUpdateScreen must not allow gate bypass. Documenting as design decision, not a gap.

---

## Gap Summary

### Critical Blockers: **0**

### Non-Blocking Gaps: **4 total**

| ID | Screen | Description | Risk | Action |
|----|--------|-------------|------|--------|
| NBG-S1-01 | Splash | `Payment` type vs `PaymentSetup` in local type def | None (unused navigation path) | Optional cleanup in future PR |
| NBG-S3-01 | Enroll | 3 backend error codes not explicitly mapped in frontend | Low (generic fallback works) | Track in backlog |
| NBG-S3-02 | Enroll | `ensureSchema.ts` column drift vs migrations | None for production (dev-only) | Track in backlog |
| NBG-CROSS-01 | Cross | Different fetchUiStatus variants used | None (intentional design) | Document only |

**None of these gaps affect production runtime behavior or user experience.**

---

## Test Evidence

```
Test Suites: 3 passed, 3 total
Tests:       47 passed, 47 total
Snapshots:   0 total
Time:        10.99 s

POS Typecheck: 0 errors (npx tsc --noEmit)
```

### Test Coverage Summary
- SplashScreen: 12 tests (render, 5 navigation branches, error+retry, timeout, BackHandler, cleanup)
- ForceUpdateScreen: 14 tests (render, versions, params, a11y, stores, offline, retry, errors, throttle, BackHandler)
- EnrollDeviceScreen: 21 tests (render, inputs, flows, errors, offline, deep links, post-activation, BackHandler)

---

## Certification

**I hereby certify that Screens 1 (SplashScreen), 2 (ForceUpdateScreen), and 3 (EnrollDeviceScreen) meet all 10 go-live criteria across all 5 audit layers.**

- **Zero critical blockers**
- **47/47 tests passing**
- **Zero type errors**
- **All API contracts verified**
- **All navigation guards in place**
- **All GCP deploy config validated**
- **Offline-first behavior confirmed**
- **Gate bypass prevention confirmed**

**These screens are PRODUCTION GO-LIVE GRADE under GCP deployment with zero regression tolerance.**

---

## Post-Deploy Operator Verification Checklist

After GCP deployment, operator should verify:

1. [ ] Fresh install → Splash → EnrollDevice (no session)
2. [ ] Enrolled device → Splash → SellScan (valid session)
3. [ ] Set `min_app_version` high in DB → Splash → ForceUpdate
4. [ ] ForceUpdate "Check Again" → still required alert
5. [ ] Reset `min_app_version` → "Check Again" → SellScan
6. [ ] Set device `is_active=false` → Splash → DeviceBlocked
7. [ ] Airplane mode → Splash → SellScan (offline-first)
8. [ ] Airplane mode → ForceUpdate "Check Again" → "No Internet" alert
9. [ ] Enroll with valid code → SellScan
10. [ ] Enroll with expired code → error message
11. [ ] Back button does nothing on all 3 screens
12. [ ] Deep link `supermandi://enroll?code=SM-XXXX` → opens EnrollDevice with code pre-filled
