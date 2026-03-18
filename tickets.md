# V3 Splash/Auth/Store-Connection Tickets

Date: 2026-03-17
Audience: Claude
Prototype source: `RELEASES/supermandi-pos-v3.html`
Scope: The v3 splash screen shown in the prototype (`splash`) and the full path behind it: boot UI, navigation, session wiring, OTP auth, ui-status, device/store backend, DB schema, migrations, Cloud Run/gateway parity, business edge cases, and regression coverage.

## High-confidence findings

Use these code paths as source of truth. Existing release audits overstate completeness for this flow.

1. Prototype vs app entrypoint drift
   - Prototype splash is the white gradient boot screen with `Connecting to store...` and a bottom `Continue` CTA.
   - `App.tsx:136,144` still boots the app with legacy `SplashScreen`, not `SplashScreenV3`.
   - `src/screens/v3/SplashScreenV3.tsx` exists but is currently unused.

2. Legacy fallback still leaks into v3 boot
   - `src/screens/SplashScreen.tsx:121` routes no-session users to `V3Phone`.
   - `src/screens/SplashScreen.tsx:231-237` still sends the timeout/error recovery path to `EnrollDevice` via `Continue Offline`.
   - Result: default v3 auth is phone+OTP, but recovery still drops users into old code-based activation.

3. Splash prototype parity is incomplete even in `SplashScreenV3`
   - `src/screens/v3/SplashScreenV3.tsx` has no bottom `Continue` CTA, no explicit retry/error UI, and adds a `v3.0` watermark not present in the prototype.
   - Status copy is dynamic (`Loading...`, `Welcome!`, `Ready!`) instead of the locked prototype copy (`Connecting to store...`).

4. OTP backend is not aligned with the canonical schema
   - `backend/src/routes/v1/pos/otpAuth.ts:24-25,106-107` still queries `stores` + `users` and joins on `s.owner_id`.
   - The runtime fallback `stores` table created in `backend/src/db/ensureSchema.ts` does not expose `owner_id`, `store_name`, `store_code`, or `status` in the shape this route expects.
   - Current `public.stores` view (`backend/migrations/184_sa_p1_006_allowed_payment_methods.sql:20-49`) also does not expose `owner_id`.
   - There is no corresponding migration in this repo that creates a compatible `public.users` table/view for this route.

5. OTP device creation is incompatible with current device schema direction
   - `backend/src/routes/v1/pos/otpAuth.ts:133-135` inserts `pos_devices.id` as `otp-${phone}-${Date.now()}`.
   - `backend/migrations/163_wave3b_type_normalization.sql:345` converts `pos_devices.id` to UUID.
   - Result: OTP auth and migrated DB assumptions are in conflict.

6. Client token contract is inconsistent
   - OTP backend returns a random hex device token, not a JWT.
   - `src/services/deviceSession.ts:243` still tries to decode device tokens as JWT via `atob(parts[1])`.
   - `src/services/api/apiClient.ts:392-395` only clears session when the error string equals `device_unauthorized`, while backend middleware emits `DEVICE_UNAUTHORIZED`.

7. ui-status can still let invalid sessions drift into POS
   - `backend/src/middleware/deviceToken.ts` tracks `tokenExpired` and `tokenRevoked`.
   - `requireDeviceTokenAllowInactive` does not enforce those states before returning status context.
   - `src/services/api/uiStatusApi.ts:154-182` converts any non-OK `ui-status` response into safe defaults instead of distinguishing auth failure from offline failure.

8. Store metadata hydration is incomplete for OTP login
   - `src/screens/v3/OTPScreenV3.tsx` and `src/screens/v3/StoreSelectScreenV3.tsx` save only `deviceId`, `storeId`, and `deviceToken`.
   - They do not persist `storeName` or `storeCode` into `settingsStore`, so first-render v3 surfaces can show fallback branding until another sync path runs.
   - `src/services/sseClient.ts` exports `startSSEClient()` / `stopSSEClient()` but there are no call sites.

9. Test coverage is missing where the risk is highest
   - No local tests were found for `backend/src/routes/v1/pos/otpAuth.ts`.
   - No local tests were found for `PhoneScreenV3`, `OTPScreenV3`, `StoreSelectScreenV3`, or `SplashScreenV3`.

## Old flow vs v3 target

| Area | Old / current code | v3 target |
|---|---|---|
| App boot | Legacy `SplashScreen` mounted in navigator | Single v3 splash gate |
| Recovery path | Can still redirect to `EnrollDevice` | Must stay inside v3 phone+OTP flow unless user explicitly uses activation flow |
| Auth model | Mixed: OTP on happy path, code-based enrollment on fallback path | One primary path: phone -> OTP -> optional store select -> POS |
| Device creation | Legacy `EnrollDevice` applies richer invariants than OTP auth | OTP auth must meet the same device/store invariants or call shared helper |
| Token semantics | Random opaque token in backend, partial JWT assumptions in client | One opaque-token contract end to end |
| Store hydration | Enroll flow sets `storeName` / `storeCode`, OTP flow does not | Both auth paths hydrate identical local state |
| Boot auth check | `ui-status` non-OK becomes default success | Offline/network failures may fallback, auth failures may not |

## Ticket order

Implement in this order:

1. `V3-BOOT-001`
2. `V3-NAV-002`
3. `V3-CLIENT-003`
4. `V3-BE-004`
5. `V3-API-005`
6. `V3-DB-006`
7. `V3-GCP-007`
8. `V3-BIZ-008`
9. `V3-REG-009`

---

## V3-BOOT-001 - Unify splash entrypoint and restore prototype UI parity

Priority: P0
Layers: UI/UX, wiring, navigation

Problem:
- The prototype splash is the requested screen, but the app still boots into legacy `SplashScreen`.
- `SplashScreenV3` is closer visually but is not wired into the navigator and still misses prototype elements.

Scope:
- Replace the mounted splash entrypoint with a single canonical v3 splash implementation.
- Match the prototype for:
  - white to pale-blue gradient background
  - SuperMandi mark
  - `Point of Sale`
  - spinner
  - `Connecting to store...`
  - bottom `Continue` CTA
- Remove the `v3.0` watermark from the splash screen.

Files:
- `App.tsx`
- `src/screens/SplashScreen.tsx`
- `src/screens/v3/SplashScreenV3.tsx`
- Optional: extract shared branded splash component if that reduces duplication

Acceptance:
- Cold start lands on a splash screen that visually matches `RELEASES/supermandi-pos-v3.html`.
- There is only one production splash implementation in active use.
- Screen has testIDs/accessibility labels for logo, loading text, spinner, and CTA.

---

## V3-NAV-002 - Remove legacy activation leakage from the v3 boot funnel

Priority: P0
Layers: navigation, recovery UX, regression

Problem:
- Timeout/error recovery from splash still routes to `EnrollDevice`, which is the old activation flow.
- That creates a mixed-model experience and reintroduces old code paths after the user has already entered the v3 funnel.

Scope:
- Make the v3 boot graph explicit:
  - valid session -> `SellScan`
  - no session -> `V3Phone`
  - blocked -> `DeviceBlocked`
  - force update -> `ForceUpdate`
  - timeout/network failure -> retry and/or continue within the v3 auth flow
- Keep `EnrollDevice` reachable only for explicit code-based activation use cases such as deep links or an intentional alternate flow.
- Ensure `Continue` CTA uses current session state instead of hardcoded navigation.

Files:
- `src/screens/SplashScreen.tsx`
- `src/screens/v3/SplashScreenV3.tsx`
- `App.tsx`
- `src/screens/EnrollDeviceScreen.tsx`

Acceptance:
- No default splash recovery path routes to `EnrollDevice`.
- Back/replace behavior is deterministic and documented.
- Timeout does not flash old screens before returning to the v3 auth path.

---

## V3-CLIENT-003 - Normalize client auth/token/store-state handling

Priority: P0
Layers: client wiring, auth contract, UX correctness

Problem:
- Client assumes device tokens may be JWTs even though OTP auth returns opaque random tokens.
- Unauthorized handling depends on the wrong error string.
- OTP login does not hydrate store name/code, and no runtime sync client is started after login.

Scope:
- Remove JWT decoding assumptions from device-token validity checks or move them behind a true JWT-only guard.
- Normalize unauthorized handling in `apiClient` using backend error codes:
  - `DEVICE_UNAUTHORIZED`
  - `TOKEN_EXPIRED`
  - `TOKEN_REVOKED`
- Update auth screens to read `ApiError.payload` correctly and show backend message text instead of generic `Request failed (...)`.
- Persist `storeName` and `storeCode` after OTP login and store selection.
- Start/stop `startSSEClient()` (or an equivalent status sync bootstrap) from the POS root and logout path.

Files:
- `src/services/deviceSession.ts`
- `src/services/api/apiClient.ts`
- `src/screens/v3/PhoneScreenV3.tsx`
- `src/screens/v3/OTPScreenV3.tsx`
- `src/screens/v3/StoreSelectScreenV3.tsx`
- `src/screens/v3/PosRootLayoutV3.tsx`
- `src/stores/settingsStore.ts`

Acceptance:
- Invalid/revoked tokens clear session and do not trap the user inside a broken POS state.
- OTP auth surfaces friendly backend messages.
- First render after OTP login shows the actual store name/code.
- Runtime settings/store updates begin once the POS root mounts.

---

## V3-BE-004 - Rewrite POS OTP backend against canonical store/user/device models

Priority: P0
Layers: backend, backend API, auth, data model

Problem:
- `otpAuth.ts` still uses legacy `stores`/`users` joins that do not match the current canonical schema.
- The route also expects columns such as `owner_id`, `store_name`, `store_code`, and `status` that do not match the runtime `stores` fallback table shape.
- Device creation in OTP auth bypasses richer enrollment/device lifecycle rules and uses non-UUID IDs.

Scope:
- Rewrite `send-otp` and `verify-otp` against canonical data:
  - `platform.stores`
  - `auth.users`
  - `auth.store_users` and/or retailer-phone ownership mapping
- Do not depend on `public.stores.owner_id` or `public.users`.
- Generate canonical device rows:
  - UUID device IDs
  - token expiry fields populated consistently
  - label/device metadata/fingerprint handled consistently
  - re-enrollment and duplicate-device semantics defined
- Reject invalid `storeId` instead of silently falling back to the first store.
- Add backend rate limiting and cryptographically strong OTP generation.
- Stop any plaintext OTP logging outside explicitly gated dev/test modes.

Files:
- `backend/src/routes/v1/pos/otpAuth.ts`
- Shared device/token helpers if needed
- Any shared auth/store lookup utilities introduced during the rewrite

Acceptance:
- OTP auth works against the canonical schema without relying on compatibility views that omit required columns.
- Device insert/update works on DBs where `pos_devices.id` is UUID.
- Multi-store verification only succeeds for a store the user actually owns.
- Error responses include stable `code` + user-safe `message`.

---

## V3-API-005 - Harden ui-status and boot gating for expired/revoked/unauthorized sessions

Priority: P0
Layers: frontend API, backend API, security, regression

Problem:
- `ui-status` currently behaves like a soft fallback even for auth failures.
- `requireDeviceTokenAllowInactive` does not block expired/revoked tokens before returning status context.
- Splash can therefore send a dead session into POS.

Scope:
- Decide and implement one rule:
  - offline/network failures may fallback to cached POS mode
  - auth failures may not
- Enforce token-expired and token-revoked handling in the read-only status path.
- Teach `fetchUiStatus` to distinguish:
  - network timeout / transport error
  - 401 unauthorized / revoked / expired
  - 403 inactive device / inactive store
- Route auth failures to session clear + `V3Phone` or a dedicated recovery state.

Files:
- `backend/src/middleware/deviceToken.ts`
- `backend/src/routes/v1/pos/uiStatus.ts`
- `src/services/api/uiStatusApi.ts`
- `src/screens/SplashScreen.tsx`
- `src/screens/v3/SplashScreenV3.tsx`

Acceptance:
- A revoked or expired token never reaches `SellScan`.
- Offline users with a still-valid cached session can still continue offline.
- Boot behavior differs correctly between network failure and auth failure.

---

## V3-DB-006 - Close DB and migration gaps for OTP auth and device creation

Priority: P0
Layers: DB, migrations, schema parity

Problem:
- The OTP flow depends on `pos_otp` and on device-row writes that are currently out of sync with the evolved `pos_devices` schema.
- Repo audit docs already note migration 191 as pending in some environments.

Scope:
- Verify `backend/migrations/191_pos_otp_table.sql` is part of the required rollout for this flow.
- If canonical OTP auth needs extra columns or cleanup semantics, add a forward migration instead of ad hoc runtime SQL.
- Ensure migrate-from-zero covers the final OTP/device schema path.
- Add schema-level verification for:
  - `pos_otp`
  - `pos_devices.id` UUID compatibility
  - any indexes used by OTP lookup / store selection

Files:
- `backend/migrations/191_pos_otp_table.sql`
- Any new migration required by the backend rewrite
- Migration verification scripts if needed

Acceptance:
- Empty DB -> all migrations -> OTP auth path works.
- No backend code depends on table/view columns that migrations do not create.
- Cloud SQL dry-run for this flow is clean before rollout.

---

## V3-GCP-007 - Add Cloud Run and gateway parity gates for splash/auth rollout

Priority: P1
Layers: GCP parity, deployment, operations

Problem:
- The gateway currently proxies `/api/v1/pos/*` to the main backend, but this flow has no explicit parity gate proving the required routes, migrations, and secrets are present in Cloud Run.
- Existing docs mention pending migrations but there is no implementation ticket tying boot/auth rollout to deploy readiness.

Scope:
- Add staging/prod smoke checks for:
  - `POST /api/v1/pos/auth/send-otp`
  - `POST /api/v1/pos/auth/verify-otp`
  - `GET /api/v1/pos/ui-status`
  - `POST /api/v1/pos/token/refresh`
- Fail deploy/readiness if migration 191 or any follow-up migration is pending.
- Validate required secrets/config for OTP delivery and any auth dependencies used by this path.
- Document that this flow still depends on the monolith-backed POS router unless/until microservice parity is implemented.

Files:
- `backend/services/api-gateway/src/config.ts`
- `backend/src/startup/validateGcp.ts`
- `backend/scripts/migrate.js`
- Deploy/smoke scripts used in staging and Cloud Run

Acceptance:
- There is a repeatable smoke test proving the boot/auth flow through the gateway in GCP.
- Missing migration or missing secret blocks rollout early instead of failing at runtime.

---

## V3-BIZ-008 - Lock business rules and edge cases for phone+OTP store connection

Priority: P1
Layers: business logic, UX copy, backend validation

Problem:
- The happy path exists in fragments, but business rules are not consistently enforced across splash, OTP auth, store selection, and device creation.

Required edge cases to implement and verify:
- Phone exists but no ACTIVE store
- Phone owns multiple stores and provided `storeId` is invalid
- Store becomes inactive between `send-otp` and `verify-otp`
- OTP expires while user is on store-select screen
- OTP resend after repeated attempts / lockout
- Existing device token is revoked while app is offline
- Same handset re-authenticates to same store
- Same handset re-authenticates to a different store
- Store has reached `max_devices`
- Store metadata not yet hydrated when POS first renders

Files:
- `src/screens/v3/PhoneScreenV3.tsx`
- `src/screens/v3/OTPScreenV3.tsx`
- `src/screens/v3/StoreSelectScreenV3.tsx`
- `backend/src/routes/v1/pos/otpAuth.ts`
- Any shared device/store rule helpers

Acceptance:
- Each edge case has an explicit backend behavior, client message, and navigation result.
- No silent fallback selects the wrong store or creates the wrong device record.

---

## V3-REG-009 - Add regression coverage for the full splash/auth/store-binding funnel

Priority: P1
Layers: regression, tests, CI confidence

Problem:
- This flow currently has almost no targeted automated coverage despite touching initial app boot, auth, device lifecycle, and store binding.

Scope:
- Add frontend tests for:
  - mounted splash route
  - splash timeout/recovery behavior
  - phone screen success/failure messaging
  - OTP verify success/failure/timeout
  - multi-store selector path
  - invalid token boot handling
- Add backend tests for:
  - send-otp against canonical schema
  - verify-otp multi-store success and invalid-store rejection
  - UUID-safe device creation
  - revoked/expired token handling in `ui-status`
- Add one end-to-end smoke flow for:
  - no session -> phone -> OTP -> store select -> POS

Files:
- `src/__tests__/screens/*`
- `src/__tests__/services/api/*`
- `backend/tests/*`
- `e2e-tests/tests/*`

Acceptance:
- CI fails if boot/auth/store-binding regresses.
- Test suite covers both the happy path and the known edge-case matrix from `V3-BIZ-008`.

---

## Done means

This screen is only "done" when all of the following are simultaneously true:

- The prototype splash is the real mounted splash.
- The app no longer falls back into old activation from normal v3 boot recovery.
- OTP auth uses the canonical schema and device model.
- Invalid/revoked/expired sessions do not slip through splash into POS.
- Store metadata is hydrated immediately after OTP auth.
- Required DB migrations are applied and verified in GCP.
- Regression tests exist for the funnel end to end.

---

# V3 Staff-Login / Switch-Store Tickets

Date: 2026-03-17
Audience: Claude
Prototype source: `RELEASES/supermandi-pos-v3.html`
Scope: The prototype-derived `login` screen shown after the splash/store-binding flow. The HTML prototype shows `Staff Phone + PIN`, but the approved product direction for implementation is now `PIN only` on a store-bound device.

These tickets are additive. They sit on top of `V3-BOOT-001` through `V3-REG-009` because the prototype login screen only makes sense after the device is already bound to a store.

## High-confidence findings

1. Prototype intent is a store-bound staff-auth screen, not the retailer phone-OTP onboarding screen
   - `RELEASES/supermandi-pos-v3.html` shows:
     - `SuperMandi POS`
     - `SU260305-003 · SuperMandi Store`
     - `Staff Phone`
     - `PIN`
     - `Login →`
     - `Switch Store ↗`
   - `RELEASES/pos-prototype.html` explicitly models:
     - `Splash -> Phone -> OTP -> Store Select -> Staff Login -> Sell Screen`
   - Current `RELEASES/V3_SCREEN_REGISTRY.md` claims the prototype `login` screen has been reconciled into `PhoneScreenV3 + OTPScreenV3`, but that is not what the prototype HTML actually shows.
   - Approved implementation override: keep the store-bound staff-login stage, but remove the staff phone field and use `PIN only`.

2. Current v3 navigation bypasses staff login completely
   - `App.tsx` mounts `V3Phone`, `V3OTP`, and `V3StoreSelect`, but no mounted staff-login route.
   - `src/screens/v3/OTPScreenV3.tsx` resets directly to `SellScan` on single-store success.
   - `src/screens/v3/StoreSelectScreenV3.tsx` also resets directly to `SellScan` after store selection.

3. Old-screen references still exist, but the actual screen file is gone
   - No local `src/screens/StaffLoginScreen.tsx` file exists in this checkout.
   - Multiple release docs still claim `StaffLoginScreen.tsx` exists and is production-ready.
   - `src/__tests__/screens/StaffLoginScreen.stg-327.unit.test.ts` is only a countdown helper test, not a real screen test.

4. Current switch flows are broken and drift from the prototype
   - Prototype action is `Switch Store`.
   - `src/screens/v3/SettingsScreenV3.tsx` exposes `Switch Staff` and `Logout`, not `Switch Store`.
   - `src/screens/v3/V3ScreenWrappers.tsx` wires `onSwitchStaff` to `PhoneLogin`, which is not a mounted route in `App.tsx`.
   - Existing i18n/logout copy still assumes re-enrollment in places, which conflicts with the v3 phone+OTP/store-select model.

5. Staff auth backend and DB already exist, but they are detached from v3 UI
   - `src/services/api/staffApi.ts` already exposes:
     - `POST /api/v1/pos/staff/login`
     - `GET /api/v1/pos/staff/me`
     - `POST /api/v1/pos/staff/verify-pin`
   - `backend/src/routes/v1/pos/staff.ts` implements those routes.
   - `platform.store_staff` already exists via:
     - `backend/migrations/120_sa_p1_001_store_staff.sql`
     - `backend/src/db/ensureSchema.ts`
   - `backend/src/middleware/posStaff.ts` already enforces `x-staff-id` for staff-protected routes.

6. Staff session/state hydration is incomplete
   - `src/stores/staffSessionStore.ts` exists, but no active v3 login screen populates it.
   - `src/services/api/apiClient.ts` only sends `x-staff-id` if `staffSessionStore.session` exists.
   - `src/screens/v3/SettingsScreenV3.tsx` hardcodes `Raju (Manager)` instead of rendering the actual staff session.

7. Staff auth security is below production grade
   - `backend/src/routes/v1/pos/staff.ts` still authenticates by `phone + PIN`, which no longer matches the approved `PIN only` product direction.
   - `POST /api/v1/pos/staff/login` has no rate limit, no lockout, and no auth-audit logging.
   - `POST /api/v1/pos/staff/verify-pin` has only an in-memory per-process limiter, so Cloud Run instance hops can bypass it.
   - `backend/src/services/authAuditService.ts` exists but is not used by POS staff login.
   - `PIN only` login requires a unique-per-store PIN lookup design; the current schema only guarantees uniqueness by phone.

8. Business flow is ambiguous between store binding and staff identity
   - OTP auth binds the device to a store.
   - Staff login should bind the human operator to that store-bound device.
   - Current flow skips the second step and therefore allows the POS shell to mount without a real staff session.
   - Some backend routes require `requirePosStaff`; others only record `x-staff-id` opportunistically, which creates inconsistent behavior.

9. Regression coverage is shallow where it matters
   - No focused frontend tests were found for a real mounted v3 staff-login screen, because the screen is missing.
   - No backend route tests were found for `POST /api/v1/pos/staff/login`.
   - Existing backend tests for `staff/me` and `verify-pin` are mostly schema/contract tests, not route/integration tests.

## Old flow vs v3 target

| Area | Old / current code | v3 target |
|---|---|---|
| Store connection | Phone -> OTP -> optional store select | Same |
| Staff auth | Legacy/stale `StaffLoginScreen` references only; current v3 skips it | Explicit `StaffLoginScreenV3` after device-store binding |
| Route after OTP | Direct `SellScan` reset | `V3StaffLogin` unless a valid staff session already exists for the same store |
| Switch action | Settings shows `Switch Staff`; prototype shows `Switch Store` | Bound-store login shows `Switch Store`, POS settings can still offer `Switch Staff` separately |
| Staff state | `staffSessionStore` exists but is not mounted into boot/auth flow | Staff session populated on login and enforced where required |
| Store/staff display | Hardcoded fallback values (`SuperMandi Store`, `Raju (Manager)`) | Real `storeCode`, `storeName`, `staff name`, `role` |
| Security | No durable rate limit/lockout on staff login; login keyed by phone | Unique-per-store PIN lookup, stable error codes, durable throttling/audit |
| Recovery | Some paths still imply re-enrollment/logout | Staff-session expiry should return to staff login; store switch should return to v3 store-binding flow |

## Ticket order

Implement in this order after `V3-REG-009`:

1. `V3-LOGIN-010`
2. `V3-NAV-011`
3. `V3-CLIENT-012`
4. `V3-BE-013`
5. `V3-DB-014`
6. `V3-GCP-015`
7. `V3-BIZ-016`
8. `V3-REG-017`

---

## V3-LOGIN-010 - Build the real v3 staff-login screen from the approved prototype override

Priority: P0
Layers: UI/UX, frontend wiring

Problem:
- The prototype login screen is a store-bound staff PIN gate.
- The current app has no mounted screen that matches that UI or purpose.

Scope:
- Create `StaffLoginScreenV3` and mount it in the app.
- Match the prototype card style, but apply the product-approved interaction override:
  - blue mark + `SuperMandi POS`
  - bound store code and store name in the subtitle
  - single `PIN` input
  - primary `Login →` CTA
  - `Switch Store ↗` secondary action
- Render actual store metadata from `settingsStore`, not hardcoded placeholders.
- Add loading, invalid-credentials, locked/rate-limited, no-staff-configured, empty-store-meta, and offline-disabled states.
- Add testIDs/accessibility labels for:
  - store header
  - pin input
  - login CTA
  - switch-store action

Files:
- New: `src/screens/v3/StaffLoginScreenV3.tsx`
- `App.tsx`
- Optional shared branded auth card component if it reduces duplication cleanly

Acceptance:
- The mounted screen visually matches the prototype login card with the approved PIN-only override.
- Store code/name come from live state.
- No hardcoded `Raju (Manager)` or fake store name remains in the login surface.

---

## V3-NAV-011 - Insert staff login into the v3 route graph and repair switch flows

Priority: P0
Layers: navigation, session gating, recovery

Problem:
- OTP/store-select currently jump straight into `SellScan`.
- `Switch Staff` points to a dead `PhoneLogin` route.
- Prototype `Switch Store` behavior does not exist in the active flow.

Scope:
- Make the route graph explicit:
  - `Splash -> V3Phone -> V3OTP -> optional V3StoreSelect -> V3StaffLogin -> SellScan`
  - If device session exists but no valid staff session exists for that store, route to `V3StaffLogin`
  - If both device session and staff session are valid for the same store, route to `SellScan`
- Change OTP/store-select success to land on `V3StaffLogin`, not `SellScan`.
- Replace the dead `PhoneLogin` navigation target.
- Split the concepts clearly:
  - `Switch Staff` from settings: clear only staff session, keep device-store session, route to `V3StaffLogin`
  - `Switch Store` from login: clear staff session and device-store session, route back into v3 phone/store-binding flow
- Ensure store-switch does not route to `EnrollDevice`.

Files:
- `App.tsx`
- `src/screens/SplashScreen.tsx`
- `src/screens/v3/OTPScreenV3.tsx`
- `src/screens/v3/StoreSelectScreenV3.tsx`
- `src/screens/v3/SettingsScreenV3.tsx`
- `src/screens/v3/V3ScreenWrappers.tsx`
- New route typing where needed

Acceptance:
- There is a mounted `V3StaffLogin` route.
- OTP/store-select never bypass staff login on a fresh session.
- `Switch Staff` and `Switch Store` have distinct, working behaviors.
- No navigation path references `PhoneLogin`.

---

## V3-CLIENT-012 - Wire staff session bootstrap, hydration, and UX messages

Priority: P0
Layers: client state, API integration, UX correctness

Problem:
- Staff API and session store exist, but the login UI does not use them.
- Store/staff display currently falls back to placeholders.

Scope:
- Call `staffLogin()` from the new v3 staff-login screen using `pin` only.
- After successful login, call `staffMe()` or extend login response so the client has:
  - `staffId`
  - `name`
  - `role`
  - `maxDiscountPct`
- Persist the result into `staffSessionStore`.
- Render real staff/store values in settings and other surfaces instead of placeholders.
- On device-store change, clear stale staff session if it belongs to a different store context.
- Route staff-session expiry back to `V3StaffLogin`, not to old enrollment/re-enrollment copy where device session is still valid.
- Normalize client error handling so backend `error.code` and `error.message` show up cleanly on the screen.

Files:
- `src/services/api/staffApi.ts`
- `src/stores/staffSessionStore.ts`
- `src/services/api/apiClient.ts`
- `src/screens/v3/StaffLoginScreenV3.tsx`
- `src/screens/v3/SettingsScreenV3.tsx`
- `src/screens/v3/PosRootLayoutV3.tsx`
- `src/stores/settingsStore.ts`
- Any helper used to validate staff session against current store session

Acceptance:
- Successful login creates a real persisted staff session.
- First render of POS settings shows real staff/store metadata.
- Staff-session expiry returns to staff login without unnecessarily clearing the device-store session.

---

## V3-BE-013 - Harden the POS staff-auth backend contract

Priority: P0
Layers: backend, backend API, auth contract

Problem:
- `/api/v1/pos/staff/login` exists but is minimal and not production-hardened.
- It is still keyed by `phone + PIN`, while the required model is `PIN only`.
- Status handling and error semantics are incomplete.

Scope:
- Change staff login to accept `pin` only on a store-bound device.
- Add a server-side lookup strategy that safely supports `PIN only`, for example:
  - store `pin_hash` for password-style verification
  - store a deterministic `pin_lookup_hash` for indexed lookup and uniqueness enforcement
- Enforce uniqueness of active staff PINs within a store.
- Return stable structured errors with `code` + user-safe `message`.
- Enforce store/device preconditions consistently before staff auth succeeds.
- Decide whether `maxDiscountPct` belongs in login response or in a mandatory `staff/me` follow-up, then standardize it.
- Add auth-audit logging for successful and failed POS staff logins using existing audit infrastructure where possible.
- Review staff-protected POS routes and make sure the staff-login contract is sufficient for routes that require `x-staff-id`.

Files:
- `backend/src/routes/v1/pos/staff.ts`
- `backend/src/middleware/posStaff.ts`
- `backend/src/services/authAuditService.ts`
- Any shared PIN lookup/hash helper introduced

Acceptance:
- `staff/login` accepts `PIN only` and resolves exactly one active staff member within the current store.
- Backend returns deterministic error codes for invalid input, invalid credentials, locked/rate-limited, inactive staff, and unenrolled device.
- Successful staff login can be audited.

---

## V3-DB-014 - Add durable staff-auth schema support and migration parity

Priority: P1
Layers: DB, migrations, schema parity

Problem:
- `platform.store_staff` is currently too thin for durable auth controls.
- Current rate limiting is process memory, which is not sufficient for multi-instance Cloud Run behavior.

Scope:
- Add a forward migration for any durable staff-auth state needed by `V3-BE-013`, for example:
  - `updated_at`
  - `last_login_at`
  - `last_failed_login_at`
  - `failed_login_count`
  - `locked_until`
  - `last_login_ip`
- Add schema support for `PIN only` login:
  - `pin_lookup_hash`
  - unique/indexed lookup per store
  - any phone-column deprecation, nullability change, or profile-only conversion needed by the final owner/staff model
- Keep `ensureSchema.ts` aligned with the migrated shape or stop relying on runtime schema drift for this table.
- Verify index/constraint coverage for:
  - store-scoped PIN uniqueness / lookup
  - active-staff lookup
  - any lockout queries
- Validate compatibility with admin staff CRUD endpoints and enrollment auto-create logic.

Files:
- `backend/migrations/120_sa_p1_001_store_staff.sql`
- New migration(s) following 120
- `backend/src/db/ensureSchema.ts`
- `backend/src/routes/v1/admin/staff.ts`
- `backend/src/routes/v1/pos/enroll.ts`

Acceptance:
- Migrate-from-zero produces the final `platform.store_staff` shape needed by staff auth.
- Durable lockout state does not depend on in-memory maps.
- Admin staff CRUD, enrollment auto-create, and POS staff login all agree on the schema.

---

## V3-GCP-015 - Add GCP/gateway parity checks for staff-auth rollout

Priority: P1
Layers: GCP parity, deployment, operations

Problem:
- Staff auth routes are mounted, but there is no explicit rollout gate proving that Cloud Run, gateway routing, and migrations are all aligned for the login screen.

Scope:
- Add staging/prod smoke checks for:
  - `POST /api/v1/pos/staff/login`
  - `GET /api/v1/pos/staff/me`
  - `POST /api/v1/pos/staff/verify-pin`
- Fail readiness/deploy if the required `store_staff` auth migration is missing.
- Confirm the gateway path for `/api/v1/pos/*` reaches the backend version that contains the staff-auth changes.
- Validate any secrets/config used by the chosen audit/rate-limit implementation.

Files:
- `backend/src/startup/validateGcp.ts`
- `backend/services/api-gateway/src/config.ts`
- deploy/smoke scripts for staging and prod
- migration validation scripts

Acceptance:
- There is a repeatable GCP smoke proving staff login end to end through the gateway.
- Missing migration or missing auth dependency blocks rollout before runtime failure.

---

## V3-BIZ-016 - Lock the business rules for staff login and store switching

Priority: P1
Layers: business logic, UX copy, validation

Problem:
- The prototype implies a clear operator model, but the codebase currently mixes device auth, store binding, staff auth, and switch-store semantics.

Required edge cases to define and implement:
- Device is bound to a store but no active staff exists
- Store has exactly one default auto-created manager from enrollment (`1234`) and owner has never changed the PIN
- Staff is inactive after device-store binding but before staff login
- Staff-session expires while device session is still valid
- Store is switched while cart, draft sale, or shift state exists
- Staff switches without changing store
- Manager PIN verification happens after a cashier session is active
- Duplicate PIN attempted for two active staff in the same store
- Weak/default PIN policy and reset behavior
- Device token belongs to Store A but stale staff session belongs to an old Store B
- Cloud Run instance restart occurs during brute-force attempts

