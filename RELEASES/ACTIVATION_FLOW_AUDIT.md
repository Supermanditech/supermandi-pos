# ACTIVATION FLOW DEEP AUDIT — POS Download to Operational

> **Date**: 2026-02-19 | **Branch**: feat/CROSS-SURFACE-329-332-activation-flow
> **Scope**: Complete user journey from POS download → device activation → operational POS
> **Surfaces**: POS App, Retailer Admin, SuperAdmin, Backend API, DB/Migrations, GCP Deploy
> **Method**: 6 parallel Opus 4.6 deep-scan agents, ~160 raw findings → deduplicated to atomic tickets

---

## CRITICAL P0 BLOCKERS (Must fix before GCP deploy)

### DB-001: RLS `withStoreContext` never called — store isolation bypassed at DB level
- **File**: `backend/packages/common/src/db/client.ts:81`
- **Issue**: The `withStoreContext()` function exists but is never imported or called anywhere in the codebase. RLS policies in migration 149 expect `current_setting('app.current_store_id')` to be set via `SET LOCAL`, but no middleware or service code calls this. All 27 RLS-protected tables have policies that are technically active but always evaluate against empty/null context — meaning RLS either blocks everything (if strict) or allows everything (if permissive).
- **Fix**: Create middleware that calls `withStoreContext(storeId)` wrapping all store-scoped DB queries in a transaction with `SET LOCAL app.current_store_id`.
- **Layer**: DB | Security | P0

### DB-002: `SET LOCAL` without transaction has no effect
- **File**: `backend/packages/common/src/db/client.ts:89`
- **Issue**: `withStoreContext()` calls `SET LOCAL app.current_store_id = $1` but does NOT wrap in a transaction. `SET LOCAL` only persists within a transaction block — outside a transaction it reverts immediately.
- **Fix**: Wrap with `BEGIN ... SET LOCAL ... <queries> ... COMMIT` or use `pool.connect()` + explicit transaction.
- **Layer**: DB | Security | P0

### DB-003: 5 duplicate migration number collisions (100, 101, 107, 108)
- **File**: `backend/migrations/100_*.sql`, `101_*.sql`, `107_*.sql`, `108_*.sql`
- **Issue**: Multiple migration files share the same number prefix. Migration runner sorts by filename string, so execution order is non-deterministic within a collision group. If they have interdependencies, this is a data corruption risk on fresh deploy.
- **Fix**: Renumber all duplicates to unique sequential numbers.
- **Layer**: Migration | P0

### DB-004: Zero rollback (.down.sql) files exist for 161 migrations
- **File**: `backend/packages/common/src/db/migrate.ts:108-144`
- **Issue**: The rollback function looks for `.down.sql` files but none exist. If migration 149 (RLS on 27 tables) fails mid-way, there is no automated recovery.
- **Fix**: Create `.down.sql` files for at minimum migrations 149, 150, and any with DROP operations. Cloud SQL backup is mandatory but not sufficient for partial failures.
- **Layer**: Migration | P0

### DB-005: TEXT `store_id` in enrollment tables vs UUID RLS function
- **File**: `backend/migrations/011b_ensure_runtime_tables.sql:12`
- **Issue**: `pos_device_enrollments` and `pos_devices` use `store_id TEXT` but `rls_store_check()` casts to `::uuid`. RLS cannot be applied to these tables without a type-specific function.
- **Fix**: Either create `rls_store_check_text()` for V1 tables or migrate store_id columns to UUID.
- **Layer**: Schema | RLS | P0

### GCP-001: Hardcoded dead domain `supermandi.in` in backend API responses
- **File**: `backend/services/platform-service/src/routes/retailerAdmin.ts:120,152,291`
- **Issue**: Three hardcoded `https://supermandi.in/s/${store.code}` URLs returned to SuperAdmin users. Domain is dead.
- **Fix**: Replace with `${process.env.PORTAL_BASE_URL || 'https://supermandi.tech'}/s/${store.code}`.
- **Layer**: EnvVar | P0

### GCP-002: Dead domain fallback in email service
- **File**: `backend/src/services/emailService.ts:475`
- **Issue**: Fallback URL uses `https://supplier.supermandi.in` — a non-existent domain.
- **Fix**: Remove dead domain fallback; require env var or use `supermandi.tech`.
- **Layer**: EnvVar | P0

