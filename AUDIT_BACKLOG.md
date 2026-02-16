# SuperMandi Production Hardening Backlog — Phase 11

> **Generated:** 2026-02-16 | **Audit:** 5 parallel deep-scan agents + GCP MCP parity check
> **Scope:** Retailer Admin + Supplier Portal + POS App + SuperAdmin + Backend + GCP Infrastructure
> **Total Tickets:** 67 | **Execution Model:** One ticket = one branch = one PR = one tag

---

## Executive Summary

| Platform | Total | P0 | P1 | P2 |
|----------|-------|----|----|------|
| Infrastructure/GCP | 4 | 2 | 2 | 0 |
| Backend | 10 | 4 | 6 | 0 |
| Retailer Admin | 7 | 0 | 5 | 2 |
| Supplier Portal | 9 | 3 | 4 | 2 |
| POS App | 12 | 3 | 6 | 3 |
| SuperAdmin | 8 | 4 | 3 | 1 |
| P2 Polish (cross-platform) | 17 | 0 | 0 | 17 |
| **TOTAL** | **67** | **16** | **26** | **25** |

### GCP Parity Findings
- All 6 Cloud Run services deployed at GIT_SHA `f61a3b2` — **37 commits behind** main HEAD `e52adf7`
- Missing secrets: RAZORPAY_*, OPENAI_API_KEY, PAYOUT_PROCESS_API_KEY, GCS_IMAGES_BUCKET, GCS_CHAT_BUCKET
- 20 Dependabot vulnerability alerts (nodemailer, multer, axios, undici, tar, esbuild)

---

## Tier 0: Infrastructure & Deploy Blockers (Phase 11A)

> Must fix BEFORE any staging deploy. These are deployment prerequisites.

### FIX-001: Deploy main HEAD to staging (37 commits behind)
- **Priority:** P0
- **Platform:** GCP
- **Scope:** All 6 Cloud Run services
- **Description:** GCP staging is at `f61a3b2`, main HEAD is `e52adf7`. Phase 9 (UPI, B2B, WhatsApp, AI) and Phase 10 (3400+ tests) are NOT deployed. Trigger CI deploy to staging.
- **Acceptance:** All 6 services show GIT_SHA matching main HEAD. Health checks pass.
- **Files:** `.github/workflows/deploy.yml`

### FIX-002: Add missing GCP secrets for Phase 9 features
- **Priority:** P0
- **Platform:** GCP
- **Scope:** Secret Manager + Cloud Run env vars
- **Description:** Code references RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_ACCOUNT_NUMBER, RAZORPAY_WEBHOOK_SECRET, OPENAI_API_KEY, PAYOUT_PROCESS_API_KEY, GCS_IMAGES_BUCKET, GCS_CHAT_BUCKET, CREDIT_ENABLED, SUPERMANDI_COLLECTION_VPA — none exist in GCP. Services will crash on these code paths.
- **Acceptance:** All referenced env vars either exist in Secret Manager OR code gracefully handles missing vars (fail-fast with clear error, not silent undefined).
- **Files:** `backend/services/*/src/**`, Secret Manager console

### FIX-003: Fix Dependabot critical vulnerabilities
- **Priority:** P1
- **Platform:** Backend
- **Scope:** package.json dependencies
- **Description:** 20 open Dependabot alerts: multer (8 high DoS), nodemailer (2 high DoS + 2 medium), axios (1 high prototype pollution), tar (3 high path traversal), undici (3 medium), esbuild (1 medium dev SSRF).
- **Acceptance:** `gh api repos/.../dependabot/alerts --jq '[.[] | select(.state=="open")] | length'` returns 0 for high/critical.
- **Files:** `backend/package.json`, `backend/services/*/package.json`

### FIX-004: Validate VITE_API_BASE_URL in all portals
- **Priority:** P1
- **Platform:** Retailer, Supplier, SuperAdmin
- **Scope:** Build config + API modules
- **Description:** All 3 portals default API_BASE to empty string `''` if env var missing. Behind load balancer, relative paths `/api/...` will 404. Must fail-fast at build time if VITE_API_BASE_URL is unset in production.
- **Acceptance:** `pnpm -r build` with VITE_API_BASE_URL unset fails with clear error. Build succeeds when set.
- **Files:** `retailer-admin/src/lib/api.ts:9`, `supplier-portal/src/lib/api.ts`, `supermandi-superadmin/src/api/*.ts`, all `vite.config.ts`
- **Ref:** BUG-R-029, BUG-A-006