Files:
- `src/screens/v3/StaffLoginScreenV3.tsx`
- `src/screens/v3/SettingsScreenV3.tsx`
- `src/stores/staffSessionStore.ts`
- `backend/src/routes/v1/pos/staff.ts`
- `backend/src/routes/v1/pos/enroll.ts`
- Any shift/cart cleanup helpers touched by switch flows

Acceptance:
- Each edge case has an explicit backend behavior, client message, and navigation result.
- `Switch Store` semantics are documented and implemented consistently.
- The default-manager bootstrap path does not leave the operator in a dead-end or insecure state.

---

## V3-REG-017 - Add real regression coverage for the store-bound staff-auth funnel

Priority: P1
Layers: tests, regression, CI confidence

Problem:
- Existing tests are mostly placeholders, contract schemas, or helper logic.
- There is no real regression suite for `OTP/store bind -> staff login -> POS`.

Scope:
- Add frontend screen tests for:
  - `V3StaffLogin` render with store header
  - successful login
  - invalid credentials
  - locked/rate-limited state
  - no-staff-configured state
  - `Switch Store`
  - `Switch Staff`
  - stale staff session vs changed store session
- Add backend route/integration tests for:
  - `POST /api/v1/pos/staff/login`
  - unique store-scoped PIN lookup
  - inactive staff
  - durable rate limit / lockout
  - `GET /api/v1/pos/staff/me`
  - `POST /api/v1/pos/staff/verify-pin`
- Add one e2e smoke flow for:
  - no session -> phone -> OTP -> store select -> staff login -> sell

Files:
- `src/__tests__/screens/*`
- `src/__tests__/services/api/*`
- `backend/tests/*`
- `e2e-tests/tests/*`

Acceptance:
- CI fails if the staff-login funnel regresses.
- Tests cover the actual mounted route graph, not just type/contract helpers.

---

## Done means for this screen

This login screen is only "done" when all of the following are simultaneously true:

- The prototype staff-login card exists as a real mounted v3 screen.
- OTP/store selection no longer bypasses staff login.
- `Switch Store` works from the login screen without falling back to legacy enrollment.
- `Switch Staff` works from settings without using a dead route.
- A valid staff session is created, persisted, and used for protected POS APIs.
- Staff login uses `PIN only`, unique store-scoped PIN lookup, durable throttling/lockout, and audit logging.
- Required DB migrations are applied and verified in GCP.
- Regression tests cover the end-to-end path from store bind through staff login.

---

# Requirement Override: Owner Creates Staff, Staff Logs Into POS

Date: 2026-03-17
Audience: Claude
Status: This section overrides any earlier interpretation that daily POS auth is owner phone OTP.

## Product direction locked by operator

Target interaction:

1. Store owner registers on retailer web
2. Store owner gets/owns the store context on retailer web
3. Store owner creates POS staff on retailer web
4. POS device is connected to that store
5. Staff logs into POS with `PIN only`
6. Staff operates POS

This means:

- Owner registration happens on retailer web, not on POS
- Staff records are a retailer-owner-managed resource, not a SuperAdmin-only operational dependency for the normal flow
- Daily POS auth is `staff PIN only`
- Owner phone OTP may still exist for retailer web login or first-time store/device connection, but it must not be the primary daily POS operator login

## Current gap against that requirement

Confirmed from code:

- Retailer web has authenticated store-owner routes under `/api/v1/retailer-admin/*`
- Retailer web already manages products, settings, devices, customers, etc.
- Staff CRUD exists only under SuperAdmin endpoints:
  - `backend/src/routes/v1/admin/staff.ts`
  - `supermandi-superadmin/src/api/staff.ts`
- No normal retailer-owner staff CRUD surface was found in `retailer-admin/`
- POS already has staff-login backend and DB:
  - `backend/src/routes/v1/pos/staff.ts`
  - `platform.store_staff`

So the missing architectural piece is not staff auth itself. It is owner-scoped staff management on retailer web plus aligning POS to treat staff PIN login as the default operator step after device-store binding.

## Revised interaction to implement

Canonical flow:

- Retailer web:
  - owner registers
  - owner signs in
  - owner opens a Staff page
  - owner creates staff members with:
    - name
    - PIN
    - role
    - active/inactive status
- POS:
  - if device is not yet connected to a store, run store/device connection flow
  - once the device is connected to a store, show the staff login screen
  - staff enters PIN
  - app creates/persists staff session
  - POS opens

Blocked-state rule:

- If the store has no active staff, POS must not invent a hidden staff path for normal production use.
- It should show a clear message telling the operator that the store owner must create staff in retailer web.

## Additional tickets required by this requirement

Implement after `V3-REG-017`:

1. `V3-OWNER-018`
2. `V3-API-019`
3. `V3-POS-020`
4. `V3-BIZ-021`
5. `V3-REG-022`

---

## V3-OWNER-018 - Add retailer-owner staff management in retailer web

Priority: P0
Layers: retailer web, UI/UX, navigation

Problem:
- Staff creation is currently treated as a SuperAdmin function.
- That conflicts with the required business flow where the retailer owner creates staff after registration.

Scope:
- Add a staff management surface to `retailer-admin/` for authenticated store owners.
- Required capabilities:
  - list staff for the current owner store
  - add staff
  - edit name/role/active status
  - reset staff PIN
- Required fields:
  - name
  - PIN
  - role (`CASHIER`, `STOCK_MANAGER`, `MANAGER`)
  - active/inactive
- Remove staff mobile number from the normal POS-auth model.
- If business still wants contact info later, treat it as optional profile data, not as the POS login identifier.
- Add owner-facing empty state:
  - explain that POS staff must be created here before staff can log into the POS

Likely files:
- New retailer page/component under `retailer-admin/src/pages/`
- `retailer-admin/src/lib/api.ts`
- retailer web route registration/navigation

Acceptance:
- A retailer owner can create and manage staff for their own store without SuperAdmin involvement.
- Empty-state and success/error states are production-grade.

---

## V3-API-019 - Add owner-scoped retailer-admin staff CRUD APIs

Priority: P0
Layers: backend API, authorization, store ownership

Problem:
- Existing staff CRUD is mounted under `/api/v1/admin/*`, which is the wrong ownership model for the required flow.

Scope:
- Add retailer-owner-scoped staff CRUD endpoints under `/api/v1/retailer-admin/*`.
- Reuse the `platform.store_staff` model; do not fork staff data.
- Enforce:
  - current authenticated retailer owner can only manage staff for their own store
  - no cross-store write/read access
  - stable validation and error contracts
- Endpoints needed:
  - list staff
  - create staff
  - update staff
  - reset staff PIN
- Owner-side create/update contract should no longer require staff phone for POS auth.
- Reuse shared validation/business rules with admin staff routes where practical.

Likely files:
- New `backend/src/routes/v1/retailer-admin/staff.ts`
- `backend/src/routes/v1/index.ts`
- Shared validation/helpers extracted from `backend/src/routes/v1/admin/staff.ts`

Acceptance:
- Retailer-owner staff CRUD works through authenticated retailer-admin routes.
- Store ownership is enforced by backend, not just by frontend routing.

---

## V3-POS-020 - Make staff PIN login the primary POS operator gate

Priority: P0
Layers: POS navigation, auth model, UX

Problem:
- Current v3 work still leans on phone+OTP as if it were the daily operator login.
- The required model is owner-created staff -> staff logs in.

Scope:
- Treat `PIN only` as the primary daily POS login on a store-bound device.
- Keep store/device connection separate from operator login.
- If the device is store-bound:
  - route to `V3StaffLogin`
  - do not route to owner OTP flow for normal daily use
- If there are zero active staff:
  - block login
  - show actionable message: owner must create staff in retailer web
- Keep `Switch Store` as a device/store action, not as a substitute for missing staff setup.

Likely files:
- `App.tsx`
- `src/screens/SplashScreen.tsx`
- `src/screens/v3/StaffLoginScreenV3.tsx`
- `src/screens/v3/SettingsScreenV3.tsx`
- `src/screens/v3/OTPScreenV3.tsx`
- `src/screens/v3/StoreSelectScreenV3.tsx`

Acceptance:
- Daily POS use on a configured device starts with staff login.
- Staff login is no longer modeled as an optional extra after owner OTP.
- POS does not ask staff for phone number.

---

## V3-BIZ-021 - Remove normal-flow dependence on hidden auto-created staff

Priority: P1
Layers: business logic, onboarding policy, security

Problem:
- `backend/src/routes/v1/pos/enroll.ts` currently auto-creates a default manager staff with PIN `1234` if no staff exists.
- That may be useful as a temporary fallback, but it is not the desired normal production flow.

Scope:
- Decide and implement the production rule:
  - either remove auto-created default staff entirely from the normal path
  - or keep it only as an explicitly documented transitional fallback
- If fallback is kept:
  - surface it clearly to the owner
  - force/reset it quickly
  - do not let it silently replace owner-created staff management
- Align all docs and UX copy with the actual chosen rule.

Files:
- `backend/src/routes/v1/pos/enroll.ts`
- retailer web onboarding/device activation surfaces
- `tickets.md`-driven implementation docs if touched

Acceptance:
- The normal production path is owner-created staff, not silent default staff bootstrap.
- No insecure hidden dependency remains in the main operator flow.
- If a default bootstrap staff exists temporarily, it must still comply with the final `PIN only` login contract.

---

## V3-REG-022 - Add cross-surface regression coverage for owner-created staff -> POS login

Priority: P1
Layers: regression, CI, cross-surface confidence

Problem:
- The required journey crosses retailer web, backend staff CRUD, and POS login.
- Current tests do not cover that path.

Scope:
- Add regression coverage for:
  - retailer owner creates staff on retailer web
  - staff appears in `platform.store_staff`
  - store-bound POS accepts that staff `PIN`
  - inactive staff is rejected
  - reset PIN invalidates old PIN immediately
  - duplicate active PIN in the same store is rejected
  - zero-staff state produces the expected blocked guidance
- Include at least one smoke/e2e proof across surfaces.

Files:
- `retailer-admin/src/__tests__/*`
- `backend/tests/*`
- `src/__tests__/screens/*`
- `e2e-tests/tests/*`

Acceptance:
- CI proves the intended business journey:
  - owner registers/signs in on retailer web
  - owner creates staff
  - staff logs into POS

---

# Final Requirement Lock: Owner OTP + Staff PIN + Easy Idle Re-Entry

Date: 2026-03-17
Audience: Claude
Status: This is the final authoritative auth flow unless the operator changes it again. It supersedes narrower interpretations such as `staff PIN only for everyone`.

## Required business flow

1. Retailer registers on retailer web
2. SuperAdmin approves store activation
3. Retailer owner can log into:
   - retailer web with `phone + OTP`
   - POS app with `phone + OTP`
4. After retailer owner logs into POS app, owner can create/manage staff from:
   - POS Settings
   - retailer web
5. Staff can log into POS using a PIN created by the owner
6. Owner and staff should both have easy re-entry on POS after idle lock without repeated OTP during the normal full-day store operation

## Locked auth model

Owner auth:
- Primary login on retailer web: `phone + OTP`
- Primary login on POS app: `phone + OTP`
- Owner must be able to reach staff-management controls from retailer web and POS Settings after login
- Owner must be able to create/reset a POS quick PIN from retailer web and POS Settings
- Owner quick PIN is for POS re-entry and unlock only; retailer web login remains `phone + OTP`

Staff auth:
- Staff login on POS is `PIN`
- Staff PIN can be created/reset from retailer web and POS Settings
- Staff should not need OTP for normal POS use

Fast re-entry on POS after idle:
- POS should soft-lock operator session on idle
- Re-entry after idle should use `PIN`, not repeated OTP
- This applies to both:
  - retailer owner on POS
  - staff on POS
- Re-entry should work on the already bound device even when the network is temporarily unavailable, using a secure local verifier cache plus forced re-sync when connectivity returns

Hard rule:
- Owner and staff cannot share the same actual PIN inside the same store
- If two identities share one PIN, the app cannot safely determine who logged in, which breaks:
  - audit trail
  - shift attribution
  - sales attribution
  - role enforcement
- Therefore PIN must be unique per store across the owner’s POS identity and all staff identities

## Current runtime/session baseline found in code

- POS idle timeout currently logs out after `35 minutes` in `src/hooks/useSessionTimeout.ts`
- POS warning currently appears at `30 minutes`
- Retailer web idle timeout currently uses `30 minutes` in `retailer-admin/src/lib/AuthContext.tsx`
- Retailer web warning starts `5 minutes` before timeout

These values are not yet tied cleanly to the required owner/staff dual-auth model.

## Required session behavior

POS app:
- Store/device session should be long-lived enough for daily store operation
- Owner OTP should not be required again and again during a normal working day
- Idle should clear the active operator session, not destroy the whole device-store binding
- Re-entry after idle should land on a fast PIN screen
- OTP should only be required again for harder boundaries such as:
  - explicit logout
  - device revocation
  - token expiry/revocation
  - store switch
  - owner session bootstrap on a fresh/untrusted device
- Recommended baseline:
  - device/store trust: `30 days` rolling on a trusted POS device, or until revoked
  - owner trusted POS session after OTP: `30 days` rolling with silent refresh where possible
  - active operator session: soft-lock after `10 minutes` idle, unlock by PIN
  - hard clear of active operator context: at app restart, explicit logout, store switch, deactivation, or cryptographic/session revocation
- Owner and staff PIN unlock on POS must not depend on repeated OTP during the working day

Retailer web:
- Owner login remains `phone + OTP`
- Session should survive normal refresh/navigation with token refresh
- Idle timeout and warning behavior must be made explicit and tested
- Recommended baseline:
  - idle timeout: `60 minutes`
  - warning: `5 minutes` before idle expiry
  - absolute session ceiling: `12 hours` before fresh OTP is required again

## Edge cases that must be covered

- SuperAdmin has not yet approved the store
- Owner tries POS OTP login before store approval
- Owner logs into POS but no device-store connection exists yet
- Owner has multiple approved stores and logs into POS with OTP
- Owner creates staff from retailer web and staff logs into POS immediately
- Owner creates staff from POS Settings and the same staff appears in retailer web immediately
- Owner sets or resets their own POS quick PIN from retailer web and from POS Settings
- Owner resets a staff PIN from retailer web while staff is logged in on POS
- Owner resets a staff PIN from POS Settings while staff is logged in on POS
- Owner changes/deactivates a staff member while that staff has an active POS session
- POS sits idle all day and repeatedly locks/unlocks
- Network is down during owner OTP bootstrap
- Network is down during staff PIN unlock on an already bound device
- Owner PIN unlock vs staff PIN unlock on the same device
- Duplicate PIN attempted for owner/staff within the same store
- Store switch while owner or staff has an active POS session

## Additional tickets required by this final requirement

Implement after `V3-REG-022`:

1. `V3-OWNER-023`
2. `V3-POS-024`
3. `V3-SESSION-025`
4. `V3-BIZ-026`
5. `V3-REG-027`

---

## V3-OWNER-023 - Support retailer-owner OTP login on both retailer web and POS

Priority: P0
Layers: retailer auth, POS auth, navigation, backend API

Problem:
- The final requirement explicitly needs owner OTP login on both surfaces.
- Earlier tickets were drifting toward staff-only POS auth.

Scope:
- Keep retailer owner `phone + OTP` login on retailer web.
- Add/keep retailer owner `phone + OTP` login on POS for owner bootstrap.
- After successful owner POS login:
  - allow entry to owner-capable POS mode
  - expose staff-management entry point in POS Settings
- If owner belongs to multiple approved stores:
  - require explicit store selection after OTP
  - bind the active POS device/store context before staff management or operator unlock
- Ensure store approval gates OTP login correctly.

Acceptance:
- Approved owner can log into retailer web with OTP.
- Approved owner can log into POS with OTP.
- Unapproved owner is blocked with clear messaging.
- Multi-store owners cannot accidentally land in the wrong store context on POS.

---

## V3-POS-024 - Add owner staff-management controls to POS Settings

Priority: P0
Layers: POS settings, owner capabilities, backend wiring

Problem:
- Final requirement says owner must be able to create/manage staff from POS Settings as well as retailer web.
- Current POS Settings does not provide real owner staff CRUD.

Scope:
- Add a staff-management area in POS Settings visible only to the retailer owner POS session.
- Required actions:
  - list staff
  - add staff
  - reset PIN
  - activate/deactivate
  - update role
- Add owner self-service controls in POS Settings for:
  - create/reset owner POS quick PIN
  - force staff logout after PIN reset/deactivation
- Use the same backend/store data as retailer web.
- Propagate changes across platforms without drift.

Acceptance:
- Owner can manage staff from POS Settings.
- Staff created in POS Settings are visible in retailer web and can log into POS immediately.
- Owner can create/reset their own POS quick PIN from POS Settings.

---

## V3-SESSION-025 - Split device session, owner session, and operator PIN re-entry correctly

Priority: P0
Layers: session architecture, security, UX

Problem:
- Current timeouts are surface-specific and do not reflect the required all-day POS usage.
- Repeated OTP on POS would be operationally unacceptable.

Scope:
- Define and implement three distinct layers:
  - device/store binding session
  - owner OTP-authenticated session
  - active operator session (owner or staff) for POS usage
- Idle on POS should:
  - soft-lock the active operator
  - keep device/store binding intact
  - allow quick re-entry with PIN
- PIN re-entry on an already bound POS device should work with temporary network loss using a secure local verifier cache, then reconcile revocations/resets when online
- Explicit logout or hard auth failure should:
  - clear the higher-level owner/device auth as appropriate
- Review and rationalize current timeout baselines:
  - POS idle warning at 30m / logout at 35m
  - retailer web idle timeout at 30m
- Replace them with the target session model:
  - POS trusted device/store session: 30 days rolling
  - POS owner trusted session: 30 days rolling
  - POS active operator soft-lock: 10 minutes idle
  - retailer web idle timeout: 60 minutes
  - retailer web absolute session ceiling: 12 hours

Acceptance:
- POS can run all day without repeated owner OTP in the normal case.
- Idle lock returns to easy PIN re-entry.
- Hard auth boundaries still require stronger login.
- Offline PIN re-entry on a previously synced, still-trusted POS device behaves predictably and is covered by tests.

---

## V3-BIZ-026 - Enforce store-wide PIN uniqueness and identity attribution

Priority: P0
Layers: business logic, DB constraints, security

Problem:
- Final requirement wants easy PIN re-entry for owner and staff on POS.
- If owner and staff can share the same actual PIN, identity is ambiguous and the system becomes incorrect.

Scope:
- Enforce unique PIN per store across:
  - owner POS identity
  - all staff identities
- Decide how owner is represented for POS PIN re-entry:
  - as a linked manager/staff-style identity
  - or as a parallel owner-PIN identity with the same uniqueness guarantees
- Ensure audit/shift/sale attribution always resolves to one user identity.
- Reject owner/staff same-PIN attempts with clear product messaging instead of silent overwrite or ambiguous login.

Acceptance:
- Same actual PIN cannot be assigned to two active identities in the same store.
- Every PIN login maps to exactly one actor.
- Retailer owner and staff can both unlock quickly on POS, but never through a shared PIN identity.

---

## V3-REG-027 - Add full regression coverage for owner OTP + staff PIN + idle re-entry

Priority: P1
Layers: regression, CI, e2e

Scope:
- Add tests for:
  - owner OTP login on retailer web
  - owner OTP login on POS
  - owner creates staff from retailer web
  - owner creates staff from POS Settings
  - owner creates/resets their own POS quick PIN from retailer web
  - owner creates/resets their own POS quick PIN from POS Settings
  - staff PIN login on POS
  - owner PIN re-entry on POS after idle
  - staff PIN re-entry on POS after idle
  - duplicate PIN rejection within the same store
  - owner/staff same-PIN rejection with clear message
  - staff deactivation/reset while staff session is active
  - offline PIN re-entry on a bound device after prior sync
  - multi-store owner OTP login on POS with store selection
  - approval/not-approved store states

Acceptance:
- CI proves the final business journey end to end with the required smooth-login behavior.

---

# Third Screen Investigation: SELL Home + Welcome Guide Overlay

Prototype source:
- `RELEASES/supermandi-pos-v3.html`

Current mounted screen path:
- `App.tsx` mounts `SellScan -> PosRootLayoutV3`
- `PosRootLayoutV3` defaults to `SELL`
- `SELL` tab renders `SellScreenV3`

What the prototype screen actually is:
- This is not a separate auth screen.
- It is the main v3 SELL home with:
  - branded top bar
  - online status
  - kebab/menu button
  - search
  - retail vs bulk toggle
  - category chips
  - product grid
  - bottom nav
  - first-run welcome/guide modal (`Welcome to SuperMandi POS`)

## Current findings for this screen

UI / UX gaps:
- `SellScreenV3` does not implement the prototype welcome/guide modal at all.
- `BrandedHeader` supports `onMenuPress`, but `SellScreenV3` does not pass it, so the prototype kebab/menu affordance is dead.
- `selectedCategory` changes local state only; the category chips do not filter the grid.
- `Frequent` chip is fake in the current screen. Backend already has `/api/v1/pos/products/frequent`, but the v3 UI does not use it.
- Product tiles still use synthetic/fallback display logic:
  - fake trade price = `85%` of retail
  - fake `caseSize = 24`
  - rough brand extraction from description
  - emoji-only imagery instead of using available image data
- Offline/network status is fragmented:
  - `PosRootLayoutV3` has an offline banner
  - `SellScreenV3` renders `OfflineBanner`
  - `BrandedHeader` independently polls network and shows its own online pill

Wiring / navigation gaps:
- The prototype guide appears after login; current app has no persisted first-entry guide state.
- The repo already defines onboarding-related storage keys, but they are not wired into v3 SELL home.
- The route-swap docs overstate completeness: `ROUTE_SWAP_GUIDE.md` claims v3 flag-based swapping and “Ready” parity, but `App.tsx` hard-mounts v3 directly and several SELL home behaviors are still missing.
- `posV3Enabled` exists in `settingsStore`, but current app boot does not use it as the route switch described in the docs.

Frontend API / client gaps:
- `SellScreenV3` loads its grid through `productsStore -> productsApi.listProducts()` instead of the richer SELL-specific contract in `sellSearchApi`.
- `productsStore` strips out rich SELL-home fields already available from backend routes:
  - `storeProductId`
  - `mrp`
  - `brand`
  - `category`
  - `image_url`
  - `gst_rate`
  - `net_content_*`
  - `metadataUpdatedAt`
- `catalogApi.getCategoryProducts()` exists but is not used.
- `UniversalSearchV3` bypasses the dedicated store-scoped `searchHistory` service and instead writes to a single global AsyncStorage key, which risks cross-store/cross-context leakage on shared devices.
- `UniversalSearchV3` still contains demo fallback results in production code.
- SELL-home feature flags from `ui-status` / `settingsStore` are not respected:
  - `voiceEnabled`
  - `categoryBrowsingEnabled`

Backend / backend API gaps:
- POS SELL backend routes already exist for:
  - search
  - lookup
  - list
  - category list
  - category products
  - frequent products
- But the mounted SSE route is in drift:
  - `index.ts` mounts `pos/syncEvents.sse.ts`
  - `syncEvents.sse.ts` is stale and does not match the client event contract
  - `syncEvents.ts` contains the correct event-style SSE contract, but is not the mounted route
- This means `startSSEClient()` in `PosRootLayoutV3` is likely not receiving the event format it expects.
- Category counts can drift from visible product lists because:
  - product list/search routes enforce extra supplier-approval visibility logic
  - category count route currently counts store products more broadly

DB / migration / table findings:
- Existing tables already cover most of this screen:
  - `catalog.store_products`
  - `catalog.store_product_barcodes`
  - `catalog.products`
  - `catalog.fmcg_taxonomy`
  - `inventory.stock_balances`
  - `public.sales`
  - `public.sale_items`
  - `platform.stores`
  - `platform.feature_flags`
  - `pos_devices`
- No backend DB table is required just to persist the welcome guide if the behavior is device-local. That should stay local unless product explicitly needs cross-device tutorial sync.
- However, bulk/trade pricing on SELL is not backed by a trustworthy store-sell data contract today. Current UI uses a synthetic `85%` fallback, which is not acceptable as production business logic.
- If `Bulk / Trade` remains a real SELL mode, the repo likely needs a real store-side trade-pricing contract and possibly a forward migration. If product does not want that now, the toggle should be degraded or disabled instead of inventing prices.

GCP / parity findings:
- API gateway broadly proxies `/api/v1/pos`, so the issue is not route absence.
- The real parity risk is streaming/runtime behavior:
  - mounted SSE implementation drift
  - gateway / Cloud Run buffering / long-lived connection behavior
  - event contract parity between backend and React Native SSE client

Business / edge-case findings:
- Shared-device first-run behavior must be defined:
  - show the welcome guide once per device+store?
  - once per operator?
  - once per app version?
- Current recommendation:
  - show once per device+store+guide-version
  - do not re-show on every staff switch
  - expose it again manually from Help/More
- Need explicit handling for:
  - no products in store
  - no sales history for `Frequent`
  - feature flags disabling voice or category browsing
  - offline entry with cached data
  - store switch on shared device
  - search history leakage across stores/operators
  - barcode conflicts
  - very large catalogs where loading everything eagerly is too slow
  - bulk/trade mode when no true trade price exists

Regression / old-code vs v3 findings:
- Existing SELL v3 tests are mostly static source-string assertions, not behavioral tests.
- Current docs and tests overstate readiness for this screen.
- Old code references for SELL parity are stale; the repo no longer contains the large legacy `SellScanScreen` implementation the docs still reference.

## Tickets for this third screen

Implement after `V3-REG-027`:

1. `V3-SELL-028`
2. `V3-WIRING-029`
3. `V3-API-030`
4. `V3-BE-031`
5. `V3-DB-032`
6. `V3-GCP-033`
7. `V3-BIZ-034`
8. `V3-REG-035`

---

## V3-SELL-028 - Build the real v3 SELL home guide and header parity

Priority: P0
Layers: UI/UX, interaction, navigation affordances

Problem:
- The prototype third screen is the v3 SELL home with a first-run welcome/guide overlay.
- Current `SellScreenV3` lacks that guide entirely and does not wire the header kebab/menu action.

Scope:
- Implement the welcome/guide modal shown in the prototype:
  - title and copy parity
  - `SELL / BUY / STORE / MORE` explanation rows
  - primary CTA `Got it, Start Billing`
- Show it automatically on the first successful entry to SELL home after auth/device binding.
- Add accessible dismissal behavior:
  - CTA dismiss
  - backdrop dismiss only if product approves
  - test IDs for automation
- Wire the header kebab/menu button to a real action:
  - quick settings/help/action sheet or direct navigation per product decision
- Remove visual drift against the prototype where feasible without breaking existing design system.

Acceptance:
- First entry to SELL home can show the guide.
- Dismissing the guide returns user to the live SELL screen without navigation reset.
- Header kebab/menu is visible and wired.

---

## V3-WIRING-029 - Rewire SELL home state, chips, feature flags, and local persistence

Priority: P0
Layers: local state, store state, navigation, feature flags

Problem:
- Current SELL-home state is partially fake:
  - category chips do nothing
  - `Frequent` is not wired
  - onboarding persistence is absent
  - feature flags are ignored
  - search history persistence bypasses the store-scoped service

Scope:
- Add local persistence for the SELL-home guide using a versioned, store-scoped local key.
- Decide and implement guide-display policy:
  - recommended: once per `device + store + guideVersion`
  - do not re-show on every staff switch
- Replace the dead `selectedCategory` UI with real category selection behavior.
- Wire `Frequent` to a real data path instead of treating it as a fake static category.
- Respect SELL-home feature flags:
  - hide/disable voice entry when `voiceEnabled=false`
  - hide/disable category browsing when `categoryBrowsingEnabled=false`
- Replace `UniversalSearchV3`’s global AsyncStorage recent-search key with the existing store-scoped search history service.
- Remove or explicitly gate demo-only search fallback data.
- Rationalize online/offline status so SELL home has one coherent status model instead of three disconnected surfaces.

Acceptance:
- Category selection changes the visible product set.
- `Frequent` shows real frequent products or a correct empty state.
- Guide dismissal persists locally and does not leak across unrelated stores.
- Voice/category controls follow backend/store flags.
- Search history is store-scoped and shared-device safe.

---

## V3-API-030 - Move SELL home to the authoritative SELL-specific frontend data contract

Priority: P0
Layers: frontend API client, state modeling, product mapping

Problem:
- `SellScreenV3` currently uses generic `productsStore -> productsApi.listProducts()`.
- That path strips rich data already exposed by the SELL-specific endpoints and forces fake defaults in the UI.

Scope:
- Stop driving SELL home from the generic `productsStore` mapping for the main product grid.
- Introduce or refactor a SELL-home-specific client/state path using the existing authoritative endpoints:
  - store product list
  - store product search
  - category products
  - frequent products
- Preserve richer tile/search fields already returned by backend:
  - `storeProductId`
  - `brand`
  - `category`
  - `mrp`
  - `image_url`
  - `gst_rate`
  - `net_content_value`
  - `net_content_unit`
  - `metadataUpdatedAt`
- Remove fake UI data synthesis such as:
  - `priceTradeMinor = price * 0.85`
  - hardcoded `caseSize = 24`
  - brand extraction from description
- Keep grid/search/cart identity coherent across:
  - tap-to-add
  - search add
  - scan add
  - cart updates

Acceptance:
- SELL home grid/search show data that matches authoritative backend payloads.
- Fake fallback pricing/metadata are removed from production paths.
- Grid/search/cart use a coherent identity model.

---

## V3-BE-031 - Align SELL-home backend contracts for categories, frequent products, and SSE

Priority: P0
Layers: backend API, SSE contract, route hygiene

Problem:
- The frontend is not the only issue. Backend contract drift exists too:
  - duplicate SSE route implementations
  - mounted SSE route does not match client expectations
  - category count visibility may diverge from visible list/search results
  - frequent-products API exists but has no frontend contract owner today

Scope:
- Collapse the duplicate SSE implementations and keep one mounted source of truth.
- Ensure the mounted SSE route matches the React Native client contract:
  - proper `event:` framing
  - `connected`
  - `product_updated`
  - `stock_updated`
  - `settings_updated`
  - heartbeat behavior
- Remove or deprecate stale SSE route files/imports.
- Audit category-count queries so the category chips/counts reflect the same product-visibility rules as SELL list/search.
- Formalize the frequent-products response contract for SELL home.
- Confirm store/product update broadcasts reach the SELL home via SSE or define a polling fallback that is actually tested.

Acceptance:
- Mounted SSE route and client use the same protocol.
- Category counts match visible SELL-home products.
- Frequent-products contract is stable and documented by tests.

---

## V3-DB-032 - Lock the DB and migration strategy for SELL-home category/frequent/bulk behavior

Priority: P0
Layers: DB, query strategy, migrations, business contract

Problem:
- This screen mostly reuses existing catalog tables, but one business/data gap is unresolved:
  - `Bulk / Trade` SELL mode currently uses invented pricing
- Also, guide persistence does NOT justify a backend table by default.

Scope:
- Explicitly decide the data model for SELL-side bulk/trade pricing:
  - if bulk/trade SELL is real, add a real store-side pricing contract and forward migrations as needed
  - if not, degrade or disable the bulk toggle instead of using synthetic pricing
- Verify/adjust DB-backed query paths used by:
  - category browsing
  - frequent products
  - stock-aware SELL listing
- Do not create a backend DB table for guide dismissal unless product explicitly requires cross-device sync.
- If schema changes are needed for bulk/trade pricing, update both POS and retailer-admin data paths together.

Acceptance:
- No production SELL path uses invented trade price math.
- DB changes are forward-migrated only.
- Guide persistence remains local unless there is an explicit approved requirement for server-side sync.

---

## V3-GCP-033 - Verify gateway and production parity for SELL-home live updates

Priority: P1
Layers: gateway, infra parity, runtime behavior

Problem:
- This screen depends on live product/settings freshness, but production parity risk is in SSE/runtime behavior, not just route existence.

Scope:
- Verify that the mounted SELL-home routes work correctly through the API gateway in deployed environments:
  - store-products list/search/lookup
  - category endpoints
  - frequent-products endpoint
  - SSE endpoint