### GCP-003: `NODE_ENV=staging` bypasses production security guards
- **File**: `.github/workflows/deploy.yml:564,639`
- **Issue**: Many code paths check `NODE_ENV === 'production'` for security features (secure cookies, webhook verification, fail-fast on missing env vars, structured logging). With `NODE_ENV=staging`, these are all disabled.
- **Fix**: Update all code to check `NODE_ENV !== 'development'` instead of `NODE_ENV === 'production'`.
- **Layer**: EnvVar | Security | P0

### GCP-004: POS app.json points to production API, not staging
- **File**: `app.json:23-24`
- **Issue**: `API_URL` and `POS_API_URL` hardcoded to `https://supermandi.tech`. During staging testing, POS hits production.
- **Fix**: Document that staging POS builds must use `EXPO_PUBLIC_API_URL=https://staging.supermandi.tech`. Add `app.config.js` for env-aware config.
- **Layer**: EnvVar | P0

### POS-001: SplashScreen skips version check — outdated app reaches SellScan
- **File**: `src/screens/SplashScreen.tsx:73`
- **Issue**: SplashScreen goes directly from `getDeviceSession()` to `SellScan` without calling `fetchUiStatus()` to check `forceUpdate`. User on forbidden version can interact with POS for up to 60s before polling catches it.
- **Fix**: Call `fetchUiStatus()` after session check; if `forceUpdate`, navigate to ForceUpdate.
- **Layer**: Navigation | Security | P0

### POS-002: SplashScreen skips device-blocked check
- **File**: `src/screens/SplashScreen.tsx:73`
- **Issue**: Same as POS-001 but for `deviceActive === false`. A blocked device with cached session reaches StaffLogin.
- **Fix**: Check `fetchUiStatus().deviceActive` before navigating to SellScan.
- **Layer**: Security | P0

### POS-003: Deep link `?code=X` not mapped to `enrollmentCode` route param
- **File**: `App.tsx:363-370`
- **Issue**: React Navigation deep link config maps `EnrollDevice: "enroll"` but doesn't parse `?code=X` into `enrollmentCode`. The workaround via `Linking.getInitialURL()` is fragile.
- **Fix**: Add `parse: { enrollmentCode: (code) => code }` to deep link config.
- **Layer**: Navigation | P0

### SA-001: LoginGate ignores auth return values — allows login with invalid OTP
- **File**: `supermandi-superadmin/src/components/LoginGate.tsx:38-47,59-63`
- **Issue**: `sendAdminOtp()` and `verifyAdminOtp()` never throw (catch internally, return `{success: false}`). LoginGate wraps in try/catch, so failures are never detected. Invalid OTP → `onLogin()` → dashboard access (with broken API calls).
- **Fix**: Check `result.success` before proceeding to next step.
- **Layer**: Auth | P0

### SA-002: Three SuperAdmin tabs use hardcoded relative URLs — broken on GCP
- **Files**: `supermandi-superadmin/src/tabs/SupportQueueTab.tsx:44-52`, `AIInsightsTab.tsx:33-41`, `CreditProvidersTab.tsx:50-58`
- **Issue**: Each tab defines own `apiFetch()` without `API_BASE` prefix. On GCP, calls go to Nginx (returns 404) instead of API gateway.
- **Fix**: Import `API_BASE` from env and prefix all URLs.
- **Layer**: GCP-Parity | P0

### RET-001: Page refresh loses accessToken — all API calls silently fail
- **File**: `retailer-admin/src/lib/AuthContext.tsx:455`
- **Issue**: `accessToken` is null after refresh. All pages guard with `if (!accessToken) return;` — user sees empty dashboard with no error.
- **Fix**: Wait for token refresh to complete before rendering protected pages, or check `isAuthenticated` instead of `accessToken`.
- **Layer**: Auth | P0

---

## P1 HIGH (48 issues — grouped by surface)