---

## Tier 1: Backend P0 — Store Isolation & Data Integrity (Phase 11B)

> Critical security and data integrity fixes. Must be done before any user-facing testing.

### FIX-005: Fix store_id isolation in UPDATE queries
- **Priority:** P0
- **Platform:** Backend
- **Scope:** catalog-service, platform-service
- **Description:** `linkSupplierToStoreProduct` updates `catalog.store_products` without `WHERE store_id = $N`. Attacker could modify another store's product mappings. Cross-store data corruption risk.
- **Acceptance:** All UPDATE/DELETE queries on store-scoped tables include `AND store_id = $token.storeId`. Integration test proves cross-store mutation fails with 403.
- **Files:** `backend/services/platform-service/src/services/retailerCatalogService.ts:312`
- **Ref:** BUG-B-001

### FIX-006: Fix store_id isolation in DELETE queries
- **Priority:** P0
- **Platform:** Backend
- **Scope:** catalog-service
- **Description:** `unmapProduct` deletes from `catalog.supplier_product_map` using only mapping ID without store ownership verification. Any authenticated user could delete another store's mappings.
- **Acceptance:** DELETE query includes store ownership join/check. Test proves cross-store delete returns 403.
- **Files:** `backend/services/catalog-service/src/services/mappingService.ts:491`
- **Ref:** BUG-B-005

### FIX-007: Wrap stock update in transaction
- **Priority:** P0
- **Platform:** Backend
- **Scope:** platform-service
- **Description:** Stock update writes to `inventory.inventory_ledger`, `inventory.stock_balances`, and `catalog.store_products` as 3 separate queries without transaction. If 3rd UPDATE fails, ledger is inconsistent.
- **Acceptance:** All 3 writes wrapped in BEGIN/COMMIT. Simulated failure test shows rollback.
- **Files:** `backend/services/platform-service/src/routes/retailerPortal.ts:1113-1133`
- **Ref:** BUG-B-010

### FIX-008: Add idempotency key to GRN receive endpoint
- **Priority:** P0
- **Platform:** Backend
- **Scope:** order-service
- **Description:** POST `/stores/:storeId/orders/:orderId/receive` performs inventory mutations without idempotency key. Retry creates duplicate stock entries. Comment acknowledges this but no enforcement exists.
- **Acceptance:** Endpoint requires `Idempotency-Key` header. Duplicate key returns 409 with original response. Test proves retry safety.
- **Files:** `backend/services/order-service/src/routes/receive.ts:42-50`
- **Ref:** BUG-B-006

---

## Tier 2: Backend P1 — Performance & Validation (Phase 11C)

### FIX-009: Fix N+1 query in CSV bulk upload
- **Priority:** P1
- **Platform:** Backend
- **Scope:** supplier-service
- **Description:** CSV upload loops 1000 products with individual INSERT queries. 1000 serial DB round-trips. Use batch INSERT.
- **Acceptance:** Bulk insert uses single multi-row INSERT or batched prepared statements. Upload of 1000 products < 5 seconds.
- **Files:** `backend/services/supplier-service/src/routes/products.ts:665-687`
- **Ref:** BUG-B-008

### FIX-010: Add rate limiting to supplier product endpoints
- **Priority:** P1
- **Platform:** Backend
- **Scope:** supplier-service
- **Description:** CSV upload allows 1000 products per request with only gateway's general 30 req/min limit. Need endpoint-specific throttle.
- **Acceptance:** CSV upload: max 5 per hour per supplier. Product CRUD: max 60 per minute per supplier.
- **Files:** `backend/services/supplier-service/src/routes/products.ts:510`
- **Ref:** BUG-B-009

### FIX-011: Add index on refresh_tokens.token_hash
- **Priority:** P1
- **Platform:** Backend
- **Scope:** auth-service, migrations
- **Description:** `findRefreshTokenByHash` queries on every token refresh (high frequency) without verified index on `token_hash`. Full table scan on token refresh.
- **Acceptance:** Migration adds `CREATE INDEX idx_refresh_tokens_hash ON auth.refresh_tokens(token_hash) WHERE revoked_at IS NULL`. Query EXPLAIN shows index scan.
- **Files:** `backend/services/auth-service/src/db/tokenQueries.ts:90-96`, `backend/migrations/`
- **Ref:** BUG-B-013