- Verify streaming headers/buffering behavior for the mounted SSE route in gateway/GCP deployment.
- Add a parity checklist or smoke validation for:
  - gateway proxying
  - long-lived stream stability
  - disconnect/reconnect behavior
  - fallback behavior when streaming is unavailable

Acceptance:
- SELL home receives the same route behavior in local/staging/live environments.
- SSE either works correctly through gateway/GCP or cleanly falls back to a tested polling path.

---

## V3-BIZ-034 - Nail the shared-device business rules for SELL home

Priority: P1
Layers: product rules, shared device behavior, UX edge cases

Problem:
- This screen sits at the start of all-day cashier operation on shared devices.
- First-run guide, frequent products, search history, and offline behavior can easily become noisy or unsafe if rules are not explicit.

Scope:
- Define and implement rules for:
  - when the guide shows
  - when it can be reopened
  - whether owner/staff/operator switch should reset it
  - whether search history is shared per store or per operator
- Define empty states for:
  - no products
  - no frequent history
  - disabled voice/category features
  - offline cached mode
- Define SELL-home behavior when:
  - store is inactive or partially activated
  - search returns barcode conflicts
  - catalog is large
  - bulk/trade mode lacks real pricing

Acceptance:
- Shared-device behavior is explicit and testable.
- SELL home remains fast and predictable without cross-store/operator leakage.

---

## V3-REG-035 - Add real regression coverage for the SELL home and welcome-guide flow

Priority: P1
Layers: frontend regression, backend regression, e2e

Problem:
- Existing v3 SELL tests are mostly source-text checks and do not prove runtime behavior.

Scope:
- Add behavioral tests for:
  - guide shown on first entry
  - guide dismissal persistence
  - guide manual reopen from Help/More if implemented
  - category selection changes results
  - `Frequent` chip loads real frequent products
  - no frequent-history empty state
  - feature flag gating for voice/category browsing
  - store-scoped search history
  - search add / tap add / scan add identity consistency
  - offline cached SELL-home behavior
  - SSE-driven product/settings refresh or polling fallback
  - duplicate/stale SSE route regression
- Add backend tests for:
  - frequent-products query contract
  - category count parity with visible list/search rules
  - mounted SSE route framing and event types

Acceptance:
- CI proves SELL home behavior, not just file contents.
- The prototype third screen has runtime regression coverage across UI, wiring, backend contract, and live update behavior.

---

# Main-HEAD-only Audit Override: SELL Home + Welcome Guide

Date: 2026-03-17
Audit basis:
- Git target: `main`
- HEAD commit: `2fdad49f00a8cc068ea6b978d4dc49ed15853344`
- Prototype source of truth: `RELEASES/supermandi-pos-v3.html`
- Current local feature branch was ignored for this audit. All file validation below was done with `git show main:...`.

This section is the authoritative replacement for the earlier SELL-home tickets `V3-SELL-028` through `V3-REG-035`.

## Main-only findings

1. Welcome guide is missing completely on `main`
- Prototype: `supermandi-pos-v3.html:1336-1366` creates `showGuide()` and shows `Welcome to SuperMandi POS` after login.
- `main:src/screens/v3/SellScreenV3.tsx`
- `main:src/screens/v3/PosRootLayoutV3.tsx`
- There is no guide modal, no first-entry persistence, and no `Got it, Start Billing ->` flow anywhere in committed app code.

2. SELL header parity is incomplete and partially dead
- Prototype: `supermandi-pos-v3.html:422-430` shows logo, online pill, and a kebab button that routes to `more`.
- `main:src/components/v3/BrandedHeader.tsx` can render a menu button, but `main:src/screens/v3/SellScreenV3.tsx` mounts it without `onMenuPress`.
- `main` also duplicates online/offline state in three places:
  - `src/components/v3/BrandedHeader.tsx`
  - `src/screens/v3/PosRootLayoutV3.tsx`
  - `src/components/ui/OfflineBanner.tsx`

3. Search UX is still scaffold-level, not V3-complete
- Prototype search (`supermandi-pos-v3.html:475-489`) is a dedicated V3 state with typed query, results, and recent searches.
- `main:src/components/v3/UniversalSearchV3.tsx` still uses:
  - demo results `DEMO_SELL` / `DEMO_BUY`
  - a global AsyncStorage key `@supermandi.recent_searches`
  - no store scoping despite the committed `src/services/searchHistory.ts` service already existing

4. Category rail is not V3-faithful and is not actually wired
- Prototype chips are exactly `Frequent`, `Beverages`, `Snacks`, `Dairy`, `Staples`, `Home Care` (`supermandi-pos-v3.html:454-460`).
- `main:src/screens/v3/SellScreenV3.tsx` starts with those labels, then replaces them with raw taxonomy labels from `getFmcgCategories()`.
- `main:backend/migrations/026_fmcg_taxonomy.sql` seeds `Sab`, `Atta-Dal`, `Chawal`, `Masala`, `Tel-Ghee`, etc. Those do not match the prototype rail.
- `selectedCategory` only changes chip styling; it does not change the product set.

5. `Frequent` is fake UI today
- `main:backend/src/routes/v1/pos/storeProducts.ts` already exposes `GET /api/v1/pos/products/frequent`.
- `main:src/screens/v3/SellScreenV3.tsx` never calls it.
- Result: `Frequent` is just a selected label, not a real home-state.

6. SELL grid data on `main` is still using synthetic product metadata
- `main:src/screens/v3/SellScreenV3.tsx`
- `main:src/stores/productsStore.ts`
- `main:src/services/api/productsApi.ts`
- Current root causes:
  - generic `productsStore.loadProducts()` drives the home grid
  - `priceTradeMinor` falls back to `Math.round(priceMinor * 0.85)`
  - `caseSize` is hardcoded to `24`
  - `brand` is guessed from `description?.split(" ")[0]`
- That is not production-safe parity.

7. Backend feature flags exist, but the committed POS client drops or ignores them
- `main:backend/src/routes/v1/pos/uiStatus.ts` returns `voiceEnabled` and `categoryBrowsingEnabled`.
- `main:src/services/api/uiStatusApi.ts` does not map those flags into the typed parsed response.
- `main:src/services/sseClient.ts` updates `buyEnabled`, `reorderEnabled`, `creditEnabled`, `bnplEnabled`, but not `voiceEnabled` or `categoryBrowsingEnabled`.
- `main:src/screens/v3/SellScreenV3.tsx` does not gate voice/category UI from settings state.

8. Live-update wiring is conflicted on `main`
- `main:backend/src/routes/v1/pos/syncEvents.ts` is the correct event-framed SSE implementation.
- `main:backend/src/routes/v1/pos/syncEvents.sse.ts` is a stale duplicate with a different protocol and wrong middleware import path.
- `main:backend/src/routes/v1/index.ts` mounts both.
- `main:src/services/sseClient.ts` expects event-framed SSE, but its polling fallback hits `/api/v1/pos/sync/poll`, which does not exist on `main`.

9. Old/conflicting scaffolding is still present
- `main:src/screens/v3/PosRootLayoutV3.tsx` still contains unused `PlaceholderScreen` and stale "coming soon" comments.
- `main:src/screens/v3/ROUTE_SWAP_GUIDE.md` still references non-existent `SellScanScreen`.
- `main:src/components/v3/UniversalSearchV3.tsx` still carries demo-only fallback data in production code.

10. Regression coverage is weak for the risk level
- `main:src/__tests__/screens/sell-screen-v3.stg-553.test.ts`
- `main:src/__tests__/screens/universal-search-v3.stg-560.test.ts`
- Existing tests are mainly source-text checks, not runtime behavior or cross-layer contract coverage.

## FIX Tickets

## V3-FIX-036 - Implement the V3 welcome guide modal exactly once per store/device/session policy

Priority: P0
Layers: UI, UX, local state

Issue:
- The committed app never shows the prototype welcome guide on first entry to SELL.

Root cause:
- Neither `SellScreenV3` nor `PosRootLayoutV3` contains the `showGuide()` behavior found in the prototype.

Files impacted:
- `src/screens/v3/PosRootLayoutV3.tsx`
- `src/screens/v3/SellScreenV3.tsx`
- add a small local persistence helper/service if needed
- tests under `src/__tests__/screens/`

Expected outcome:
- First successful arrival at SELL on a bound/authenticated device shows the guide with the exact V3 copy:
  - `Welcome to SuperMandi POS`
  - `SELL — Billing & checkout`
  - `BUY — Order from suppliers`
  - `STORE — Stock & inventory`
  - `MORE — Reports, Khata, Settings`
  - `Got it, Start Billing ->`
- Dismissal persists locally by `device + store + guideVersion`.
- The guide does not reappear on every tab switch or every app foreground.
- No backend table is added for guide dismissal.

## V3-FIX-037 - Restore V3 header fidelity and give SELL one authoritative online/offline state

Priority: P0
Layers: UI, wiring, navigation

Issue:
- The prototype top bar has a working kebab button and one clear status pill.
- `main` leaves the menu button unwired and renders multiple competing connectivity indicators.

Root cause:
- `BrandedHeader` supports `onMenuPress`, but `SellScreenV3` does not pass it.
- Connectivity is checked separately in `BrandedHeader`, `PosRootLayoutV3`, and `OfflineBanner`.

Files impacted:
- `src/components/v3/BrandedHeader.tsx`
- `src/screens/v3/SellScreenV3.tsx`
- `src/screens/v3/PosRootLayoutV3.tsx`
- `src/components/ui/OfflineBanner.tsx`

Expected outcome:
- SELL header matches the prototype behavior.
- Kebab/menu press routes to `MORE` from SELL without dead taps.
- Online/offline state is computed once and rendered coherently.
- No duplicate banner/pill conflicts remain on SELL home.

## V3-FIX-038 - Bring V3 search behavior to parity using real store-scoped history and real results

Priority: P0
Layers: UI, UX, local data

Issue:
- The committed search overlay still contains demo results and non-store-scoped recent searches.

Root cause:
- `UniversalSearchV3.tsx` uses `DEMO_SELL`, `DEMO_BUY`, and a global AsyncStorage key instead of the committed `searchHistory` service.

Files impacted:
- `src/components/v3/UniversalSearchV3.tsx`
- `src/services/searchHistory.ts`
- `src/screens/v3/SellScreenV3.tsx`
- tests under `src/__tests__/screens/` and `src/__tests__/services/`

Expected outcome:
- SELL search uses real results only.
- Recent searches are persisted per store, not globally across devices/stores.
- Search presentation matches the V3 search state:
  - typed query state
  - results section
  - recent searches section
  - clean close/back behavior back to SELL
- No demo rows appear in production paths.

## V3-FIX-039 - Parse and apply V3 SELL feature flags end to end

Priority: P0
Layers: frontend, API parsing, live settings sync

Issue:
- Backend returns `voiceEnabled` and `categoryBrowsingEnabled`, but committed POS client behavior does not follow them.

Root cause:
- `uiStatusApi.ts` typed parsing drops those flags.
- `sseClient.ts` does not refresh them on `settings_updated`.
- `SellScreenV3.tsx` ignores them even though `settingsStore` already supports them.

Files impacted:
- `src/services/api/uiStatusApi.ts`
- `src/services/sseClient.ts`
- `src/screens/v3/SellScreenV3.tsx`
- `src/stores/settingsStore.ts`

Expected outcome:
- `voiceEnabled` hides/disables the mic affordance when false.
- `categoryBrowsingEnabled` hides/disables the chip rail when false.
- Initial splash/ui-status hydration and live settings refresh both keep those flags correct.

## V3-FIX-040 - Add a dedicated V3 SELL-home category-group contract instead of exposing raw taxonomy labels

Priority: P0
Layers: backend API, DB contract, frontend API client

Issue:
- Raw FMCG taxonomy labels on `main` do not match the V3 SELL rail.

Root cause:
- `catalog.fmcg_taxonomy` is a merchandising taxonomy.
- `catalog.ts` exposes that raw taxonomy directly to the POS screen.
- The V3 prototype rail is a separate display contract.

Files impacted:
- `backend/src/routes/v1/catalog.ts`
- `src/services/api/catalogApi.ts`
- `src/screens/v3/SellScreenV3.tsx`
- add forward migration(s) if a persisted mapping table/view is required
- likely related migrations:
  - `backend/migrations/026_fmcg_taxonomy.sql`
  - `backend/migrations/027_store_products_taxonomy.sql`

Expected outcome:
- SELL home receives one dedicated category-group contract that returns exactly the V3 groups:
  - `Frequent`
  - `Beverages`
  - `Snacks`
  - `Dairy`
  - `Staples`
  - `Home Care`
- Counts and membership are deterministic and documented.
- The POS UI no longer displays raw taxonomy labels like `Sab` or `Atta-Dal` on the SELL rail.

## V3-FIX-041 - Wire `Frequent` and category chips to real product sets

Priority: P0
Layers: frontend wiring, backend API usage

Issue:
- On `main`, chips only change styling.

Root cause:
- `selectedCategory` in `SellScreenV3.tsx` is not connected to data.
- `/api/v1/pos/products/frequent` is unused.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/services/api/sellSearchApi.ts` or a new SELL-home API client
- `backend/src/routes/v1/pos/storeProducts.ts`
- tests under `src/__tests__/screens/` and `backend/tests/`

Expected outcome:
- `Frequent` loads real frequently sold products or a correct empty state for stores with no history.
- Every other chip filters the visible product set.
- Chip selection survives expected back/forward interactions without stale UI state.

## V3-FIX-042 - Move SELL home off synthetic grid data and onto the authoritative store-product contract

Priority: P0
Layers: frontend state, frontend API integration

Issue:
- The current SELL grid is built from a generic products cache and synthetic tile metadata.

Root cause:
- `SellScreenV3.tsx` uses `productsStore.loadProducts()` and then invents trade price, brand, and case size.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/stores/productsStore.ts`
- `src/services/api/productsApi.ts`
- `src/services/api/sellSearchApi.ts`
- add a dedicated SELL-home store/hook if needed

Expected outcome:
- The grid is driven by authoritative SELL endpoints, not synthetic derivation.
- Product identity is stable across:
  - grid tap-to-add
  - search add
  - scan add
  - cart quantity updates
- Tile/search payloads preserve real backend fields instead of guessed values.

## DELETE Tickets

## V3-DELETE-043 - Remove the stale duplicate SSE implementation and its route mount

Priority: P0
Layers: backend cleanup, routing hygiene

Issue:
- `main` ships two different SSE implementations for the same path.

Root cause:
- `backend/src/routes/v1/index.ts` mounts both `syncEvents.ts` and `syncEvents.sse.ts`.
- `syncEvents.sse.ts` is an obsolete parallel implementation with a different protocol.

Files impacted:
- `backend/src/routes/v1/index.ts`
- `backend/src/routes/v1/pos/syncEvents.sse.ts`
- keep `backend/src/routes/v1/pos/syncEvents.ts` as the single source of truth
- update affected tests/imports

Expected outcome:
- Only one SSE route exists for `/api/v1/pos/sync/events`.
- No duplicate mount or protocol ambiguity remains.
- The stale file is deleted, not left orphaned.

## V3-DELETE-044 - Remove demo/scaffold leftovers that conflict with SELL-home V3 parity

Priority: P1
Layers: frontend cleanup, docs cleanup

Issue:
- `main` still contains production-visible scaffold code and stale migration notes for this screen family.

Root cause:
- SELL home was moved incrementally and the leftover scaffolding was not removed after mount.

Files impacted:
- `src/components/v3/UniversalSearchV3.tsx`
- `src/screens/v3/PosRootLayoutV3.tsx`
- `src/screens/v3/ROUTE_SWAP_GUIDE.md`
- update tests that assert stale source strings

Expected outcome:
- Remove:
  - `DEMO_SELL`
  - `DEMO_BUY`
  - global `@supermandi.recent_searches`
  - unused `PlaceholderScreen`
  - stale "coming soon" comments for already-mounted V3 screens
  - stale guide/doc references to non-existent `SellScanScreen`
- Cleanup leaves no orphan references and no runtime/build breakage.

## HARDEN Tickets

## V3-HARDEN-045 - Resolve `Bulk / Trade` into a real contract or disable it on SELL

Priority: P0
Layers: business rules, backend API, DB contract, frontend UX

Issue:
- `main` shows a SELL-side `Bulk / Trade` mode but computes price using invented `85%` math.

Root cause:
- No committed SELL-specific trade-price contract exists for store products.
- Existing wholesale endpoints are supplier-purchase oriented, not a valid SELL fallback.

Files impacted:
- `src/components/v3/CustomerTypeToggle.tsx`
- `src/components/v3/ProductTileV3.tsx`
- `src/screens/v3/SellScreenV3.tsx`
- if real pricing is approved: add forward migration(s) and backend route support

Expected outcome:
- One of two states is implemented, explicitly:
  - real store-side trade pricing contract with real data
  - or the toggle is disabled/hidden for SELL until such data exists
- No production SELL path uses invented trade-price math.

## V3-HARDEN-046 - Replace the broken polling fallback and verify Cloud Run/API-gateway SSE parity

Priority: P0
Layers: frontend live updates, backend route support, gateway parity, production readiness

Issue:
- `sseClient.ts` falls back to `/api/v1/pos/sync/poll`, but that route does not exist on `main`.

Root cause:
- The fallback path was scaffolded without a matching backend implementation.
- `main` also still carries duplicated SSE routing, which increases deployment ambiguity.

Files impacted:
- `src/services/sseClient.ts`
- `backend/src/routes/v1/pos/syncEvents.ts`
- `backend/src/routes/v1/index.ts`
- `backend/services/api-gateway/src/config.ts`
- deployment/parity test assets if present

Expected outcome:
- Live updates use one working strategy:
  - event-framed SSE through gateway/Cloud Run
  - and, if needed, a real implemented polling fallback
- No client path points to a non-existent endpoint.
- Production parity is verified for long-lived SELL-home connections.

## V3-HARDEN-047 - Add store-scoped offline/cache behavior for list, search, category, and frequent flows

Priority: P1
Layers: local state, data lifecycle, offline behavior

Issue:
- Moving SELL home to the correct contracts will regress offline use unless caching is redesigned deliberately.

Root cause:
- Current offline behavior rides on the generic `productsStore` cache.
- There is no committed category/frequent/search cache contract for the V3 SELL home.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/stores/productsStore.ts` or a replacement SELL-home store
- `src/services/searchHistory.ts`
- store-scoped storage helpers if needed

Expected outcome:
- Trusted/bound POS devices can still open SELL home and search cached products offline.
- Frequent/category/search failures degrade cleanly without cross-store leakage.
- Empty, offline, partial-failure, and stale-cache states are explicit and testable.

## V3-HARDEN-048 - Replace source-text tests with runtime SELL-home regression coverage

Priority: P1
Layers: frontend regression, backend regression, e2e

Issue:
- Current tests mostly prove that strings exist in files, not that SELL home works.

Root cause:
- `main` test coverage for this area was written as scaffolding guards and never upgraded to behavior-level tests.

Files impacted:
- `src/__tests__/screens/sell-screen-v3.stg-553.test.ts`
- `src/__tests__/screens/universal-search-v3.stg-560.test.ts`
- add new frontend tests under `src/__tests__/screens/`
- add backend tests under `backend/tests/`
- add e2e smoke where appropriate under `e2e-tests/tests/`

Expected outcome:
- Add runtime coverage for:
  - guide first-show and dismissal persistence
  - header menu routing to `MORE`
  - category/frequent data switching
  - store-scoped recent-search behavior
  - feature-flag gating for voice/category rail
  - correct empty/error/offline states
  - single mounted SSE protocol and reconnect/fallback behavior
- Remove false confidence from pure source-text assertions.

---

# Main-HEAD-only Audit Override: Base SELL Home Screen (Post-Guide)

Date: 2026-03-17
Audit basis:
- Git target: `main`
- HEAD commit: `2fdad49f00a8cc068ea6b978d4dc49ed15853344`
- V3 source of truth: `https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html`
- Local verification mirror used in repo: `RELEASES/supermandi-pos-v3.html`
- Local working-tree edits were ignored. Validation was done with `git show main:...` only.

Scope:
- This section is for the base SELL home screen shown after guide dismissal:
  - top bar
  - search bar
  - customer toggle
  - category rail
  - product grid
  - cart-empty strip
  - bottom nav
- `V3-FIX-036` still owns the welcome-guide modal itself.
- For this screen, tickets `V3-FIX-037` through `V3-HARDEN-048` are superseded by the ticket set below.

## Main-only findings

1. Header, menu, online status, and MORE badge are not production-faithful on `main`
- Prototype base screen has one status pill, a working kebab that routes to `MORE`, and a visible `MORE` badge.
- `main:src/screens/v3/SellScreenV3.tsx` mounts `<BrandedHeader />` without `onMenuPress`, so the kebab is dead.
- `main:src/screens/v3/PosRootLayoutV3.tsx` hardcodes `moreBadge={3}` with no source contract.
- `main` computes connectivity in three places:
  - `src/components/v3/BrandedHeader.tsx`
  - `src/screens/v3/PosRootLayoutV3.tsx`
  - `src/components/ui/OfflineBanner.tsx`

2. Search shell and overlay behavior still drift from V3
- Prototype search uses the SELL shell, then a dedicated search state with:
  - exact placeholder copy
  - `✕` close affordance
  - `RESULTS`
  - `RECENT SEARCHES`
- `main:src/components/v3/UniversalSearchV3.tsx` still uses:
  - `Cancel` instead of `✕`
  - recent searches only when query is empty
  - embedded demo fallback data
  - a global storage key `@supermandi.recent_searches`
- `main:src/services/searchHistory.ts` already implements store-scoped history but is not used here.

3. Feature-flag parity is partial, not end to end
- Backend `main:backend/src/routes/v1/pos/uiStatus.ts` returns `voiceEnabled` and `categoryBrowsingEnabled`.
- `main:src/services/api/uiStatusApi.ts` drops those flags in nested parsing.
- `main:src/services/sseClient.ts` does not refresh them on `settings_updated`.
- `main:src/screens/v3/SellScreenV3.tsx` therefore cannot trust live flag state.

4. Category rail is still display-wrong and behavior-wrong
- Prototype rail is exactly:
  - `Frequent`
  - `Beverages`
  - `Snacks`
  - `Dairy`
  - `Staples`
  - `Home Care`
- `main:src/screens/v3/SellScreenV3.tsx` replaces those labels with raw FMCG taxonomy labels from `getFmcgCategories()`.
- `main:backend/src/routes/v1/catalog.ts` exposes raw `catalog.fmcg_taxonomy` rows, whose seed labels on `main` include `Sab`, `Atta-Dal`, `Chawal`, `Masala`, `Tel-Ghee`, etc.
- `selectedCategory` only changes selected styling; it does not change the visible product set.

5. `Frequent` and the rest of the chip rail are still mostly cosmetic
- `main:backend/src/routes/v1/pos/storeProducts.ts` already exposes `GET /api/v1/pos/products/frequent`.
- `main:src/screens/v3/SellScreenV3.tsx` never calls it.
- The current SELL home grid is still powered by generic `productsStore.loadProducts()`, not chip-specific datasets.

6. Product tiles and the home grid still drop real backend fields and invent replacements
- Prototype tiles show stable brand, image/icon area, stock dot, price, and `MRP · 48/pcs case` style copy.
- `main:src/screens/v3/SellScreenV3.tsx` and `main:src/components/v3/ProductTileV3.tsx` still:
  - guess `brand` from `description?.split(" ")[0]`
  - hardcode `caseSize: 24`
  - omit the literal `case` suffix in the sub-copy
  - ignore backend `image_url` on the grid path
  - use emoji placeholders in `ProductTileV3`
- `main:src/stores/productsStore.ts` strips the richer store-product payload down to a generic product shape, so SELL cannot render faithful tiles even though `main:src/services/api/sellSearchApi.ts` and `main:backend/src/routes/v1/pos/storeProducts.ts` already expose richer fields.

7. SELL shell states are still scaffold-level
- `main:src/screens/v3/SellScreenV3.tsx` uses a centered full-page spinner/empty block rather than a V3 shell-preserving loading/error/empty treatment.
- Cart-empty copy on `main` is `Cart empty — tap a product or scan barcode`, while the prototype copy is `Cart empty — tap product or scan barcode`.
- There is no explicit screen-level treatment for:
  - no frequent history
  - category fetch failure with cached grid still available
  - search failure while keeping recent searches
  - low-width device vs wider tablet layout

8. Live-update and data lifecycle are still conflict-prone on `main`
- `main:src/services/sseClient.ts` still points polling fallback at `/api/v1/pos/sync/poll`, which does not exist.
- `main:backend/src/routes/v1/index.ts` mounts both `syncEvents.ts` and stale `syncEvents.sse.ts`.
- Grid/search/cart identity is still inconsistent:
  - grid often keys by product id or barcode
  - search results prefer `storeProductId`
  - cart add paths mix barcode and id keys
- That creates real duplicate-line and stale-qty risk for kirana counter use.

9. Mandatory cleanup must be aggressive but safe
- Delete conflicting scaffold and duplicate code now.
- Do not delete `SellScanScreen` itself in this wave.
- Reason: `App.tsx` still mounts `PosRootLayoutV3` under the `SellScan` route name, and legacy scan/payment/report surfaces are still referenced elsewhere.
- Safe cleanup target is ambiguity and orphan code, not premature deletion of still-mounted legacy surface area.

## FIX Tickets

## V3-FIX-049 - Wire SELL header actions and replace the fake `MORE` badge with a real source

Priority: P0
Layers: UI fidelity, navigation, local state

Issue:
- The prototype SELL header has a working kebab action and the bottom nav shows a meaningful `MORE` badge.
- On `main`, the kebab is dead and the badge is hardcoded.

Root cause:
- `SellScreenV3.tsx` mounts `BrandedHeader` without `onMenuPress`.
- `PosRootLayoutV3.tsx` injects `moreBadge={3}` without any state or backend source.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/components/v3/BrandedHeader.tsx`
- `src/screens/v3/PosRootLayoutV3.tsx`
- `src/components/v3/BottomNavV3.tsx`
- any real source introduced for `MORE` actionable count

Expected outcome:
- Kebab/menu press from SELL always routes to `MORE`.
- No hardcoded `MORE` badge remains in production code.
- Badge value either comes from a documented real source or is hidden when no real source exists.
- Header and bottom-nav interactions remain consistent after refresh, tab change, and app resume.

## V3-FIX-050 - Restore V3 search-shell behavior with store-scoped history and exact section ordering

Priority: P0
Layers: UI fidelity, UX behavior, frontend integration

Issue:
- The base-screen search experience on `main` does not match the V3 prototype.

Root cause:
- `UniversalSearchV3.tsx` uses scaffold behavior:
  - `Cancel` button instead of `✕`
  - recent searches only when query is empty
  - demo fallback rows
  - global history key instead of the committed store-scoped history service

Files impacted:
- `src/components/v3/UniversalSearchV3.tsx`
- `src/services/searchHistory.ts`
- `src/screens/v3/SellScreenV3.tsx`
- tests under `src/__tests__/screens/` and `src/__tests__/services/`

Expected outcome:
- Search entry and overlay behavior match V3:
  - exact placeholder and close affordance
  - `RESULTS` section for typed query
  - `RECENT SEARCHES` visible in the same overlay state when applicable
  - return cleanly to SELL on close
- Recent searches are read/written through the store-scoped history service.
- Search failures keep the overlay usable instead of dropping into demo content.

## V3-FIX-051 - Hydrate and honor `voiceEnabled` and `categoryBrowsingEnabled` end to end on SELL

Priority: P0
Layers: frontend, API parsing, live settings sync

Issue:
- Backend feature flags exist, but the committed SELL home cannot reliably trust or apply them.

Root cause:
- `uiStatusApi.ts` drops these flags in nested parsing.
- `sseClient.ts` does not refresh them on `settings_updated`.
- `SellScreenV3.tsx` therefore runs on stale/default assumptions.

Files impacted:
- `src/services/api/uiStatusApi.ts`
- `src/services/sseClient.ts`
- `src/stores/settingsStore.ts`
- `src/screens/v3/SellScreenV3.tsx`

Expected outcome:
- `voiceEnabled=false` removes or disables the mic affordance on SELL.
- `categoryBrowsingEnabled=false` removes or disables the chip rail on SELL.
- Initial bootstrap and live settings refresh both keep these flags correct.
- No SELL screen path reintroduces hidden-but-tappable dead controls.

## V3-FIX-052 - Replace raw taxonomy exposure with a dedicated V3 SELL category-group contract

Priority: P0
Layers: backend API, frontend API, DB contract

Issue:
- The category rail rendered from `main` backend data cannot match the V3 display contract.

Root cause:
- `catalog.ts` exposes raw `catalog.fmcg_taxonomy` labels directly to POS.
- The V3 rail is a display-group contract, not a direct taxonomy dump.

Files impacted:
- `backend/src/routes/v1/catalog.ts`
- `src/services/api/catalogApi.ts`
- `src/screens/v3/SellScreenV3.tsx`
- add forward migration(s) only if a persisted mapping table/view is required
- likely related existing migrations:
  - `backend/migrations/026_fmcg_taxonomy.sql`
  - `backend/migrations/027_store_products_taxonomy.sql`

Expected outcome:
- SELL home receives exactly these groups, in this order:
  - `Frequent`
  - `Beverages`
  - `Snacks`
  - `Dairy`
  - `Staples`
  - `Home Care`
- Group ids, counts, and membership rules are deterministic and documented.
- POS no longer renders raw taxonomy labels like `Sab` or `Atta-Dal` on the SELL rail.

## V3-FIX-053 - Wire `Frequent` and every category chip to authoritative product datasets

Priority: P0
Layers: frontend wiring, backend API usage, UX behavior

Issue:
- Chip selection on `main` is largely cosmetic.

Root cause:
- `selectedCategory` in `SellScreenV3.tsx` does not drive data.
- `/api/v1/pos/products/frequent` is already available but unused.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/services/api/sellSearchApi.ts` or a new dedicated SELL-home API client
- `backend/src/routes/v1/pos/storeProducts.ts`
- tests under `src/__tests__/screens/` and `backend/tests/`

Expected outcome:
- `Frequent` loads actual frequently sold products or a correct empty state for stores with no sales history.
- Every non-`Frequent` chip changes the visible product dataset.
- Switching chips preserves expected state through refresh, resume, and back-navigation.
- Partial failures degrade to inline retry or cached category data, not a silent no-op.

## V3-FIX-054 - Promote SELL tile/grid rendering to the authoritative store-product payload

Priority: P0
Layers: UI fidelity, frontend state, frontend-backend contract

Issue:
- The current grid cannot match V3 tile fidelity because it throws away real fields and invents replacements.

Root cause:
- `productsStore.ts` reduces rich store-product rows to a generic `Product`.
- `SellScreenV3.tsx` and `ProductTileV3.tsx` then guess `brand`, hardcode `caseSize`, omit `case` copy, and ignore `image_url`.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/components/v3/ProductTileV3.tsx`
- `src/stores/productsStore.ts`
- `src/services/api/productsApi.ts`
- `src/services/api/sellSearchApi.ts`
- `backend/src/routes/v1/pos/storeProducts.ts`

Expected outcome:
- SELL grid and tile rendering use real backend fields for:
  - image
  - brand
  - price
  - MRP/trade metadata
  - case size
  - unit
  - product mode
- Tile sub-copy matches V3 semantics, including the literal `case` suffix.
- No guessed `description.split(...)` brand or hardcoded `caseSize: 24` remains in this path.

## V3-FIX-055 - Match base-screen shell states for loading, empty, error, cart strip, and responsive layout

Priority: P1
Layers: UI fidelity, UX behavior, responsiveness

Issue:
- The committed SELL shell breaks parity when data is loading, empty, stale, or partially failed.