### POS App (9 P1)
| ID | File | Issue |
|----|------|-------|
| POS-P1-001 | Multiple (12 files) | Fragmented `RootStackParamList` — no shared navigation type |
| POS-P1-002 | App.tsx (30+ wrappers) | `useNavigation<any>()` defeats TypeScript safety |
| POS-P1-003 | ForceUpdateScreen.tsx:27 | Empty iOS App Store URL sends iOS users to Play Store |
| POS-P1-004 | ErrorBoundary.tsx:54-72 | Hardcoded colors, no app restart option |
| POS-P1-005 | App.tsx + 5 screens | No SafeAreaProvider — content under system bars on notched devices |
| POS-P1-006 | ForceUpdate + DeviceBlocked | No Android BackHandler blocks bypass via back button |
| POS-P1-007 | EnrollDeviceScreen.tsx:179 | Dead code: `+91` prefix check on already-stripped digits |
| POS-P1-008 | uiStatusApi.ts:122-180 | Non-strict `fetchUiStatus` swallows 401 — auth errors invisible |
| POS-P1-009 | PaymentSetupScreen.tsx:210 | Hardcoded `#fff` instead of theme token |

### Retailer Admin (6 P1)
| ID | File | Issue |
|----|------|-------|
| RET-P1-001 | ProtectedLayout.tsx:118-128 | Help page blocked by limited-mode route guard despite allowlist |
| RET-P1-002 | App.tsx:313 vs ProtectedLayout:123 | LimitedModeGuard and route guard have conflicting allowed paths |
| RET-P1-003 | SettingsPage.tsx:790 | `handleChange` accepts `string|number` but passed `boolean` via `as any` |
| RET-P1-004 | RegisterPage.tsx:486-512 | APPLICATION_EXISTS auto-resume never triggers (error object missing `.code`) |
| RET-P1-005 | RegisterPage.tsx:976 | "Back" from documents step loses idToken → OTP re-verification fails |
| RET-P1-006 | LoginPage.tsx:154 | Raw phone sent to Firebase instead of normalized phone |

### SuperAdmin (8 P1)
| ID | File | Issue |
|----|------|-------|
| SA-P1-001 | ErrorBoundary.tsx:35 | "Go Home" navigates to `/` instead of `/admin/` on GCP |
| SA-P1-002 | App.tsx:2505 | Native `confirm()` for enrollment revocation (should use ConfirmDialog) |
| SA-P1-003 | App.tsx:2531,2533 | Native `alert()` for resend result (should use react-hot-toast) |
| SA-P1-004 | StaffTab.tsx:148 | Native `confirm()` for staff deactivation |
| SA-P1-005 | SettingsTab.tsx:144 | Native `confirm()` for feature flag kill (destructive global op) |
| SA-P1-006 | App.tsx:2827-2843 | Mobile nav missing 8 tabs (gst, refunds, monitoring, quality, etc.) |
| SA-P1-007 | ErrorBoundary.tsx + components/ErrorBoundary.tsx | Duplicate implementations with different behavior |
| SA-P1-008 | AIInsightsTab.tsx:73-82 | AI job endpoints share the missing API_BASE issue |

### Backend API (5 P1)
| ID | File | Issue |
|----|------|-------|
| BE-P1-001 | deviceQueries.ts:162 | SQL string interpolation for INTERVAL (injection vector) |
| BE-P1-002 | enroll.ts:902 | Wrong schema `pos.pos_devices` — should be `public.pos_devices` |
| BE-P1-003 | deviceQueries.ts:121, enroll.ts:777 | `Math.random()` for enrollment code generation (not crypto-secure) |
| BE-P1-004 | deviceQueries.ts:224 | Cannot revoke partially-used multi-use enrollment codes |
| BE-P1-005 | enroll.ts:161,258,520,586 | Plaintext code lookup defeats enrollment_code_hash purpose |

### DB/Migration (12 P1)
| ID | File | Issue |
|----|------|-------|
| DB-P1-001 | 149_rls.sql + 161_rls_gap.sql | 15+ store-scoped tables missing RLS policies |
| DB-P1-002 | 011b:22 | pos_devices has no FK to platform.stores |
| DB-P1-003 | 046:19 | pos_device_enrollments missing updated_at trigger |
| DB-P1-004 | 003:95 | supplier_store_links.store_id has no FK constraint |
| DB-P1-005 | 011b, 018b, 104, 106 | 10+ V1 tables use TEXT IDs instead of UUID |
| DB-P1-006 | seed_demo_data.sql:20 | Wrong `verification_status = 'ACTIVE'` (CHECK allows only pending/verified/rejected) |
| DB-P1-007 | 018:89 | sale_items has no store_id — RLS impossible on this table |
| DB-P1-008 | 012:56 | No CHECK constraint on `uses_count <= max_uses` |
| DB-P1-009 | 149:66 | `rls_store_check` marked STABLE but may cause caching issues |
| DB-P1-010 | 001, 018, 021, 100 | public.stores VIEW redefined 4+ times with column conflicts |
| DB-P1-011 | 011b:22 | pos_devices.store_id nullable for active devices |
| DB-P1-012 | 018:23 | sales.id is VARCHAR(100), not UUID (schema inconsistency) |