### FIX-012: Add LIMIT to unbounded catalog categories query
- **Priority:** P1
- **Platform:** Backend
- **Scope:** catalog-service
- **Description:** SELECT DISTINCT categories has no LIMIT. Malicious data could return hundreds of categories causing memory issues.
- **Acceptance:** Query has `LIMIT 500`. Response includes `truncated: true` flag if limit hit.
- **Files:** `backend/services/catalog-service/src/routes/catalog.ts:115-129`
- **Ref:** BUG-B-011

### FIX-013: Fix toFixed financial calculation in purchase orders
- **Priority:** P1
- **Platform:** Backend
- **Scope:** order-service
- **Description:** `toFixed(2)` used on financial amounts. Verify underlying calculation uses integer paisa arithmetic per project rules.
- **Acceptance:** All calculations use integer arithmetic. `toFixed` only used for display strings, never for comparisons.
- **Files:** `backend/services/order-service/src/services/purchaseOrderService.ts:149`
- **Ref:** BUG-B-004

### FIX-014: Replace empty catch blocks with logging
- **Priority:** P1
- **Platform:** Backend
- **Scope:** catalog-service, platform-service
- **Description:** Multiple `.catch(() => {})` silently swallow errors. Makes production debugging impossible.
- **Acceptance:** All catch blocks log error context. No empty catch blocks in production code. Grep for `catch\s*\(\s*\)\s*\{\s*\}` returns 0.
- **Files:** `backend/services/catalog-service/src/cache/redis.ts:173`, `backend/services/platform-service/src/services/retailerCatalogService.ts:434`
- **Ref:** BUG-B-002, BUG-B-003

---

## Tier 3: Retailer Admin P1 (Phase 11D)

### FIX-015: Fix bare response.json() calls — use safeJson everywhere
- **Priority:** P1
- **Platform:** Retailer Admin
- **Description:** FeatureFlagContext and 12+ other locations use raw `response.json()` instead of `safeJson()`. HTML error responses from backend will crash the app with JSON parse error.
- **Acceptance:** Grep for `\.json\(\)` in retailer-admin returns 0 outside of safeJson definition. All API responses use safeJson.
- **Files:** `retailer-admin/src/lib/FeatureFlagContext.tsx:57`, multiple pages
- **Ref:** BUG-R-001

### FIX-016: Fix memory leak in ImportPage polling
- **Priority:** P1
- **Platform:** Retailer Admin
- **Description:** `pollingRef` interval never cleaned up on unmount. Navigating away during CSV import causes memory leak and state updates on unmounted component.
- **Acceptance:** useEffect cleanup clears interval. React strict mode double-mount test passes.
- **Files:** `retailer-admin/src/pages/ImportPage.tsx:48`
- **Ref:** BUG-R-005

### FIX-017: Add error boundary for lazy-loaded routes
- **Priority:** P1
- **Platform:** Retailer Admin
- **Description:** Lazy-loaded pages in Suspense have no fallback for chunk load failures (network error). Entire app crashes with no recovery.
- **Acceptance:** Each lazy route wrapped in ErrorBoundary with "Failed to load page — Retry" UI. Chunk load error triggers retry.
- **Files:** `retailer-admin/src/App.tsx:15-49`
- **Ref:** BUG-R-015

### FIX-018: Fix price rounding — use Math.floor for rupees-to-paise
- **Priority:** P1
- **Platform:** Retailer Admin
- **Description:** `Math.round(float * 100)` for paise conversion. 99.995 rounds to 10000 paise (Rs 100) instead of 9999. Should use `Math.floor`.
- **Acceptance:** All rupees-to-paise conversions use `Math.floor`. Unit test covers edge cases (99.995, 99.994, 0.001).
- **Files:** `retailer-admin/src/pages/ProductsPage.tsx:501`
- **Ref:** BUG-R-016

### FIX-019: Enforce HTTPS in API base URL
- **Priority:** P1
- **Platform:** Retailer Admin
- **Description:** API_GATEWAY_BASE can be http:// in production. Auth tokens sent over unencrypted connection.
- **Acceptance:** Production build fails if VITE_API_BASE_URL starts with `http:`. Dev mode allows http.
- **Files:** `retailer-admin/src/lib/api.ts:9`
- **Ref:** BUG-R-010

### FIX-020: Duplicate ErrorBoundary consolidation
- **Priority:** P2
- **Platform:** Retailer Admin
- **Description:** Two ErrorBoundary files exist (root + components/). Different implementations cause import confusion.
- **Acceptance:** Single ErrorBoundary at root level. All imports consolidated. `components/ErrorBoundary.tsx` deleted.
- **Files:** `retailer-admin/src/ErrorBoundary.tsx`, `retailer-admin/src/components/ErrorBoundary.tsx`
- **Ref:** BUG-R-004

