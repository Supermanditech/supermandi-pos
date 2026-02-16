# SuperMandi Production Hardening Backlog — Phase 11 + Phase 12

> **Generated:** 2026-02-16 (Phase 11), 2026-02-17 (Phase 12)
> **Audit:** 5 parallel deep-scan agents + GCP MCP parity check + full test-suite audit (250+ files read)
> **Scope:** Retailer Admin + Supplier Portal + POS App + SuperAdmin + Backend + GCP Infrastructure + Test Quality
> **Total Tickets:** 87 (67 Phase 11 + 20 Phase 12) | **Execution Model:** One ticket = one branch = one PR = one tag

---

## Executive Summary

### Phase 11: Production Hardening (FIX-001 → FIX-067) — 48/67 DONE

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

### Phase 12: Test Quality Hardening (TQ-001 → TQ-020) — 0/20 DONE

| Category | Total | P0 | P1 | P2 |
|----------|-------|----|----|------|
| Critical Gaps (auth, UI, CI) | 6 | 3 | 3 | 0 |
| Theater Removal & Rewrite | 7 | 0 | 4 | 3 |
| Test Infrastructure Fixes | 4 | 1 | 2 | 1 |
| Stress & Resilience | 3 | 0 | 1 | 2 |
| **TOTAL** | **20** | **4** | **10** | **6** |

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

## Phase 12: Test Quality Hardening (TQ-001 → TQ-020)

> **Generated:** 2026-02-17 | **Audit:** Full test-suite read of every test file in repo
> **Goal:** Eliminate test theater, close critical gaps, achieve "close eyes and ship" confidence
> **Scope:** Backend + POS + Retailer Admin + Supplier Portal + SuperAdmin + E2E
> **Total Tickets:** 20 | **Execution Model:** One ticket = one branch = one PR = one tag

### Phase 12 Summary

| Category | Total | P0 | P1 | P2 |
|----------|-------|----|----|------|
| Critical Gaps (auth, UI, CI) | 6 | 3 | 3 | 0 |
| Theater Removal & Rewrite | 7 | 0 | 4 | 3 |
| Test Infrastructure Fixes | 4 | 1 | 2 | 1 |
| Stress & Resilience | 3 | 0 | 1 | 2 |
| **TOTAL** | **20** | **4** | **10** | **6** |

### Audit Findings (Input for Tickets)

| Verdict | Backend | POS App | Portals | E2E | Total |
|---------|---------|---------|---------|-----|-------|
| PRODUCTION-GRADE | 10 files (~143 tests) | 24 files | 137 files | 13 files | 184 files |
| USEFUL-BUT-LIMITED | 8 files (~69 tests) | 12 files | — | 10 files | 30 files |
| THEATER | 4 files (~51 tests) | ~25 files | — | 3 files + 5 root e2e/ | 37 files |