Root cause:
- Interim scaffold states were left in `SellScreenV3.tsx` instead of being replaced with a V3-faithful shell treatment.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/components/v3/ProductTileV3.tsx`
- tests under `src/__tests__/screens/`

Expected outcome:
- Header, search, toggle, category rail, and bottom nav remain mounted while product data is loading or retrying.
- Cart-empty strip copy matches the prototype:
  - `Cart empty — tap product or scan barcode`
- SELL has explicit screen-level treatments for:
  - no frequent history
  - empty category
  - inline retry on list/category/search failure
  - offline cached data
- Grid stays legible on narrow POS widths and wider tablet widths without clipped tiles or broken column math.

## DELETE Tickets

## V3-DELETE-056 - Remove demo search scaffolding and the global recent-search storage key

Priority: P0
Layers: frontend cleanup, regression safety

Issue:
- Production SELL search still ships demo-only fallback code and a cross-store storage key.

Root cause:
- `UniversalSearchV3.tsx` retained prototype scaffolding after API wiring began.

Files impacted:
- `src/components/v3/UniversalSearchV3.tsx`
- `src/services/searchHistory.ts` if legacy migration cleanup is needed
- tests that currently assert scaffold strings instead of runtime behavior

Expected outcome:
- Remove:
  - `DEMO_SELL`
  - `DEMO_BUY`
  - global `@supermandi.recent_searches`
- No production search path can render fake rows.
- Cleanup leaves no orphan imports, dead constants, or stale source-text tests.

## V3-DELETE-057 - Delete the stale duplicate SSE route and the dead `/sync/poll` fallback assumption

Priority: P0
Layers: backend cleanup, frontend cleanup, production consistency

Issue:
- `main` still ships conflicting live-update implementations and a client fallback to a route that does not exist.

Root cause:
- `backend/src/routes/v1/index.ts` mounts both `syncEvents.ts` and `syncEvents.sse.ts`.
- `src/services/sseClient.ts` still points polling fallback at `/api/v1/pos/sync/poll`.

Files impacted:
- `backend/src/routes/v1/index.ts`
- `backend/src/routes/v1/pos/syncEvents.sse.ts`
- `src/services/sseClient.ts`
- related tests/imports

Expected outcome:
- Only one live-update route remains mounted for SELL-home sync.
- No client code points to `/api/v1/pos/sync/poll` unless a real endpoint is added in the same change.
- Cleanup leaves no duplicate protocol handling, wrong middleware imports, or dead reconnect branches.

## V3-DELETE-058 - Remove stale V3 SELL scaffolding and misleading swap documentation

Priority: P1
Layers: cleanup, docs, code hygiene

Issue:
- `main` still contains scaffolding that misrepresents the real SELL-home runtime.

Root cause:
- Incremental V3 migration left behind dead code and outdated route-swap guidance.

Files impacted:
- `src/screens/v3/PosRootLayoutV3.tsx`
- `src/screens/v3/ROUTE_SWAP_GUIDE.md`
- any additional V3-only docs/comments that still reference obsolete SELL mount assumptions

Expected outcome:
- Remove:
  - unused `PlaceholderScreen`
  - stale "coming soon" comments in the mounted V3 root
  - route-swap guidance that still describes non-current SELL ownership
- Rewrite or delete V3 docs that still claim `SellScanScreen` is the active V3 implementation.
- Do not delete `SellScanScreen` itself in this ticket.

## HARDEN Tickets

## V3-HARDEN-059 - Resolve `Bulk / Trade` into a real store-side pricing contract or remove it from SELL

Priority: P0
Layers: business rules, backend API, frontend UX

Issue:
- SELL currently exposes `Bulk / Trade`, but `main` still computes trade price with invented `85%` math.

Root cause:
- There is no committed store-side SELL trade-pricing contract on `main`.
- `SellScreenV3.tsx` and cart total logic still assume a synthetic multiplier.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/components/v3/CustomerTypeToggle.tsx`
- `src/components/v3/ProductTileV3.tsx`
- backend route(s) and forward migration(s) only if real store-side trade pricing is approved

Expected outcome:
- One explicit production state exists:
  - real trade-pricing contract with real data
  - or `Bulk / Trade` is hidden/disabled on SELL until that data exists
- No SELL price or total uses invented percentage math.

## V3-HARDEN-060 - Define one canonical product identity across grid, search, scan, and cart

Priority: P0
Layers: data lifecycle, business logic, regression safety

Issue:
- The same physical SKU can enter the cart under different ids depending on whether it came from the grid, search, or scan path.

Root cause:
- Grid code often keys by `barcode ?? productId`.
- Search code prefers `storeProductId ?? productId`.
- Cart quantity lookups mix barcode and id matching.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/stores/cartStore.ts`
- `src/stores/productsStore.ts` or replacement SELL-home store
- `src/services/api/sellSearchApi.ts`
- scan/cart bridge code if required

Expected outcome:
- One canonical identity contract is documented and enforced, preferably store-product-first.
- Adding the same SKU from grid, search, and scan increments one cart line, not duplicates.
- Qty badges, cart sheet, and payment handoff all use the same identity rules.

## V3-HARDEN-061 - Add store-scoped offline/cache lifecycle for SELL home datasets

Priority: P1
Layers: offline behavior, local state, data lifecycle

Issue:
- Correct SELL-home parity will regress offline behavior unless cache scope is redesigned deliberately.

Root cause:
- Current offline behavior depends on the generic `productsStore` cache.
- There is no dedicated cache contract for:
  - base grid
  - category groups
  - frequent products
  - search results metadata

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/stores/productsStore.ts` or replacement SELL-home store
- `src/services/searchHistory.ts`
- store-scoped storage helpers if needed

Expected outcome:
- Trusted/bound POS devices can still open SELL home offline with the last known store-scoped dataset.
- Category/frequent/search caches do not leak across stores.
- Offline, stale-cache, and partial-refresh states are explicit and testable.

## V3-HARDEN-062 - Add Cloud Run and API-gateway parity gates for the SELL-home contracts

Priority: P1
Layers: GCP parity, deployment readiness, production safety

Issue:
- The SELL-home contract changes required for parity can pass locally while still failing behind the gateway or in Cloud Run.

Root cause:
- `main` has no sell-home-specific rollout gate for:
  - category-group contract
  - frequent products
  - ui-status feature flags
  - long-lived live-update connection

Files impacted:
- `backend/services/api-gateway/src/config.ts`
- `backend/src/startup/validateGcp.ts`
- deployment/smoke scripts used for staging and Cloud Run
- any parity test harness introduced for SELL-home routes

Expected outcome:
- Staging/prod parity checks prove that SELL home works through the gateway for:
  - `GET /api/v1/pos/ui-status`
  - category-group endpoint(s)
  - `GET /api/v1/pos/products/frequent`
  - live update endpoint
- Missing route, env, or gateway config blocks rollout before production drift.

## V3-HARDEN-063 - Replace source-text guards with runtime SELL-home parity and edge-case coverage

Priority: P1
Layers: regression, business edge cases, cleanup verification

Issue:
- Current SELL-home tests mostly assert file text, not behavior.

Root cause:
- Existing tests were written as scaffolding guards and were never upgraded to runtime assertions.

Files impacted:
- `src/__tests__/screens/sell-screen-v3.stg-553.test.ts`
- `src/__tests__/screens/universal-search-v3.stg-560.test.ts`
- add runtime frontend tests under `src/__tests__/screens/`
- add backend tests under `backend/tests/`
- add e2e smoke where needed under `e2e-tests/tests/`

Expected outcome:
- Runtime coverage exists for:
  - header menu -> `MORE`
  - exact search-shell behavior
  - store-scoped recent-search history
  - voice/category flag gating
  - category-group and `Frequent` switching
  - grid/cart identity consistency across grid/search/scan
  - no-frequent-history and partial-failure states
  - offline cached SELL-home open on a bound device
  - delete-ticket verification with no orphan references or build breakage

## Critical Click Map - SELL Home Completion Gate

This screen is the daily cashier surface. Claude must not mark the SELL-home work complete until every visible tap target below is verified against the V3 prototype and against committed code behavior.

Important:
- Some elements are intentionally non-interactive in the prototype.
- Those elements still require verification, because accidental press handlers and dead wrappers are regressions too.
- "Looks close" is not acceptable for this screen. Every click path needs an explicit behavior, data source, and back-flow.

### Click-by-click matrix

1. Header logo / brand block
- Prototype behavior:
  - static branding only
  - no navigation
- Current `main` expectation:
  - no accidental press target
- Claude proof required:
  - code reference showing no press handler
  - runtime test or interaction assertion confirming no navigation is fired

2. Online status pill
- Prototype behavior:
  - informational only
  - not a button
- Current `main` risk:
  - duplicate online/offline surfaces can conflict with the pill state
- Claude proof required:
  - one authoritative online/offline state source
  - proof the pill is informational only and does not trigger navigation/modals

3. Kebab / overflow menu
- Prototype behavior:
  - tap routes to `MORE`
- Current `main` gap:
  - dead when `BrandedHeader` is mounted without `onMenuPress`
- Claude proof required:
  - code reference for SELL -> MORE wiring
  - runtime test that tapping kebab changes active tab or route to `MORE`

4. Search field shell
- Prototype behavior:
  - tapping/focusing search opens the dedicated search state
- Current `main` expectation:
  - opens `UniversalSearchV3`
  - does not lose cart/chip/tab state when closed
- Claude proof required:
  - runtime test for open and close
  - confirmation that search close returns to the same SELL context

5. Search overlay close `X`
- Prototype behavior:
  - `✕` returns to SELL
- Current `main` risk:
  - overlay currently used `Cancel` scaffold behavior
- Claude proof required:
  - exact close affordance parity
  - runtime test proving close returns to SELL without state loss

6. Search result row `+ Add`
- Prototype behavior:
  - tapping a result adds it and returns to SELL
- Current `main` risk:
  - identity drift between search/grid/cart may create duplicate lines
- Claude proof required:
  - runtime test showing result selection increments the same cart identity as tile/scan paths
  - code reference for canonical product identity

7. Recent search chip
- Prototype behavior:
  - tapping a recent search should restore/search that term
- Current `main` risk:
  - recent history was global, not store-scoped
- Claude proof required:
  - runtime test proving recent-search tap populates/query-runs correctly
  - proof storage is store-scoped

8. Scan button
- Prototype behavior:
  - tap opens scan flow
- Current `main` expectation:
  - routes to `V3Scan`
  - back/cancel returns to SELL
  - cart and chip state survive expected return path
- Claude proof required:
  - route wiring proof
  - runtime test for open -> back/close -> SELL return

9. Voice button
- Prototype behavior:
  - tap opens voice flow
  - add/retry/back paths are explicit
- Current `main` risk:
  - feature-flag gating incomplete
  - voice overlay can exist while icon visibility is stale
- Claude proof required:
  - runtime test for open/close
  - proof `voiceEnabled=false` removes or disables the entry point

10. `Retail` toggle
- Prototype behavior:
  - switches SELL pricing/mode to retail
- Current `main` expectation:
  - tiles, cart, and totals stay internally consistent
- Claude proof required:
  - runtime test proving retail mode is selectable and reflected in tile/cart display

11. `Bulk / Trade` toggle
- Prototype behavior:
  - toggle exists in the prototype
- Current `main` risk:
  - fake pricing math still exists in SELL logic
- Claude proof required:
  - explicit proof of one final state:
    - real trade-price contract
    - or hidden/disabled control
  - do not mark complete while fake math remains in user-facing SELL totals

12. `Frequent` chip
- Prototype behavior:
  - default active chip
  - loads frequent/familiar products
- Current `main` gap:
  - visual state existed before real data wiring
- Claude proof required:
  - runtime test for frequent dataset load
  - empty-state proof for stores with no sales history

13. `Beverages` chip
14. `Snacks` chip
15. `Dairy` chip
16. `Staples` chip
17. `Home Care` chip
- Prototype behavior:
  - each chip changes the grid dataset
- Current `main` gap:
  - chip state was cosmetic only
- Claude proof required:
  - runtime coverage proving each chip changes visible products
  - proof categories come from the dedicated V3 contract, not local hardcoding only

18. Product tile tap
- Prototype behavior:
  - tap adds product to cart
  - qty badge appears/increments
  - cart strip reflects cart contents
- Current `main` risk:
  - grid data and cart identity drift
- Claude proof required:
  - runtime test showing first tap creates one line
  - second tap increments the same line, not a duplicate

19. In-cart tile visual state
- Prototype behavior:
  - selected/in-cart tile shows clear feedback
- Current `main` expectation:
  - border, badge, and qty match cart state
- Claude proof required:
  - runtime assertion tying tile badge to cart state

20. Cart empty strip
- Prototype behavior:
  - informational strip only
  - not a button
- Current `main` expectation:
  - exact copy:
    - `Cart empty — tap product or scan barcode`
- Claude proof required:
  - proof copy matches prototype
  - proof it is not a dead/hidden tap target

21. Cart strip when cart has items
- Prototype behavior:
  - opens cart state
- Current `main` expectation:
  - opens `CartSheetV3`
  - preserves correct totals and item count
- Claude proof required:
  - runtime test for strip open behavior after adding a tile/search result

22. Bottom nav `SELL`
- Prototype behavior:
  - stays on SELL
- Current `main` expectation:
  - idempotent tap
  - does not wipe scroll/cart/search context unnecessarily
- Claude proof required:
  - runtime proof for idempotent behavior

23. Bottom nav `BUY`
24. Bottom nav `STORE`
25. Bottom nav `MORE`
- Prototype behavior:
  - each tab changes screen
- Current `main` expectation:
  - tab switching works
  - returning to SELL preserves intended state
- Claude proof required:
  - runtime proof for each tab switch
  - explicit statement of what SELL state is intentionally preserved vs reset

### Claude completion proof for this screen

When Claude claims this screen is complete, the final report must include all of the following:

1. A click-path checklist covering all 25 items above.
2. For each item:
- code reference
- runtime test reference or e2e proof
- if intentionally non-interactive, proof that no handler exists
3. A state-persistence note for:
- search open/close
- scan open/back
- voice open/back
- tab switch away and return
- add-to-cart and cart-sheet open
4. A cleanup note stating exactly what old code/docs/tests were deleted and what was intentionally kept.

## V3-HARDEN-064 - Add runtime verification for every visible SELL-home click path

Priority: P0
Layers: UX regression, navigation, business safety

Issue:
- The SELL-home screen is the main operator surface, but current tickets do not force proof for every visible tap target.

Root cause:
- Prior coverage was organized by subsystem, not by the actual click paths a cashier uses all day.

Files impacted:
- runtime frontend tests under `src/__tests__/screens/`
- e2e flows under `e2e-tests/tests/`
- any small test-only helpers needed for SELL-home interaction coverage

Expected outcome:
- Add runtime coverage for every critical visible interaction on the base SELL-home screen:
  - kebab
  - search open/close/result/recent-search
  - scan open/back
  - voice open/back
  - retail/bulk toggle
  - each category chip
  - tile tap/add/increment
  - cart strip open
  - bottom nav tab changes
- Non-interactive elements are also asserted as non-interactive where required:
  - logo
  - online pill
  - cart-empty strip

## V3-DELETE-065 - Remove stale SELL route aliases, docs, and tests only after V3 click-path parity is proven

Priority: P1
Layers: cleanup, navigation hygiene, regression prevention

Issue:
- Even when the new SELL home works, stale old naming and old-screen references can keep the codebase ambiguous.

Root cause:
- The repo still carries legacy naming and documentation around `SellScan` even though the mounted V3 screen is `PosRootLayoutV3` + `SellScreenV3`.
- The old `SellScanScreen.tsx` file is already gone from `src`, but route names, docs, and test labels still point at it.

Files impacted:
- `App.tsx`
- gate screens and wrappers that still navigate by legacy `SellScan` route name
- `src/screens/v3/ROUTE_SWAP_GUIDE.md`
- tests/docs that still describe the old SELL owner incorrectly
- examples already verified on `main`:
  - `src/screens/EnrollDeviceScreen.tsx`
  - `src/screens/DeviceBlockedScreen.tsx`
  - `src/screens/PaymentSetupScreen.tsx`
  - `src/screens/ForceUpdateScreen.tsx`
  - `src/screens/v3/V3ScreenWrappers.tsx`

Expected outcome:
- Replace stale route aliasing and outdated docs/tests with canonical V3 naming once parity is proven.
- Do not break valid boot/gate flows while cleaning up route names.
- Claude must provide grep-backed proof that:
  - stale `SellScanScreen` ownership references are removed where they are no longer true
  - no orphan route references remain
  - runtime navigation still works after cleanup

# Main-HEAD-only Audit Extension: Downstream Sub-Screens Originating from SELL Home

Pinned baseline:
- `main@2fdad49f00a8cc068ea6b978d4dc49ed15853344`

Source-of-truth screen chain from `RELEASES/supermandi-pos-v3.html`:
- `sell -> search`
- `sell -> cart -> payment -> cash | upi | udhar -> success`
- `sell -> voice`
- `sell -> scan -> newprod`
- `sell -> buy -> compare | counter`
- `sell -> store -> grn | reorder | stock`
- `sell -> more -> khata | reports | settings`

Main findings on `main`:
- `UniversalSearchV3` still behaves like a scaffold, not the prototype search scene:
  - wrong close affordance text
  - recent searches only render when query is empty
  - search results still carry placeholder image logic and old layout assumptions
- `CartSheetV3` is still a full-height sheet with non-prototype sections:
  - discount editor
  - customer editor
  - no WhatsApp share CTA
  - no dedicated cart back-header screen
- `VoiceOverlayV3` is a modal, not the prototype screen, and still shows fake matched amount:
  - `matchedQty * 10`
- `ScanScreenV3` is modal/context-switch driven and still uses local cache lookup instead of an authoritative scan contract for the SELL flow.
- `NewProductScreenV3` still uses simulated master lookup and local-only save primitives:
  - `lookupMasterDB(...)`
  - `upsertLocalProduct(...)`
  - `setLocalPrice(...)`
- `PaymentScreenV3` compresses `payment`, `cash`, `upi`, and `udhar` into one implementation, while the prototype is a screen chain with separate states and back flows.
- `SuccessScreenV3` still fabricates key business outputs:
  - random streak
  - random bill ref
  - placeholder profit percentage
- `BuyScreenV3` still carries invented wholesale assumptions:
  - default `caseSize: 24`
  - estimated `ptrMinor`
  - static categories
- `CompareScreenV3` still falls back to demo offers when API fetch fails.
- `CounterPurchaseScreenV3` is richer than the prototype in some places but still diverges on scan contract, supplier handling, and save flow details.
- `StoreHubScreenV3`, `GRNScreenV3`, `ReorderScreenV3`, and `StockScreenV3` are partially wired but still retain placeholder totals, fixed labels, or prototype drift in launch behavior.
- `MoreScreenV3`, `KhataScreenV3`, `ReportsScreenV3`, and `SettingsScreenV3` still mix real APIs with placeholder copy, static values, or legacy behavior.

## V3-FIX-066 - Bring SELL search sub-screen to exact V3 parity

Priority: P0
Layers: UI, UX, navigation, frontend state

Issue:
- The SELL search screen on `main` still behaves like an overlay scaffold rather than the prototype search sub-screen.

Root cause:
- `UniversalSearchV3` still carries old generic assumptions:
  - `Cancel` text instead of prototype `✕`
  - recent searches hidden when query is non-empty
  - placeholder result imagery/layout
  - old close/result-add flow assumptions

Files impacted:
- `src/components/v3/UniversalSearchV3.tsx`
- `src/services/searchHistory.ts`
- SELL search callers in `src/screens/v3/SellScreenV3.tsx`

Expected outcome:
- Match the prototype search sub-screen exactly for SELL:
  - top search bar with close `✕`
  - results block first
  - recent-search block still visible below results
  - selecting a result adds the item and returns to SELL cleanly
- Preserve SELL scroll/cart state on close and on add-to-cart return.

## V3-FIX-067 - Replace cart sheet behavior with the V3 cart screen contract

Priority: P0
Layers: UI, UX, navigation, sell flow

Issue:
- Current cart implementation is a sheet-like custom surface, while the prototype is a dedicated cart screen with a clear back flow and action row.

Root cause:
- `CartSheetV3` was built as a reusable overlay and accumulated extra sections not present in V3:
  - discount editor
  - customer editor
  - no WhatsApp share CTA

Files impacted:
- `src/components/v3/CartSheetV3.tsx`
- `src/screens/v3/SellScreenV3.tsx`
- route/wrapper code that opens checkout from SELL

Expected outcome:
- The cart experience matches the prototype:
  - header back to SELL
  - `Clear All`
  - item list
  - total summary
  - `+ Add More`
  - `📌 Park`
  - WhatsApp `Share`
  - `PAY ->`
- Any non-prototype discount/customer functionality must move behind an explicit secondary flow, not stay embedded in the cart surface.

## V3-FIX-068 - Restore voice sub-screen parity and authoritative add-to-cart behavior

Priority: P0
Layers: UI, UX, frontend-backend integration

Issue:
- The current voice flow is still a modal and shows fabricated match pricing.

Root cause:
- `VoiceOverlayV3` resolves UI from voice intent only and still renders:
  - `matchedQty * 10`
- The confirm path is not guaranteed to hydrate product identity/price from authoritative data before add-to-cart.

Files impacted:
- `src/components/v3/VoiceOverlayV3.tsx`
- `src/screens/v3/SellScreenV3.tsx`
- voice/product resolution service layer if needed

Expected outcome:
- Match the prototype voice screen:
  - full-screen dark scene
  - back action
  - listening state
  - transcript
  - matched product summary
  - `Add`
  - `Retry`
- Confirm must add the resolved product with real store product metadata and real price, not a synthetic amount.

## V3-FIX-069 - Bring SELL scan sub-screen to the V3 contract

Priority: P0
Layers: UI, UX, navigation, scan integration

Issue:
- The current scan implementation is a modal with extra context switching and local lookup assumptions that do not match the prototype SELL scan path.

Root cause:
- `ScanScreenV3` was built as a multipurpose scanner:
  - `sell | stock_in | new_product`
- The prototype SELL flow is single-purpose and result-card driven.

Files impacted:
- `src/screens/v3/ScanScreenV3.tsx`
- `src/screens/v3/V3ScreenWrappers.tsx`
- barcode lookup/state integration used by SELL

Expected outcome:
- SELL scan matches the prototype:
  - full-screen dark scan scene
  - back to SELL
  - camera/HID/manual barcode path
  - bottom result card
  - `New Product`
  - `Continue`
- Remove the non-V3 SELL context toggle from the primary SELL scan path.

## V3-FIX-070 - Replace simulated new-product flow with the V3 create-product contract

Priority: P0
Layers: UI, API, backend, DB, offline

Issue:
- New product creation still depends on simulated master lookup and local-only writes.

Root cause:
- `NewProductScreenV3` currently uses:
  - `lookupMasterDB(...)`
  - `upsertLocalProduct(...)`
  - `setLocalPrice(...)`
- The photo CTA is also non-functional in current main.

Files impacted:
- `src/screens/v3/NewProductScreenV3.tsx`
- `src/services/api/catalogApi.ts`
- backend catalog/store-product endpoints used for barcode enrichment or creation
- offline queue/store-product sync path if the app must support queued creation

Expected outcome:
- Match the prototype new-product screen:
  - barcode-led entry from scan miss
  - working photo capture/attach flow
  - compact required fields
  - `Add to Store & Cart`
- Master lookup and store-product create must use real API/backend contracts with safe offline fallback, not local simulation.

## V3-FIX-071 - Split payment chooser and child screens into the exact V3 route chain

Priority: P0
Layers: navigation, UX, payment flow architecture

Issue:
- Current payment implementation collapses multiple prototype screens into one file and one mounted surface.

Root cause:
- `PaymentScreenV3` currently handles:
  - method chooser
  - cash UI
  - UPI UI
  - Udhar UI
  - split payment modal

Files impacted:
- `src/screens/v3/PaymentScreenV3.tsx`
- `src/screens/v3/V3ScreenWrappers.tsx`
- `App.tsx`

Expected outcome:
- Restore the V3 screen chain:
  - `payment`
  - `cash`
  - `upi`
  - `udhar`
  - `success`
- Back flows must match prototype navigation exactly:
  - method child screen back goes to payment chooser
  - payment chooser back goes to cart

## V3-FIX-072 - Implement dedicated cash payment parity

Priority: P0
Layers: UX, API integration, cashier flow

Issue:
- The cash experience on `main` is nested inside the unified payment screen instead of being its own cash scene.

Root cause:
- The current design reused one screen for all methods, which hides the prototype’s explicit cash state and back flow.

Files impacted:
- payment child screen implementation for cash
- `src/services/api/posApi.ts` usage for cash completion

Expected outcome:
- Dedicated cash screen with:
  - amount to collect
  - exact preset
  - round-up presets
  - manual received entry
  - change to return
  - `✓ COMPLETE SALE`
- Sale creation/payment recording must stay idempotent and not duplicate the sale on repeated taps.

## V3-FIX-073 - Implement dedicated UPI payment parity with real QR/status handling

Priority: P0
Layers: UX, payments, backend API

Issue:
- The current UPI experience still renders a placeholder QR block inside the unified payment screen.

Root cause:
- `PaymentScreenV3` initializes UPI but does not render a dedicated V3 UPI screen with authoritative QR payload and status handling.

Files impacted:
- payment child screen implementation for UPI
- `src/services/api/posApi.ts`
- backend payment-init / confirm path if payload drift exists

Expected outcome:
- Dedicated UPI screen with:
  - total amount
  - real QR presentation from authoritative payment payload
  - waiting state
  - explicit received/confirm action
  - back flow to payment chooser
- No placeholder QR or fake receipt step remains.

## V3-FIX-074 - Implement dedicated Udhar payment parity with existing-customer selection

Priority: P0
Layers: UX, khata integration, API

Issue:
- Current Udhar flow only supports free-text customer entry inside the unified payment screen.

Root cause:
- Prototype requires both:
  - new customer details
  - existing-customer quick selection
- Current `main` only implements the first half.

Files impacted:
- payment child screen implementation for Udhar
- khata/customer lookup integration
- `src/services/api/posApi.ts` due-payment path

Expected outcome:
- Dedicated Udhar screen with:
  - amount due
  - customer name/phone
  - existing-customer quick-select list
  - `Record Udhar`
- The sale must attach to the correct customer/khata ledger entry without duplicate credit records.

## V3-FIX-075 - Bring success/receipt screen to exact V3 parity

Priority: P0
Layers: UI, UX, payment completion, backend correctness

Issue:
- Current success screen still fabricates business outputs that should come from real sale context.

Root cause:
- `SuccessScreenV3` still invents:
  - random streak
  - random bill ref
  - placeholder profit percentage

Files impacted:
- `src/screens/v3/SuccessScreenV3.tsx`
- sale completion payload passed from payment flow
- receipt/void integration in `src/services/api/posApi.ts`

Expected outcome:
- Success screen matches the prototype:
  - correct payment label
  - real bill reference
  - real receipt-print state
  - `New Sale`
  - `Reprint`
  - `Send Bill`
  - `Void`
- No random bill ID, streak, or fake profit remains in production paths.

## V3-FIX-076 - Bring BUY screen to exact V3 parity

Priority: P0
Layers: UI, API, backend contract, business logic

Issue:
- BUY still relies on generic catalog mapping and invented wholesale metadata.

Root cause:
- `BuyScreenV3` still fabricates:
  - `caseSize: 24`
  - estimated `ptrMinor`
  - static category chips
- It does not yet honor the exact prototype card terms:
  - MRP
  - PTS/PTR
  - case/crate size
  - MOQ
  - scheme/trade discount/credit banners
  - stock-need copy

Files impacted:
- `src/screens/v3/BuyScreenV3.tsx`
- `src/services/api/catalogApi.ts`
- backend catalog/wholesale contract used by BUY
- any migration/API additions needed for supplier offer fields

Expected outcome:
- BUY matches the prototype:
  - supplier selector
  - category chips
  - rich supplier cards
  - finance banner
  - accurate order strip
- No invented wholesale economics remain in UI or ordering logic.

## V3-FIX-077 - Bring compare-suppliers screen to exact V3 parity

Priority: P1
Layers: UI, API, pricing logic

Issue:
- Compare screen still falls back to demo supplier offers on fetch failure.

Root cause:
- `CompareScreenV3` uses a fallback demo block instead of an authoritative empty/error state.

Files impacted:
- `src/screens/v3/CompareScreenV3.tsx`
- `src/services/api/catalogApi.ts`
- supplier-offer backend contract if fields are missing

Expected outcome:
- Compare screen matches the prototype:
  - product header
  - sell price/current stock/weekly need
  - ranked supplier cards
  - best-price badge
  - order CTA per supplier
- API failure must surface as a real error/empty state, not demo suppliers.

## V3-FIX-078 - Bring counter-purchase screen to exact V3 parity

Priority: P1
Layers: UI, API, inventory, supplier workflow

Issue:
- Current counter-purchase flow diverges from the prototype on scan behavior, supplier selection, and purchase confirmation details.

Root cause:
- The implementation mixed prototype goals with extra local assumptions:
  - store-product barcode lookup only
  - local draft bias
  - ad hoc supplier handling

Files impacted:
- `src/screens/v3/CounterPurchaseScreenV3.tsx`
- `src/components/v3/PurchaseItemCardV3.tsx`
- supplier/inventory APIs used by manual inward flow

Expected outcome:
- Match the prototype counter-purchase flow:
  - scan zone
  - supplier/invoice strip
  - continuously appended scanned items
  - repeat/new item handling
  - summary footer
  - confirm/save path
- Purchase confirmation must write authoritative inward records and supplier linkage.

## V3-FIX-079 - Bring STORE hub and Receive-Stock launch behavior to exact V3 parity

Priority: P1
Layers: navigation, inventory UX, API integration

Issue:
- Store hub is partially correct, but its child launch behavior still drifts from the prototype store subtree.

Root cause:
- `StoreHubScreenV3` and `GRNScreenV3` still include placeholder order metadata and wrapper assumptions.

Files impacted:
- `src/screens/v3/StoreHubScreenV3.tsx`
- `src/screens/v3/GRNScreenV3.tsx`
- `src/screens/v3/V3ScreenWrappers.tsx`
- relevant order/inventory APIs

Expected outcome:
- Store hub matches prototype cards and recent-order behavior.
- Receive Stock launch/back flow matches prototype:
  - store -> grn -> back to store
  - scan bar + tabs + pending PO context + confirm receipt
- Placeholder PO metadata is replaced by real order context.

## V3-FIX-080 - Bring reorder and stock sub-screens to exact V3 parity

Priority: P1
Layers: UX, reorder logic, inventory data

Issue:
- Reorder and stock screens are partly wired but still retain placeholder totals, placeholder actions, and non-prototype behaviors.

Root cause:
- Current screens were implemented as partial V3 approximations:
  - reorder send-to-supplier action is mostly toast-level
  - stock footer actions are alert placeholders

Files impacted:
- `src/screens/v3/ReorderScreenV3.tsx`
- `src/screens/v3/StockScreenV3.tsx`
- reorder/inventory service APIs

Expected outcome:
- Reorder screen matches prototype urgency cards and approval/edit/dismiss behavior.
- Stock screen matches prototype tabs, summary counters, search, and inventory row behavior.
- Actions that remain unsupported must be explicitly disabled or completed, not left as placeholder alerts.

## V3-FIX-081 - Bring MORE hub to exact V3 parity

Priority: P1
Layers: UI, UX, summary data, navigation

Issue:
- Current MORE screen still mixes real summary with placeholder greeting and hardcoded dashboard content.

Root cause:
- `MoreScreenV3` still contains fixed morning-card content and hardcoded menu assumptions.

Files impacted:
- `src/screens/v3/MoreScreenV3.tsx`
- `src/services/api/dailySummaryApi.ts`
- navigation wiring for MORE quick-access routes

Expected outcome:
- Match the prototype MORE hub:
  - branded header
  - staff/store identity
  - online indicator
  - yesterday brief
  - today stats
  - finance banner
  - quick-access list
- No fixed demo dashboard copy remains in production.

## V3-FIX-082 - Bring Khata screen to exact V3 parity

Priority: P1
Layers: UI, API, collections workflow

Issue:
- Current Khata screen mixes live store data with hardcoded fallback customers and simplified actions.

Root cause:
- `KhataScreenV3` still injects fallback arrays and relies on alert/toast shortcuts for collection/reminder actions.

Files impacted:
- `src/screens/v3/KhataScreenV3.tsx`
- `src/stores/khataStore.ts`
- khata/collection APIs

Expected outcome:
- Match the prototype:
  - outstanding/overdue summary
  - search
  - overdue and pending sections
  - remind and collect actions
  - bulk WhatsApp reminder CTA
- Remove hardcoded customer fallback data from production paths.

## V3-FIX-083 - Bring Reports screen to exact V3 parity

Priority: P1
Layers: UI, reporting API, export/print

Issue:
- Reports screen still has incomplete profit/export behavior and placeholder PDF handling.

Root cause:
- `ReportsScreenV3` only partially uses the daily summary contract and leaves PDF/export as alert placeholder.