### FIX-021: Fix DashboardPage double-fetch on category change
- **Priority:** P2
- **Platform:** Retailer Admin
- **Description:** Two useEffect hooks listen for `selectedCategory` changes — one refetches products, another auto-refreshes on tab focus. Triggers fetchProducts twice on category change.
- **Acceptance:** Single combined effect or deduplication flag. Network tab shows 1 fetch per category change.
- **Files:** `retailer-admin/src/pages/ProductsPage.tsx:302-318`
- **Ref:** BUG-R-018

---

## Tier 4: Supplier Portal P0-P1 (Phase 11E)

### FIX-022: Add root error boundary
- **Priority:** P0
- **Platform:** Supplier Portal
- **Description:** Root layout has no error boundary. If AuthProvider or QueryClientProvider throw during init, entire app crashes with no recovery.
- **Acceptance:** `error.tsx` exists at root level with recovery UI. Test simulates provider crash.
- **Files:** `supplier-portal/src/app/layout.tsx:16-28`
- **Ref:** BUG-S-001

### FIX-023: Fix auth check — use cookie not in-memory token
- **Priority:** P0
- **Platform:** Supplier Portal
- **Description:** Root page redirect uses `getAuthToken()` (in-memory) instead of `hasAuthCookie()`. After page reload, in-memory token is null, authenticated users redirected to login.
- **Acceptance:** Auth check uses `hasAuthCookie()`. Page reload preserves auth state. Test covers refresh scenario.
- **Files:** `supplier-portal/src/app/page.tsx:11`
- **Ref:** BUG-S-002

### FIX-024: Fix auth profile refresh race condition
- **Priority:** P0
- **Platform:** Supplier Portal
- **Description:** `refreshProfile` callback has missing dependency (`hasAuthCookie`). Stale closures cause inconsistent auth state.
- **Acceptance:** All dependencies in refreshProfile's useCallback. ESLint exhaustive-deps passes.
- **Files:** `supplier-portal/src/lib/auth.tsx:38-73`
- **Ref:** BUG-S-003

### FIX-025: Fix infinite loop in order quantity debounce
- **Priority:** P1
- **Platform:** Supplier Portal
- **Description:** Debounced quantity update mutation doesn't cancel on unmount. Stale state reference fires after component unmount.
- **Acceptance:** useEffect cleanup clears `qtyDebounceRef`. No state update warnings in React strict mode.
- **Files:** `supplier-portal/src/app/(dashboard)/orders/page.tsx:599-614`
- **Ref:** BUG-S-004

### FIX-026: Fix pagination state sync with URL
- **Priority:** P1
- **Platform:** Supplier Portal
- **Description:** Products page pagination uses both URL params and useState. Direct setCurrentPage calls bypass URL sync, breaking browser back button.
- **Acceptance:** currentPage derived from URL only (no useState). All pagination controls use router.replace.
- **Files:** `supplier-portal/src/app/(dashboard)/products/page.tsx:71-72`
- **Ref:** BUG-S-006

### FIX-027: Fix blob URL memory leak in image upload
- **Priority:** P1
- **Platform:** Supplier Portal
- **Description:** `URL.createObjectURL` called for image previews but `URL.revokeObjectURL` never called. Memory leaks accumulate with repeated uploads.
- **Acceptance:** All createObjectURL calls paired with revokeObjectURL in cleanup. Memory profiler shows no blob leak after 10 upload/replace cycles.
- **Files:** `supplier-portal/src/app/(dashboard)/products/page.tsx:277-282`
- **Ref:** BUG-S-007

### FIX-028: Close SSE connection on logout
- **Priority:** P1
- **Platform:** Supplier Portal
- **Description:** Orders page EventSource cleanup only runs on unmount, not logout. Multiple SSE connections accumulate on re-login.
- **Acceptance:** SSE closes when `isAuthenticated` changes to false. Network tab shows single SSE connection.
- **Files:** `supplier-portal/src/app/(dashboard)/orders/page.tsx:94-121`
- **Ref:** BUG-S-009