### GCP Parity (8 P1)
| ID | File | Issue |
|----|------|-------|
| GCP-P1-001 | 3 frontend Dockerfiles | Use `npm install` instead of `pnpm install --frozen-lockfile` |
| GCP-P1-002 | deploy.yml:131-151 | Firebase build-args declared but Dockerfiles don't declare matching ARGs |
| GCP-P1-003 | ROUTING_SPEC.json:13 | Supplier portal port listed as 3001 but Docker uses 8080 |
| GCP-P1-004 | socketManager.ts:59-61 | WebSocket CORS has hardcoded localhost fallback |
| GCP-P1-005 | deploy.yml:578 | `RATE_LIMIT_MULTIPLIER=100` effectively disables rate limiting on staging |
| GCP-P1-006 | payment-service/config.ts:79 | Hardcoded DB credentials in fallback |
| GCP-P1-007 | supermandi-superadmin/vite.config.ts | No versionPlugin — can't verify deployed build SHA |
| GCP-P1-008 | deploy.yml:587-588 | CORS missing `www.` subdomain variant |

---

## P2 MEDIUM (97 issues — summary only, see agent outputs for details)

### POS App P2 (18)
- Deep link handler race condition on unmount
- Hardcoded spacing/colors in MenuScreen
- Camera timeout hint says "5s" but constant is 45s
- PaymentSetupScreen no offline check
- Missing testIDs on PaymentSetupScreen
- "Continue without session" confusing UX label
- Menu items not i18n-wrapped
- Token refresh fetch has no timeout
- No explanation banner when tabs disabled
- Conditional UiShowcase screen registration
- Deprecated Constants.manifest usage
- Splash init ordering not guaranteed
- StaffLoginScreen wrong error property access
- stopPropagation may not work in RN nested Pressables
- No dedup on rapid foreground loadProducts
- Fragile hex+alpha color concatenation
- Auto-activate timer race
- WhatsApp brand color not a named constant

### Retailer Admin P2 (21)
- RegisterPage brand name "SuperManditech" vs "SuperMandi"
- ForgotPasswordPage footer inconsistent
- Settings save error could render [object Object]
- useEffect missing loadDevices dependency
- LoginPage raw phone to Firebase
- ErrorBoundary navigates to `/` (should be `/retailer/login`)
- PENDING_APPROVAL state no next action
- CONTACT_SUPPORT no support link
- Terms/Privacy links are non-clickable spans
- GST validation regex inconsistency (Settings vs Register)
- Auth race condition on page refresh
- DeviceActivation `catch(err: any)` type safety
- Settings `catch(err: any)` type safety
- Double safeJson consumption in store.ts
- DeviceRequiredBanner onStatusLoaded re-fire
- handleChangePhone clears draft without confirmation
- Drag-and-drop text but no handler
- Vite drops all console.* in production
- IDLE_TIMEOUT silent clamp
- Dashboard toLocaleString on potentially undefined
- Dead code: API_BASE_URL in ProtectedLayout

### SuperAdmin P2 (12)
- fetchStores without pagination loads partial results
- WhatsApp API inconsistent error handling
- Resend OTP countdown before success confirmation
- AI Insights requires manual Store ID entry
- SupportQueueTab hardcodes agent name
- CreditProvidersTab loading state hides errors
- ConfirmDialog backdrop dismissal during loading
- Enrollment countdown shows expired codes as active
- Cross-tab enrollment state confusion
- Monolithic App.tsx (~3440 lines)
- Duplicate ErrorBoundary wrapping
- Session refresh mutex edge case