Files impacted:
- `src/screens/v3/ReportsScreenV3.tsx`
- `src/services/api/dailySummaryApi.ts`
- printer/share/export integrations

Expected outcome:
- Match the prototype:
  - Today/Week/Month tabs
  - sales/profit cards
  - payment split bars
  - print/share/PDF actions
- Unsupported export behavior must be completed or intentionally removed, not left as alert-only placeholder.

## V3-FIX-084 - Bring Settings screen to exact V3 parity

Priority: P1
Layers: UI, device config, session flow

Issue:
- Current settings screen still shows placeholder store/staff/payment values and mixes new auth work with older generic settings assumptions.

Root cause:
- `SettingsScreenV3` still hardcodes fields such as:
  - `Raju (Manager)`
  - `store@upi`
  - printer/HID statuses

Files impacted:
- `src/screens/v3/SettingsScreenV3.tsx`
- device/session/settings stores and APIs that supply:
  - active staff
  - hardware state
  - payment configuration

Expected outcome:
- Match the prototype:
  - store section
  - staff section
  - hardware section
  - payments section
  - preferences section
  - `Switch Staff`
  - `Logout`
- Placeholder values are replaced by real state or removed until supported.

## V3-DELETE-085 - Remove downstream modal-wrapper and legacy route drift after parity is proven

Priority: P1
Layers: cleanup, navigation, regression prevention

Issue:
- Downstream V3 screens still carry wrapper-era assumptions and route aliases that no longer match the prototype screen chain.

Root cause:
- `V3ScreenWrappers.tsx` and legacy route naming still preserve modal/alias patterns from earlier migration stages.

Files impacted:
- `src/screens/v3/V3ScreenWrappers.tsx`
- `App.tsx`
- route docs/tests referring to old downstream ownership

Expected outcome:
- Remove stale modal-first route assumptions once downstream parity is implemented.
- Claude must provide grep-backed proof that:
  - legacy downstream aliases are removed where no longer needed
  - back flows still work after cleanup

## V3-DELETE-086 - Remove demo, simulated, and fallback production data from downstream screens

Priority: P0
Layers: cleanup, data integrity

Issue:
- Several downstream screens still contain demo or simulated production data.

Root cause:
- Migration left behind placeholder data sources such as:
  - simulated master lookup in `NewProductScreenV3`
  - demo supplier fallback in `CompareScreenV3`
  - fallback customer arrays in `KhataScreenV3`
  - placeholder report/help text in downstream screens

Files impacted:
- `src/screens/v3/NewProductScreenV3.tsx`
- `src/screens/v3/CompareScreenV3.tsx`
- `src/screens/v3/KhataScreenV3.tsx`
- any other downstream screen still using demo fallback

Expected outcome:
- Remove demo/simulated/fallback production data from all audited downstream screens.
- Replace with real empty/error states instead of fabricated business records.

## V3-DELETE-087 - Remove non-V3 actions and dead UI states from downstream flows

Priority: P1
Layers: cleanup, UX consistency

Issue:
- Several downstream screens still expose controls or states that do not exist in the prototype and create ambiguity.

Root cause:
- Examples already confirmed on `main`:
  - SELL scan context toggle
  - embedded cart discount/customer panels
  - placeholder alert-only footer actions in inventory/report flows

Files impacted:
- `src/screens/v3/ScanScreenV3.tsx`
- `src/components/v3/CartSheetV3.tsx`
- `src/screens/v3/StockScreenV3.tsx`
- `src/screens/v3/ReportsScreenV3.tsx`
- any affected child screen introduced by wrapper-era drift

Expected outcome:
- Remove or relocate non-V3 actions and dead states so the downstream flow matches the prototype without duplicate paths or confusing affordances.

## V3-HARDEN-088 - Guarantee state persistence and back-stack safety across SELL child screens

Priority: P0
Layers: navigation, session state, business safety

Issue:
- The main operator journey now spans many child screens, but `main` does not yet prove safe return behavior across these branches.

Root cause:
- Child screens were implemented incrementally and do not share one explicit persistence contract for:
  - cart
  - current tab
  - current search query
  - scan return
  - payment completion/void

Files impacted:
- SELL root/layout state
- downstream child screens listed above
- navigation state helpers/tests

Expected outcome:
- Define and implement explicit return-state rules for every SELL child screen.
- Claude must provide runtime proof for:
  - search close/add return
  - scan continue/new-product return
  - cart back/pay return
  - success new-sale return
  - buy/store/more tab switch away and back

## V3-HARDEN-089 - Harden downstream backend/API contracts for idempotency and production safety

Priority: P0
Layers: backend, API, DB, production safety

Issue:
- Several child-screen flows now depend on multi-step create/update operations that remain vulnerable to partial failure or duplicate submission.

Root cause:
- High-risk examples already visible on `main`:
  - sale creation + payment confirmation
  - UPI initiation + manual confirmation
  - new product create + add-to-cart
  - manual inward confirmation
  - reorder approve-all

Files impacted:
- backend/payment routes and services
- product-create/catalog routes and services
- inventory/manual-inward and reorder approval routes
- supporting DB constraints/migrations if missing

Expected outcome:
- Idempotency, validation, and duplicate-submit protections are explicit for all downstream audited flows.
- Claude must document any forward migrations or API schema changes required.

## V3-HARDEN-090 - Add runtime regression coverage for every downstream screen reached from SELL

Priority: P0
Layers: QA, regression prevention

Issue:
- The base SELL click map is now defined, but downstream screen coverage is still too weak for production parity claims.

Root cause:
- Existing tests on this area are fragmented and do not prove the full child-screen chain from SELL.

Files impacted:
- `src/__tests__/screens/`
- `backend/tests/`
- `e2e-tests/tests/`

Expected outcome:
- Add runtime coverage for the downstream chain reached from SELL:
  - search
  - cart
  - voice
  - scan
  - new product
  - payment child screens
  - success
  - buy / compare / counter
  - store / grn / reorder / stock
  - more / khata / customers / finance / reports / stock / sales / settings / help action
- Claude must not claim completion without runtime proof for back flow, state persistence, and error/empty states on each audited branch.

# Main-HEAD-only Audit Addendum: MORE User-Journey Subtree from SELL

Pinned comparison baseline:
- source-of-truth prototype: `RELEASES/supermandi-pos-v3.html`
- implementation comparison point: current Claude branch `feat/v3-owner-staff-auth@c90827b90db8402a281f9b597c437592673e4057`

MORE user-journey subtree from this SELL screen:
1. `SELL -> MORE` tab
2. `MORE header gear -> Settings`
3. `MORE Today's Sales card -> Reports`
4. `MORE Udhar Pending card -> Khata`
5. `MORE Finance banner -> Credit & Finance`
6. `MORE quick access -> Khata`
7. `MORE quick access -> Customers`
8. `MORE quick access -> Reports`
9. `MORE quick access -> Stock`
10. `MORE quick access -> Sales History`
11. `MORE quick access -> Settings`
12. `MORE quick access -> Help`

Current branch comparison against the prototype:
- Already covered by existing pending tickets:
  - `V3-FIX-080` shared `Stock`
  - `V3-FIX-081` `More` hub
  - `V3-FIX-082` `Khata`
  - `V3-FIX-083` `Reports`
  - `V3-FIX-084` `Settings`
- Still missing or misrouted on the current Claude branch:
  - `CustomersScreenV3` exists but still uses `DEMO` fallback, `Alert.prompt`, and fake WhatsApp phone derivation
  - `FinanceScreenV3` exists but still mixes real API calls with hardcoded offers, fixed credit score, and alert-placeholder bill-discount actions
  - `Sales History` is not mounted as a dedicated V3 screen; `PosRootLayoutV3` incorrectly routes `sales` to `V3Reports`
  - `Help` is a dead/non-V3 route; `PosRootLayoutV3` points `help` to `Help` without a mounted V3 target
  - `MoreScreenV3` still hardcodes the Khata badge `3`; that remains within `V3-FIX-081`

## V3-FIX-091 - Bring Customers screen to exact V3 parity

Priority: P1
Layers: UI, UX, customer data, cross-platform input

Issue:
- `CustomersScreenV3` is present on the Claude branch, but it still behaves like a partial scaffold rather than the V3 customer list screen.

Root cause:
- Current implementation still uses:
  - `DEMO` fallback customer rows
  - `Alert.prompt` for `+ Add`
  - synthetic WhatsApp phone derivation from customer name text

Files impacted:
- `src/screens/v3/CustomersScreenV3.tsx`
- `src/stores/customerStore.ts`
- customer/contact APIs if a create/list/detail contract is missing

Expected outcome:
- Match the prototype customer list:
  - header with `+ Add`
  - search
  - customer rows with avatar, visit/total metadata, WhatsApp CTA, chevron
- No demo fallback customers remain in production.
- `+ Add` must be cross-platform and not rely on `Alert.prompt`.
- WhatsApp action uses real stored phone/contact data only.

## V3-FIX-092 - Bring Credit & Finance screen to exact V3 parity

Priority: P1
Layers: UI, API integration, finance feature gating

Issue:
- `FinanceScreenV3` exists on the Claude branch, but still mixes live API calls with hardcoded financial offers and placeholder actions.

Root cause:
- Current implementation still hardcodes:
  - credit score `720`
  - offer amounts and provider cards
  - alert-only bill-discount/upload flows
- It also renders a Finbox card outside the tab-specific flow.

Files impacted:
- `src/screens/v3/FinanceScreenV3.tsx`
- `src/services/api/creditApi.ts`
- any backend/feature-flag config needed for finance availability

Expected outcome:
- Match the prototype finance subtree:
  - `Offers`
  - `My Loans`
  - `Bill Discount`
  - provider cards and CTA states
- Feature-disabled states must be explicit.
- No fixed score/offer data or alert-placeholder completion remains in production paths.

## V3-FIX-093 - Implement dedicated Sales History screen and correct MORE routing

Priority: P0
Layers: navigation, UI, sales data lifecycle

Issue:
- `Sales History` is part of the prototype MORE user journey, but the current Claude branch does not implement it as a real V3 screen.

Root cause:
- `src/screens/v3/PosRootLayoutV3.tsx` currently routes:
  - `sales -> V3Reports`
- There is no mounted `V3Sales` screen/wrapper in the V3 route graph.

Files impacted:
- `src/screens/v3/PosRootLayoutV3.tsx`
- `src/screens/v3/V3ScreenWrappers.tsx`
- `App.tsx`
- new V3 sales-history screen file
- sales-history API client(s) if missing

Expected outcome:
- Tapping `Sales History` from `MORE` opens a dedicated V3 sales-history screen, not `Reports`.
- Screen matches the prototype list-style bill history:
  - bill rows
  - payment-type icon/state
  - amount
  - item/time metadata
- Back flow returns to `MORE`, not to an incorrect parent or a blank route.

## V3-HARDEN-094 - Resolve MORE `Help` into a supported V3 action or remove the dead route

Priority: P0
Layers: navigation safety, support UX, cleanup

Issue:
- `Help` is visible in the current `MORE` menu but routes to a non-V3/dead target.

Root cause:
- `src/screens/v3/PosRootLayoutV3.tsx` currently maps:
  - `help -> Help`
- There is no mounted V3 help destination in the current branch.
- The prototype shows a `Help` row but does not define a downstream `help` screen, so the product contract must be made explicit.

Files impacted:
- `src/screens/v3/PosRootLayoutV3.tsx`
- `src/screens/v3/MoreScreenV3.tsx`
- any support/help screen or support-action handler introduced
- route wiring if a real V3 help surface is added

Expected outcome:
- One explicit supported behavior exists:
  - real V3 `Help & Support` screen/action
  - or `Help` row removed until support flow is implemented
- No visible `Help` tap target can lead to a dead route.

## V3-HARDEN-095 - Add MORE subtree click-path and back-flow runtime verification

Priority: P1
Layers: QA, navigation, regression prevention

Issue:
- The downstream runtime gate currently does not force a dedicated proof for the `MORE` subtree from the main SELL journey.

Root cause:
- `MORE` has multiple overlapping paths:
  - header gear
  - stats cards
  - finance banner
  - quick-access rows
- Current branch still has route drift in this subtree.

Files impacted:
- runtime frontend tests under `src/__tests__/screens/`
- e2e flows under `e2e-tests/tests/`
- any navigation test helpers needed for the MORE subtree

Expected outcome:
- Add runtime coverage for:
  - `SELL -> MORE`
  - header gear -> `Settings`
  - today sales card -> `Reports`
  - udhar pending card -> `Khata`
  - finance banner -> `Finance`
  - quick-access rows:
    - `Khata`
    - `Customers`
    - `Reports`
    - `Stock`
    - `Sales History`
    - `Settings`
  - `Help` action or explicit absence
- Claude must provide proof that every MORE click path either lands on the correct V3 surface or is intentionally removed.

# Branch-Level Production Audit Addendum: System Readiness vs Claude Branch

Pinned comparison baseline:
- production checklist: current go-live audit request for product metadata, supplier approval, ledger integrity, auth/session, payments, WhatsApp, GCP parity, and scale
- implementation comparison point: current Claude branch `feat/v3-owner-staff-auth@bb82b1695ff35081e9cd585e58b707fb700c7e4c`

Scope note:
- Existing owner/staff auth session work is already tracked in:
  - `V3-OWNER-023`
  - `V3-POS-024`
  - `V3-SESSION-025`
  - `V3-BIZ-026`
  - `V3-REG-027`
- This addendum covers the remaining production-grade system gaps that are still open after Claude's current branch work.

Current high-risk branch findings:
- POS product caching still strips metadata that retailer web and backend already store and return.
- Supplier-catalog add and admin publish flows still bypass append-only inventory ledger guarantees in some paths.
- Supplier approval/publish state checks still drift between `ACTIVE`, `active`, and `verified`.
- A stale duplicate retailer product/import implementation still exists in `backend/services/platform-service`, with schema-unsafe logic that conflicts with the mounted monolith routes.
- POS payment/checkout frontend still contains production placeholders while backend payments/WhatsApp paths are substantially more real.

## V3-FIX-096 - Unify product metadata contract across retailer web, CSV import, supplier publish, and POS

Priority: P0
Layers: frontend, backend API, data contract, offline cache

Issue:
- Product metadata is not consistently preserved from creation/import/publish flows through to POS search, scan, list, and offline cache.

Root cause:
- Retailer-admin create/edit and CSV import already capture richer metadata, and POS backend endpoints already return richer fields, but the POS store cache still collapses products to a thin shape.
- This creates drift across retailer web, POS, and offline behavior.

Files impacted:
- `src/stores/productsStore.ts`
- `src/services/api/productsApi.ts`
- `src/services/api/sellSearchApi.ts`
- `backend/src/routes/v1/retailer-admin/products.ts`
- `backend/src/routes/v1/retailer-admin/csvImport.ts`
- `backend/src/routes/v1/pos/storeProducts.ts`

Expected outcome:
- Define one authoritative product contract that preserves, at minimum:
  - SKU
  - name
  - category/taxonomy
  - unit / sold-by / rate-unit / pack metadata
  - sell/purchase/MRP pricing
  - GST / HSN / tax fields
  - supplier linkage
  - barcode + generated SuperMandi barcode
  - image URL / brand / manufacturer / origin / net-content fields where available
- POS list/search/scan/offline cache must preserve the same metadata set instead of dropping fields during store hydration.
- Claude must add regression coverage proving that inline entry, CSV import, supplier-catalog publish, and POS retrieval all expose the same contract shape.

## V3-FIX-097 - Canonicalize supplier -> SuperAdmin -> retailer SKU publish flow

Priority: P0
Layers: business workflow, backend routes, retailer web UX

Issue:
- The supplier approval and retailer publish/add flow is still fragmented and not production-safe as one canonical SKU lifecycle.

Root cause:
- There are multiple overlapping flows:
  - supplier product approval in admin
  - retailer supplier-catalog browse/add
  - supplier/store link discovery
- Current retailer add flow is too thin and does not express a full metadata + stock onboarding review step.

Files impacted:
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `retailer-admin/src/pages/SupplierCatalogPage.tsx`
- any shared supplier/catalog service extracted to remove duplicated lifecycle logic

Expected outcome:
- One explicit lifecycle exists:
  1. supplier submits SKU with metadata
  2. SuperAdmin reviews/edits/approves SKU
  3. approved SKU becomes publishable to retailer stores
  4. retailer can add/publish SKU into store catalog with explicit review of sell price, stock seed, and supplier linkage
- Retailer web must not use a thin add flow that silently materializes incomplete store-product data.
- Claude must document the canonical state machine and remove overlapping route behavior that violates it.

## V3-FIX-098 - Centralize SuperAdmin margin control and final retailer price derivation

Priority: P0
Layers: pricing engine, admin backend, retailer catalog contracts

Issue:
- Margin application is not yet guaranteed by one canonical implementation across approval, publish, and retailer-consumed catalog data.

Root cause:
- Margin logic is currently spread across admin routes, retailer-admin supplier flows, and catalog-service support code.
- This creates risk of percentage vs fixed margin drift and inconsistent retailer purchase price output.

Files impacted:
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `backend/services/catalog-service/src/services/catalogServiceSupport.ts`
- `backend/services/catalog-service/src/services/catalogService.ts`
- any shared pricing helper introduced by the fix

Expected outcome:
- One shared pricing calculator/service handles:
  - percentage margin
  - fixed/lumpsum margin
  - precedence rules
  - rounding rules
  - final retailer-facing purchase price derivation
- Admin approve/edit/publish flows and retailer supplier-catalog responses must all use the same implementation.
- Claude must add tests proving identical output for all supported margin modes across all entry points.

## V3-FIX-099 - Make supplier-catalog add and publish flows ledger-safe

Priority: P0
Layers: inventory, ledger integrity, backend data mutations

Issue:
- Some supplier-driven store-product onboarding paths still materialize stock state without a matching append-only ledger history.

Root cause:
- Supplier-catalog add and publish flows create store-product/catalog state, and in some cases stock-balance rows, without enforcing the same ledger-first invariant used elsewhere.

Files impacted:
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- shared inventory/ledger helpers used by these routes

Expected outcome:
- Any flow that seeds opening stock, stock balance, or inventory-affecting store state must write the corresponding append-only inventory ledger entry in the same transaction.
- Flows that only publish catalog metadata without stock movement must remain explicitly non-inventory operations.
- Claude must add regression tests for:
  - supplier-catalog add with opening stock
  - admin publish with and without stock seed
  - duplicate-submit/idempotent retry behavior

## V3-DELETE-100 - Delete or quarantine stale platform-service retailer catalog routes

Priority: P0
Layers: cleanup, backend safety, deployment consistency

Issue:
- A stale duplicate retailer product/import implementation still exists in `backend/services/platform-service` and conflicts with the mounted monolith routes.

Root cause:
- The legacy `platform-service` route file still contains product/import logic with older schema assumptions, naive CSV parsing, and different mutation behavior.
- This is dangerous because environments can drift on which implementation they actually exercise.

Files impacted:
- `backend/services/platform-service/src/routes/retailerPortal.ts`
- `backend/services/platform-service/src/index.ts`
- any docs/config wiring that still advertise or mount these stale paths

Expected outcome:
- Remove the stale duplicate retailer product/import routes entirely, or quarantine them behind an explicit kill-switch with no production mount path.
- No environment may have two competing retailer product/import implementations.
- Cleanup must include:
  - route unmounting
  - stale docs/config removal
  - tests proving the canonical mounted routes are the only supported implementation

## V3-HARDEN-101 - Normalize supplier/store status enums and approval checks

Priority: P0
Layers: backend logic, migrations, business invariants

Issue:
- Supplier approval and publish logic still relies on inconsistent status values and comparisons.

Root cause:
- Current code mixes `ACTIVE`, `active`, `verified`, and legacy assumptions across approval, publish, and retailer visibility checks.
- This can cause valid suppliers/SKUs to disappear or block publish incorrectly depending on which route is hit.

Files impacted:
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `backend/src/services/supplierStateMachine.ts`
- forward migrations normalizing persisted enum/string values if required

Expected outcome:
- One canonical status vocabulary is defined for:
  - supplier verification
  - supplier active/inactive lifecycle
  - product approval/publish lifecycle
  - store/supplier link activation
- All routes use shared helpers/state-machine checks instead of ad hoc string comparisons.
- Claude must include forward migration and regression coverage for old mixed-case rows already in the database.

## V3-HARDEN-102 - Enforce append-only ledger invariants across every product/stock ingestion path

Priority: P0
Layers: DB integrity, backend services, auditability

Issue:
- Append-only stock/ledger rules are enforced in some ingestion flows, but not consistently across the entire system.

Root cause:
- Manual product creation, CSV import, supplier-catalog add, publish, and sync/update paths do not all share one invariant-enforcing ledger layer.

Files impacted:
- `backend/src/routes/v1/retailer-admin/products.ts`
- `backend/src/routes/v1/retailer-admin/csvImport.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- any inventory/ledger helper or migration required to enforce the invariant

Expected outcome:
- Ledger-first rules are formalized and reused across:
  - manual inline entry
  - CSV upload commit
  - supplier-catalog add/publish
  - stock sync/update operations
- No path may update stock balances without a matching ledger event and audit trail.
- Claude must add DB-level or service-level safeguards strong enough to catch regression even if a new route is added later.

## V3-HARDEN-103 - Productionize POS checkout, UPI, WhatsApp, and customer-share flows

Priority: P0
Layers: POS frontend, payments API, webhook/state handling, customer comms

Issue:
- Backend payment and WhatsApp capabilities exist, but the POS/frontend checkout experience still contains production placeholders and manual shortcuts.

Root cause:
- Current POS payment UI still uses placeholder QR rendering, simplified GST logic, and immediate manual UPI confirmation.
- Customer share/WhatsApp flows still rely on mixed deep-link vs server-send behavior depending on screen.

Files impacted:
- `src/screens/v3/PaymentScreenV3.tsx`
- `src/screens/v3/SuccessScreenV3.tsx`
- `src/services/billing/billShare.ts`
- `backend/src/routes/v1/pos/payments.ts`
- `backend/src/routes/v1/pos/whatsapp.ts`
- any webhook/status reconciliation path touched by the fix

Expected outcome:
- POS payment screen renders real payment artifacts returned by backend:
  - actual QR payload/URI
  - correct store-linked UPI target
  - correct payment pending/confirmed/failed states
- No fake GST math or manual-success shortcut remains in the primary checkout path.
- WhatsApp/share flows must use explicit production behavior:
  - server-backed send when configured
  - clear fallback only when server path is unavailable
- Claude must add integration/regression coverage for UPI init, confirmation, failure, and customer bill-share states.

## V3-HARDEN-104 - Add go-live parity gates for product import, supplier publish, payments, and WhatsApp

Priority: P0
Layers: deployment, config validation, CI/CD

Issue:
- Generic environment validation exists, but there is no single go-live gate proving that the business-critical flows in this audit are actually ready in target environments.

Root cause:
- Current GCP/config validation is too generic and does not explicitly block rollout when critical dependencies for import/publish/payments/WhatsApp are misconfigured.

Files impacted:
- `backend/src/startup/validateGcp.ts`
- `backend/services/api-gateway/src/config.ts`
- `scripts/gates/`
- workflow/deploy verification files under `.github/workflows/`

Expected outcome:
- Add explicit deployment/readiness gates for:
  - retailer product import
  - supplier publish/discovery
  - POS payment init/confirm
  - WhatsApp send/webhook verification
  - any required signed-upload/storage paths for product images/imports
- The gate must run in the real deploy/staging verification path, not just exist as an unreferenced script.
- Claude must document fail-fast behavior and the exact env/config assumptions required for production.

## V3-HARDEN-105 - Add scale and performance gates for SKU volume, scans, and user concurrency

Priority: P0
Layers: DB performance, POS responsiveness, load/stress validation

Issue:
- The repo has load/stress tooling, but there is no explicit go/no-go acceptance proving the system meets the declared production targets.

Root cause:
- Performance tooling exists in fragments, but not yet tied to the concrete targets required for launch:
  - 5,000+ SKUs per retailer store
  - 10,000 SKU scans/day
  - 10,000 combined supplier/retailer users

Files impacted:
- `scripts/load-tests/`
- `e2e-tests/stress/`
- relevant migrations/indexes for:
  - `catalog.store_products`
  - product barcode mappings
  - search queries
  - supplier catalog queries
- POS search/scan/cart endpoints and clients touched by resulting fixes

Expected outcome:
- Define measurable acceptance thresholds for:
  - cold/warm store catalog load
  - barcode lookup latency
  - search latency at 5k+ SKUs/store
  - scan-to-cart latency under daily scan volume
  - publish/import throughput for 1500-3000 supplier SKUs
- Add missing indexes, pagination, and cache invalidation rules required to meet those thresholds.
- Claude must produce reproducible load/stress commands and a go/no-go report format tied to these exact targets.

## V3-HARDEN-106 - Stand up executable React Native device/emulator e2e harness for V3 parity gates

Priority: P0
Layers: QA infrastructure, CI/CD, mobile test execution

Issue:
- V3 click-path parity tickets now depend on device-level execution, but the repo does not yet have an executable React Native e2e harness wired for those flows.

Root cause:
- Current repo state supports:
  - Jest code-contract tests
  - some mounted React Native screen/component tests with mocks
  - Playwright-style web e2e specs
- But the SELL-home and other V3 POS click-map specs cannot be executed end to end without a real RN test harness and running app target.

Files impacted:
- `package.json`
- `e2e-tests/`
- emulator/device runner config (Detox, Maestro, or one explicit alternative)
- CI workflow files under `.github/workflows/`
- app build/test scripts needed to boot the POS target for e2e

Expected outcome:
- Choose one supported RN e2e stack for the POS app and make it executable in this repo:
  - Detox
  - Maestro
  - or one explicit equivalent, but not multiple half-configured options
- Provide:
  - local run instructions
  - CI/emulator execution path
  - stable testIDs/accessibility hooks for V3 screens
- one passing smoke path proving the harness actually runs against the app
- `V3-HARDEN-064` and downstream click-map tickets must then run on this harness instead of remaining skipped/spec-only.

# Branch-Level Device-Fit Addendum: Multi-Device Responsive Parity for All V3 Screens

Pinned comparison baseline:
- source-of-truth prototype: `RELEASES/supermandi-pos-v3.html`
- implementation comparison point: current Claude branch `feat/v3-owner-staff-auth@bb82b1695ff35081e9cd585e58b707fb700c7e4c`

Production target:
- Every V3 screen, child screen, modal, tab, card, chip, tile, cart surface, and form must fit professionally on:
  - low-width Android phones used by retailers (`320-360dp`)
  - mainstream Android phones (`375-393dp`)
  - larger Android phones (`412-430dp`)
  - Indian handheld POS devices (`480-600dp`)
  - wider handheld POS / compact tablet devices (`600-800dp`)
- This includes real text content, longer category labels, SKU names, Hindi/English strings, dynamic badges, and real store/staff/product data.

Current branch findings already confirmed:
- SELL category chips stretch/crop on smaller widths because chip text and padding are fixed.
- `SellScreenV3` still hardcodes `numColumns={3}`, compressing tile content on narrow devices.
- `ProductTileV3` still uses fixed small text and fixed name height, which causes SKU-name breakage on smaller devices and higher font scales.
- `BrandedHeader`, bottom-nav controls, and some pills/buttons still assume one compact width profile.
- Several modals/sheets/forms still rely on fixed width/spacing assumptions that will not fit all phones and handheld POS devices cleanly.

## V3-FIX-107 - Establish supported device matrix and shared responsive layout primitives for V3

Priority: P0
Layers: design system, layout primitives, cross-screen infrastructure

Issue:
- V3 screens are still built with one assumed phone width rather than an explicit supported device matrix.

Root cause:
- Current components rely on fixed paddings, fixed text sizes, and fixed layout assumptions instead of shared responsive primitives.

Files impacted:
- shared layout/theme utilities under `src/theme/` and `src/components/ui/`
- any new hook/util introduced for screen class / width bucket detection
- `src/components/v3/`
- `src/screens/v3/`

Expected outcome:
- Define one supported responsive matrix for V3:
  - `compact-phone`
  - `phone`
  - `large-phone`
  - `handheld-pos`
  - `wide-pos`
- Introduce shared layout primitives/tokens for:
  - horizontal padding
  - grid columns
  - chip/tab sizing
  - header action spacing
  - modal max width
  - bottom-nav sizing
  - text scale limits where justified
- Claude must not keep solving each screen with isolated magic numbers.

## V3-FIX-108 - Make the entire SELL subtree device-fit across phones and handheld POS devices

Priority: P0
Layers: UI fidelity, responsive layout, POS usability

Issue:
- The main SELL operator flow still breaks visually on smaller widths and high-density handheld POS devices.

Root cause:
- Current SELL family still uses:
  - fixed 3-column grid assumptions
  - fixed chip paddings/font sizes
  - fixed tile text height
  - fixed cart-strip and header spacing

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/components/v3/ProductTileV3.tsx`
- `src/components/v3/CartSheetV3.tsx`
- `src/components/v3/CartItemRowV3.tsx`
- `src/components/v3/UniversalSearchV3.tsx`
- `src/components/v3/VoiceOverlayV3.tsx`
- `src/screens/v3/ScanScreenV3.tsx`
- `src/screens/v3/NewProductScreenV3.tsx`
- `src/screens/v3/PaymentScreenV3.tsx`
- `src/screens/v3/SuccessScreenV3.tsx`

Expected outcome:
- SELL family fits cleanly on all supported device classes:
  - search bar/header actions never clip or overflow
  - category chips remain readable, scrollable, and professionally sized
  - grid column count adapts by width
  - SKU names, brand labels, MRP/case/unit lines, and cart strip copy do not collide or truncate incorrectly
  - cart/payment/success surfaces fit within safe viewport height without awkward overflow
- Claude must verify SELL on real device-width snapshots for all supported classes.

## V3-FIX-109 - Make BUY and STORE subtrees device-fit across phones and handheld POS devices

Priority: P0
Layers: UI fidelity, inventory workflow usability

Issue:
- BUY and STORE screens still inherit fixed chip/card/grid assumptions that will break on compact phones and wider handheld POS devices.

Root cause:
- Supplier/category chips, purchase cards, reorder rows, stock tables, and GRN quantity controls were not built against an explicit responsive matrix.

Files impacted:
- `src/screens/v3/BuyScreenV3.tsx`
- `src/screens/v3/CompareScreenV3.tsx`
- `src/screens/v3/CounterPurchaseScreenV3.tsx`
- `src/screens/v3/StoreHubScreenV3.tsx`
- `src/screens/v3/GRNScreenV3.tsx`
- `src/screens/v3/ReorderScreenV3.tsx`
- `src/screens/v3/StockScreenV3.tsx`
- `src/components/v3/SupplierProductCardV3.tsx`
- `src/components/v3/PurchaseItemCardV3.tsx`

Expected outcome:
- BUY and STORE flows remain professional and usable on all supported classes:
  - chips do not stretch awkwardly
  - quantity steppers remain tappable
  - product/supplier cards do not clip metadata
  - stock and reorder rows fit without broken text or hidden CTA controls
- Claude must include width-aware layout decisions instead of one-size-fits-all card dimensions.

## V3-FIX-110 - Make auth, MORE, finance, customers, reports, settings, and all modal-driven screens device-fit

Priority: P0
Layers: UI fidelity, forms, operational usability

Issue:
- Login/auth/settings/customers/reports/finance/MORE surfaces still risk clipped text, crushed headers, and broken form/layout states on smaller phones and handheld POS devices.

Root cause:
- These screens still mix fixed spacing, placeholder-era card sizing, and modal assumptions not validated against multiple device widths.

Files impacted:
- `src/screens/v3/SplashScreenV3.tsx`
- `src/screens/v3/PhoneScreenV3.tsx`
- `src/screens/v3/OTPScreenV3.tsx`
- `src/screens/v3/StoreSelectScreenV3.tsx`
- `src/screens/v3/StaffLoginScreenV3.tsx`
- `src/screens/v3/MoreScreenV3.tsx`
- `src/screens/v3/KhataScreenV3.tsx`
- `src/screens/v3/CustomersScreenV3.tsx`
- `src/screens/v3/FinanceScreenV3.tsx`
- `src/screens/v3/ReportsScreenV3.tsx`
- `src/screens/v3/Sales*Screen*.tsx`
- `src/screens/v3/SettingsScreenV3.tsx`
- any modal/sheet components used by these flows