### FIX-029: Fix 401 redirect to include basePath /supplier
- **Priority:** P1
- **Platform:** Supplier Portal
- **Description:** `handle401Response()` redirects to `/login` instead of `/supplier/login`. After load balancer routing, users hit 404.
- **Acceptance:** All redirects use basePath prefix. Test: logged-out redirect goes to `/supplier/login`.
- **Files:** `supplier-portal/src/lib/api.ts:148-157`
- **Ref:** BUG-S-015, BUG-S-037 from old audit

### FIX-030: Fix phone validation — enforce Indian format
- **Priority:** P2
- **Platform:** Supplier Portal
- **Description:** Phone validation accepts any 10-13 digit number including non-Indian formats. India-specific app should enforce +91 prefix + 10 digits.
- **Acceptance:** Validation enforces `/^\+91[6-9]\d{9}$/` after normalization. Error message shows expected format.
- **Files:** `supplier-portal/src/app/register/page.tsx:215-218`
- **Ref:** BUG-S-010

---

## Tier 5: POS App P0-P1 (Phase 11F)

### FIX-031: Fix payment double-submit race condition
- **Priority:** P0
- **Platform:** POS App
- **Description:** `submittingRef` check-then-set pattern has race window. Between if-check and assignment, another tap can pass through. Must use atomic guard.
- **Acceptance:** Set `submittingRef.current = true` BEFORE the if-check, unset on early return. Test: rapid double-tap creates only 1 payment.
- **Files:** `src/screens/PaymentScreen.tsx:717-719, 1029-1032`
- **Ref:** BUG-P-002

### FIX-032: Fix network listener memory leak
- **Priority:** P0
- **Platform:** POS App
- **Description:** Network status useEffect callback can fire with stale state after unmount. Missing mounted ref guard causes setState on unmounted component.
- **Acceptance:** Add mounted ref. Cleanup runs before unmount. No "Can't perform React state update" warnings.
- **Files:** `src/screens/PaymentScreen.tsx:219-248`
- **Ref:** BUG-P-003

### FIX-033: Fix offline sync error swallowing
- **Priority:** P0
- **Platform:** POS App
- **Description:** `syncOutbox` silently catches batch errors. Users have no indication of failed syncs. Offline sales could be lost.
- **Acceptance:** Sync errors exposed to UI with retry button. Pending sync count visible in status bar.
- **Files:** `src/services/offline/sync.ts:149-183`
- **Ref:** BUG-P-001

### FIX-034: Fix BNPL polling abort controller race
- **Priority:** P1
- **Platform:** POS App
- **Description:** `pollingAbortControllerRef` accessed and mutated across async ops without lock. Rapid calls create dangling references.
- **Acceptance:** Polling uses controller identity check. New poll waits for previous to complete. Test: rapid startAutoPolling calls don't leak.
- **Files:** `src/screens/BnplDuesScreen.tsx:163-231`
- **Ref:** BUG-P-004

### FIX-035: Add keyboard dismiss on modal close
- **Priority:** P1
- **Platform:** POS App
- **Description:** SplitPaymentModal cleanup doesn't dismiss keyboard. Keyboard stays visible after modal closes if TextInput was focused.
- **Acceptance:** `Keyboard.dismiss()` called in cleanup. Test: focus amount input → close modal → keyboard hidden.
- **Files:** `src/components/sell/SplitPaymentModal.tsx:104-128`
- **Ref:** BUG-P-005

### FIX-036: Add loading state for QR regeneration
- **Priority:** P1
- **Platform:** POS App
- **Description:** QR regeneration shows brief blank state. No loading indicator during new UPI intent generation.
- **Acceptance:** ActivityIndicator shown while `loadingUpi` is true. No blank flash.
- **Files:** `src/screens/PaymentScreen.tsx:956-967`
- **Ref:** BUG-P-006

### FIX-037: Cap in-memory rate limit state growth
- **Priority:** P1
- **Platform:** POS App
- **Description:** `rateLimitState` Map grows indefinitely. On 24/7 device, hundreds of categories accumulate.
- **Acceptance:** Map capped at 100 entries with LRU eviction. Cleanup runs on every access.
- **Files:** `src/services/api/apiClient.ts:47, 53-67`
- **Ref:** BUG-P-007

### FIX-038: Surface offline scan errors to user
- **Priority:** P1
- **Platform:** POS App
- **Description:** `handleScan` shows generic "Scan failed" for all errors. Offline scans should show "Offline — scan will process when online".
- **Acceptance:** Error messages differentiate network errors from API errors. Offline state shows appropriate message.
- **Files:** `src/services/scan/handleScan.ts:366-399`
- **Ref:** BUG-P-008