### Backend P2 (22)
- Rate limit gaps on generate-activation-code and activation-status
- Store CRUD no local auth middleware
- Internal auth routes zero authentication
- Misleading gateway prefix stripping comment
- getActiveSessionCount ignores Redis sessions
- Idempotent re-enrollment leaks device_token
- getDeviceById no store isolation
- Hardcoded user name on Firebase login
- check-label leaks device info to unauthenticated callers
- lookup-activation enables phone-based store enumeration
- Unbounded in-memory rate limit Map
- JWT_SECRET falls back to ADMIN_TOKEN
- Trusts gateway headers without validation
- Silent failure on last_active_at update
- Missing storeId UUID validation
- CSRF design gap for non-JSON POS endpoints
- Store state transition failure silently ignored
- Tokens in both cookies and body
- Demo store uses_count can exceed max_uses
- Proxy body forwarding corrupts non-JSON content
- Unvalidated date parameter causes RangeError
- Unbounded deviceMeta object accepted

### DB/Migration P2 (18)
- 10+ tables with store_id but no FK constraint
- sell_payments.sale_id UUID vs sales.id VARCHAR mismatch
- V1 sale_items may conflict with V3 sale_items
- Column rename fragile on partial failure
- Enrollment code no length constraint
- max_devices conflicting defaults (10 vs 5)
- No index on pos_device_enrollments.store_id
- inventory_ledger transaction_type CHECK stale
- Trigger on public.payments which may not exist
- order_receives missing store_id for RLS
- 8+ tables missing updated_at trigger
- Hardcoded demo tokens in migration
- store_staff missing updated_at column
- auth.store_users not covered by RLS
- device_activation_codes no RLS
- Invoicing schema not created before use
- sale_items V1/V3 conflict
- public.stores VIEW column conflicts

### GCP P2 (6)
- OG tags point to production (acceptable)
- POS HelpScreen hardcoded production URLs (acceptable for native app)
- Docker pnpm version mismatch (8 vs 10)
- notificationService fallback to production URL
- Test script uses dead `.in` domain
- .env.production committed despite .gitignore

---

## RECOMMENDED FIX ORDER

### Wave 1: Security & Data Integrity (P0 blockers)
1. DB-001 + DB-002: Fix RLS `withStoreContext` (store isolation is broken)
2. DB-003: Renumber duplicate migrations
3. SA-001: Fix LoginGate auth bypass
4. GCP-003: Fix NODE_ENV=staging security bypass
5. POS-001 + POS-002: Add version + device-blocked checks to Splash
6. GCP-001 + GCP-002: Remove dead domain references
7. SA-002: Fix 3 SuperAdmin tabs missing API_BASE
8. RET-001: Fix page refresh token loss
9. POS-003: Fix deep link param mapping
10. GCP-004: Document staging POS build requirement

### Wave 2: Backend Security (P1)
11. BE-P1-001: Parameterize SQL INTERVAL
12. BE-P1-002: Fix wrong schema reference
13. BE-P1-003: Replace Math.random() with crypto
14. BE-P1-004: Fix multi-use code revocation
15. BE-P1-005: Decide plaintext vs hash-only codes

### Wave 3: DB Schema Hardening (P1)
16. DB-P1-001: Add RLS to 15+ missing tables
17. DB-P1-002 + DB-P1-004: Add FK constraints
18. DB-P1-006: Fix seed demo data
19. DB-P1-010: Consolidate public.stores VIEW

### Wave 4: Frontend Fixes (P1)
20. POS-P1-001 + POS-P1-002: Shared navigation types
21. POS-P1-005: SafeAreaProvider
22. POS-P1-006: BackHandler for gate screens
23. SA-P1-001: Fix ErrorBoundary navigation
24. SA-P1-006: Add missing mobile tabs
25. RET-P1-001 + RET-P1-002: Fix limited mode guard conflicts

### Wave 5: GCP Deploy Parity (P1)
26. GCP-P1-001: Fix Docker pnpm usage
27. GCP-P1-005: Reduce rate limit multiplier
28. GCP-P1-007: Add version plugin to SuperAdmin
29. GCP-P1-008: Add www. to CORS

### Wave 6: P2 Polish (batch)
30-97. All P2 items batched by surface

---

## STATISTICS

| Metric | Value |
|--------|-------|
| Raw findings | 160 |
| After dedup | ~130 unique |
| P0 blockers | 15 |
| P1 high | 48 |
| P2 medium | 97 |
| Surfaces covered | 6 |
| Audit agents | 6 x Opus 4.6 |
| Files read | 200+ |