Expected outcome:
- Auth and MORE-family screens fit cleanly across all supported device classes:
  - titles/subtitles/buttons/input rows do not clip
  - finance/report cards remain readable
  - list rows preserve icon/text/CTA hierarchy
  - settings rows and badges do not collapse or overlap
  - modal-driven flows fit keyboard + safe-area constraints
- Claude must treat this as a full subtree sweep, not piecemeal spot fixes.

## V3-HARDEN-111 - Enforce text-fit rules for chips, tabs, headers, SKU cards, list rows, and bottom navigation

Priority: P0
Layers: typography, localization, responsive UX

Issue:
- Real text content is still not governed by one consistent fit strategy, causing stretched or clipped UI in category chips, tabs, card titles, and list rows.

Root cause:
- Current UI mixes fixed font sizes, fixed heights, and no explicit truncation/wrap policy for dynamic text.

Files impacted:
- `src/components/v3/BrandedHeader.tsx`
- `src/components/v3/BottomNavV3.tsx`
- `src/components/v3/ProductTileV3.tsx`
- `src/components/v3/UniversalSearchV3.tsx`
- `src/components/v3/CustomerTypeToggle.tsx`
- chip/tab/list-row components across `src/screens/v3/`
- `src/components/ui/AppText.tsx`

Expected outcome:
- Define and apply explicit text-fit rules:
  - single-line ellipsis where required
  - two-line clamp where appropriate
  - min/max widths for pills and chips
  - controlled font scaling for dense POS surfaces
  - no clipped labels in English or Hindi
- Category labels like `Frequent`, `Beverages`, `Bulk / Trade`, `Home Care`, long SKU names, and dynamic badges must remain visually professional on the smallest supported width.

## V3-HARDEN-112 - Harden modal, sheet, keyboard, and safe-area behavior for phones and POS devices

Priority: P0
Layers: UX, input flows, platform/device compatibility

Issue:
- Modals, bottom sheets, and keyboard-driven forms still risk overflowing or hiding actionable controls on compact Android phones and handheld POS devices.

Root cause:
- Several V3 surfaces rely on fixed modal widths/heights and do not yet share one safe-area + keyboard handling contract.

Files impacted:
- modal/sheet components under `src/components/v3/`
- `src/screens/v3/PaymentScreenV3.tsx`
- `src/screens/v3/SettingsScreenV3.tsx`
- `src/screens/v3/NewProductScreenV3.tsx`
- auth screens and any form-heavy V3 surface

Expected outcome:
- All modal/sheet/form flows fit and remain usable with:
  - Android keyboard open
  - safe-area insets
  - compact-height handheld POS devices
  - long validation/error messages
- No primary CTA, close action, or important field may be pushed off-screen without a reliable scroll path.

## V3-DELETE-113 - Remove fixed-width, fixed-height, and fixed-column layout drift that breaks responsive parity

Priority: P0
Layers: cleanup, responsive correctness

Issue:
- The current V3 implementation still contains hardcoded width/height/column decisions that cause device-fit regressions.