### FIX-039: Add stale price warning before payment screen
- **Priority:** P1
- **Platform:** POS App
- **Description:** Cart price staleness only checked when payment button tapped (too late). 4-hour threshold hardcoded.
- **Acceptance:** Warning badge on cart/checkout button when items > 4 hours old. Threshold configurable via env var.
- **Files:** `src/screens/PaymentScreen.tsx:693-714`
- **Ref:** BUG-P-009

### FIX-040: Add max recording duration for voice
- **Priority:** P2
- **Platform:** POS App
- **Description:** Voice recording runs indefinitely. No auto-stop. Device storage/battery drain risk.
- **Acceptance:** Auto-stop at 60 seconds with notification. Progress bar shows remaining time.
- **Files:** `src/services/voice/voiceClient.ts:112-143`
- **Ref:** BUG-P-011

### FIX-041: Fix printer error state not clearing
- **Priority:** P2
- **Platform:** POS App
- **Description:** `printerService.status.error` set on failure but never cleared. Blocks future prints even after fix.
- **Acceptance:** Error auto-clears on successful connectivity check. Manual clearError method exposed.
- **Files:** `src/services/printerService.ts:139-194`
- **Ref:** BUG-P-012

### FIX-042: Fix voice audio session not reset on error
- **Priority:** P2
- **Platform:** POS App
- **Description:** If recording createAsync fails, audio session stays in recording mode. Blocks other audio.
- **Acceptance:** `resetAudioSession()` called in catch block. Test: failed recording doesn't block audio.
- **Files:** `src/services/voice/voiceClient.ts:137-142`
- **Ref:** BUG-P-019

---

## Tier 6: SuperAdmin P0-P1 (Phase 11G)

### FIX-043: Fix LoginGate error state — stay on email step on failure
- **Priority:** P0
- **Platform:** SuperAdmin
- **Description:** When `sendAdminOtp()` fails, step is still set to "otp". User can submit invalid OTP against failed request.
- **Acceptance:** Step only advances to "otp" on successful API call. Error shown on email step.
- **Files:** `supermandi-superadmin/src/components/LoginGate.tsx:38-47`
- **Ref:** BUG-A-001

### FIX-044: Fix analytics 401 — dispatch auth-expired event
- **Priority:** P0
- **Platform:** SuperAdmin
- **Description:** Analytics `getJson()` throws generic "Unauthorized" on 401 but doesn't dispatch auth-expired event. User stuck with expired token.
- **Acceptance:** Analytics uses `fetchWithTimeout` (which dispatches event) OR `getJson` dispatches event on 401.
- **Files:** `supermandi-superadmin/src/api/analytics.ts:10-34`
- **Ref:** BUG-A-004

### FIX-045: Fix empty string params in analytics API
- **Priority:** P0
- **Platform:** SuperAdmin
- **Description:** Analytics URLSearchParams appends `storeId=""` when empty. Backend may reject or return wrong data.
- **Acceptance:** Only append to searchParams if value is truthy and non-empty. Test: empty storeId excluded from request.
- **Files:** `supermandi-superadmin/src/api/analytics.ts:59-62`
- **Ref:** BUG-A-002

### FIX-046: Remove dead modal persistence code
- **Priority:** P0
- **Platform:** SuperAdmin
- **Description:** `loadModalState`/`saveModalState` exist but are never used (modalDirty guard prevents restoration). Dead code confuses debugging.
- **Acceptance:** Dead code removed. OR: implement properly if persistence is needed. No unused functions.
- **Files:** `supermandi-superadmin/src/App.tsx:180-201`
- **Ref:** BUG-A-003

### FIX-047: Fix SuppliersTab approve+publish setTimeout race
- **Priority:** P1
- **Platform:** SuperAdmin
- **Description:** "Approve & Publish" uses `setTimeout(handlePublishProduct, 1500)`. If approval takes >1.5s, publish fires before approval completes.
- **Acceptance:** Publish awaits approval promise completion (no setTimeout). Test: slow approval still publishes correctly.
- **Files:** `supermandi-superadmin/src/tabs/SuppliersTab.tsx:668-672`
- **Ref:** BUG-A-014

### FIX-048: Add error boundary around modal dialogs
- **Priority:** P1
- **Platform:** SuperAdmin
- **Description:** Product edit modal renders 200+ lines of JSX with calculations but no error boundary. Malformed data crashes entire app.
- **Acceptance:** Modal wrapped in ErrorBoundary with "Error loading data — Close" fallback.
- **Files:** `supermandi-superadmin/src/tabs/SuppliersTab.tsx:748-941`
- **Ref:** BUG-A-010