**7 Critical Gaps Identified:**
1. No test ever logs in through real auth (all E2E bypass JWT)
2. Zero UI rendering tests for POS app (67 files, zero `render()` calls)
3. Cart store mocks away stock capping (the #1 business invariant)
4. Portal tests never hit a real backend (137 files, all mocked APIs)
5. Stress tests have never been run (no infrastructure exists)
6. No authenticated browser flows (Playwright only visits login pages)
7. Resilience tests non-functional (db-failure/redis-failure always skip)

---

### Tier 8: Critical Gap Closure — Auth & Security (Phase 12A)

#### TQ-001: Add real auth E2E test — phone login → JWT → authenticated request
- **Priority:** P0
- **Platform:** E2E (Playwright)
- **Scope:** Auth flow, JWT validation, token refresh
- **Description:** EVERY E2E test currently bypasses authentication using `x-actor-id` / `x-device-token` headers instead of going through the real JWT login flow. OTP is always bypassed via `otpProof: "dev-mode-skip"`. If the gateway has a bug validating tokens, all tests pass but production is insecure. Need at least one test per role (retailer, supplier, admin) that does: real phone input → OTP (test-mode) → receive JWT → make authenticated API call → verify JWT is validated by middleware → test token refresh → test expired token rejection.
- **Acceptance:** 3 new E2E tests (retailer, supplier, admin) that go through real `POST /auth/login` → receive JWT → use JWT in Authorization header → verify 401 on expired/invalid token. No `x-actor-id` header shortcuts.
- **Files:** `e2e-tests/tests/auth/real-auth-flow.spec.ts` (new), `e2e-tests/tests/auth/helpers.ts` (new)
- **Gap:** GAP-1

#### TQ-002: Add POS app component render tests for critical screens
- **Priority:** P0
- **Platform:** POS App
- **Scope:** React Native Testing Library, 5 critical screens
- **Description:** The POS app has 67 test files but ZERO component render tests. No `render()`, no `screen.getByText()`, no React Native Testing Library usage. If a button disappears, a screen crashes, or navigation breaks — nothing catches it. The three web portals have render tests but POS (the primary user-facing app) has none. Need render tests for the 5 highest-traffic screens: SellScanScreen, PaymentScreen, SuccessPrintScreenV2, MenuScreen, CartBottomSheet.
- **Acceptance:** 5 new test files using `@testing-library/react-native`. Each test: renders without crash, critical buttons exist, critical text visible, tap triggers expected action (mocked navigation/store). UX 4-state coverage (loading/success/empty/error) for screens that have those states.
- **Files:** `src/__tests__/screens/SellScanScreen.test.tsx` (new), `src/__tests__/screens/PaymentScreen.test.tsx` (new), `src/__tests__/screens/SuccessPrintScreen.test.tsx` (new), `src/__tests__/screens/MenuScreen.test.tsx` (new), `src/__tests__/screens/CartBottomSheet.test.tsx` (new)
- **Gap:** GAP-2

#### TQ-003: Fix cartStore test — stop mocking away stock cap
- **Priority:** P0
- **Platform:** POS App
- **Scope:** `src/__tests__/stores/cartStore.test.ts`
- **Description:** The Jest `cartStore.test.ts` mocks `capAddQuantity` to always succeed (`jest.mock('../services/stockCap')`). This means the most critical business invariant (don't oversell) is mocked away in the standard test suite. The real stock cap test exists in `src/services/stockCap.integration.test.js` but it's outside Jest's `testMatch` and doesn't run with `pnpm test`. The cart store test gives false confidence that cart operations are tested while silently allowing overselling.
- **Acceptance:** (A) `cartStore.test.ts` updated to test WITH real stock cap logic (at least 3 tests: add within stock, reject above stock, reject out-of-stock). (B) `stockCap.integration.test.js` path added to Jest `testMatch` OR converted to a Jest test file so it runs with `pnpm test`.
- **Files:** `src/__tests__/stores/cartStore.test.ts`, `src/services/stockCap.integration.test.js`, `jest.config.js`
- **Gap:** GAP-3

#### TQ-004: Move Tier 3 backend tests (goldenPath, auth) to CI
- **Priority:** P0
- **Platform:** Backend CI
- **Scope:** jest.config.ts, CI workflow
- **Description:** The two most valuable backend tests — `goldenPath.test.ts` (13 tests, full purchase cycle against real API + DB) and `auth.test.ts` (8 tests, real JWT flow) — only run in Tier 3, which requires a manually started API gateway. They are NOT part of CI. CI default is Tier 2. These tests catch authentication bypasses, state machine violations, inventory miscalculations — but nobody runs them. Need to add a CI job that spins up testcontainers + API gateway and runs Tier 3 tests.
- **Acceptance:** GitHub Actions workflow includes a `test-tier3` job that: starts PostgreSQL + Redis via testcontainers, starts API gateway, runs `TEST_TIER=3 pnpm test`. Job runs on every PR to main.
- **Files:** `.github/workflows/ci.yml` (modify), `backend/jest.config.ts` (verify Tier 3 config), `backend/tests/containers/globalSetup.ts`
- **Gap:** GAP-3 (backend aspect)

#### TQ-005: Add authenticated Playwright browser tests for all 3 portals
- **Priority:** P1
- **Platform:** E2E (Playwright)
- **Scope:** Retailer Admin, Supplier Portal, SuperAdmin
- **Description:** Every Playwright browser test only visits login/public pages. Nobody ever logs in and navigates authenticated dashboards, views products, creates orders, or uses any real feature through the browser. Need at least one smoke test per portal that: logs in with test credentials → navigates to main dashboard → verifies data loads → navigates to 2-3 key pages → logs out. This tests the real frontend-to-backend integration in a browser.
- **Acceptance:** 3 new Playwright spec files. Each: (1) loads portal login page, (2) enters test credentials, (3) reaches authenticated dashboard, (4) verifies at least 1 API-driven data load, (5) navigates to 2 sub-pages, (6) logs out successfully. No `x-actor-id` shortcuts — real browser auth.
- **Files:** `e2e-tests/tests/authenticated/retailer-dashboard.spec.ts` (new), `e2e-tests/tests/authenticated/supplier-dashboard.spec.ts` (new), `e2e-tests/tests/authenticated/admin-dashboard.spec.ts` (new)
- **Gap:** GAP-6

#### TQ-006: Add portal-to-backend integration contract tests
- **Priority:** P1
- **Platform:** Retailer Admin, Supplier Portal, SuperAdmin
- **Scope:** API response shape validation
- **Description:** All 137 portal test files use mocked API responses. They verify the UI calls the right endpoints with right payloads, but never verify the backend returns what the frontend expects. A backend response shape change would break portals silently. Need contract tests that: call the real backend API → validate the response matches the Zod/TypeScript shape the portal expects. These can run against the same testcontainers backend from TQ-004.
- **Acceptance:** 3 new test files (one per portal) that make real HTTP calls to the backend and validate response shapes against the portal's expected types. At minimum: auth endpoint, product list, order list, config-status.
- **Files:** `e2e-tests/tests/contracts/retailer-api-contract.spec.ts` (new), `e2e-tests/tests/contracts/supplier-api-contract.spec.ts` (new), `e2e-tests/tests/contracts/admin-api-contract.spec.ts` (new)
- **Gap:** GAP-4

---

### Tier 9: Theater Removal & Rewrite (Phase 12B)

#### TQ-007: Rewrite backend security.unit.test.ts — test real middleware
- **Priority:** P1
- **Platform:** Backend
- **Scope:** `backend/tests/security.unit.test.ts` (14 tests)
- **Description:** Every test creates local objects and asserts against them. The SQL injection test does `expect(maliciousInput).toContain("'")` — asserting a string literal has a quote. The XSS test does a manual `.replace()` unrelated to actual escaping. The RBAC test defines local role arrays. The storeId test compares two local variables. ZERO imports from actual codebase. If someone removes all authentication from every route, these 14 tests still pass.
- **Acceptance:** Rewrite to import and test real middleware: (A) `enforceStoreIsolation` with tampered storeId → verify rejection. (B) Real Express route with `requireDeviceToken` → verify 401 without token. (C) Real input validation middleware with SQL injection payload → verify sanitized. Delete any test that doesn't import real application code.
- **Files:** `backend/tests/security.unit.test.ts`
- **Verdict:** Currently THEATER → must become PRODUCTION-GRADE

#### TQ-008: Rewrite backend dataIntegrity.unit.test.ts — test real functions
- **Priority:** P1
- **Platform:** Backend
- **Scope:** `backend/tests/dataIntegrity.unit.test.ts` (12 tests)
- **Description:** Tests JavaScript arithmetic: `expect(10 + 20).toBe(30)`. The "sale cannot create negative stock" test does `if (condition) expect(true).toBe(true)`. The "ledger entries immutable" test asserts a local object has a field it was just given. No application code imported. Zero production bug detection capability.
- **Acceptance:** Rewrite to import real functions: (A) Test `formatMoney` with edge cases. (B) Test `normalizeScan` with real barcodes. (C) Test `applyInventoryMovement` with boundary values. (D) Test real order state machine transitions. Delete any test that only asserts local arithmetic.
- **Files:** `backend/tests/dataIntegrity.unit.test.ts`
- **Verdict:** Currently THEATER → must become PRODUCTION-GRADE

#### TQ-009: Rewrite backend crossServiceIntegration.unit.test.ts — test real flows
- **Priority:** P1
- **Platform:** Backend
- **Scope:** `backend/tests/crossServiceIntegration.unit.test.ts` (8 tests)
- **Description:** Despite name "Cross-Service Integration," nothing crosses services. Every test creates local data and asserts `expect(95).toBeLessThanOrEqual(100)`. None import application code. Name gives false confidence of integration coverage that doesn't exist.
- **Acceptance:** Either: (A) Rewrite as real cross-service tests that call scan → create sale → verify inventory deduction via actual service functions. OR (B) Delete file entirely (the real integration testing is done by `goldenPath.test.ts` in Tier 3). No in-between — no local arithmetic masquerading as integration tests.
- **Files:** `backend/tests/crossServiceIntegration.unit.test.ts`
- **Verdict:** Currently THEATER → delete or rewrite

#### TQ-010: Rewrite POS fixPOS.test.ts — test actual code, not copies
- **Priority:** P1
- **Platform:** POS App
- **Scope:** `src/__tests__/fixes/fixPOS.test.ts` (~35 tests across 13 describe blocks)
- **Description:** Each FIX test re-implements the fix logic inline (in the test file) and tests the inline copy. FIX-035 literally sets a boolean to true and asserts it's true. FIX-056/057 create objects with hardcoded strings and check they exist. FIX-037 implements LRU eviction from scratch. None import from `src/`. If real code drifts, tests still pass green.
- **Acceptance:** For each FIX block: (A) If the fix is in a pure function (e.g., LRU eviction in apiClient), import and test the REAL function. (B) If the fix is a UI pattern (mounted ref, cleanup), convert to a component render test. (C) If the fix is trivially correct (set boolean), delete the test. Every remaining test must have at least one `import` from `src/`.
- **Files:** `src/__tests__/fixes/fixPOS.test.ts`
- **Verdict:** Currently THEATER → rewrite or delete

#### TQ-011: Remove/rewrite POS API export-only tests
- **Priority:** P2
- **Platform:** POS App
- **Scope:** ~20 files in `src/__tests__/services/api/*.test.ts`
- **Description:** Every API test file just checks `typeof function === 'function'` and creates TypeScript objects to verify `.field === 'value'`. TypeScript compilation already catches this. Example: `expect(typeof createSale).toBe('function')` — this is the test. If createSale throws on every call, the test passes.
- **Acceptance:** Either: (A) Add real tests per file — mock fetch, verify correct URL/method/headers/body sent. OR (B) Delete these files and rely on TypeScript + the real integration tests. Minimum: any remaining test must assert behavior, not just existence.
- **Files:** `src/__tests__/services/api/posApi.test.ts`, `src/__tests__/services/api/scanApi.test.ts`, and ~18 more in same directory
- **Verdict:** Currently THEATER → rewrite or delete

#### TQ-012: Delete root e2e/ theater tests
- **Priority:** P2
- **Platform:** POS App
- **Scope:** `e2e/` directory (5 files)
- **Description:** Files claim "E2E" but contain only arithmetic: `expect(10000 * 2).toBe(20000)`, array filters, and string comparisons. Comments admit: "for full UI E2E testing, use Maestro flows." Zero HTTP calls, zero browser automation, zero DB. Real E2E is in `e2e-tests/` directory. These mislead contributors into thinking E2E coverage exists.
- **Acceptance:** Delete `e2e/` directory entirely (not `e2e-tests/` — that's the real one). Or rename to `e2e/README.md` explaining these are deprecated stubs.
- **Files:** `e2e/sellFlow.test.ts`, `e2e/buyFlow.test.ts`, `e2e/reorderFlow.test.ts`, `e2e/grnFlow.test.ts`, `e2e/batchKInvariants.test.ts`, `e2e/jest.config.js`
- **Verdict:** Currently THEATER → delete

#### TQ-013: Rewrite backend voiceOrderService boundary tests — import real code
- **Priority:** P2
- **Platform:** Backend
- **Scope:** `backend/src/services/ai/__tests__/voiceOrderService.test.ts` (boundary section)
- **Description:** The `enforceBoundaries` function tested on lines 13-42 is a LOCAL COPY defined inside the test file. It has zero connection to the real `voiceOrderService.ts`. If someone changes the real service's boundary logic, these tests keep passing with the old copied logic. The schema validation and idempotency sections are separate and acceptable.
- **Acceptance:** Import `enforceBoundaries` from the actual service file (or its extracted utility). Delete the local copy. If the function isn't exported, export it. Every assertion must reference imported code.
- **Files:** `backend/src/services/ai/__tests__/voiceOrderService.test.ts`
- **Verdict:** Boundary section THEATER → rewrite

---

### Tier 10: Test Infrastructure Fixes (Phase 12C)

#### TQ-014: Include standalone POS integration tests in Jest testMatch
- **Priority:** P1
- **Platform:** POS App
- **Scope:** `jest.config.js`, 5 standalone test files
- **Description:** The 5 most valuable POS tests — `stockCap.integration.test.js`, `sellFirstOnboarding.integration.test.js`, `stockService.integration.test.js`, `saleScope.test.js`, `purchaseDraftLogic.test.ts` — use `node:assert` and `vm.runInNewContext` with manual TypeScript transpilation. They are NOT in Jest's `testMatch` pattern (`<rootDir>/src/__tests__/**/*`) and don't run with `pnpm test`. They must be executed individually via `node src/services/stockCap.test.js`. They are invisible to the standard test runner.
- **Acceptance:** Either: (A) Move files into `src/__tests__/` and convert to Jest assertions. OR (B) Add a second testMatch pattern: `<rootDir>/src/**/*.integration.test.{js,ts}`. OR (C) Add an npm script `test:integration` that runs them separately. The standalone tests MUST be discoverable by at least one `pnpm test*` command.
- **Files:** `jest.config.js`, `src/services/stockCap.integration.test.js`, `src/services/scan/sellFirstOnboarding.integration.test.js`, `src/services/stockService.integration.test.js`, `src/services/saleScope.test.js`, `src/stores/purchaseDraftLogic.test.ts`

#### TQ-015: Fix E2E accessibility-deep.spec.ts broken assertion
- **Priority:** P2
- **Platform:** E2E (Playwright)
- **Scope:** `e2e-tests/tests/accessibility-deep.spec.ts`
- **Description:** The focus indicator test does `expect(typeof hasVisibleFocus).toBe('boolean')` — this assertion ALWAYS passes. It checks the type is boolean, not that focus IS visible. Should be `expect(hasVisibleFocus).toBe(true)`. This means the focus indicator check provides zero value.
- **Acceptance:** Change assertion to `expect(hasVisibleFocus).toBe(true)`. If the test then fails because focus indicators are missing, fix the CSS. Don't weaken the assertion back.
- **Files:** `e2e-tests/tests/accessibility-deep.spec.ts`

#### TQ-016: Fix backend contract tests — import Zod schemas from app code
- **Priority:** P1
- **Platform:** Backend
- **Scope:** `backend/tests/contracts/posApi.unit.test.ts`, `backend/tests/contracts/inventoryApi.unit.test.ts`
- **Description:** Both files define Zod schemas inside the test file that are disconnected from actual API code. If the real API returns a different shape, these tests don't know. They test "does Zod work?" not "does our API match the contract?" Need to either import schemas from the app code OR generate schemas from actual response types.
- **Acceptance:** Schemas imported from actual API service files or shared types. If no shared schemas exist, create them in a `backend/src/contracts/` directory and import from both route handlers and tests. Every schema must have a clear link to the route it validates.
- **Files:** `backend/tests/contracts/posApi.unit.test.ts`, `backend/tests/contracts/inventoryApi.unit.test.ts`

#### TQ-017: Add test coverage reporting to CI
- **Priority:** P1
- **Platform:** All
- **Scope:** CI workflow, jest/vitest configs
- **Description:** No coverage reporting exists in CI. Theater tests inflate perceived coverage. Need actual coverage numbers visible on every PR to track progress and prevent regression. Coverage thresholds exist in portal configs (30% statements) but are never enforced.
- **Acceptance:** CI workflow runs tests with `--coverage`. Coverage report attached to PR as comment. Coverage thresholds enforced: fail if coverage drops below current baseline. Coverage badge in README.
- **Files:** `.github/workflows/ci.yml`, `jest.config.js`, `backend/jest.config.ts`, `retailer-admin/vitest.config.ts`, `supermandi-superadmin/vitest.config.ts`, `supplier-portal/jest.config.js`

---

### Tier 11: Stress & Resilience Tests (Phase 12D)

#### TQ-018: Fix E2E db-failure and redis-failure tests — implement real failure simulation
- **Priority:** P1
- **Platform:** E2E (Playwright)
- **Scope:** `e2e-tests/stress/tests/db-failure.spec.ts`, `e2e-tests/stress/tests/redis-failure.spec.ts`
- **Description:** Both files have the right intent but critical tests are behind `test.skip()` with manual env flags (`DB_DOWN=true`, `REDIS_DOWN=true`). The `simulateDbFailure()` function is literally `console.log()` — it doesn't actually stop any services. The only tests that run are trivial health checks. Real resilience testing requires using testcontainers to actually stop/restart DB/Redis.
- **Acceptance:** Rewrite using testcontainers: (A) Start PostgreSQL + Redis. (B) Run baseline test. (C) Stop PostgreSQL container. (D) Verify API returns 503 (not crash). (E) Restart PostgreSQL. (F) Verify recovery. Same pattern for Redis. Remove `test.skip()` and env flag gates. Tests must actually run.
- **Files:** `e2e-tests/stress/tests/db-failure.spec.ts`, `e2e-tests/stress/tests/redis-failure.spec.ts`

#### TQ-019: Set up k6 stress test infrastructure
- **Priority:** P2
- **Platform:** E2E (k6)
- **Scope:** k6 scripts, seed data, CI integration
- **Description:** 6 well-designed k6 stress scripts exist but require: k6 installed, staging deployment, seeded 100K-product database, Razorpay sandbox, multiple auth tokens. No evidence this infrastructure has ever been assembled. The `seed-production-data.ts` script exists but requires direct DB access. Need a runnable setup that can execute stress tests against staging after deploy.
- **Acceptance:** (A) Docker-based k6 setup (or k6 cloud config). (B) `seed-production-data.ts` runnable against staging Cloud SQL. (C) Auth token generation script for k6 scenarios. (D) CI job that runs k6 suite after staging deploy (can be manual trigger). (E) At least one stress test (scan-stress) verifiable locally.
- **Files:** `e2e-tests/stress/k6/*.js`, `e2e-tests/stress/seed-production-data.ts`, `.github/workflows/stress-test.yml` (new)

#### TQ-020: Replace go-no-go-report.ts with computed report
- **Priority:** P2
- **Platform:** E2E
- **Scope:** `e2e-tests/stress/go-no-go-report.ts`
- **Description:** Current script prints 20 hardcoded "PASS" values that are developer assertions, not computed from actual test runs. The 28 "MANUAL" entries have no tracking mechanism. This is a documentation artifact masquerading as an automated gate.
- **Acceptance:** Rewrite to: (A) Read actual test results from Jest/Playwright/k6 JSON output files. (B) Compute PASS/FAIL from real data. (C) Track MANUAL items with explicit staging verification checkboxes. (D) Output machine-readable JSON for CI gating. Zero hardcoded PASS values.
- **Files:** `e2e-tests/stress/go-no-go-report.ts`

---

### Phase 12 Execution Order & Gates

```
Phase 12A (Tier 8): TQ-001→TQ-006  — Critical Gap Closure
  Gate: Real auth E2E passes, POS render tests pass, cartStore tests enforce stock cap

Phase 12B (Tier 9): TQ-007→TQ-013  — Theater Removal
  Gate: Zero theater tests remain. Every test file imports real application code.

Phase 12C (Tier 10): TQ-014→TQ-017  — Infrastructure Fixes
  Gate: All standalone tests discoverable by pnpm test, CI coverage reporting active

Phase 12D (Tier 11): TQ-018→TQ-020  — Stress & Resilience
  Gate: db-failure + redis-failure tests actually run, k6 scan-stress verifiable
```

### Phase 12 Execution Rules
1. **One ticket = one branch = one PR = one tag** — no mixed scope
2. **TQ-001→TQ-004 are blockers** — these close the critical security/integrity gaps
3. **Theater removal (TQ-007→TQ-013) can run in parallel** — independent files
4. **TQ-014 (Jest testMatch) must come before TQ-003** — standalone tests need to be in Jest first
5. **TQ-017 (coverage CI) should be early** — establishes baseline before rewrites
6. **Delete > Rewrite** — if a theater test has no salvageable logic, delete it. Don't polish garbage.

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
| **Test Quality Audit** | **Full-repo read of all 250+ test files, 2026-02-17** |