Root cause:
- Migration work left behind fixed assumptions such as:
  - `numColumns={3}` without width adaptation
  - fixed text heights on tiles
  - fixed chip paddings/font sizes
  - fixed modal widths that do not derive from viewport/device class

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/components/v3/ProductTileV3.tsx`
- `src/components/v3/BrandedHeader.tsx`
- `src/components/v3/BottomNavV3.tsx`
- `src/screens/v3/BuyScreenV3.tsx`
- any other V3 screen/component still using layout magic numbers incompatible with the supported matrix

Expected outcome:
- Remove hardcoded layout drift that cannot survive the supported device matrix.
- Replace one-off magic numbers with shared responsive tokens/helpers introduced in `V3-FIX-107`.
- Cleanup must not regress V3 visual fidelity on the reference width while fixing smaller/larger devices.

## V3-HARDEN-114 - Add screenshot and runtime regression matrix for all 26 V3 screens across supported device classes

Priority: P0
Layers: QA, regression prevention, release gating

Issue:
- Device-fit claims are not production-safe without repeatable proof across the supported width classes and the full 26-screen V3 surface.

Root cause:
- Current testing focuses on logic and partial screen behavior, but not a repeatable device-matrix UI fit gate for all V3 screens and sub-screens.

Files impacted:
- `e2e-tests/`
- screenshot/snapshot/regression harness for RN device classes
- CI workflow files under `.github/workflows/`
- any helper scripts/runbooks used to capture approval snapshots

Expected outcome:
- Add a release gate that captures and verifies all V3 screens across the supported device matrix, including:
  - auth screens
  - SELL family
  - BUY family
  - STORE family
  - MORE family
  - all modal/sheet states that are part of the operator journey
- Proof must include:
  - no clipped or stretched text
  - no hidden CTA controls
  - no overlapping badges/icons
  - no broken grid/list density
- Claude must not sign off responsive parity without this matrix.

# Branch-Level Auth Rollout Addendum: Phone+OTP vs Stale Enrollment Flow

Pinned comparison baseline:
- intended product flow:
  1. retailer registers on retailer web
  2. SuperAdmin approves retailer/store
  3. retailer owner logs in on POS with registered phone + OTP
  4. owner creates staff; staff logs in with PIN
- implementation comparison point: current Claude branch `feat/v3-owner-staff-auth`
- staging behavior observed during Maestro bring-up:
  - `POST /api/v1/pos/auth/send-otp` returns `401 DEVICE_UNAUTHORIZED`
  - deployed gateway/version is behind the branch auth work
  - staging database is missing OTP auth persistence/table support

Confirmed current problem:
- The app now surfaces `PhoneScreenV3` as the normal first-time POS login path.
- Staging backend/env is still behaving like the old enrollment-first model.
- This creates a false product dead-end where the user sees `DEVICE_UNAUTHORIZED` on a flow that should be `phone + OTP`.
- The old activation/enrollment flow is stale for the normal retailer-owner journey and must not be treated as the required path.

## V3-FIX-115 - Make deployed POS phone+OTP auth contract match the intended retailer flow

Priority: P0
Layers: backend API, DB, deployment parity, auth

Issue:
- The deployed environment still rejects the intended POS phone+OTP flow with `DEVICE_UNAUTHORIZED`.

Root cause:
- App/auth branch work is ahead of the deployed backend and DB state.
- The deployed backend is not yet serving the intended `/api/v1/pos/auth/*` contract for owner login.

Files impacted:
- `backend/src/routes/v1/pos/otpAuth.ts`
- `backend/src/routes/v1/index.ts`
- OTP-related migrations including `pos_otp` support
- deploy/version wiring for gateway + main backend

Expected outcome:
- `POST /api/v1/pos/auth/send-otp` and follow-up OTP verification work in staging/prod for approved retailer owners without requiring prior device enrollment.
- Required DB schema for OTP auth exists in deployed environments before the app flow is exposed.
- Claude must provide environment-backed proof, not branch-only proof.

## V3-FIX-116 - Add auth capability handshake so the app never exposes an undeployed login path

Priority: P0
Layers: app boot, API contract, rollout safety

Issue:
- The app can expose `PhoneScreenV3` even when the target backend environment is not yet ready to support owner phone+OTP login.

Root cause:
- There is no explicit compatibility/capability check gating the POS auth funnel by deployed backend readiness.

Files impacted:
- `src/screens/v3/SplashScreenV3.tsx`
- `src/screens/v3/PhoneScreenV3.tsx`
- `src/services/api/uiStatusApi.ts`
- backend ui-status/capability contract if missing

Expected outcome:
- The app boot/auth flow checks explicit backend capabilities before routing into phone+OTP.
- If the environment is not ready, the app shows an intentional rollout/incompatibility state instead of a broken `DEVICE_UNAUTHORIZED` dead-end.
- Claude must not rely on implicit trial-and-error API failures as the capability signal.

## V3-DELETE-117 - Remove stale enrollment-first assumptions from the normal owner login journey

Priority: P0
Layers: cleanup, auth UX, route ownership

Issue:
- Old enrollment-first assumptions still leak into debugging, backend behavior, and operator guidance even though they are no longer the normal product flow.

Root cause:
- Legacy device-enrollment architecture still exists in code/docs/routes and is easy to misinterpret as the required first-time owner login path.

Files impacted:
- old enrollment/deep-link docs and stale prompts
- any routing/comments/help text that imply owner must enroll device before phone+OTP
- auth decision points in V3 boot screens if they still preserve this assumption

Expected outcome:
- Normal retailer-owner POS login is explicitly `phone + OTP` after approval.
- Old enrollment flow remains only for truly separate activation/recovery cases if still needed.
- No user-facing or operator-facing guidance should tell the retailer to use stale enrollment for the standard journey.

## V3-HARDEN-118 - Add deploy smoke gates for POS OTP auth route, schema, and approval-state behavior

Priority: P0
Layers: CI/CD, staging/prod verification, regression prevention

Issue:
- The app can be built and installed while staging/prod still lacks the backend route/schema needed for the surfaced auth flow.

Root cause:
- Current rollout gates did not fail fast on:
  - missing `/api/v1/pos/auth/send-otp` behavior
  - missing OTP schema/table support
  - wrong fallback to stale `DEVICE_UNAUTHORIZED`

Files impacted:
- `scripts/gates/`
- `.github/workflows/`
- backend startup/deploy validation

Expected outcome:
- Add blocking deploy smoke checks for:
  - `/api/v1/pos/auth/send-otp`
  - OTP verify path
  - approved-owner success path
  - unapproved / unregistered / wrong-phone failure modes
  - presence/readiness of required OTP schema
- A rollout must fail before promotion if the app-exposed POS auth path is not actually live.

## V3-HARDEN-119 - Add environment/version parity proof between app build and deployed auth backend

Priority: P1
Layers: release management, observability, go-live safety

Issue:
- The Maestro/device test exposed that the installed app and the deployed backend were on incompatible auth generations, but there was no clear parity proof before testing.

Root cause:
- Current release process does not enforce or surface one clear compatibility signal between:
  - app build
  - api-gateway SHA
  - main backend SHA
  - required migration/schema state

Files impacted:
- version/build metadata surfaces
- deploy workflow/reporting
- release/runbook scripts used before device QA

Expected outcome:
- Before device QA or release sign-off, there is one explicit compatibility proof showing:
  - app build SHA/version
  - gateway SHA/version
  - backend SHA/version
  - required migration/auth capability state
- Claude must add a release/runbook check so auth failures like this are caught before manual OTP testing starts.

# Zero-Drift Execution Order: Remaining Pending Tickets After `a1dfb153`

Pinned implementation point:
- current branch checkpoint: `feat/v3-owner-staff-auth@a1dfb153`

Completed immediately before this plan:
- `V3-API-005`
- `V3-FIX-066`
- `V3-FIX-067`
- `V3-FIX-068`
- `V3-FIX-069`
- `V3-FIX-070`
- `V3-FIX-075`

Hard rule for the remaining queue:
- No merge
- No push for release purposes
- No APK release/rebuild for rollout
- No GCP/staging/prod deployment work
- No cleanup tickets before the replacement parity work for that subtree is fully landed
- No cross-cutting hardening ticket may reopen already-accepted auth funnel behavior unless a regression is proven

Current remaining queue size from this checkpoint:
- `47` tickets

Execution principle:
- Finish user-facing parity before cleanup.
- Finish cleanup before global hardening.
- Finish functional contracts before responsive/device-fit sweep.
- Finish auth rollout safety last, once the branch behavior is internally complete, but before any future release readiness claim.

## Phase 1 - Payment Route Chain Without Regressing SELL Root

Tickets:
- `V3-FIX-071`
- `V3-FIX-072`
- `V3-FIX-073`
- `V3-FIX-074`

Why first:
- `V3-FIX-075` is already done, so the remaining payment child-chain must be completed now while SELL context is still fresh.
- This phase has the highest user-journey impact and blocks clean downstream parity.

Write scope:
- payment chooser + child payment screens
- payment navigation chain
- payment APIs only where required by UI parity

Guard rails:
- Do not reopen completed SELL search/voice/scan work.
- Do not mix cleanup here.
- Keep sale identity and payment confirmation behavior stable while splitting screens.

Exit gate:
- `SELL -> payment -> cash | upi | udhar -> success` matches the V3 chain with preserved back flow and sale continuity.

## Phase 2 - BUY and STORE Core Screen Parity

Tickets:
- `V3-FIX-076`
- `V3-FIX-077`
- `V3-FIX-078`
- `V3-FIX-079`

Why second:
- BUY and STORE are separate subtrees with limited overlap with MORE and lower risk of colliding with the auth/session work.

Write scope:
- `BuyScreenV3`
- `CompareScreenV3`
- `CounterPurchaseScreenV3`
- `StoreHubScreenV3`
- `GRNScreenV3`
- `ReorderScreenV3`

Guard rails:
- Do not start delete tickets yet.
- Do not fold stock/report/settings work into this phase unless directly required by these tickets.
- Preserve already-accepted SELL root behavior.

Exit gate:
- BUY and STORE primary navigation paths match V3 without demo fallbacks or route drift.

## Phase 3 - MORE Core and Remaining MORE Subtree Parity

Tickets:
- `V3-FIX-080`
- `V3-FIX-081`
- `V3-FIX-082`
- `V3-FIX-083`
- `V3-FIX-084`
- `V3-FIX-091`
- `V3-FIX-092`
- `V3-FIX-093`
- `V3-HARDEN-094`
- `V3-HARDEN-095`

Why third:
- MORE is the most route-dense subtree.
- It should be completed as one contiguous batch to avoid partial navigation drift.

Write scope:
- `MoreScreenV3`
- `KhataScreenV3`
- `ReportsScreenV3`
- `SettingsScreenV3`
- `CustomersScreenV3`
- `FinanceScreenV3`
- sales-history routing/screen
- help action resolution

Guard rails:
- Keep MORE subtree changes isolated from system-audit tickets.
- Resolve route ownership before cleanup.
- Add runtime proof for MORE click paths before any delete work touches dead routes.

Exit gate:
- Every MORE entry point from SELL lands on a correct V3 target or is intentionally removed with proof.

## Phase 4 - Safe Cleanup Only After Replacement Parity Is In Place

Tickets:
- `V3-DELETE-085`
- `V3-DELETE-086`
- `V3-DELETE-087`

Why fourth:
- These tickets remove wrapper-era drift and demo/legacy data.
- Doing them earlier would create regression risk while downstream screens are still moving.

Write scope:
- route aliases
- wrapper drift
- demo/fallback data
- non-V3 actions/states

Guard rails:
- No delete-first behavior.
- Every deletion must point to the now-landed replacement path.
- Provide grep-backed proof and runtime verification after each delete commit.

Exit gate:
- No orphan route, demo source, or non-V3 downstream action remains in the completed subtrees.

## Phase 5 - Cross-Screen Hardening for State, Idempotency, and Downstream Runtime Safety

Tickets:
- `V3-HARDEN-088`
- `V3-HARDEN-089`
- `V3-HARDEN-090`

Why fifth:
- These depend on the downstream screens already being stable.

Write scope:
- navigation persistence
- backend/API idempotency for audited child flows
- runtime regression coverage for downstream screens

Guard rails:
- No new user-facing flow changes unless required to close a verified edge case.
- Harden existing flows; do not redesign them.

Exit gate:
- Downstream screen chain has explicit persistence/back-flow rules, idempotent APIs, and runtime regression proof.

## Phase 6 - Production System Audit Block

Tickets:
- `V3-FIX-096`
- `V3-FIX-097`
- `V3-FIX-098`
- `V3-FIX-099`
- `V3-DELETE-100`
- `V3-HARDEN-101`
- `V3-HARDEN-102`
- `V3-HARDEN-103`
- `V3-HARDEN-104`
- `V3-HARDEN-105`

Why sixth:
- This is the first branch-wide production contract sweep.
- It should not run while screen parity work is still shifting.

Write scope:
- product metadata contract
- supplier/SuperAdmin/retailer SKU lifecycle
- pricing engine
- ledger invariants
- stale platform-service removal
- checkout/payments/WhatsApp
- deploy readiness gates
- scale/perf acceptance

Guard rails:
- One subsystem at a time; do not mix unrelated migrations and UI work in the same commit.
- Prefer shared service extraction over route-by-route duplication.

Exit gate:
- Product, supplier, ledger, payment, and scale contracts are canonicalized and no stale duplicate implementation remains.

## Phase 7 - Device-Fit and Responsive Sweep Across the Full V3 Surface

Tickets:
- `V3-FIX-107`
- `V3-FIX-108`
- `V3-FIX-109`
- `V3-FIX-110`
- `V3-HARDEN-111`
- `V3-HARDEN-112`
- `V3-DELETE-113`
- `V3-HARDEN-114`

Why seventh:
- Responsive work should happen after functional parity is stable, otherwise layout churn masks real product drift.

Write scope:
- shared responsive primitives
- SELL/BUY/STORE/MORE/auth screen fit
- chip/text/tab/header sizing
- modal/keyboard/safe-area behavior
- screenshot/device-matrix regression gates

Guard rails:
- No new business logic changes here unless required to unblock fit.
- Preserve accepted V3 visual hierarchy while adapting for device classes.

Exit gate:
- All 26 V3 screens and required modal states fit the supported device matrix without clipped or stretched text.

## Phase 8 - Auth Rollout Safety and Release-Parity Guards

Tickets:
- `V3-FIX-115`
- `V3-FIX-116`
- `V3-DELETE-117`
- `V3-HARDEN-118`
- `V3-HARDEN-119`

Why last:
- These tickets are specifically about preventing undeployed auth behavior from being exposed.
- They should be finalized after branch behavior is otherwise stable, but before any future release readiness summary.

Write scope:
- POS owner phone+OTP contract
- capability handshake
- stale enrollment-first cleanup
- deploy smoke gates
- version/build/backend parity proof

Guard rails:
- No deployment execution in this phase.
- This phase is code + gates + proof only.
- Do not claim release readiness on completion; it only makes future rollout safe.

Exit gate:
- The branch can no longer surface a broken phone+OTP path without explicit capability mismatch handling and release parity proof.

## V3-FIX-120 - Canonicalize add-to-cart payloads from tap, search, voice, and scan into one editable SELL cart contract

Priority: P0
Layers: SELL UX, cart state, API payload integrity

Issue:
- Products can enter the SELL cart from multiple paths, but the branch still risks entry-point drift in what product metadata is preserved once the item reaches cart and checkout.

Root cause:
- Tile tap, search selection, voice confirm, and scan continue paths do not all guarantee the same canonical cart-line payload for:
  - product identity
  - barcode
  - unit / pack size
  - brand
  - price
  - tax / GST context
  - variant/global/store product references

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/components/v3/UniversalSearchV3.tsx`
- `src/components/v3/VoiceOverlayV3.tsx`
- `src/screens/v3/ScanScreenV3.tsx`
- `src/stores/cartStore.ts`
- any shared cart-add helper introduced by the fix

Expected outcome:
- `tap -> add`
- `search -> select -> add`
- `voice -> add`
- `scan -> continue -> add`
all create the same canonical editable cart line with the same authoritative product metadata and stable identity.

## V3-FIX-121 - Implement production-grade cart line edit/hold flow for qty, price, discount, and product metadata

Priority: P0
Layers: cart UX, SELL flow, pricing controls

Issue:
- The SELL cart still lacks one production-grade edit contract for a retailer to inspect and adjust a cart line before payment.

Root cause:
- Cart editing remains fragmented between line-level quantity controls, older discount assumptions, and screen-specific shortcuts.
- There is no single V3-safe edit surface for:
  - quantity
  - price override where allowed
  - discount
  - product notes / batch / product-linked metadata shown in cart
  - hold / resume-safe draft preservation

Files impacted:
- `src/components/v3/CartSheetV3.tsx`
- `src/stores/cartStore.ts`
- `src/screens/v3/SellScreenV3.tsx`
- `src/screens/v3/PaymentScreenV3.tsx`
- any draft/hold helper touched by the fix

Expected outcome:
- Retailer can edit a cart line safely before payment.
- Draft cart state preserves edits on hold/resume/back flows.
- Every visible edit stays consistent across SELL, cart, payment, and success handoff.

## V3-HARDEN-122 - Make cart edits flow into final sale, ledger, and sync contracts without draft/commit corruption

Priority: P0
Layers: POS backend, sales API, ledger integrity, offline/sync

Issue:
- Cart edits are only useful if the exact edited commercial state is what gets committed into the final sale and append-only audit trail.

Root cause:
- Draft cart state, sale creation payloads, offline sale queueing, and downstream ledger events are not yet explicitly hardened around edited line data.
- There is still risk that:
  - edited price/discount metadata is lost at checkout
  - draft edits mutate inventory/ledger too early
  - synced sales commit a different commercial payload than the retailer saw

Files impacted:
- `src/stores/cartStore.ts`
- `src/services/api/posApi.ts`
- offline sale helpers under `src/services/offline/`
- `backend/src/routes/v1/pos/sales.ts`
- `backend/src/routes/v1/pos/sync.ts`
- any inventory/sale-item ledger helper touched by the fix

Expected outcome:
- Draft cart edits remain draft-only until sale commit.
- On payment completion, final sale rows, sale items, stock effects, khata entries, and append-only ledger/audit artifacts reflect the exact edited cart state.
- Offline sync preserves the same committed result without duplication or silent normalization.

## V3-FIX-123 - Make POS UPI checkout generate the consumer QR from the exact retailer store UPI address

Priority: P0
Layers: POS checkout UX, payments API, backend payment init

Issue:
- UPI checkout still risks placeholder QR behavior and contract drift between what the store configured and what the consumer scans.

Root cause:
- Current POS UPI path still needs one canonical store-linked contract proving that:
  - the QR is built from the retailer store’s exact active UPI address
  - the amount matches the committed sale total
  - the displayed target and backend payment payload are the same source of truth

Files impacted:
- `src/screens/v3/UpiScreenV3.tsx`
- `src/services/api/posApi.ts`
- `backend/src/routes/v1/pos/sales.ts`
- `backend/src/routes/v1/pos/payments.ts`
- any payment-service helper used to build the UPI intent / QR payload

Expected outcome:
- Once a product reaches cart and the retailer selects UPI, the consumer-facing QR is generated from the exact active store UPI address and exact payable amount.
- No placeholder QR, stale UPI target, or mismatched payment amount remains.

## V3-FIX-124 - Add POS Settings parity for retailer-owned store UPI address management

Priority: P0
Layers: POS settings UI, owner permissions, store settings API

Issue:
- Retailer owner must be able to view/add/update the store UPI address directly from the POS app.

Root cause:
- POS settings still mixes placeholder payment configuration with partial store-settings behavior.

Files impacted:
- `src/screens/v3/SettingsScreenV3.tsx`
- `src/services/api/uiStatusApi.ts`
- `src/services/api/apiClient.ts`
- `backend/src/routes/v1/pos/store.ts`
- any POS settings state/store touched by the fix

Expected outcome:
- POS owner can add/update the store UPI address from POS settings.
- Validation, save state, permission handling, and post-save refresh are production-grade.
- The saved UPI address is the same one consumed by POS UPI checkout.

## V3-FIX-125 - Add retailer-web parity for owner-managed store UPI address configuration

Priority: P0
Layers: retailer-admin UI, settings API, owner permissions

Issue:
- Retailer web must expose the same production-grade store UPI configuration path as POS.

Root cause:
- Store settings parity across surfaces is still uneven, and UPI configuration cannot rely on only one entry surface.

Files impacted:
- `retailer-admin/src/pages/SettingsPage.tsx`
- retailer-admin settings API helpers/hooks used by that page
- `backend/src/routes/v1/retailer-admin/settings.ts`

Expected outcome:
- Retailer owner can add/update the active store UPI address from retailer web settings.
- The value, validation rules, error states, and persisted result stay aligned with POS settings and checkout.

## V3-FIX-126 - Add SuperAdmin store-level UPI address management parity with proper override/audit behavior

Priority: P1
Layers: SuperAdmin UI, admin API, store governance

Issue:
- SuperAdmin also needs a production-grade store UPI management path for support, correction, and activation workflows.

Root cause:
- Admin store/settings surfaces exist, but UPI ownership/edit behavior is not yet normalized across owner and admin flows.

Files impacted:
- `supermandi-superadmin/src/tabs/StoresTab.tsx`
- `supermandi-superadmin/src/api/stores.ts`
- `backend/src/routes/v1/admin/stores.ts`
- `backend/src/routes/v1/admin/settings.ts`

Expected outcome:
- SuperAdmin can view/add/update a store UPI address with explicit audit-safe behavior.
- Admin edits do not create a second conflicting source of truth.
- Owner-facing surfaces reflect the same canonical store UPI value after refresh/sync.

## V3-HARDEN-127 - Canonicalize store UPI schema, validation, permissions, migrations, and cross-surface sync

Priority: P0
Layers: DB, migrations, API contracts, authz, sync

Issue:
- POS, retailer web, SuperAdmin, and checkout cannot be production-grade unless one canonical store UPI contract governs schema, validation, and propagation.

Root cause:
- UPI data currently risks being treated as a settings field in multiple places without one explicit lifecycle for:
  - source-of-truth storage
  - validation format
  - permission boundaries
  - audit timestamps / actor attribution
  - sync to POS runtime state

Files impacted:
- `backend/src/routes/v1/pos/store.ts`
- `backend/src/routes/v1/retailer-admin/settings.ts`
- `backend/src/routes/v1/admin/stores.ts`
- `backend/src/routes/v1/admin/settings.ts`
- any shared settings/store helper
- forward migrations if required

Expected outcome:
- One canonical store UPI schema and validation contract exists.
- POS owner, retailer owner, and SuperAdmin edit the same underlying store UPI record under correct permission rules.
- POS runtime state refreshes cleanly after changes from any surface.

## V3-DELETE-128 - Remove duplicate placeholder payment-config and scattered store-UPI write paths after canonical UPI contract lands

Priority: P1
Layers: cleanup, settings drift, payments drift

Issue:
- Once the canonical store UPI contract is implemented, stale placeholder fields and duplicate write paths will become regression risks.

Root cause:
- Legacy/placeholder payment settings code still exists across POS and admin surfaces.

Files impacted:
- any old placeholder payment-config UI in POS settings
- any duplicate retailer-admin/admin store-UPI write helper superseded by the canonical contract
- stale docs/tests that still describe conflicting UPI ownership behavior

Expected outcome:
- Only one production write path per surface remains.
- No placeholder `store@upi` style state or conflicting helper remains in live code.

## V3-HARDEN-129 - Add end-to-end regression coverage for cart edits, ledger commit, store UPI settings, and UPI checkout routing

Priority: P0
Layers: runtime tests, backend tests, e2e, release safety

Issue:
- The new cart-edit and store-UPI cross-surface work is too high-risk to leave covered only by shallow contract tests.

Root cause:
- This flow spans:
  - SELL add-to-cart entry points
  - cart edit state
  - sale commit
  - ledger/audit output
  - UPI settings mutation
  - UPI checkout generation

Files impacted:
- `src/__tests__/`
- `backend/tests/`
- `retailer-admin/src/__tests__/`
- `supermandi-superadmin/src/__tests__/`
- `e2e-tests/tests/`

Expected outcome:
- Runtime and contract coverage prove:
  - add-to-cart metadata is consistent across tap/search/voice/scan
  - cart edits survive hold/resume and commit correctly
  - final sale/ledger state matches edited cart state
  - changing store UPI from POS, retailer web, or SuperAdmin updates the same canonical value
  - consumer-facing UPI checkout always uses the exact active retailer store UPI address

## Phase 9 - Cart Edit Integrity and Store UPI Address Parity

Tickets:
- `V3-FIX-120`
- `V3-FIX-121`
- `V3-HARDEN-122`
- `V3-FIX-123`
- `V3-FIX-124`
- `V3-FIX-125`
- `V3-FIX-126`
- `V3-HARDEN-127`
- `V3-DELETE-128`
- `V3-HARDEN-129`

Why ninth:
- This block cuts across SELL, cart, checkout, ledger, POS settings, retailer web, SuperAdmin, and payment routing.
- It must come after the payment-route split is stable, but before any production-readiness claim.

Write scope:
- SELL add-to-cart contract across all entry paths
- cart edit/hold flow
- sale/ledger commit integrity for edited cart lines
- store UPI configuration across POS, retailer-admin, and SuperAdmin
- UPI QR/payment routing from canonical store UPI data
- regression coverage for the full path

Guard rails:
- No deployment work in this phase.
- No new fake QR, placeholder payment values, or local-only settings writes.
- Do not let draft cart edits mutate stock/ledger before final sale commit.

## V3-HARDEN-130 - Enforce store isolation across store catalog, supplier catalog, ledger, settings, and search surfaces

Priority: P0
Layers: UI/UX, navigation, API authz, backend queries, DB constraints, migrations, GCP parity

Issue:
- The repo still lacks one explicit production ticket that proves store-scoped data isolation across:
  - POS store products
  - digitized onboarding products
  - supplier catalog exposure
  - store search
  - settings/payment state
  - store ledger and sales history

Root cause:
- Several parity tickets already harden individual flows, but there is no single isolation audit/fix ticket ensuring one store never sees or mutates another store’s operational data, and that supplier/global catalog data does not leak into store-owned search/results/contracts by accident.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/screens/v3/BuyScreenV3.tsx`
- `src/components/v3/UniversalSearchV3.tsx`
- `src/services/api/sellSearchApi.ts`
- `src/services/api/suppliersApi.ts`
- `backend/src/routes/v1/pos/storeProducts.ts`
- `backend/src/routes/v1/pos/sales.ts`
- `backend/src/routes/v1/retailer-admin/products.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- any shared authz/store helper or forward migration needed to enforce store scoping
- deploy/readiness checks touched by the fix

Expected outcome:
- Store-owned operational data is always store-scoped.
- Supplier/global catalog data is exposed only through explicitly separated supplier/discovery surfaces.
- No cross-store, cross-catalog, or cross-tenant leakage remains in UI, navigation, API responses, ledger state, or cached/offline datasets.

## V3-FIX-131 - Separate store-product search and supplier-catalog search into isolated UX and API contracts

Priority: P0
Layers: search UX, navigation, API design

Issue:
- Store digitized products and supplier-listed catalog products can still collide conceptually in search, making retailer search results ambiguous and operationally risky.

Root cause:
- Search flows are still being improved for parity, but there is not yet one explicit contract that says:
  - store search is for sellable/in-stock/store-owned products
  - supplier catalog search is for procurement/discovery products
  - the two result sets must never be mixed into one ambiguous operator list

Files impacted:
- `src/components/v3/UniversalSearchV3.tsx`
- `src/screens/v3/SellScreenV3.tsx`
- `src/screens/v3/BuyScreenV3.tsx`
- `src/services/api/sellSearchApi.ts`
- `src/services/api/suppliersApi.ts`
- `backend/src/routes/v1/pos/storeProducts.ts`
- `backend/src/routes/v1/pos/suppliers.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`

Expected outcome:
- Store-product search and supplier-catalog search are fully isolated in UI, routing intent, and API response shape.
- A retailer searching store inventory sees only store products.
- A retailer searching procurement/supplier catalog sees only supplier/discovery results.
- No ambiguous blended result list remains in production paths.

## V3-FIX-132 - Add multilingual multi-key search support for SKU, barcode, product, supplier, brand, and quantity terms

Priority: P0
Layers: search UX, indexing, API query behavior, localization

Issue:
- Search still is not explicitly ticketed to support the full set of retailer lookup behaviors required for kirana operations.

Root cause:
- Existing search parity tickets focus on screen fidelity and result wiring, but not on one production-grade search contract for:
  - SKU
  - barcode
  - product name
  - supplier name
  - brand
  - Hindi / English terms
  - quantity / pack-size / unit cues

Files impacted:
- `src/components/v3/UniversalSearchV3.tsx`
- `src/screens/v3/BuyScreenV3.tsx`
- `src/services/api/sellSearchApi.ts`
- `src/services/api/suppliersApi.ts`
- `backend/src/routes/v1/pos/storeProducts.ts`
- `backend/src/routes/v1/pos/suppliers.ts`
- any search/index helper or forward migration needed for performant lookup

Expected outcome:
- Both store search and supplier-catalog search support easier lookup by the real operator parameters above.
- Hindi/English and barcode/SKU/brand/supplier queries behave predictably.
- Search remains fast at the SKU volumes already covered by scale tickets.

## V3-HARDEN-133 - Define and enforce the inventory ledger event matrix for stock credit, debit, sold, unsold, and delivery states

Priority: P0
Layers: ledger logic, backend business rules, DB auditability, retailer/POS sync

Issue:
- The system still needs one explicit production ticket defining exactly when stock is credited or debited and how that maps to payment and delivery states.

Root cause:
- Ledger invariants are already ticketed broadly, but the business event timing is not yet expressed as one auditable matrix across:
  - inline product creation
  - CSV import
  - supplier publish/add
  - GRN / delivered stock
  - opening stock
  - sale completion
  - payment modes cash / UPI / udhar
  - void/refund/cancel behavior

Files impacted:
- `backend/src/routes/v1/pos/sales.ts`
- `backend/src/routes/v1/pos/sync.ts`
- `backend/src/routes/v1/retailer-admin/products.ts`
- `backend/src/routes/v1/retailer-admin/csvImport.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- any shared inventory/ledger service and forward migration touched by the fix

Expected outcome:
- One canonical event matrix defines:
  - when stock is added
  - when stock is reserved vs not reserved
  - when stock is debited
  - when a sale is considered sold for ledger purposes
  - how cash/UPI/udhar affect commercial state vs stock movement
  - how unsold/cancelled/voided/refunded states reverse or preserve ledger entries
- Retailer web and POS reflect the same stock/ledger truth after sync.

## V3-HARDEN-134 - Define product metadata ownership and bidirectional sync rules across retailer web, POS, CSV, supplier publish, and SuperAdmin edits

Priority: P0
Layers: product data governance, sync, API contracts, UI consistency

Issue:
- Product metadata consistency is already ticketed, but the repo still lacks one explicit ownership/sync ticket for who is allowed to edit which metadata and how those edits propagate across all surfaces.

Root cause:
- Metadata can originate from:
  - retailer web inline entry
  - retailer web CSV import
  - supplier catalog listing
  - SuperAdmin review/edit
  - POS edits
- Without one canonical ownership/sync rule, the same field can drift or be overwritten unexpectedly.

Files impacted:
- `backend/src/routes/v1/retailer-admin/products.ts`
- `backend/src/routes/v1/retailer-admin/csvImport.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/src/routes/v1/pos/storeProducts.ts`
- `src/stores/productsStore.ts`
- `retailer-admin/src/pages/SupplierCatalogPage.tsx`
- any metadata-sync helper/service introduced by the fix

Expected outcome:
- One field-ownership matrix defines:
  - which metadata is supplier-owned
  - which metadata SuperAdmin can override
  - which metadata retailer can edit locally
  - which metadata POS can edit and sync back to retailer web
- Retailer web and POS always converge on the same final store-product metadata after edits/imports/sync.
- SuperAdmin edits and publish actions propagate cleanly without silent field regression.

## Phase 10 - Store Isolation, Search Semantics, and Ledger Event Governance

Tickets:
- `V3-HARDEN-130`
- `V3-FIX-131`
- `V3-FIX-132`
- `V3-HARDEN-133`
- `V3-HARDEN-134`

Why tenth:
- These are system-governance tickets that sit above individual screens.
- They close the remaining production gaps around tenant isolation, search correctness, and ledger timing that are not fully covered by the earlier parity and scale blocks.

Write scope:
- store/catalog isolation
- store search vs supplier search separation
- multilingual/multi-key search semantics
- inventory ledger event timing
- metadata ownership and bidirectional sync governance

Guard rails:
- No deployment execution in this phase.
- No new blended search experience that mixes store and supplier results.
- No metadata overwrite path without an explicit ownership rule.

## V3-FIX-135 - Change SELL in-store SKU tiles from one-tap add to one-tap detail-first with explicit add

Priority: P0
Layers: SELL UX, navigation, cart behavior, screen density

Operator-approved behavior:
- Single tap on an in-store SKU tile must open a compact detail-first surface.
- The tile tap must no longer add directly to the sell cart.
- Add-to-cart must happen only from an explicit CTA inside the detail surface.

Issue:
- The current SELL operator flow still binds tile tap directly to `handleAddProduct(...)`, which causes accidental cart adds and prevents the retailer from reviewing full product details first.

Root cause:
- `SellScreenV3` currently optimizes for direct tile add instead of a dense-grid + detail-first workflow.
- `ProductTileV3` accessibility and interaction still describe tile tap as add-to-cart behavior.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/components/v3/ProductTileV3.tsx`
- any new `SellProductDetail*` surface introduced for this flow
- `src/stores/cartStore.ts`
- SELL click-path/runtime tests

Expected outcome:
- SELL home keeps maximum SKU density on screen.
- Single tap on a tile opens a product detail screen/sheet/modal with:
  - top-level fast `Add to Cart` CTA for repeated/familiar purchases
  - product image/icon
  - full product name
  - brand
  - SKU / barcode
  - unit / pack / MRP / sell price / tax metadata
  - stock context where appropriate
  - explicit `Add to Cart` again after the detailed metadata/action section
  - explicit close/back
- No accidental add occurs on tile tap.
- Return from detail preserves SELL scroll/chip/search/cart state.

## V3-FIX-136 - Change supplier-catalog SKU cards to detail-first add flow with explicit add-to-purchase-cart

Priority: P0
Layers: BUY UX, supplier discovery, procurement cart behavior

Operator-approved behavior:
- Retailer must see supplier product details before adding to purchase cart.
- Single tap on a supplier SKU card must open the detail surface.
- Add-to-purchase-cart must happen only from an explicit CTA inside the detail surface.

Issue:
- Supplier discovery currently still exposes inline add behavior on supplier SKU cards, which lets a retailer add to purchase cart without reviewing full procurement details first.

Root cause:
- `SupplierProductCardV3` still keeps inline quantity/add controls on the card while also supporting card tap navigation.
- The current card shape mixes browse, compare, and add behaviors into one dense card contract.

Files impacted:
- `src/screens/v3/BuyScreenV3.tsx`
- `src/components/v3/SupplierProductCardV3.tsx`
- `src/screens/v3/CompareScreenV3.tsx` or a replacement detail surface if compare becomes the canonical detail page
- procurement cart/order state touched by the fix
- BUY runtime tests

Expected outcome:
- Supplier catalog keeps maximum SKU visibility on screen.
- Single tap on supplier SKU card opens the detail-first procurement surface showing:
  - top-level fast `Add to Purchase Cart` CTA for repeated/familiar procurement
  - supplier/product metadata
  - pricing / PTR / PTS / case / MOQ / margin / schemes
  - stock/suggested quantity context
  - explicit quantity selection
  - explicit `Add to Purchase Cart` / order CTA again after the detailed metadata/action section
- Inline add from the list card is removed from the main browsing surface.
- No accidental procurement-cart add occurs from a list-card tap.

## V3-HARDEN-137 - Unify detail-first product-discovery contract across SELL and BUY without reducing SKU density or breaking back flows

Priority: P0
Layers: UX architecture, navigation, responsive behavior, regression safety

Issue:
- SELL and BUY now need one explicit operator-safe contract for dense browsing + detail-first review, otherwise the app will drift into inconsistent list interactions and regressions.

Root cause:
- Current code mixes:
  - direct add on SELL tile tap
  - detail + inline add on BUY cards
  - compare-specific procurement flows
- There is no explicit rule for when a card tap should open detail vs add vs compare.

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/screens/v3/BuyScreenV3.tsx`
- `src/components/v3/ProductTileV3.tsx`
- `src/components/v3/SupplierProductCardV3.tsx`
- `src/screens/v3/CompareScreenV3.tsx`
- any new shared product-detail surface or navigation helper
- responsive/device-fit tests under the V3 matrix

Expected outcome:
- Dense SKU browsing remains intact on both SELL and BUY.
- Card/tile tap semantics are consistent:
  - tap = open details
  - explicit CTA inside details = add
- Detail surfaces must support both:
  - a top fast-add CTA for low-friction repeat purchase
  - a bottom/post-details CTA for operators who review full metadata first
- Back/close from details returns to the same list context without losing:
  - scroll position
  - selected supplier/category/chip
  - search state
  - cart/purchase-cart state
- Detail surfaces fit the supported phone/POS device matrix.

## V3-DELETE-138 - Remove stale one-tap-add assumptions, labels, and tests after detail-first flow lands

Priority: P1
Layers: cleanup, accessibility, regression prevention

Issue:
- After detail-first behavior is implemented, stale text, labels, and tests that still describe tile/card tap as direct add will become a regression risk.

Root cause:
- Current code and tests still encode direct-add assumptions such as:
  - SELL tile accessibility copy
  - old click-path assertions
  - BUY card inline-add main-list assumptions

Files impacted:
- `src/components/v3/ProductTileV3.tsx`
- `src/components/v3/SupplierProductCardV3.tsx`
- SELL/BUY runtime tests
- any docs or comments that still state tile tap directly adds to cart

Expected outcome:
- No live code, accessibility label, runtime test, or doc still claims:
  - SELL tile tap directly adds to cart
  - supplier list-card tap directly adds to purchase cart
- Cleanup happens only after the replacement detail-first behavior is proven.

## Phase 11 - Detail-First Dense SKU Browsing for SELL and BUY

Tickets:
- `V3-FIX-135`
- `V3-FIX-136`
- `V3-HARDEN-137`
- `V3-DELETE-138`

Why eleventh:
- This is an operator-approved interaction change that cuts across SELL and BUY browsing behavior.
- It should land after the current parity/governance blocks are understood, because it changes tap semantics on the two highest-frequency product discovery surfaces.

Write scope:
- SELL in-store product details before add
- BUY supplier product details before add
- dense SKU visibility preservation
- back-flow and state-persistence safety
- cleanup of old one-tap-add assumptions

Guard rails:
- Do not reduce SKU density by permanently expanding cards inline.
- Do not allow implicit add on tile/card tap after this phase lands.
- Keep add explicit inside the detail surface only.

## Commit Strategy Across All Remaining Phases

Rule set:
- Prefer one ticket per commit.
- Allow tightly coupled pairs only when they share one write set and one user-visible surface.
- Never combine:
  - cleanup + new feature
  - responsive sweep + backend/migration work
  - auth rollout safety + unrelated UI parity
- Run the smallest relevant tests before each commit where practical.

## Regression-Proof Completion Rule

The branch must not be called:
- merge-ready
- deploy-ready
- APK-ready
- GCP-ready
- production-ready

until all sixteen phases above are complete and re-verified against `tickets.md`.

## Phase 12 - Supplier Catalogue as SuperMandi Principal B2B Procurement

Scope lock approved by operator:
- All supplier-catalogue purchases must run as:
  - `supplier -> SuperMandi -> retailer`
- Retailer-facing BUY catalogue must behave as a SuperMandi procurement lane, not direct supplier checkout.
- Counter Purchase remains open as a separate direct-local procurement lane for retailer-entered/manual inward.
- No mixed cart, invoice, ledger, or settlement contract may cross these two lanes.

## V3-FIX-139 - Gate supplier catalogue participation behind KYC, GST, bank, and fulfillment readiness in supplier portal

Priority: P0
Layers: supplier portal UX, supplier auth/compliance API, backend readiness rules

Issue:
- Supplier catalogue participation is not yet explicitly gated by one production-grade readiness contract before supplier SKUs can enter the SuperMandi principal procurement lane.

Root cause:
- Supplier onboarding, KYC, GST, bank details, dispatch address, and operational readiness are spread across existing supplier flows, but there is no single approved gate that blocks:
  - SKU submission
  - publish eligibility
  - procurement-order acceptance
until the supplier can legally and operationally sell to SuperMandi.

Files impacted:
- `supplier-portal/src/app/(dashboard)/kyc/page.tsx`
- `supplier-portal/src/app/(dashboard)/dashboard/page.tsx`
- `supplier-portal/src/lib/api.ts`
- `backend/src/routes/v1/supplier/kyc.ts`
- `backend/src/routes/v1/supplier/profile.ts`
- `backend/src/routes/v1/supplier/dashboard.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/migrations/060_supplier_bank_kyc.sql`
- any new supplier-readiness helper/service touched by the fix

Expected outcome:
- Supplier cannot submit/publish catalogue SKUs or fulfill procurement orders until KYC, GSTIN, bank/payout details, dispatch address, and agreement acceptance are complete.
- Supplier portal clearly shows readiness blockers and approval state.
- SuperAdmin sees the same readiness truth before approving catalogue participation.

Override requirement:
- Claude must first inspect the existing supplier readiness/KYC flows in code, then override or replace conflicting readiness logic in place.
- Do not add a parallel readiness path beside the current one.

## V3-FIX-140 - Implement supplier SKU intake lifecycle with mandatory GST/wholesale metadata and review states

Priority: P0
Layers: supplier portal UX, CSV/import API, backend validation, catalog intake

Issue:
- Supplier product intake still needs one explicit principal-procurement contract for inline and CSV listing with the metadata needed for SuperMandi resale and GST compliance.

Root cause:
- Existing supplier listing flows are present, but the approved operating model now requires every catalogue SKU to carry a complete wholesale metadata packet before SuperAdmin review:
  - supplier SKU
  - product name / brand / category
  - HSN
  - GST %
  - unit / pack / case / MOQ
  - barcode
  - image
  - supplier base price
  - stock / lead time

Files impacted:
- `supplier-portal/src/app/(dashboard)/products/page.tsx`
- `supplier-portal/src/__tests__/pages/dashboard/products.test.tsx`
- `backend/src/routes/v1/supplier/products.ts`
- `backend/services/supplier-service/src/routes/products.ts`
- `backend/services/catalog-service/src/services/mappingService.ts`
- `backend/migrations/032_supplier_extended_fields.sql`
- `backend/migrations/131_t063_supplier_product_barcode_unique.sql`
- `backend/migrations/194_supplier_sku_capacity.sql`
- any CSV/import helper touched by the fix

Expected outcome:
- Supplier can add/edit SKUs inline or via CSV only with the mandatory wholesale/GST metadata required for resale by SuperMandi.
- SKU lifecycle states are explicit:
  - `Draft`
  - `Submitted`
  - `Changes Requested`
  - `Approved`
  - `Published`
  - `Paused`
- Missing GST/HSN/pack/MOQ/barcode-critical fields block submission.

Override requirement:
- Claude must inspect the current supplier inline/CSV listing paths first and override conflicting schema, validation, and lifecycle behavior in the existing flow.
- Do not create a second SKU-submission contract that coexists with the old one.

## V3-FIX-141 - Add SuperAdmin review, metadata override, principal-sale pricing, and publish controls for supplier catalogue SKUs

Priority: P0
Layers: SuperAdmin UI, admin API, pricing/publish service, business rules

Issue:
- SuperAdmin still needs one canonical commercialization surface for converting approved supplier SKUs into SuperMandi principal-sale catalogue entries.

Root cause:
- Review/edit/approve flows exist in parts, but the approved model now requires SuperAdmin to decide and persist:
  - `billing_model = SUPERMANDI_PRINCIPAL`
  - supplier visible / hidden
  - margin mode `%`, fixed, or both
  - margin basis per unit / pack / case
  - publish targets by store/region

Files impacted:
- `supermandi-superadmin/src/tabs/CatalogTab.tsx`
- `supermandi-superadmin/src/api/catalog.ts`
- `backend/src/routes/v1/admin/catalog.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/src/routes/v1/catalog.ts`
- `backend/migrations/192_admin_margin_control.sql`
- any pricing-rule/publish helper touched by the fix

Expected outcome:
- SuperAdmin can review, fully edit, approve, price, and publish supplier SKUs as SuperMandi-sold catalogue entries.
- Supplier-catalogue SKUs cannot publish in this lane without `SUPERMANDI_PRINCIPAL`.
- Publish targets, pricing rules, supplier visibility, and audit history are stored explicitly.

Override requirement:
- Claude must inspect the current SuperAdmin catalog/review/publish code first and override conflicting commercialization logic in the existing path.
- Do not layer a new publish model beside older direct-supplier assumptions.

## V3-FIX-142 - Make retailer BUY catalogue a SuperMandi-principal procurement lane isolated from Counter Purchase

Priority: P0
Layers: POS BUY UX, retailer-admin order UX, navigation, purchase-cart behavior

Issue:
- Retailer procurement UX still risks blending supplier-catalogue ordering with direct/local counter purchase behavior.

Root cause:
- BUY, Compare, Counter Purchase, and store inward flows have been evolving independently, but the approved operating model now requires:
  - supplier-catalogue buying to be presented as buying from SuperMandi
  - Counter Purchase to remain a separate direct-local inward lane
  - no mixed cart/order semantics across the two

Files impacted:
- `src/screens/v3/BuyScreenV3.tsx`
- `src/screens/v3/CompareScreenV3.tsx`
- `src/screens/v3/CounterPurchaseScreenV3.tsx`
- `src/stores/purchaseCartStore.ts`
- `src/stores/purchaseDraftStore.ts`
- `src/services/api/catalogApi.ts`
- `src/services/api/suppliersApi.ts`
- `retailer-admin/src/pages/PurchaseOrdersPage.tsx`
- any shared purchase-lane helper introduced by the fix

Expected outcome:
- Retailer BUY catalogue clearly shows the SuperMandi principal procurement lane.
- Catalogue detail/cart/checkout flow never behaves like direct supplier checkout.
- Counter Purchase stays available for direct local/manual inward only.
- No mixed purchase cart can contain both catalogue-principal items and counter-purchase direct items.

Override requirement:
- Claude must inspect the current BUY, Compare, Counter Purchase, and purchase-cart code first and override conflicting interaction/order-lane behavior in place.
- Do not leave an alternate direct-supplier catalogue checkout path live after the change.

## V3-FIX-143 - Build supplier fulfillment UX around SuperMandi procurement orders with staged retailer disclosure and no retailer-directory access

Priority: P0
Layers: supplier portal UX, supplier orders API, privacy/operational controls

Issue:
- Supplier still needs a trustworthy fulfillment surface that proves orders are genuine without giving broad retailer-directory access.

Root cause:
- The principal-sale catalogue model requires supplier interaction to be anchored around SuperMandi procurement orders, not unrestricted retailer discovery.

Files impacted:
- `supplier-portal/src/app/(dashboard)/orders/page.tsx`
- `supplier-portal/src/app/(dashboard)/invoices/page.tsx`
- `supplier-portal/src/lib/api.ts`
- `backend/src/routes/v1/supplier/orders.ts`
- `backend/src/routes/v1/supplier/invoices.ts`
- `backend/src/routes/v1/admin/documents.ts`
- any supplier-order visibility helper touched by the fix

Expected outcome:
- Supplier sees SuperMandi procurement orders, not a browseable retailer/customer list.
- Pre-acceptance view shows only operationally necessary order details.
- Post-acceptance disclosure is limited to what is needed for dispatch/invoicing into SuperMandi, not free-form retailer contact harvesting.
- Supplier can accept, reject, part-accept, upload invoice, and mark dispatch from one production-grade flow.

Override requirement:
- Claude must inspect the current supplier order/invoice visibility flows first and override any broader retailer-disclosure behavior in the existing implementation.
- Do not add a new restricted view while leaving the old unrestricted access path available.

## V3-FIX-144 - Orchestrate retailer purchase checkout into linked SuperMandi sales orders and supplier procurement orders

Priority: P0
Layers: checkout API, backend orchestration, order state machine, retailer/supplier/admin visibility

Issue:
- The approved principal-sale catalogue lane needs one canonical order-orchestration contract linking retailer checkout to upstream supplier procurement without manual drift.

Root cause:
- Current procurement/order behavior is spread across BUY/cart/GRN flows and older supplier routes, but there is no explicit end-to-end linkage rule for:
  - retailer order to SuperMandi
  - upstream procurement order to supplier
  - shared order state/event history

Files impacted:
- `src/screens/v3/BuyScreenV3.tsx`
- `src/services/api/suppliersApi.ts`
- `backend/src/routes/v1/pos/suppliers.ts`
- `backend/src/routes/v1/supplier/orders.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/services/order-service/src/services/grnService.ts`
- any purchase-order orchestration service/state-machine helper introduced by the fix

Expected outcome:
- Retailer checkout from BUY creates a SuperMandi retailer-facing purchase order and a linked supplier-facing procurement order.
- SuperAdmin, supplier portal, retailer POS, and retailer web all see the same linked order truth with stable references.
- Order splitting by supplier/region/fulfillment constraints is handled centrally and audibly.

Override requirement:
- Claude must inspect the current checkout/order-creation/orchestration path first and override conflicting order-linking behavior in the existing code.
- Do not introduce a parallel procurement-order generator beside the live path.

## V3-FIX-145 - Generate, store, download, and WhatsApp the dual-document chain: supplier invoice to SuperMandi and SuperMandi tax invoice to retailer

Priority: P0
Layers: invoice UX, document API, PDF generation, WhatsApp dispatch, storage

Issue:
- The approved model requires two document chains for catalogue purchases, but invoice/document behavior is not yet explicitly locked to that principal-sale flow.

Root cause:
- Existing invoice services and screens exist, but the end-to-end B2B principal model requires:
  - supplier invoice `supplier -> SuperMandi`
  - retailer tax invoice `SuperMandi -> retailer`
  - immutable storage
  - POS/web download
  - automatic WhatsApp dispatch logs

Files impacted:
- `backend/src/services/invoiceService.ts`
- `backend/src/services/invoicePdfService.ts`
- `backend/src/routes/v1/supplier/invoices.ts`
- `backend/src/routes/v1/admin/invoices.ts`
- `backend/src/routes/v1/admin/whatsapp.ts`
- `retailer-admin/src/__tests__/InvoicesPage.test.tsx`
- `supplier-portal/src/app/(dashboard)/invoices/page.tsx`
- `src/screens/v3/StoreHubScreenV3.tsx`
- any document download/share helper introduced by the fix

Expected outcome:
- For every completed catalogue procurement transaction:
  - supplier can upload/view the supplier invoice to SuperMandi
  - SuperMandi generates the retailer invoice
  - retailer can download the retailer invoice from POS and retailer web
  - WhatsApp dispatch to the right parties is logged and retry-safe
- Invoice PDF and JSON artifacts are immutable and versioned.

Override requirement:
- Claude must inspect the current invoice/document/WhatsApp flow first and override conflicting document ownership or dispatch behavior in the existing code.
- Do not leave an older direct-supplier retailer-invoice path active for catalogue purchases.

## V3-HARDEN-146 - Enforce append-only ledger, GRN gating, and event-state truth for the principal procurement lane

Priority: P0
Layers: stock ledger, procurement ledger, GRN, sync, auditability

Issue:
- Principal-sale catalogue procurement must not mutate stock or financial truth at the wrong event boundary.

Root cause:
- The approved model now requires one explicit event contract:
  - retailer stock increases only on `GRN_CONFIRMED`
  - catalogue checkout does not directly increase stock
  - procurement/invoice/dispatch/grn/settlement states must remain append-only and auditable

Files impacted:
- `src/screens/v3/GRNScreenV3.tsx`
- `src/stores/inwardStore.ts`
- `backend/src/routes/v1/pos/sales.ts`
- `backend/src/routes/v1/pos/sync.ts`
- `backend/src/routes/v1/admin/grnAlerts.ts`
- `backend/src/services/grnAlertNotificationService.ts`
- `backend/services/order-service/src/services/grnService.ts`
- `backend/migrations/186_sup_pos_grn_tables.sql`
- any procurement-ledger helper touched by the fix

Expected outcome:
- Principal-lane stock enters retailer inventory only after GRN confirmation.
- Procurement, invoice, dispatch, GRN, and settlement events are append-only and reconstructable.
- Counter Purchase direct inward remains isolated and does not share ledger identity with catalogue-principal procurement.

Override requirement:
- Claude must inspect the current GRN, stock-ledger, inward, and procurement event flows first and override conflicting event timing or mixed-ledger behavior in place.
- Do not add a second ledger interpretation beside the existing one.

## V3-HARDEN-147 - Add schema, migration, and data-governance support for principal procurement, dual invoices, and document dispatch

Priority: P0
Layers: DB schema, migrations, data integrity, audit governance

Issue:
- The approved principal-sale catalogue lane needs an explicit schema/migration ticket so order, invoice, and document behavior does not remain implicit or partially reused from older flows.

Root cause:
- Existing migrations cover pieces of suppliers, GRN, margin control, and invoices, but there is no single ticket guaranteeing the final schema for:
  - supplier readiness
  - principal-sale publish state
  - linked retailer/procurement orders
  - dual invoices
  - immutable document storage refs
  - dispatch logs

Files impacted:
- `backend/migrations/134_t069_invoice_system_schema.sql`
- `backend/migrations/135_t070_product_invoice_config.sql`
- `backend/migrations/186_sup_pos_grn_tables.sql`
- `backend/migrations/192_admin_margin_control.sql`
- any new forward migration added for principal-procurement linkage/document storage
- `backend/packages/common/src/types/catalog.types.ts`
- `backend/packages/common/src/types/supplier.types.ts`

Expected outcome:
- Schema supports the approved business flow without overloading legacy direct-supplier catalogue assumptions.
- All new tables/columns/constraints/indexes are forward migrations only.
- Types and DB constraints enforce:
  - linked order references
  - invoice ownership
  - immutable document pointers
  - publish/commercial model integrity

Override requirement:
- Claude must inspect the existing supplier/catalog/invoice/GRN schema first and extend or replace conflicting structures deliberately through forward migrations.
- Do not preserve contradictory legacy schema semantics if they block the approved principal-sale flow.

## V3-HARDEN-148 - Add GCP parity, worker/storage readiness, and release gates for principal procurement and B2B document delivery

Priority: P0
Layers: deployment, cloud config, async workers, release gating, observability

Issue:
- This principal-sale catalogue lane is not production-safe unless cloud/runtime readiness proves that order orchestration, PDFs, and WhatsApp delivery are actually live in the deployed environment.

Root cause:
- Current parity gating does not yet explicitly fail deployment when:
  - published catalogue checkout cannot create the linked upstream/downstream orders
  - invoice PDF generation is down
  - document storage bucket is misconfigured
  - WhatsApp dispatch/webhook is broken
  - GRN cannot close the principal procurement loop

Files impacted:
- `.github/workflows/deploy.yml`
- `scripts/gates/`
- `backend/src/startup/validateGcp.ts`
- supplier/superadmin/retailer env examples touched by the fix
- any async worker or storage config path used by invoice/document delivery

Expected outcome:
- Deployment is blocked unless the principal procurement lane passes environment and post-deploy smoke gates.
- GCP/runtime readiness proves:
  - catalogue SKU visible to retailer
  - retailer checkout creates linked orders
  - supplier invoice upload works
  - retailer invoice generation works
  - PDF/doc storage works
  - WhatsApp dispatch works
  - GRN completes the stock event safely

Override requirement:
- Claude must inspect the current deploy gates, env validation, and worker/storage setup first and override conflicting readiness assumptions in the live release path.
- Do not bolt on optional checks while older permissive gates still allow a broken principal-procurement deployment through.

## V3-DELETE-149 - Remove direct-supplier catalogue checkout assumptions while preserving Counter Purchase direct procurement

Priority: P1
Layers: cleanup, navigation safety, business-rule consistency

Issue:
- Legacy or partial code paths can still make supplier-catalogue buying behave like direct supplier checkout, which now conflicts with the approved principal-sale model.

Root cause:
- Older supplier/discovery/procurement flows evolved before the current scope lock:
  - supplier-catalogue purchase must be principal-sale
  - direct supplier purchase remains only in Counter Purchase

Files impacted:
- `src/screens/v3/BuyScreenV3.tsx`
- `src/screens/v3/CounterPurchaseScreenV3.tsx`
- `src/services/api/suppliersApi.ts`
- `backend/src/routes/v1/pos/suppliers.ts`
- `backend/src/routes/v1/catalog.ts`
- supplier/admin docs or tests that still describe catalogue purchase as direct supplier checkout

Expected outcome:
- No live catalogue purchase path still behaves or documents itself as direct supplier checkout.
- Counter Purchase direct procurement remains available and clearly separated.
- Cleanup lands only after the replacement principal-sale flow is working end to end.

Override requirement:
- Claude must inspect the existing direct-supplier catalogue assumptions first and remove or replace them only after verifying the principal-sale replacement path.
- Do not keep hidden fallback routes, stale docs, or dormant API branches that preserve the old model.

## Phase 12 - Ticket Set

Tickets:
- `V3-FIX-139`
- `V3-FIX-140`
- `V3-FIX-141`
- `V3-FIX-142`
- `V3-FIX-143`
- `V3-FIX-144`
- `V3-FIX-145`
- `V3-HARDEN-146`
- `V3-HARDEN-147`
- `V3-HARDEN-148`
- `V3-DELETE-149`

Why twelfth:
- This is an operator-approved business-model lock for supplier-catalogue procurement.
- It converts catalogue purchase into a principal-sale B2B lane while preserving Counter Purchase as the only direct-local retailer procurement path.

Guard rails:
- Do not allow supplier-catalogue SKUs to bypass SuperMandi as seller of record in this phase.
- Do not break Counter Purchase direct inward while cleaning up catalogue assumptions.
- Do not mix catalogue-principal and counter-purchase-direct carts, orders, invoices, or ledger identities.

## V3-HARDEN-150 - Prove portal-scale UX and interaction stability at 10k-SKU retailer stores and 5k-SKU supplier catalogs

Priority: P0
Layers: POS UI/UX, retailer web UX, supplier portal UX, SuperAdmin UX, responsive performance

Issue:
- The current scale tickets do not explicitly prove that all operator-facing surfaces remain usable and crash-free when catalog sizes reach the approved business targets.

Root cause:
- Existing performance tickets focus on backend/load thresholds, but not on end-to-end UI behavior across:
  - POS app with 10,000+ store SKUs
  - retailer web with 10,000+ store SKUs
  - supplier portal with 5,000+ supplier SKUs
  - SuperAdmin review/publish screens across very large SKU queues

Files impacted:
- `src/screens/v3/SellScreenV3.tsx`
- `src/screens/v3/BuyScreenV3.tsx`
- `src/screens/v3/StockScreenV3.tsx`
- `src/components/v3/ProductTileV3.tsx`
- `retailer-admin/src/pages/ProductsPage.tsx`
- `retailer-admin/src/pages/SupplierCatalogPage.tsx`
- `supplier-portal/src/app/(dashboard)/products/page.tsx`
- `supermandi-superadmin/src/tabs/CatalogTab.tsx`
- any shared pagination/virtualization/search helper introduced by the fix

Expected outcome:
- All four operator surfaces remain usable with:
  - 10,000+ SKUs in a retailer store
  - 5,000+ SKUs in one supplier catalog
- No surface tries to eagerly render the full dataset at once.
- Pagination, virtualization, search narrowing, and filter behavior are production-grade on low-end Indian POS/mobile devices and web laptops/desktops.
- Claude must provide reproducible UX/perf proof for list load, scroll, filter, and open-detail behavior at these dataset sizes.

Override requirement:
- Claude must inspect the current list/grid/table rendering paths first and override conflicting eager-load or non-virtualized behavior in place.
- Do not leave old full-render paths alive behind alternate routes or hidden flags.

## V3-HARDEN-151 - Build the canonical supplier-catalog publication/distribution contract for 1000 suppliers and 1M+ aggregate SKU visibility

Priority: P0
Layers: catalog publication logic, SuperAdmin controls, supplier-catalog distribution, API design

Issue:
- The repo does not yet explicitly define how SuperMandi will publish and expose catalogue SKUs when supplier count and aggregate SKU volume become very large.

Root cause:
- Existing tickets cover individual supplier SKU approval and principal-sale publication, but not the large-scale distribution model where:
  - each supplier may have ~1,000 SKUs
  - total supplier count may approach ~1,000
  - retailer-visible procurement catalog may need to expose 10,000+ published SKUs safely

Files impacted:
- `backend/src/routes/v1/admin/catalog.ts`
- `backend/src/routes/v1/catalog.ts`
- `backend/services/catalog-service/src/services/catalogService.ts`
- `backend/services/catalog-service/src/services/searchService.ts`
- `backend/services/catalog-service/src/routes/catalog.ts`
- `supermandi-superadmin/src/tabs/CatalogTab.tsx`
- `src/services/api/catalogApi.ts`
- `src/services/api/suppliersApi.ts`
- any publication-indexing/distribution helper or migration introduced by the fix

Expected outcome:
- One explicit publication/distribution contract exists for:
  - supplier submission
  - SuperAdmin approval
  - principal-sale publication
  - retailer-store-targeted catalogue exposure
- Retailer POS/retailer web do not load a naive global mega-catalog.
- Publication to stores is targetable, indexable, and queryable without full-table scans.
- Claude must document and implement the scaling model for:
  - per-supplier SKU volumes
  - per-store published SKU subsets
  - aggregate supplier catalogue growth

Override requirement:
- Claude must inspect the current catalogue publication/exposure logic first and override conflicting “load everything” or globally blended catalog assumptions in the existing code.
- Do not add a second publication model beside the live one.

## V3-HARDEN-152 - Add DB/index/cache/migration capacity gates for 10k-SKU stores, 5k-SKU suppliers, and 1000-supplier catalog scale

Priority: P0
Layers: DB schema, indexes, query planning, cache design, forward migrations

Issue:
- Current schema and index tickets do not yet form one explicit capacity contract for the approved SKU and supplier scale.

Root cause:
- Individual migrations exist for catalog growth, but the system still lacks a single production-grade audit/fix ticket covering:
  - store-product lookup at 10k+ SKUs/store
  - supplier SKU lookup at 5k+ SKUs/supplier
  - published-catalog search across large supplier aggregates
  - GRN/order/invoice joins under catalogue growth

Files impacted:
- `backend/migrations/132_t065_catalog_scalability_indexes.sql`
- `backend/migrations/194_supplier_sku_capacity.sql`
- `backend/services/catalog-service/src/db/queries.ts`
- `backend/services/catalog-service/src/cache/redis.ts`
- `backend/src/routes/v1/pos/storeProducts.ts`
- `backend/src/routes/v1/pos/suppliers.ts`
- `backend/src/routes/v1/admin/catalog.ts`
- any new forward migration, materialized index, cache table, or query helper introduced by the fix

Expected outcome:
- Query/index/cache design is explicitly proven for:
  - 10,000+ SKUs per retailer store
  - 5,000+ SKUs per supplier
  - 1,000 suppliers with large aggregate catalog volume
- Required indexes, pagination cursors, cache keys, invalidation rules, and migration-safe constraints are defined and implemented.
- Claude must provide concrete query-plan/load evidence, not just code changes.

Override requirement:
- Claude must inspect the current query/index/cache paths first and extend or replace conflicting structures through forward migrations and live query changes.
- Do not preserve contradictory legacy query paths that bypass the new capacity contract.

## V3-HARDEN-153 - Add end-to-end crash-free load gates for 10k+ users, 10k-SKU stores, 10k scans/day, and multi-portal concurrency

Priority: P0
Layers: load testing, concurrency, API stability, mobile/web crash resistance, observability

Issue:
- The repo still lacks one end-to-end go/no-go gate proving that the full platform remains stable under the combined business targets across portals and POS flows.

Root cause:
- Existing scale ticket `V3-HARDEN-105` is too general for the now-approved combined target model:
  - 10,000+ users across supplier + retailer operations
  - 10,000+ SKUs/store in retailer operational surfaces
  - 10,000 scans/day on POS
  - large-scale catalogue browsing/publishing across supplier, SuperAdmin, retailer web, and POS

Files impacted:
- `scripts/load-tests/`
- `e2e-tests/stress/`
- `.github/workflows/`
- `backend/src/startup/validateGcp.ts`
- cloud dashboards/alert config checked via repo automation if present
- any portal/POS stress harness introduced by the fix

Expected outcome:
- One reproducible end-to-end stress/capacity suite proves:
  - POS does not crash or hang under high SKU count and scan volume
  - retailer web handles 10k+ store SKUs
  - supplier portal handles 5k+ supplier SKUs
  - SuperAdmin can review/publish large queues without unusable latency
  - backend and GCP services remain within defined error/latency budgets at 10k+ user concurrency targets
- Claude must produce a go/no-go checklist with measurable thresholds and fail conditions.

Override requirement:
- Claude must inspect the current load/stress tooling first and extend the live harnesses/gates instead of creating disconnected one-off scripts.
- Do not leave the older generic scale gate as the only blocking signal if it does not measure these approved targets.

## Phase 13 - High-Scale Multi-Portal Capacity and Stability

Tickets:
- `V3-HARDEN-150`
- `V3-HARDEN-151`
- `V3-HARDEN-152`
- `V3-HARDEN-153`

Why thirteenth:
- The business now explicitly requires multi-portal scale safety, not just single-surface parity.
- This phase proves that retailer POS, retailer web, supplier portal, SuperAdmin, DB, and GCP can all sustain the approved SKU/user/catalog volumes without crashes or silent degradation.

Guard rails:
- Do not treat partial backend benchmarks as a full-platform capacity sign-off.
- Do not certify portal scale until POS, retailer web, supplier portal, and SuperAdmin each have explicit acceptance evidence.
- Do not rely on local-only dev performance; all final acceptance must include deploy/GCP-ready capacity gates.

## V3-FIX-154 - Canonicalize automatic category formation into one taxonomy-assignment contract for store digitisation, manual product create, and supplier-catalog add/publish

Priority: P0
Layers: taxonomy logic, retailer web, POS/store onboarding, supplier publish flow, backend API

Issue:
- Automatic category formation exists only in fragments today, so the same product reaches store catalog through different paths with inconsistent category outcomes.

Root cause:
- Store digitisation already assigns `taxonomy_id` using `catalog.assign_taxonomy_by_name(...)` with an application fallback in `autoCategorization.ts`.
- Manual retailer product create accepts a `categoryId` override.
- But supplier-catalog add/publish flows still rely on raw text `sp.category` and currently insert `catalog.store_products` without a canonical `taxonomy_id` assignment.

Files impacted:
- `backend/src/services/storeProductDigitisationService.ts`
- `backend/src/utils/autoCategorization.ts`
- `backend/src/routes/v1/retailer-admin/products.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/src/routes/v1/catalog.ts`
- `backend/migrations/027_store_products_taxonomy.sql`
- any new shared taxonomy-assignment helper introduced by the fix

Expected outcome:
- One canonical category-formation contract is used for all store-entry paths:
  - store digitisation / onboarding
  - retailer manual product create
  - supplier-catalog add to store
  - admin publish of supplier products to stores
- The contract must resolve to one explicit outcome:
  - matched `taxonomy_id`
  - or explicit uncategorized state
- Raw supplier text categories can inform mapping, but store-facing category truth must be `taxonomy_id`, not free-form strings.

Override requirement:
- Claude must inspect the existing category/taxonomy logic first and override conflicting text-category-only behavior in the current add/publish flows.
- Do not leave supplier-catalog add/publish as a second uncategorized path beside digitisation.

## V3-HARDEN-155 - Preserve category identity correctly for repeated purchase of the same item while assigning category safely for true new SKUs

Priority: P0
Layers: product identity, store-product mapping, supplier-product mapping, repeat procurement safety

Issue:
- The system does not yet explicitly define how category behaves when the retailer repeatedly buys the same item versus when a genuinely new SKU enters the store.

Root cause:
- Repeated procurement currently resolves through a mix of:
  - `supplier_product_map`
  - store barcode bindings
  - existing `catalog.products` linkage
- But there is no explicit rule proving:
  - same mapped item keeps its existing store category/taxonomy
  - manual store override is preserved
  - truly new SKU gets a fresh category assignment
  - near-duplicate name/barcode cases do not silently fork category identity

Files impacted:
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/src/services/storeProductDigitisationService.ts`
- `backend/services/catalog-service/src/services/mappingService.ts`
- `backend/src/routes/v1/retailer-admin/products.ts`
- any product-identity or taxonomy-reconciliation helper introduced by the fix

Expected outcome:
- Repeated purchase of the same mapped store item preserves the existing `taxonomy_id`.
- If the retailer manually changed category earlier, repeated supplier procurement must not silently overwrite that override.
- A truly new SKU gets category assignment through the canonical contract from `V3-FIX-154`.
- Duplicate/near-duplicate identity paths must be explicit:
  - same SKU/barcode/master-product -> preserve category
  - new SKU/variant -> assign category anew

Override requirement:
- Claude must inspect the current repeated-add and publish identity paths first and override conflicting “always insert / always remap” behavior in place.
- Do not let repeated purchases keep re-deciding category for already-classified store items.

## V3-HARDEN-156 - Propagate category truth end to end across retailer web, POS, SuperAdmin, supplier metadata, and category chips with uncategorized governance

Priority: P0
Layers: UI consistency, API contracts, admin governance, sync, taxonomy UX

Issue:
- Even with automatic assignment, category will still drift unless all surfaces agree on how category truth is stored, shown, and corrected.

Root cause:
- Current code mixes:
  - supplier text `category`
  - store `taxonomy_id`
  - manual `categoryId` overrides
  - POS category-chip rendering from `catalog.fmcg_taxonomy`
- There is no explicit governance ticket for:
  - how uncategorized items are surfaced
  - how SuperAdmin or retailer corrects bad category assignment
  - how those corrections sync back without breaking store-specific overrides

Files impacted:
- `backend/src/routes/v1/catalog.ts`
- `backend/src/routes/v1/retailer-admin/products.ts`
- `backend/src/routes/v1/admin/catalog.ts`
- `src/services/api/catalogApi.ts`
- `src/screens/v3/SellScreenV3.tsx`
- `src/screens/v3/BuyScreenV3.tsx`
- `retailer-admin/src/pages/ProductsPage.tsx`
- `supermandi-superadmin/src/tabs/CatalogTab.tsx`
- any uncategorized review/correction flow or migration introduced by the fix

Expected outcome:
- Category truth is consistent across:
  - retailer web product tables/forms
  - POS category chips and product filters
  - SuperAdmin review/edit surfaces
  - supplier-catalog published products
- Uncategorized items are visible through an explicit review bucket, not silently buried.
- Correction rules are explicit:
  - store-local override where allowed
  - global/admin correction where required
  - sync behavior back to published/store views without clobbering legitimate store-local overrides

Override requirement:
- Claude must inspect the existing category display/filter/edit flows first and override conflicting raw-text or mixed-source category behavior in the live paths.
- Do not leave one surface using taxonomy and another using stale text categories as parallel truths.

## Phase 14 - Automatic Category Formation and Repeated-Procurement Taxonomy Governance

Tickets:
- `V3-FIX-154`
- `V3-HARDEN-155`
- `V3-HARDEN-156`

Why fourteenth:
- Automatic category formation is now a distinct cross-layer business rule with repeat-procurement implications.
- This phase closes the gap between store digitisation, supplier catalogue publish/add, repeated purchase identity, and POS/web/admin category presentation.

Guard rails:
- Do not let supplier-catalog add/publish create uncategorized store products when a canonical mapping path exists.
- Do not overwrite retailer/store category overrides on repeated purchase of the same item.
- Do not treat raw supplier text category as the final POS/store category truth.

## V3-FIX-157 - Canonicalize HID scanner, mobile camera, and manual barcode entry into one scan-intent contract across SELL, supplier-catalog procurement, and Counter Purchase

Priority: P0
Layers: POS scan UX, device input handling, navigation, scan intent routing, barcode identity

Issue:
- The current code still treats scan mostly as a thin barcode-entry helper, so HID scanner, mobile camera, and manual entry do not yet share one explicit business contract across the three approved scan intents:
  - SELL
  - supplier-catalog procurement
  - Counter Purchase direct inward

Root cause:
- `ScanScreenV3` currently acts as a modal entry layer with `sell`, `stock_in`, and `new_product` contexts, but it does not yet express:
  - supplier-catalog procurement scan intent as a first-class path
  - camera vs HID parity guarantees
  - one canonical duplicate/terminator/debounce/error policy for all scan devices
- `CounterPurchaseScreenV3` and SELL still keep separate barcode-entry assumptions outside one unified scan-intent contract.

Files impacted:
- `src/screens/v3/ScanScreenV3.tsx`
- `src/screens/v3/V3ScreenWrappers.tsx`
- `src/screens/v3/CounterPurchaseScreenV3.tsx`
- `src/screens/v3/SellScreenV3.tsx`
- `src/services/hidScannerService.ts`
- any new shared scan-intent/router helper introduced by the fix

Expected outcome:
- One canonical scan-intent contract exists for:
  - `sell_scan`
  - `supplier_catalog_procurement_scan`
  - `counter_purchase_scan`
- HID scanner, mobile camera, and manual barcode entry resolve through the same intent pipeline:
  - normalized barcode
  - resolved product identity
  - duplicate suppression
  - success/failure side effect
  - explicit next action
- Edge cases are explicitly handled:
  - partial scans
  - duplicate same-barcode bursts
  - scan terminators / trailing newline / tab
  - wrong active context
  - product found vs not found
  - offline scan behavior

Override requirement:
- Claude must inspect the current scan entry points first and override conflicting live scan behavior in place.
- Do not leave separate ad hoc HID and camera rules spread across SELL, Counter Purchase, and wrapper code.
- Existing conflicting scan code must be updated, replaced, or deleted so production has one live behavior only.
- Do not keep legacy scanner branches, hidden fallback handlers, or duplicate scan side-effect paths that can conflict after release.

## V3-HARDEN-158 - Define repeated-vs-new supplier-catalog scan behavior with edited product-field propagation for procurement lane

Priority: P0
Layers: procurement identity, product metadata, edit persistence, principal procurement UX, backend contracts

Issue:
- The approved supplier-catalog procurement lane still lacks one precise scan business rule for what happens when the retailer scans a product for purchase and the product is:
  - already repeatedly procured before
  - newly procured for the first time
  - edited by the retailer/operator before confirming purchase

Root cause:
- Phase 12 principal procurement locks the business model, but the scan contract is not yet explicit for:
  - repeated supplier-catalog SKU purchase via scan
  - true new SKU purchase via scan
  - which editable fields are local/store-specific vs catalog-derived
  - whether edited fields update draft only, order line only, store product only, or catalog truth

Files impacted:
- `src/screens/v3/BuyScreenV3.tsx`
- `src/screens/v3/CompareScreenV3.tsx`
- `src/stores/purchaseCartStore.ts`
- `src/stores/purchaseDraftStore.ts`
- `backend/src/routes/v1/pos/suppliers.ts`
- `backend/src/routes/v1/admin/suppliers.ts`
- `backend/services/catalog-service/src/services/mappingService.ts`
- any procurement-scan helper, mutation contract, or migration introduced by the fix

Expected outcome:
- Supplier-catalog procurement scan explicitly distinguishes:
  - repeated mapped store/catalog item
  - new-to-store but known catalog SKU
  - genuinely new/unmapped SKU edge case
- Edited fields have explicit propagation rules:
  - draft-only
  - order-line snapshot
  - store-local override
  - catalog/admin truth
- Repeated purchase of the same supplier-catalog SKU does not silently fork product identity or metadata.
- Procurement scan never mutates canonical catalog truth from POS-side edits without an approved override flow.

Override requirement:
- Claude must inspect the current procurement, mapping, and edit-persistence logic first and override conflicting repeated/new scan assumptions in place.
- Do not leave a parallel “scan purchase” identity model beside the approved procurement lane.
- Existing procurement-scan code must be updated, replaced, or deleted where needed so production does not contain two conflicting repeated/new purchase models.
- Do not preserve silent legacy metadata-write paths that can diverge from the approved edited-field propagation contract.

## V3-HARDEN-159 - Define repeated-vs-new Counter Purchase scan behavior with edited product-field persistence and ledger-safe manual inward semantics

Priority: P0
Layers: Counter Purchase UX, manual inward identity, metadata edits, ledger sync, supplier linkage

Issue:
- Counter Purchase still needs one explicit scan business rule for:
  - repeated local/direct purchases of known items
  - first-time local/direct purchases of new items
  - operator-edited product fields before inward confirmation

Root cause:
- `CounterPurchaseScreenV3` now handles known vs new items better, but the business contract is still not fully locked for:
  - when a repeated barcode should hydrate prior purchase/store metadata
  - which edits become permanent store metadata
  - which edits remain invoice/draft snapshot only
  - how supplier linkage and inward ledger truth are preserved after edits

Files impacted:
- `src/screens/v3/CounterPurchaseScreenV3.tsx`
- `src/components/v3/PurchaseItemCardV3.tsx`
- `src/services/api/inventoryApi.ts`
- `backend/src/routes/v1/retailer-admin/suppliers.ts`
- `backend/src/routes/v1/retailer-admin/products.ts`
- `backend/src/services/storeProductDigitisationService.ts`
- any inward-mutation, repeat-hydration, or field-governance helper introduced by the fix

Expected outcome:
- Counter Purchase scan explicitly distinguishes:
  - repeated known store product
  - known product with no prior purchase history
  - true new/manual product
- Edited fields are governed explicitly:
  - purchase-only snapshot fields
  - store-product master fields
  - ledger snapshot fields
  - tax/invoice fields
- Repeated Counter Purchase does not create silent duplicate store products when barcode/product identity already exists.
- Manual edits before confirm do not break ledger, tax, or supplier linkage semantics.

Override requirement:
- Claude must inspect the existing Counter Purchase scan, edit, and inward-save paths first and override conflicting live behavior in place.
- Do not keep a second silent fallback path that treats edited new items as if they were authoritative existing products.
- Existing Counter Purchase scan and inward-save code must be updated, replaced, or deleted where needed so production has one authoritative direct-inward behavior.
- Do not leave old save paths, duplicate barcode resolution rules, or hidden edit-persistence branches that can conflict after deployment.

## V3-FIX-160 - Canonicalize SELL HID and camera scan-to-cart behavior for printed store barcodes and physically picked store products

Priority: P0
Layers: SELL scan UX, cart identity, barcode lookup, in-store sales behavior, scanner hardware

Issue:
- SELL scanning still lacks one explicit production-grade rule for the two real sales cases:
  - scanning printed store/PDF barcodes tied to store SKUs
  - scanning physical products already present in store inventory

Root cause:
- `ScanScreenV3`, `SellScreenV3`, `productsStore`, and cart identity work were improved in earlier tickets, but the SELL business logic is still not fully locked for:
  - store-generated PDF/label barcode scan
  - manufacturer/product barcode scan on physical stock
  - canonical matching when both exist
  - repeat scans rapidly incrementing the same cart line
  - scan miss behavior that must not drift into procurement or new-product flows incorrectly

Files impacted:
- `src/screens/v3/ScanScreenV3.tsx`
- `src/screens/v3/SellScreenV3.tsx`
- `src/stores/productsStore.ts`
- `src/stores/cartStore.ts`
- `src/services/hidScannerService.ts`
- `backend/src/routes/v1/catalog.ts`
- `backend/src/routes/v1/pos/storeProducts.ts`
- any store-barcode resolution helper or migration introduced by the fix

Expected outcome:
- SELL scan-to-cart handles both:
  - store label / PDF barcode
  - physical product barcode
- Both resolution paths converge to the same canonical store-product/cart identity when they refer to the same sellable item.
- Repeated HID or camera scans increment one cart line, not duplicates.
- SELL scan miss does not silently mutate into purchase/new-product behavior unless the operator explicitly chooses that route.
- Barcode precedence/conflict rules are explicit:
  - store override barcode
  - manufacturer barcode
  - generated SuperMandi/store label barcode

Override requirement:
- Claude must inspect the current SELL scan/cart identity code first and override conflicting barcode-resolution behavior in place.
- Do not leave PDF/store-label scan and physical-product scan as parallel cart identity models.
- Existing SELL scan/cart code must be updated, replaced, or deleted where needed so production has one authoritative scan-to-cart contract.
- Do not preserve older barcode fallback branches that can create duplicate cart identities or conflicting scan outcomes in live use.

## V3-HARDEN-161 - Add 50k purchase scans/day and 50k sales scans/day capacity, latency, duplicate-suppression, and crash-resistance gates across HID and camera paths

Priority: P0
Layers: scale, device input throughput, mobile stability, API latency, offline resilience, observability

Issue:
- Existing scan-scale tickets only gate around 10k scans/day, which is below the now-approved operational target for:
  - 50,000 procurement scans/day
  - 50,000 SELL scans/day

Root cause:
- Current scale tickets are too generic and do not separately prove:
  - HID burst behavior
  - camera scan churn
  - duplicate suppression under rapid repeat scans
  - scan-to-cart / scan-to-inward latency budgets
  - mobile memory/crash behavior under prolonged scanner sessions

Files impacted:
- `src/services/hidScannerService.ts`
- `src/screens/v3/ScanScreenV3.tsx`
- `src/screens/v3/CounterPurchaseScreenV3.tsx`
- `scripts/load-tests/`
- `e2e-tests/stress/`
- `.github/workflows/`
- `backend/src/startup/validateGcp.ts`
- any scan stress harness, telemetry hook, or capacity gate introduced by the fix

Expected outcome:
- One reproducible load/stress suite proves scan safety for:
  - 50,000 purchase-side scans/day
  - 50,000 sales-side scans/day
  - HID scanner and camera scan paths
- Acceptance evidence includes:
  - duplicate suppression correctness
  - no cart/inward double-add drift
  - bounded scan-to-action latency
  - no POS crash/hang/memory blow-up during sustained scanning
  - backend lookup/query/cache paths remain within approved budgets

Override requirement:
- Claude must inspect the current scan throughput tooling first and extend or replace the live harnesses/gates instead of adding disconnected synthetic scripts.
- Do not rely on the older 10k/day scan gates as final acceptance for this approved volume.
- Existing lower-capacity scan gates, stress assumptions, and observability paths must be updated, replaced, or deleted where needed so production readiness is measured against the approved volumes only.
- Do not keep conflicting capacity gates that could let a weaker legacy threshold pass while the real scanner workload still fails in production.

## Phase 15 - HID and Camera Scan Governance for Procurement and SELL at Production Throughput

Tickets:
- `V3-FIX-157`
- `V3-HARDEN-158`
- `V3-HARDEN-159`
- `V3-FIX-160`
- `V3-HARDEN-161`

Why fifteenth:
- Scan is now approved as a first-class operational workflow across procurement and SELL, with distinct business semantics for:
  - supplier-catalog procurement
  - Counter Purchase direct inward
  - in-store retail sale
- This phase locks device-mode behavior, edited-field propagation, repeated/new identity handling, and very high scan-volume safety into one explicit cross-layer contract.

Guard rails:
- Do not reopen completed scan UI work only to re-skin it; this phase is about business logic, identity, and throughput correctness.
- Do not mix procurement scan semantics with SELL scan semantics.
- Do not let HID and camera paths diverge into different product-identity or side-effect outcomes for the same barcode.
- Do not certify scanner scale until purchase-side and sales-side throughput are both proven at the approved daily volumes.
- Existing conflicting scanner code, duplicate handlers, fallback branches, stale tests, and weaker legacy gates must be updated, replaced, or deleted so the production path is singular and non-conflicting.

## V3-HARDEN-162 - Build one real-time per-store SKU sell-through and replenishment signal layer for SuperMandi across POS, retailer web, supplier web, and SuperAdmin

Priority: P0
Layers: sales telemetry, stock truth, demand visibility, realtime sync, backend orchestration, cross-portal UX

Issue:
- SuperMandi still does not have one production-grade cross-store layer telling it, in near real time, for every store and SKU:
  - what sold
  - what remains unsold/in stock
  - what is newly ordered
  - what needs replenishment attention

Root cause:
- Existing work covers ledger events, principal procurement, reorder, and GRN in pieces, but there is not yet one explicit sell-through and replenishment signal contract across:
  - POS sale commit
  - retailer web inventory/order views
  - supplier-facing fulfillment views
  - SuperAdmin demand and allocation visibility

Files impacted:
- POS sale/stock sync surfaces
- retailer web inventory/order dashboards
- supplier web order/dispatch dashboards
- SuperAdmin demand/procurement dashboards
- backend sales/order/ledger/realtime services
- DB tables/materialized views/event feeds introduced by the fix
- GCP/runtime paths used for live event delivery

Expected outcome:
- SuperMandi has one canonical cross-store signal layer showing, per store and per SKU:
  - sold quantity
  - unsold/available stock
  - pending replenishment
  - open procurement/order state
  - delivery/GRN progress
- POS app, retailer web, supplier web, and SuperAdmin all derive from the same underlying event/state truth rather than separate approximations.
- Real-time updates propagate to the involved portals when a sale, stock event, order event, dispatch event, or delivery event changes the operational state.

Override requirement:
- Claude must inspect the existing sales, stock, reorder, procurement, ledger, and live-update paths first and override conflicting live behavior in place.
- Do not bolt on a second “dashboard-only” truth source beside the existing sales/ledger/order system.
- Existing duplicate summary queries, stale counters, and portal-specific derived-state hacks must be updated, replaced, or deleted so production has one authoritative sell-through/replenishment truth.

## V3-FIX-163 - Build retailer reorder and fresh-purchase UX for repeat and new procurement from POS and retailer web

Priority: P0
Layers: retailer UX, reorder workflow, procurement navigation, product discovery, repeat-vs-new purchase behavior

Issue:
- Retailers still need one explicit production-grade way to:
  - reorder repeat SKUs from prior demand/sales history
  - place fresh procurement orders for newly required SKUs
  - do this consistently from POS and retailer web

Root cause:
- Existing BUY/reorder flows and later procurement tickets do not yet define one operator-approved repeat/new purchasing interaction model tied to:
  - sales velocity
  - current stock
  - supplier catalogue availability
  - reorder shortcuts

Files impacted:
- `src/screens/v3/ReorderScreenV3.tsx`
- `src/screens/v3/BuyScreenV3.tsx`
- POS and retailer-web procurement/order-history surfaces
- repeat-order recommendation / reorder API routes
- shared order-draft/cart state touched by the fix

Expected outcome:
- Retailer can clearly place:
  - repeat orders for previously procured or fast-selling SKUs
  - fresh orders for newly required supplier-catalogue SKUs
- Repeat/new purchase entry points are available in both POS and retailer web with clear navigation and state continuity.
- Reorder suggestions are grounded in real store stock/sales truth rather than demo thresholds or isolated screen logic.

Override requirement:
- Claude must inspect current BUY, reorder, order-history, and procurement-entry flows first and override conflicting repeat/new purchase behavior in place.
- Do not leave multiple parallel reorder entry models across POS and retailer web.
- Existing stale reorder shortcuts, placeholder suggestions, and conflicting “buy again” flows must be updated, replaced, or deleted so production has one coherent retailer reorder/new-purchase contract.

## V3-FIX-164 - Orchestrate SuperMandi-to-supplier demand allocation, supplier order triggering, and delivery workflow from store demand signals

Priority: P0
Layers: procurement orchestration, supplier allocation, delivery workflow, SuperAdmin operations, supplier fulfillment

Issue:
- Even with principal procurement locked, there is not yet one explicit flow for how SuperMandi converts store demand into:
  - supplier-triggered procurement orders
  - supplier-specific allocation
  - dispatch and delivery tracking

Root cause:
- Current procurement work is split across approval, publish, BUY, GRN, and supplier fulfillment tickets, but the operator-approved business flow still needs one explicit order-trigger contract from store demand to supplier dispatch.

Files impacted:
- SuperAdmin procurement/order-allocation screens
- supplier web order acceptance/dispatch screens
- retailer order-tracking and delivery-status screens
- backend procurement orchestration, allocation, and dispatch services
- order/dispatch/delivery tables and migrations introduced by the fix

Expected outcome:
- SuperMandi can convert store-level demand and replenishment needs into the correct supplier-facing procurement orders.
- Supplier-specific order triggering, acceptance, partial fulfillment, dispatch, and delivery tracking are explicit and auditable.
- Retailer and SuperAdmin can see the same linked lifecycle:
  - store demand
  - procurement trigger
  - supplier acceptance
  - dispatch
  - delivery
  - GRN closure

Override requirement:
- Claude must inspect the current procurement-order, publish, supplier-fulfillment, dispatch, and GRN paths first and override conflicting live behavior in place.
- Do not leave a second hidden procurement-trigger path or manual-only delivery state model beside the live one.
- Existing conflicting allocation logic, silent supplier-selection branches, and stale dispatch-state assumptions must be updated, replaced, or deleted so production has one authoritative order-trigger and delivery workflow.

## V3-HARDEN-165 - Add real-time and WhatsApp communication contract for retailer, supplier, and SuperAdmin across replenishment, dispatch, delivery, and repeat-order interactions

Priority: P0
Layers: realtime comms, notifications, WhatsApp, portal UX, event delivery, observability

Issue:
- The involved users still lack one explicit communication contract covering:
  - new order creation
  - supplier trigger/acceptance
  - dispatch and delivery updates
  - repeat-order prompts
  - exception/failure states

Root cause:
- Existing WhatsApp and live-update work is fragmented around POS checkout and isolated screens.
- There is no single approved real-time communication model for retailer, supplier, and SuperAdmin in the replenishment/procurement lifecycle.

Files impacted:
- POS app order-status surfaces
- retailer web order/reorder views
- supplier web order/dispatch views
- SuperAdmin monitoring and action surfaces
- backend notification/event fan-out services
- WhatsApp routes/templates/logging
- gateway/runtime/GCP paths used by live event delivery

Expected outcome:
- Retailer, supplier, and SuperAdmin receive explicit real-time updates and WhatsApp communication for:
  - order created
  - supplier action required
  - supplier accepted/rejected/partial
  - dispatch out
  - delivery due
  - delivered / GRN pending / GRN complete
  - repeat-order reminder or replenishment prompt where approved
- UI states and notification states stay consistent across POS, retailer web, supplier web, and SuperAdmin.
- Communication failures are observable and do not silently desync the lifecycle.

Override requirement:
- Claude must inspect the current live-update, WhatsApp, notification, and order-status flows first and override conflicting live behavior in place.
- Do not bolt on a second notification channel while older stale communication paths still remain active.
- Existing hidden fallback notifications, stale WhatsApp shortcuts, and conflicting live-update assumptions must be updated, replaced, or deleted so production has one coherent communication contract.

## V3-HARDEN-166 - Add schema, migration, API, realtime, and GCP release parity gates for store-demand visibility and supplier-trigger orchestration

Priority: P0
Layers: schema, migrations, API contracts, runtime parity, GCP readiness, release gates

Issue:
- The above real-time sell-through and supplier-trigger flow is not production-safe unless schema, event transport, portal APIs, and deployment/runtime readiness are verified as one explicit go-live contract.

Root cause:
- Current readiness tickets cover auth, principal procurement, payments, and scanner scale in separate areas, but not the full cross-portal demand-to-supplier orchestration stack.

Files impacted:
- backend migrations for order/delivery/event state introduced by the fix
- API gateway/runtime config
- Pub/Sub / Cloud Tasks / worker / storage / websocket-SSE parity paths used by the flow
- `.github/workflows/`
- `scripts/gates/`
- environment validation and runbook/reporting surfaces

Expected outcome:
- Forward migrations, API contracts, event transport, and runtime config are all versioned and validated for:
  - cross-store sell-through visibility
  - supplier-triggered procurement orders
  - dispatch/delivery state propagation
  - WhatsApp/live notification delivery
- Deploy/release gates fail if this orchestration stack is not actually live and verifiable in the target environment.
- Claude must provide one explicit parity/readiness proof covering POS, retailer web, supplier web, SuperAdmin, backend, migrations, and runtime event delivery.

Override requirement:
- Claude must inspect the current migrations, APIs, realtime transport, deploy gates, and runtime config first and override conflicting live assumptions in place.
- Do not add optional scripts or sidecar checks while older permissive gates can still allow a broken orchestration stack through.
- Existing conflicting schema paths, event-delivery assumptions, stale env validation, and weaker release checks must be updated, replaced, or deleted so production has one enforceable readiness contract.

## Phase 16 - Real-Time Store Sell-Through, Replenishment, Supplier Triggering, and Delivery Orchestration

Tickets:
- `V3-HARDEN-162`
- `V3-FIX-163`
- `V3-FIX-164`
- `V3-HARDEN-165`
- `V3-HARDEN-166`

Why sixteenth:
- Principal procurement, ledger truth, repeat ordering, and supplier fulfillment are already partially ticketed, but the operator-approved end-to-end requirement still needs one explicit cross-portal phase for:
  - store-level sell-through visibility
  - SuperMandi-triggered supplier ordering
  - retailer repeat/new order UX
  - delivery progress
  - real-time and WhatsApp communication
- This phase makes the operational control loop explicit from store sale to supplier-triggered replenishment and delivery closure.

Guard rails:
- Do not treat this as a dashboard-only analytics phase; it must be tied to real order, stock, delivery, and communication behavior.
- Do not split portal behavior into separate truths for POS, retailer web, supplier web, and SuperAdmin.
- Do not leave manual/offline-only supplier triggering beside an automated or event-driven live path without an explicit ownership rule.
- Do not allow reorder, sell-through, delivery, or WhatsApp state to drift between UI surfaces and backend event truth.
- Existing conflicting order-monitoring, reorder, dispatch, notification, and live-update code must be updated, replaced, or deleted so production has one singular cross-layer orchestration model.