### FIX-049: Fix missing pagination in ApplicationsTab
- **Priority:** P1
- **Platform:** SuperAdmin
- **Description:** Shows "X of Y applications" but no way to load more. API supports limit/offset but UI doesn't expose pagination.
- **Acceptance:** "Load More" button or page controls. All applications accessible.
- **Files:** `supermandi-superadmin/src/tabs/ApplicationsTab.tsx:178-179`
- **Ref:** BUG-A-011

### FIX-050: Fix memory leak in SuppliersTab publish state
- **Priority:** P2
- **Platform:** SuperAdmin
- **Description:** `publishLoading`/`publishResult` state grows unbounded. Never cleared on unmount or list refresh.
- **Acceptance:** State cleared on tab unmount and product list refresh. Memory stable after 50 publish operations.
- **Files:** `supermandi-superadmin/src/tabs/SuppliersTab.tsx:118-119, 201-213`
- **Ref:** BUG-A-008

---

## Tier 7: P2 Cross-Platform Polish (Phase 11H)

### FIX-051: Strip console.log from production builds
- **Platform:** SuperAdmin, POS App
- **Description:** Console logs remain in production. SuperAdmin vite drop config doesn't catch template literals. POS has 335+ console.log calls.
- **Files:** `supermandi-superadmin/vite.config.ts:30-32`, POS `src/**`
- **Ref:** BUG-A-005

### FIX-052: Fix version.json filename convention
- **Platform:** Retailer Admin
- **Description:** Plugin writes `version.json` but should be `_version.json` to match backend convention and avoid indexing.
- **Files:** `retailer-admin/vite.config.ts:36`
- **Ref:** BUG-R-003

### FIX-053: Add Firebase config build-time validation
- **Platform:** Retailer Admin
- **Description:** Missing Firebase env vars only detected at runtime login. Build should fail if VITE_FIREBASE_* unset.
- **Files:** `retailer-admin/src/lib/firebase.ts:12-28`, `retailer-admin/vite.config.ts`
- **Ref:** BUG-R-028

### FIX-054: Fix profile page 404 in Supplier Portal nav
- **Platform:** Supplier Portal
- **Description:** Nav links to `/profile` but no page exists at that route. Users get 404.
- **Files:** `supplier-portal/src/app/(dashboard)/layout.tsx:27`
- **Ref:** BUG-S-020

### FIX-055: Fix formatPrice treating 0 as falsy
- **Platform:** Supplier Portal
- **Description:** `formatPrice` returns '-' for zero prices (treats 0 as falsy). Free products show dash instead of Rs 0.
- **Files:** `supplier-portal/src/app/(dashboard)/products/page.tsx:17-20`
- **Ref:** BUG-S-020 (old audit)

### FIX-056: Add ARIA labels to payment mode tabs
- **Platform:** POS App
- **Description:** Payment mode tabs and primary CTA lack accessibilityLabel/accessibilityHint. Screen readers announce "Button" with no context.
- **Files:** `src/screens/PaymentScreen.tsx:847-875, 1008-1014`
- **Ref:** BUG-P-022

### FIX-057: Fix QR code accessibility
- **Platform:** POS App
- **Description:** QRCode component has no accessibilityLabel. Visually impaired cashiers can't process UPI payments.
- **Files:** `src/screens/PaymentScreen.tsx:954`
- **Ref:** BUG-P-025

### FIX-058: Clear search history on store change
- **Platform:** POS App
- **Description:** Search history persists across store changes and device re-enrollment. Previous store's history visible.
- **Files:** `src/services/searchHistory.ts`
- **Ref:** BUG-P-021

### FIX-059: Fix cart auto-unlock not accounting for backgrounding
- **Platform:** POS App
- **Description:** Cart lock timeout uses Date.now() but doesn't pause when app is backgrounded. Lock expires silently.
- **Files:** `src/stores/cartStore.ts:702-714`
- **Ref:** BUG-P-020

### FIX-060: Fix sync retry — add manual retry UI
- **Platform:** POS App
- **Description:** Failed syncs have no retry mechanism. User has no way to trigger manual sync retry.
- **Files:** `src/services/offline/sync.ts:149-183`
- **Ref:** BUG-P-017

### FIX-061: Fix missing ARIA labels on product status filters
- **Platform:** Supplier Portal
- **Description:** Status filter buttons lack aria-pressed attributes. Screen readers don't know active filter.
- **Files:** `supplier-portal/src/app/(dashboard)/products/page.tsx:685-704`
- **Ref:** BUG-S-028

### FIX-062: Fix input sanitization in supplier search
- **Platform:** SuperAdmin
- **Description:** Search input sent to API without sanitization. Special regex chars could break backend search.
- **Files:** `supermandi-superadmin/src/tabs/SuppliersTab.tsx:401-404`
- **Ref:** BUG-A-015

### FIX-063: Add CSP meta tag to SuperAdmin
- **Platform:** SuperAdmin
- **Description:** No Content-Security-Policy. Inline service worker script would be blocked by strict CSP.
- **Files:** `supermandi-superadmin/index.html`
- **Ref:** BUG-A-013

### FIX-064: Fix OTP resend cooldown — persist in sessionStorage
- **Platform:** Supplier Portal
- **Description:** Cooldown lost on component remount. User can bypass by forcing remount.
- **Files:** `supplier-portal/src/app/(auth)/login/page.tsx:26, 60-65`
- **Ref:** BUG-S-024

### FIX-065: Fix document upload — add progress indicator
- **Platform:** Supplier Portal
- **Description:** Document upload shows "uploading" but no progress percentage. Large files appear frozen.
- **Files:** `supplier-portal/src/app/register/page.tsx:487-530`
- **Ref:** BUG-S-026

### FIX-066: Fix useUrlState debounce for search
- **Platform:** Supplier Portal
- **Description:** `setValue` calls `router.replace` on every keystroke. Creates excessive history entries.
- **Files:** `supplier-portal/src/hooks/useUrlState.ts:25-34`
- **Ref:** BUG-S-030

### FIX-067: Standardize error parsing across SuperAdmin API modules
- **Platform:** SuperAdmin
- **Description:** Some modules use `parseError(res)`, analytics uses custom parsing. Inconsistent error UX.
- **Files:** `supermandi-superadmin/src/api/analytics.ts`, `supermandi-superadmin/src/api/suppliers.ts`, etc.
- **Ref:** BUG-A-016

---

## Execution Order & Gates

```
Phase 11A (Tier 0): FIX-001→FIX-004  — Infra/Deploy
  Gate: All 6 services healthy at latest SHA, build passes

Phase 11B (Tier 1): FIX-005→FIX-008  — Backend P0
  Gate: Store isolation integration tests pass, idempotency test passes

Phase 11C (Tier 2): FIX-009→FIX-014  — Backend P1
  Gate: pnpm -r typecheck && pnpm test:contract && pnpm test:integration

Phase 11D (Tier 3): FIX-015→FIX-021  — Retailer P1
  Gate: pnpm -r typecheck && retailer-admin build && Playwright smoke

Phase 11E (Tier 4): FIX-022→FIX-030  — Supplier P0-P1
  Gate: pnpm -r typecheck && supplier-portal build && Playwright smoke

Phase 11F (Tier 5): FIX-031→FIX-042  — POS P0-P1
  Gate: pnpm -r typecheck && POS build && API smoke tests

Phase 11G (Tier 6): FIX-043→FIX-050  — SuperAdmin P0-P1
  Gate: pnpm -r typecheck && superadmin build && Playwright smoke

Phase 11H (Tier 7): FIX-051→FIX-067  — P2 Polish
  Gate: Full E2E suite passes, all builds clean, zero typecheck errors
```

### Execution Rules (Non-Negotiable)
1. **One ticket = one branch = one PR = one tag** — no mixed scope
2. **Bottom-up**: Lower tiers MUST complete before higher tiers start
3. **Gate before advance**: Run gate checks after each tier completes
4. **Operator E2E gate**: After automated gates pass, provide verification script before merge
5. **No partial fixes**: Each ticket must be UI-to-DB complete with tests

---

## Audit Source Files

| Platform | Agent Output |
|----------|-------------|
| Retailer Admin (29 bugs) | `tasks/accd549.output` |
| Supplier Portal (30 bugs) | `tasks/a08fce6.output` |
| POS App (25 bugs) | `tasks/ad1d72f.output` |
| SuperAdmin (25 bugs) | `tasks/ac3323b.output` |
| Backend (15 bugs) | `tasks/aa762b7.output` |
| GCP Infrastructure | MCP queries (gcloud, staging-db) |
