# Claude Production Rules

> **Discipline contract for every Claude session on SuperMandi.**
> This file is MANDATORY reading at session start — referenced by MASTER_PLAN.md.
> Claude MUST internalize every rule before writing a single line of code.
> Last Updated: 2026-02-11

---

## PURPOSE

MASTER_PLAN.md defines *what* gets done (batches, tickets, gates).
ZERO_REGRESSION_RULES.md defines *how deploys work* (immutability, rollback).
**This file defines *how Claude writes code* — the fix-quality standard, test discipline, pipeline workflow, and production safety rules.**

---

## PART A: NON-NEGOTIABLE PRINCIPLES

### A.1 Every Fix Is Production-Grade

No temporary fixes. No "TODO: fix later." Every commit must be deployable to production as-is.

| Forbidden | Required |
|-----------|----------|
| `// TODO: fix later` | Fix now or create a ticket |
| `// HACK:` or `// WORKAROUND:` | Proper solution or BLOCKED |
| Feature flags to hide broken code | Fix the code or revert it |
| `try { } catch { /* swallow */ }` | Handle the error or let it propagate |

**Test**: Would you be comfortable if this code ran in production for a year untouched? If not, it's a temp fix.

### A.2 Every Fix Works in All Environments

Every fix must work identically in:

```
LOCAL (pnpm dev) → LOCAL-PROD (docker-compose) → STAGING (Cloud Run) → PRODUCTION (Cloud Run)
```

| Forbidden | Required |
|-----------|----------|
| Paths that only work on Windows | `path.join()` or platform-agnostic |
| `fs.readFileSync("C:\\...")` | Env-driven paths or bundled assets |
| Fixes tested only in `pnpm dev` | Verified in `docker-compose.local-prod.yml` |
| `if (staging) skip_validation()` | Same validation in all environments |
| Browser-only debugging hacks | Proper error handling |

**Test**: Does this fix work inside a Docker container with no source mount?

### A.3 Every Fix Has Evidence

No "I think it works." Every fix must have proof appropriate to its risk class.

### A.4 Every Fix Is Scoped to One Ticket

One ticket, one fix, one atomic commit. No scope creep.

---

## PART B: PRODUCTION SAFETY RULES

### B.1 No Hardcoded Values

| Forbidden | Required |
|-----------|----------|
| `"http://localhost:3000"` | `process.env.API_BASE_URL` |
| `"34.xxx.xxx.xxx"` | `process.env.DATABASE_HOST` |
| `"store_123"` (test store ID) | Parameter or env var |
| `"Bearer eyJ..."` (embedded token) | Auth flow or env var |
| Magic numbers without explanation | Named constants |

**Enforcement**: Grep CI gate catches `localhost`, hardcoded IPs, embedded tokens.

### B.2 No Manual Infrastructure Patches

Every fix MUST exist in the repository. The environment must converge from `git clone` + one-click deploy. SuperMandi runs on **Google Cloud Run** (not VMs) — there is no server to SSH into.

| Forbidden | Required |
|-----------|----------|
| Manual Cloud SQL schema changes via console | Migration file in `backend/migrations/` |
| Direct edits to Cloud Run env vars in GCP console | Env vars via Secret Manager + deploy script |
| "Just run this SQL on Cloud SQL" | `scripts/migrate-prod.js` with the SQL in a migration file |
| Manual config changes in GCP console | Infrastructure-as-code or deploy scripts in repo |
| Hotfixing a running Cloud Run revision | New image build → deploy via pipeline |

**Rule**: If a fix requires a manual step in GCP console or any infrastructure outside the repo, it is NOT a fix. It is a temporary workaround and must be replaced with an automated, repo-tracked solution before the batch closes.

### B.3 No Broken Business Logic

SuperMandi has domain invariants that must NEVER be violated:

| # | Invariant | Meaning | Enforcement |
|---|-----------|---------|-------------|
| 1 | **Stock correctness** | `stock_in - stock_out = current_stock` always | `test:invariants` checks after every stock operation |
| 2 | **Ledger balance** | Every debit has a corresponding credit | Ledger reconciliation test |
| 3 | **Store isolation** | Store A's data is never visible to Store B | Server derives `storeId` ONLY from JWT token — **client input is NEVER trusted for store scoping** |
| 4 | **Idempotency** | Retrying a payment/GRN never double-counts | Every mutating endpoint MUST accept an `idempotencyKey` header; server MUST enforce uniqueness |
| 5 | **Scan resolves store-scoped** | Barcode scan returns products for the authenticated store only | WHERE clause always includes `store_id = $token.storeId` |
| 6 | **Price integrity** | Selling price >= 0, cost price recorded at time of purchase | CHECK constraints in DB + validation in service layer |

**Rule**: If a fix could affect any invariant above, the fix MUST include a test or proof that the invariant still holds.

**If unsure**: Ask. Do not guess. A wrong assumption about stock/ledger/payment correctness is worse than being blocked.

### B.4 No Partial Integrations

Every feature must be complete end-to-end:

```
UI Component → API Call → Service Logic → Database → Response → UI Update
```

| Forbidden | Required |
|-----------|----------|
| UI button that calls a non-existent API | Wire up the full chain or don't add the button |
| API endpoint with `// TODO: implement` | Implement or don't merge |
| Database column added but never read | Use it or don't add it |
| Service method that returns mock data | Real implementation or explicit mock boundary |

**Test**: Can a user complete the full journey (click → see result) without hitting a dead end?

### B.5 Migration Discipline

All database changes follow the **expand → migrate → contract** pattern:

| Phase | What Happens | Example |
|-------|-------------|---------|
| **Expand** | Add new column/table, keep old working | `ALTER TABLE ADD COLUMN new_col` with DEFAULT |
| **Migrate** | Backfill data, update code to use new | `UPDATE SET new_col = old_col` + deploy new code |
| **Contract** | Remove old column/table after verification | `ALTER TABLE DROP COLUMN old_col` (next batch) |

**Migration rules**:
- Every migration is **idempotent** (`IF NOT EXISTS`, `CREATE OR REPLACE`)
- Every migration is **backward compatible** (old code must still work after migration runs)
- CI runs **migrate-from-zero** on every PR (empty DB → all migrations → verify schema)
- Migration numbering: `NNN_description.sql` (sequential, never reorder)
- Never edit a deployed migration — always create a new one

### B.6 Performance Sanity

| Forbidden | Required |
|-----------|----------|
| N+1 queries | Batch/join queries, `dataloader` pattern |
| Unbounded `SELECT *` | Pagination with `LIMIT`/`OFFSET` or cursor |
| No performance baseline | p95 response time targets per endpoint class |
| Untested under load | k6 sanity pack for critical paths |

**Targets** (API responses):
- Health/version: < 50ms p95
- Read endpoints: < 200ms p95
- Write endpoints: < 500ms p95
- Batch operations: < 2s p95

#### B.6.1 Load Testing (k6/Locust)

Run load profiles against Docker stack (and later staging):

| Endpoint Class | Target QPS | p95 Target | Notes |
|----------------|-----------|------------|-------|
| `scan/resolve` | High | < 300ms | Hot path — most frequent POS operation |
| `search` | High | < 500ms | Realistic queries, not just prefix |
| `checkout` | Medium | < 500ms | Must be reliable + idempotent |
| `stock-in` | Medium | < 500ms | GRN/purchase receiving |

**Pass criteria**:
- p95 latency within targets above
- Error rate < 0.1%
- Zero DB deadlocks/timeouts under target load
- Zero duplicate records from concurrent writes

#### B.6.2 DB Performance Proof

Required indexes (must exist and be used):

| Index | Purpose |
|-------|---------|
| `barcode → product` mapping | Fast scan resolve |
| `store_id` scoped search | Store-isolated queries |
| `store_products` lookup | POS product catalog |
| Composite `(store_id, barcode)` | Primary POS hot path |

**Enforcement**:
- Run `EXPLAIN ANALYZE` on hot-path queries
- Enable slow-query logging (> 100ms) in local-prod
- All hot-path queries must use index scan, not seq scan
- Document results in evidence pack

#### B.6.3 Large Dataset Simulation

Before go-live, test with realistic data volumes:

| Fixture | Size | Purpose |
|---------|------|---------|
| Single store | 100k SKUs | Prove scan/search/checkout at scale |
| Multi-store (optional) | 10 stores × 50k SKUs each | Prove store isolation under load |
| Cart stress | 50-line carts | Prove checkout with large orders |

**Test scenarios**:
- Search pagination with 100k results
- Scan resolve cache hit/miss patterns
- Checkout with 50-line carts
- Barcode density (multiple products per barcode prefix)

### B.7 Resilience & Graceful Degradation

The system must degrade gracefully when dependencies fail — not crash.

| Failure Scenario | Expected Behavior | Test Method |
|-----------------|-------------------|-------------|
| **DB temporarily down** | API returns 503 (not crash), retries on reconnect | Stop Postgres container, verify API response, restart, verify recovery |
| **Redis down** | Cache miss → DB fallback, sessions degrade gracefully | Stop Redis container, verify read paths still work (slower), verify no crash |
| **Single service down** | Gateway returns correct 503 for affected routes, other routes unaffected | Stop one backend service, verify gateway isolates failure |
| **Slow DB response** | Request timeout fires, client gets clear error | Simulate slow query, verify timeout + error response (not hang) |

**Enforcement**:
- `test:resilience` runs against Docker stack with controlled container stop/start
- Every service MUST handle connection pool exhaustion without crashing
- Gateway MUST NOT crash when a downstream service is unreachable
- POS MUST show clear user-facing error (not blank screen) when API is down

### B.8 Security Enforcement

| Security Concern | Rule | Test Method |
|-----------------|------|-------------|
| **AuthN everywhere** | Every API endpoint (except `/health`, `/version`) requires valid token | `test:security` — hit all routes without token, verify 401 |
| **RBAC enforcement** | Cashier cannot access manager endpoints, manager cannot access superadmin | `test:security` — hit endpoints with wrong role token, verify 403 |
| **Tenant isolation** | Store A token never returns Store B data (API + DB + cache) | `test:invariants` — already covers (B.3 invariant #3) |
| **Input validation** | SQL injection, XSS payloads rejected at API boundary | `test:security` — send malicious payloads, verify rejection |
| **Secrets audit** | No dev keys, test tokens, or `.env` values in production builds | CI grep gate — scan built artifacts for known test patterns |
| **Config validation** | Missing required env var = fail-fast on startup (not silent fallback) | Startup test — omit each required var, verify crash with clear message |

**Enforcement**:
- `test:security` runs as part of CI (not optional)
- Auth header enforcement: zero public admin/write endpoints
- Rate limiting on auth endpoints (login, OTP) to prevent brute force
- All user input sanitized before DB queries (parameterized queries only, no string concatenation)

---

## PART C: TEST POLICY — AFTER EVERY FIX

### C.1 Always Run (Every Change)

```
pnpm -r typecheck          # Zero errors across all projects
pnpm -r lint               # Zero warnings (errors are blocked)
pnpm -r build              # All projects build successfully
pnpm test:ci               # Unit test suite
pnpm test:contract         # API contract validation (Zod/OpenAPI schema match)
```

> **Contract-Lock Gate**: Validates real API responses against Zod/OpenAPI schemas.
> Fails CI if any response shape changes or required header is missing.
> This catches the #1 go-live crash: "API changed, UI breaks" or "env/header missing".

### C.2 By Change Type

#### A. Backend / API Changes

| Test | Command | What It Proves |
|------|---------|----------------|
| Migrate from zero | `pnpm test:migrate-zero` | All migrations apply cleanly to empty DB |
| Schema verify | `pnpm test:schema-verify` | Schema matches expected state |
| Integration tests | `pnpm test:integration` | Services talk to each other correctly |
| Contract tests | `pnpm test:contract` | API responses match documented schema |
| Domain invariants | `pnpm test:invariants` | All 6 invariants (B.3) still hold |

**Domain invariant tests must verify**:
1. Stock: `stock_in - stock_out = current_stock` after operation
2. Ledger: debits = credits for the transaction
3. Store isolation: query with Store B token returns zero rows of Store A data
4. Idempotency: same request with same key = same response, no double-count
5. Scan: barcode query scoped to token's store only

**Transaction-safe integration scenarios** (must pass as atomic operations):

| Scenario | Writes | Invariant |
|----------|--------|-----------|
| Sale checkout | sale record + ledger entry + stock deduction | All three written in one transaction, or none |
| Stock-in (GRN) | ledger entry + stock increment | Both written atomically |
| Scan resolve | read-only | Always returns store-scoped product only |
| Retry checkout | same idempotency key | No duplicate orders, no double stock deduction |

#### B. Migration Changes

| Test | Command | What It Proves |
|------|---------|----------------|
| Migrate from zero | `pnpm test:migrate-zero` | Empty DB → all migrations → success |
| Schema verify | `pnpm test:schema-verify` | Schema matches expected state |
| Backward compat | Manual check | Old code still works after migration |
| Domain invariants | `pnpm test:invariants` | Stock/ledger/isolation still hold |

#### C. Portal Changes (retailer-admin, supplier-portal, supermandi-superadmin)

| Test | Command | What It Proves |
|------|---------|----------------|
| Production build | `pnpm --filter <portal> build` | No build errors |
| Playwright smoke | `pnpm test:e2e:<portal>` | Page loads, login works, critical journey completes |
| No console errors | Playwright assertion | No `console.error` in browser |

#### D. POS (Expo/React Native) Changes

| Test | Command | What It Proves |
|------|---------|----------------|
| Typecheck + lint | `pnpm typecheck && pnpm lint` (in POS root) | No type errors |
| API smoke | `pnpm test:pos:smoke` | POS can reach API, auth works, basic CRUD |
| Emulator E2E | Maestro/Detox flow | Sell flow completes on emulator |
| Release build smoke | Build release APK, test scan+sell loop 30–60 min | No memory leaks, no crashes in production mode |
| Offline/flaky network | Simulate airplane mode mid-checkout, 2G latency | Graceful degradation, retry with backoff, clear error UI |

**POS Scanner & Hardware Tests**:

| Test | What It Proves |
|------|----------------|
| HID scanner buffering | Rapid sequential scans are debounced correctly, Enter key terminates barcode |
| Duplicate scan guard | Same barcode scanned twice rapidly adds quantity (not duplicate line item) |
| Camera scan fallback | If HID scanner disconnected, camera scan activates and resolves barcode |
| Background/foreground | App resumes correctly after backgrounding mid-checkout (no state loss) |
| Soak test (extended) | 2+ hour continuous scan+sell loop on release APK — no memory leaks, no ANR |

**POS Crash-Proofing Requirements**:
- Lists MUST be virtualized (FlashList/FlatList with windowing) — no unbounded renders
- Guard against unbounded state growth (scan buffer, logs, cart arrays)
- All writes MUST use idempotency keys
- All network calls MUST have timeouts + retry with exponential backoff
- User-facing error UI for network failures ("retry safely" not just "error")
- Scanner input buffer MUST be bounded and cleared after resolve

#### E. Infrastructure Changes (Docker, CI, nginx, deploy scripts)

| Test | What It Proves |
|------|----------------|
| `docker-compose up` (local-prod) | All containers start, health checks pass |
| Full gate suite | `pnpm release:gate` passes |
| Manual browser check | All portals accessible at expected URLs |

### C.3 Standardized Test Pack Scripts

These scripts MUST exist in `package.json` (root or per-service):

| Script | Scope |
|--------|-------|
| `test:ci` | Unit tests (runs in CI and locally) |
| `test:integration` | Backend integration tests |
| `test:invariants` | Domain invariant verification (stock, ledger, isolation, idempotency, scan, price) |
| `test:migrate-zero` | Empty DB → all migrations → verify schema |
| `test:schema-verify` | Compare live schema to expected |
| `test:contract` | API contract validation (Zod/OpenAPI schema match) |
| `test:e2e:retailer` | Retailer admin Playwright smoke |
| `test:e2e:supplier` | Supplier portal Playwright smoke |
| `test:e2e:superadmin` | SuperAdmin Playwright smoke |
| `test:pos:smoke` | POS API smoke tests |
| `test:resilience` | Graceful degradation (DB down, Redis down, service down) |
| `test:security` | Auth enforcement, RBAC, input validation, tenant isolation |
| `test:load` | k6/Locust load profiles (scan, search, checkout, stock-in) |
| `test:load:dataset` | Large dataset simulation (100k SKU fixture + stress scenarios) |
| `test:deploy-parity` | Docker build + stack startup + gateway routing + health + config validation |
| `release:gate` | Full release gate (typecheck + lint + build + contract + @prod E2E) |

### C.4 Critical E2E Paths (Playwright @prod)

These are the specific end-to-end journeys that @prod E2E tests MUST cover:

| # | Journey | Steps | What It Catches |
|---|---------|-------|-----------------|
| 1 | **SuperAdmin → POS sell** | SuperAdmin provisions store → POS login → scan → sell → receipt + ledger | Full provisioning + sell chain |
| 2 | **Retailer creates SKU → POS finds it** | Retailer creates product/SKU → POS scan → product found | Catalog sync + store-scoped search |
| 3 | **Supplier adds product → visible** | Supplier adds product → appears in retailer catalog | Supplier-to-retailer pipeline |
| 4 | **Checkout → stock deduction → ledger** | POS checkout → verify stock decremented → verify ledger entry | Transaction safety |
| 5 | **Login/logout all portals** | Each portal: login → verify auth → logout → verify session cleared | Auth/session correctness |
| 6 | **Store isolation proof** | Login as Store A → query → login as Store B → query → verify zero cross-contamination | Data isolation |

### C.5 Three-Layer Catch Net

If Claude coded incorrectly, these three layers catch it before staging:

```
Layer 1: CONTRACT TESTS  → catch wrong API shapes, missing headers
Layer 2: INTEGRATION TESTS → catch wrong DB logic, ledger, isolation
Layer 3: LOAD TESTS + BIG DATASET → catch performance and scale failures
```

Any failure at any layer = BLOCKED. Fix before proceeding.

### C.6 Deploy Parity Tests

Verify that the built artifacts behave correctly in a production-like environment before staging deploy.

| Test | Command / Method | What It Proves |
|------|-----------------|----------------|
| Docker build all services | `docker-compose -f docker-compose.local-prod.yml build` | Every service image builds successfully |
| Stack startup | `docker-compose up` + wait for healthy | All containers start, health checks pass, migrations run |
| Gateway routing | Hit every `/api/v1/*` route → verify not-404 | All expected routes are registered and reachable |
| Health + version | `curl /api/v1/health` + `curl /api/v1/version` | Services report correct status and SHA |
| Config validation | Start with missing required env var → verify fail-fast | App crashes with clear message (not silent fallback) |
| Portal base paths | Hit `/retailer/`, `/supplier/`, `/admin/` → verify 200 | Production builds serve at correct base paths |
| CORS headers | Cross-origin request from portal to API → verify allowed | CORS config correct for all portal origins |

**Pass criteria**: All 7 checks green. Any failure = BLOCKED before CI push.

**Relationship to other tests**: Deploy parity runs AFTER Packs 1–3 (contract, integration, E2E) pass. It's the final local gate before pushing to CI.

### C.7 Security Test Matrix

Automated security checks that run in CI:

| # | Test | Target | Pass Criteria |
|---|------|--------|---------------|
| 1 | **Unauthenticated access** | Every non-public endpoint | 401 for all |
| 2 | **Wrong-role access** | Cashier → manager endpoints, manager → superadmin | 403 for all |
| 3 | **Tenant isolation** | Store A token → query → zero Store B data | Zero cross-store rows |
| 4 | **SQL injection** | `' OR 1=1 --` in search, login, barcode fields | Rejected or parameterized (no data leak) |
| 5 | **XSS payloads** | `<script>alert(1)</script>` in text fields | Sanitized or rejected |
| 6 | **Secrets in build** | Grep built artifacts for test tokens, `.env` patterns | Zero matches |
| 7 | **Rate limiting** | 100 rapid login attempts | Rate-limited after threshold |

---

## PART D: EVIDENCE AND REGRESSION GUARDS

### D.1 Minimum Evidence Per Fix

| Fix Type | Required Guard |
|----------|---------------|
| API change | `curl` proof showing old + new behavior both work |
| UI change | Screenshot of the fixed state |
| Database change | Migration + rollback test |
| Business logic | Invariant test (stock, ledger, or idempotency) |
| Auth/session | Login + logout + token refresh proof |

### D.2 Evidence Triplet (for BLACKBOX-POS-RUNBOOK journeys)

Any claim of PASS requires all three:

| # | Evidence | Example |
|---|----------|---------|
| 1 | **UI proof** | Screenshot of the working screen |
| 2 | **API proof** | `curl` response or network tab capture |
| 3 | **DB proof** | SQL query showing correct data state |

One without the others is not a PASS — it's UNVERIFIED.

### D.3 Evidence Pack (MEGA-RC Aware)

Evidence is collected per the structure defined in MASTER_PLAN.md Part 6:

**Per-Batch Folder** (`RELEASES/EVIDENCE/<BATCH-ID>/`):

| Artifact | Source |
|----------|--------|
| Screenshots | Browser test evidence (operator) |
| scope-verification.md | Scope + parity verification (Claude) |
| Batch-specific artifacts | e.g., curl-proofs/, docker-build-log.txt |

**MEGA-RC Combined Folder** (`RELEASES/EVIDENCE/MEGA-RC/`):

| Artifact | Source |
|----------|--------|
| gates/typecheck.txt | `pnpm -r typecheck` output |
| gates/build.txt | `pnpm -r build` output |
| gates/e2e-local.html | Playwright `@prod` report (local) |
| gates/e2e-staging.html | Playwright `@prod` report (staging) |
| migration/migrate-zero.txt | `test:migrate-zero` output |
| migration/dry-run.txt | `migrate-prod.js dry-run` output |
| ci/ci-run-link.txt | GitHub Actions run URL |
| staging/health.txt | `/health` response from staging |
| staging/version.txt | `/version` response (SHA match) |
| staging/rollback-drill.txt | Rollback drill timestamped output |
| signoff.md | Operator sign-off |

**Post Go-Live**: Each batch gets its own full evidence folder (normal cadence).

---

## PART E: DEBUG-FIX-VERIFY LOOP

Never shotgun-fix. Follow this loop for every issue:

```
1. DEBUG   — Reproduce the issue, identify root cause
2. FIND    — Locate the exact file(s) and line(s)
3. FIX     — Apply the minimal correct fix
4. RETEST  — Verify the fix works (evidence triplet if applicable)
5. GUARD   — Add test or proof that prevents regression
```

### What Each Step Produces

| Step | Output |
|------|--------|
| DEBUG | Root cause statement: "X happens because Y in file Z:line" |
| FIND | File list with line numbers |
| FIX | Atomic commit with ticket ID |
| RETEST | Evidence (screenshot, curl, SQL) |
| GUARD | Test file or proof artifact |

---

## PART F: PRODUCTION-GRADE DEBUGGING STAGES

| Stage | Environment | What It Proves |
|-------|-------------|----------------|
| 0 | `pnpm dev` (dev servers) | Code compiles, basic UI renders |
| 1 | `docker-compose.local-prod.yml` | Services talk to each other, migrations run, env vars resolve |
| 2 | RC tag + CI gates | Code works in clean environment, no local-state dependency |
| 3 | GCP Staging (Cloud Run) | Real infra: Cloud SQL, Memorystore, Secret Manager, VPC |
| 4 | Production + observability | Real users, real load, monitoring alerts working |

**Rule**: A fix is not "done" at Stage 0. It's done when it passes the stage appropriate to its risk class (see MASTER_PLAN Change Class Matrix).

### Production-Grade Debugging Checklist

When debugging any issue, systematically verify these areas:

| Area | What to Check |
|------|---------------|
| **A. Provisioning & Auth** | Store creation, device enrollment, login flows (OTP, email, Firebase), token refresh, session persistence |
| **B. Catalog & Scan** | Product CRUD, barcode scan resolution (store-scoped), category listing, search |
| **C. Buy / Stock-In** | GRN creation, purchase recording, stock balance update, supplier GSTIN, ledger entry |
| **D. Sell / Payments** | Sale creation, payment recording, stock deduction, receipt generation, refund flow |
| **E. Store Isolation** | Cross-store queries return zero rows, token-based scoping enforced at service layer |
| **F. Failure Modes** | Network timeout handling, retry behavior, idempotency under retry, error messages to user |
| **G. Performance Sanity** | No N+1 queries, pagination present, response times within p95 targets |

---

## PART G: RELEASE TRAIN & GIT DISCIPLINE

### G.1 Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Always deployable. Protected. CI must pass before merge. |
| `feat/<ticket-id>-<desc>` | Feature branches. PR to main. |
| `fix/<ticket-id>-<desc>` | Bug fix branches. PR to main. |
| `hotfix/<ticket-id>` | Emergency fixes. PR to main, expedited review. |

### G.2 Commit Message Format

```
BATCH-XXX: TICKET-ID - Description

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### G.3 PR Rules (Mode-Aware)

**Mode A (Pre-Staging — CURRENT):**
- Direct push to `main` is allowed — no deploy risk exists
- Claude works independently on tickets without waiting for PR review
- Commit discipline still applies (atomic commits, ticket IDs, evidence)

**Mode B (Staging/Production):**
- Work only via PR branches — never commit directly to `main`
- CI must be green before merge (typecheck + lint + build + test)
- PR description includes: Summary, Files Changed, Test Plan
- Squash merge preferred for clean history

### G.4 RC Tag Rules

- **Owner**: Claude creates the RC tag after all gates pass
- Format: `supermandi-YYYY-MM-DD-HHmm-BATCH-XXX`
- Operator verifies tag SHA matches expected HEAD before deploying
- Tags are immutable — never delete or move a tag
- If RC fails verification, fix → re-tag with new timestamp
- Freeze `main` once RC is tagged (no new merges until RC is deployed or rejected)

### G.5 Freeze Rules

| Phase | Rule |
|-------|------|
| **Pre-Deploy** | Once RC tagged, no new commits to main unless fixing a gate failure |
| **Post-Deploy** | Monitor 15 minutes after deploy. No new deploys during monitoring. |
| **Gate Failure** | Fix → new commit → new tag → restart verification |

---

## PART H: DEFINITION OF DONE (PER TICKET)

A ticket is DONE only when ALL of these are true:

| # | Criterion |
|---|-----------|
| 1 | Code compiles: `pnpm -r typecheck` = 0 errors |
| 2 | Tests pass: all applicable test packs from Part C green |
| 3 | Evidence collected: appropriate to fix type (Part D) |
| 4 | Works in Docker: verified in `docker-compose.local-prod.yml` (not just dev server) |
| 5 | Business invariants preserved: if applicable, invariant tests pass |
| 6 | No hardcoded values, no temp fixes, no manual infra patches |
| 7 | Commit follows format, PR created, CI green |

---

## PART I: ANTI-PATTERNS (FORBIDDEN)

| # | Anti-Pattern | Why It's Forbidden |
|---|--------------|--------------------|
| 1 | "This should work" without proof | Unverified = unknown state |
| 2 | "I think this is fine" without test | Thinking is not testing |
| 3 | "Let's move on and fix this later" | Deferred fixes become permanent bugs |
| 4 | "While I'm here, let me also refactor..." | Scope creep breaks isolation |
| 5 | Touching files outside ticket scope | Untested side effects |
| 6 | Adding features during a bug fix | Separate ticket required |
| 7 | "Improving" code that wasn't broken | Leave working code alone |
| 8 | `console.log` left in committed code | Use structured logging or remove |
| 9 | Swallowing errors silently | Handle or propagate — never hide |
| 10 | Trusting client-sent `storeId` | Server MUST derive from token |
| 11 | Missing `WHERE store_id =` in queries | Every data query must be store-scoped |
| 12 | `SELECT *` without pagination | Unbounded queries are production bombs |
| 13 | Editing a deployed migration | Create a new migration instead |
| 14 | `if (env === 'staging') skip_check()` | Same validation in all environments |

---

## PART J: OPERATOR INTERACTION RULES

### J.1 Don't Ask Operator to Test Per-Fix

Claude runs its own tests. The operator is only involved at:
- **Gate verification**: After all fixes in a batch, operator runs browser acceptance
- **Deploy authorization**: Operator confirms GO / NO-GO
- **Incident triage**: Operator confirms severity and impact

### J.2 Communication Protocol

#### When Starting a Fix
```
Starting TICKET-ID: [description]
Risk Class: X
Files in scope: [list]
```

#### When Blocked
```
BLOCKED: [specific reason]
Recommended: [Fix forward / Revert / Ask operator]
```

#### When Done
```
TICKET-ID DONE:
- Fix: [one-line summary]
- Evidence: [screenshot/curl/SQL reference]
- Guard: [test added or proof path]
- Risk: [what could break if this is wrong]
```

---

## PART K: INCIDENT WORKFLOW

### K.1 Automatic Incident Creation

When any gate fails (typecheck, E2E, CI, staging smoke), Claude MUST:
1. Create an incident entry in `RELEASES/INCIDENTS.md`
2. Set severity based on impact
3. Begin the fix loop immediately

### K.2 Claude Fix Loop (On Incident)

```
1. Identify root cause from error output
2. Locate file(s) and line(s)
3. Apply minimal fix
4. Run applicable test pack (Part C)
5. Collect evidence (Part D)
6. Update incident status
7. Re-run the failed gate to confirm resolution
```

### K.3 Severity Response

| Severity | Claude Action |
|----------|--------------|
| P0 | STOP everything. Fix this first. Recommend rollback to operator. |
| P1 | Fix in current batch. Block release until resolved. |
| P2 | Fix in current batch if time allows, else ticket for next batch. |
| P3 | Ticket for next batch. Do not block release. |

---

## PART L: STAGING TRANSITION DISCIPLINE

### L.1 Session Modes

| Mode | When Active | Claude Behavior |
|------|-------------|-----------------|
| **Mode A: Pre-Staging** | GCP not yet set up, or SA-GOLIVE still in progress | Claude starts independently, works on tickets without operator paste. No deploy risk. |
| **Mode B: Staging/Production** | GCP setup complete + SA-GOLIVE complete | Claude MUST wait for operator git sync paste before any work. Deploy risk exists — SHA alignment required. |

**Current Mode**: A (Pre-Staging) — switch to Mode B when operator confirms GCP setup complete and SA-GOLIVE is done.

### L.2 First Deploy Protocol (Mega-Batch)

The first staging deploy combines all batches (004 through SA-GOLIVE). This is a one-time exception to the "one batch = one RC" rule. See MASTER_PLAN.md "Mega-Batch Acceptance Criteria" for the full runbook.

Key rules for Claude during first deploy:
1. Run full gate suite on HEAD (not per-batch SHAs)
2. Collect per-batch evidence — no waivers for batches 004–014
3. Use `migrate-prod.js dry-run` before any migration execution
4. Do NOT enable auto-migration on container start for first deploy
5. Wait for operator to confirm Cloud SQL backup before running migrations
6. Fill the Cloud Run Parity Checklist (BATCH-010) during staging verification

### L.3 Post Go-Live (Normal Cadence)

After the first production deploy succeeds:
1. Resume "one batch = one RC" cadence
2. Switch to Session Mode B permanently
3. Auto-migration on container start is re-enabled
4. Each new batch follows the standard lifecycle: `PENDING → IN_PROGRESS → WRITTEN → GATED → TESTED → EVIDENCED → RC_TAGGED → STAGED → LIVE`

---

## PART M: PRIORITY ORDER FOR CLAUDE

### Phase 0: One-Time Setup (Done Once Per Fresh Clone)

1. Read MASTER_PLAN.md, ZERO_REGRESSION_RULES.md, this file
2. Verify local dev environment: `pnpm install`, `pnpm -r typecheck`, `pnpm -r build`
3. Verify Docker local-prod: `docker-compose -f docker-compose.local-prod.yml up`
4. Verify test infrastructure: all test scripts from Part C.3 exist and are runnable

### Phase 1: Repeat Forever (Every Ticket)

```
1. Pick next ticket from MASTER_PLAN.md (highest priority unblocked)
2. Read ticket scope, identify risk class and change type
3. DEBUG → FIND → FIX → RETEST → GUARD (Part E loop)
4. Run applicable test packs (Part C, by change type)
5. Collect evidence (Part D)
6. Commit with format: BATCH-XXX: TICKET-ID - Description
7. Update MASTER_PLAN.md ticket status
8. When batch complete:
   a. Run Claude automated gates (typecheck + unit tests + build)
   b. Provide E2E PowerShell script to operator → operator runs in VS Code terminal
   c. Operator pastes results → Claude fixes ANY issues (even minor) → repeat a-b until ZERO issues
   d. Push to CI → CI gates must pass
   e. Prepare evidence pack
```

### Promotion Gate (Full Project Completion Required)

Steps 11-13 of RELEASE_POLICY.md (PROMOTE → POST-DEPLOY → CLOSE) are **blocked**
until ALL portals (retailer/supplier/admin) + POS app are complete and verified.
The team stays in the steps 1–10 iterative cycle until then.

---

## PART N: AUTOMATION WORKFLOWS

### N.1 CI Gate (on every push to main)

```yaml
Jobs:
  - typecheck (pnpm -r typecheck)
  - lint (pnpm -r lint)
  - build (pnpm -r build)
  - test:ci (unit tests)
  - test:contract (API contract validation — Zod/OpenAPI)
  - test:invariants (domain invariant verification)
  - test:security (auth enforcement, RBAC, input validation)
  - test:migrate-zero (empty DB → all migrations)
  - docker build (all service images)
```

### N.2 One-Click Staging Deploy

```bash
./scripts/deploy-cloud-run.sh --env staging --sha <RC_SHA>
```

Deploys the exact Docker image (by SHA) to Cloud Run staging. No rebuild.

### N.3 One-Click Promote to Production

```bash
./scripts/promote-to-prod.sh <RC_SHA> --confirm
```

Shifts traffic to the staging-verified revision. Same image, same SHA.

---

## PART O: GO-LIVE SAFEGUARDS

### O.1 Observability (Day 0 Requirements)

These MUST be in place before first production deploy:

| Requirement | Implementation | Why |
|-------------|---------------|-----|
| Request correlation ID | Every request gets unique `x-request-id`, propagated across services | Trace failures end-to-end |
| Structured error logging | JSON logs with `service`, `endpoint`, `storeId`, `error`, `stack` | Searchable in Cloud Logging |
| Metrics dashboard | Error rate, p95 latency, DB connections, active requests | Detect degradation before users report |
| POS crash reporting | Sentry or Firebase Crashlytics in release APK | Catch Android-specific crashes |
| Uptime monitoring | External health check every 60s on `/api/v1/health` | Detect outages immediately |

#### O.1.1 Observability Verification Tests

Requirements from O.1 must be **testable**, not just documented:

| Test | What It Verifies |
|------|-----------------|
| Correlation ID propagation | Send request → verify `x-request-id` appears in response headers AND in service logs |
| Structured error logging | Trigger a known error → verify JSON log contains `service`, `endpoint`, `storeId`, `error`, `stack` |
| Metrics smoke | After a checkout → verify key counters incremented (orders_created, stock_updated) |
| Health endpoint | `/api/v1/health` returns `{"status":"ok"}` with service name, SHA, uptime |
| POS crash reporting | Trigger a handled exception → verify it appears in Sentry/Crashlytics dashboard |

**Enforcement**: These tests run once during staging verification (not on every commit).

### O.2 Feature Flags / Kill Switch (Recommendation)

> **Status**: Recommendation for implementation — requires new development work.

| Capability | Purpose |
|------------|---------|
| Server-side kill switch per endpoint/workflow | Disable risky modules (reorder, bulk import) without redeploy |
| Feature flag per store | Roll out new features store-by-store |
| Client-side feature config | POS reads feature flags on startup |

**Implementation priority**: After first go-live, before adding new major features.

### O.3 Canary Rollout (Post Go-Live Only)

> **Note**: Does NOT apply to MEGA-RC (first deploy). Canary applies after go-live for subsequent batches.

Post go-live deployment pattern:
```
Staging → 1-2 pilot stores (canary) → monitor → expand to all stores
```

| Step | Duration | Pass Criteria |
|------|----------|---------------|
| Pilot store(s) | 1-2 hours | Zero errors, zero user reports |
| Expand to 50% | 1 hour | Error rate < 0.1% |
| Full rollout | — | Stable for 15 min (per ROLLBACK_PLAYBOOK) |

---

## PART P: CLAUDE COMPLETENESS PROTOCOL

> **Problem**: Claude writes code, runs tests, declares done — but how does Claude ensure
> EVERY required test was run, EVERY business function was covered, and NOTHING was forgotten?
>
> **Solution**: A systematic pre-task → post-task → batch-level verification protocol
> that makes forgetting structurally impossible.

### P.1 Pre-Task Scope Analysis

Before writing ANY code for a ticket, Claude MUST:

```
1. LIST all files that will be touched (read git diff --stat if already started)
2. CLASSIFY each file using the Change-Impact Router (P.2)
3. DERIVE the full test set required
4. ANNOUNCE the test plan in the "Starting TICKET-ID" message
```

**Template** (added to Communication Protocol):
```
Starting TICKET-ID: [description]
Risk Class: X
Files in scope: [list]
Required tests: [derived from P.2 router]
Business functions affected: [from P.3 registry]
```

### P.2 Change-Impact Router

Automatic file-to-test mapping. Claude uses this table to determine which tests are required for ANY file change.

| File Pattern | Change Type | Required Tests |
|-------------|-------------|----------------|
| `backend/services/*` | Backend service | test:ci + test:contract + test:invariants + test:security + test:integration |
| `backend/services/api-gateway/*` | Gateway/routing | test:ci + test:contract + test:deploy-parity |
| `backend/migrations/*` | Schema change | migrate-from-zero + schema-verify + test:ci + test:contract + test:invariants |
| `retailer-admin/*` | Retailer portal | build (retailer) + test:ci + e2e(@prod, retailer flows) |
| `supplier-portal/*` | Supplier portal | build (supplier) + test:ci + e2e(@prod, supplier flows) |
| `supermandi-superadmin/*` | Admin portal | build (admin) + test:ci + e2e(@prod, admin flows) |
| `src/*` (root) | POS app | typecheck + test:ci + API smoke + emulator E2E + offline/flaky + scanner hardware |
| `docker-compose*.yml` | Infrastructure | test:deploy-parity + full stack startup test |
| `.github/workflows/*` | CI pipeline | Dry-run CI locally if possible, review all gate coverage |
| `e2e-tests/*` | Test changes | Run the changed tests + verify no regressions in existing tests |
| `backend/shared/*` | Shared library | ALL backend tests (shared code affects every service) |
| `scripts/*` | Deploy/migrate scripts | test:deploy-parity + migrate-from-zero |

**Rule**: If a file matches multiple patterns, the UNION of all required tests applies.

**Rule**: If a file matches NO pattern, Claude MUST explicitly state: "File [X] does not match any router pattern — manually determining required tests."

### P.3 Business Logic Registry

Master list of all business functions. Claude uses this to verify complete coverage when working on a batch or declaring a batch GATED.

| # | Business Function | Primary Services | Key Endpoints | Required Tests | Invariant |
|---|-------------------|-----------------|---------------|----------------|-----------|
| 1 | **Barcode Scan** | pos-service, catalog-service | `POST /pos/scan` | POS E2E + scanner hardware + offline/flaky | Scan scope (B.3) |
| 2 | **Product Search** | catalog-service | `GET /catalog/products/search` | Contract + integration + 100k SKU load | Price integrity (B.3) |
| 3 | **Checkout / Sale** | order-service, inventory-service, pos-service | `POST /orders/checkout` | E2E critical path + invariants + idempotency | Stock (B.3), Ledger (B.3), Idempotency (B.3) |
| 4 | **Stock-In / Receive** | inventory-service, reorder-service | `POST /inventory/stock-in` | Integration + invariants + contract | Stock (B.3), Ledger (B.3) |
| 5 | **Store Provisioning** | platform-service, auth-service | `POST /platform/stores` | Integration + security + tenant isolation | Store isolation (B.3) |
| 6 | **Auth (Login/Register)** | auth-service | `POST /auth/login`, `POST /auth/register` | Security + RBAC + contract | — |
| 7 | **Supplier Products** | supplier-service, catalog-service | `GET/POST /supplier/products` | Contract + integration + tenant isolation | Store isolation (B.3) |
| 8 | **Retailer SKU Mgmt** | catalog-service, inventory-service | `GET/PUT /catalog/skus` | Contract + integration + 100k SKU load | Price integrity (B.3) |
| 9 | **Ledger / Transactions** | order-service, analytics-service | `GET /orders/ledger` | Invariants + integration + contract | Ledger (B.3) |
| 10 | **Pricing (MRP/Sell)** | catalog-service | `GET/PUT /catalog/pricing` | Contract + invariants + integration | Price integrity (B.3) |

### P.4 Post-Task Verification

After completing code for a ticket, BEFORE declaring it done, Claude MUST:

```
1. RUN: git diff --stat (list all changed files)
2. ROUTE: Apply P.2 router to every changed file
3. COMPARE: Required tests (from router) vs actually-run tests
4. GAP CHECK: If any required test was NOT run → run it now
5. BUSINESS CHECK: Cross-reference P.3 registry — did changes touch any business function's service/endpoint?
   - If yes → verify that function's required tests were run
6. DECLARE: List all tests run with pass/fail status in the "TICKET-ID DONE" message
```

**Template** (added to Communication Protocol):
```
TICKET-ID DONE:
- Fix: [one-line summary]
- Files changed: [list from git diff]
- Tests required (P.2 router): [list]
- Tests actually run: [list with pass/fail]
- Business functions affected (P.3): [list or "none"]
- Coverage gap: NONE | [describe gap and why it's acceptable]
- Evidence: [screenshot/curl/SQL reference]
- Guard: [test added or proof path]
- Risk: [what could break if this is wrong]
```

### P.5 Batch-Level Completeness Scan

Before declaring a batch GATED, Claude MUST run a full completeness scan:

```
1. DIFF: git diff <batch-start-sha>..HEAD --stat
2. ROUTE: Apply P.2 router to EVERY file in the diff
3. UNION: Compute the union of all required tests
4. VERIFY: Every test in the union has been run and passed
5. REGISTRY: Walk P.3 registry — for each business function:
   a. Were any of its services/endpoints touched?
   b. If yes, were all its required tests run?
   c. If no tests needed, explicitly note "not affected"
6. REPORT: Generate completeness report
```

**Completeness Report Template:**
```
BATCH-XXX COMPLETENESS SCAN:
Files changed: [count]
Router-required test sets: [list]
All router tests passed: YES/NO
Business functions affected: [list with test status]
Business functions NOT affected: [list]
Unmatched files (no router pattern): [list or "none"]
VERDICT: COMPLETE / INCOMPLETE (reason)
```

### P.6 Five Safety Nets (Defense in Depth)

No single check catches everything. These five layers ensure completeness:

```
NET 1: Pre-Task (P.1)     — Claude announces scope + test plan BEFORE coding
NET 2: Post-Task (P.4)    — Claude verifies all router-required tests AFTER coding
NET 3: Batch Scan (P.5)   — Full diff review before declaring GATED
NET 4: Operator E2E        — Human runs Playwright, catches what automated tests miss
NET 5: CI Pipeline         — Independent gate, overrides all local results
```

| Net | Catches | When |
|-----|---------|------|
| Pre-Task | Forgotten test plans, scope creep | Before first line of code |
| Post-Task | Missed tests, untested file changes | After each ticket |
| Batch Scan | Cross-ticket gaps, cumulative drift | Before GATED declaration |
| Operator E2E | UI regressions, flow breaks, visual issues | Before CI push |
| CI Pipeline | Environment differences, integration failures | After push |

**Rule**: If any net catches an issue, Claude fixes it AND traces back to understand which earlier net should have caught it — then tightens the earlier net's rules.

### P.7 Session Navigation Workflow

How Claude uses this protocol throughout a session:

**Session Start:**
```
1. Read CLAUDE_PRODUCTION_RULES.md (this file)
2. Read MASTER_PLAN.md (current batch, tickets)
3. Check git log + git status
4. Identify current batch and pending tickets
```

**Per Ticket:**
```
1. P.1 — Pre-Task Scope Analysis (announce plan)
2. Write code (following Parts A-B rules)
3. Run tests (following Part C test policy)
4. P.4 — Post-Task Verification (confirm completeness)
5. Record evidence (following Part D)
6. Declare done (Communication Protocol)
```

**Batch Complete:**
```
1. P.5 — Batch-Level Completeness Scan
2. Run all automated gates (Gate 1: typecheck + test:ci + build + contract + invariants + security)
3. Provide E2E script to operator (Gate 2)
4. Fix any issues from operator E2E → repeat gates
5. Declare GATED (with completeness report)
```

---

## QUICK REFERENCE CHECKLIST

Before declaring any fix complete, verify:

- [ ] No temp fix / hack / workaround (Part A.1)
- [ ] No hardcoded values (Part B.1)
- [ ] No manual infra patches — fix exists in repo (Part B.2)
- [ ] Works in Docker, not just dev server (Part A.2)
- [ ] Business invariants preserved (Part B.3)
- [ ] Full integration: UI → API → DB → UI (Part B.4)
- [ ] Migrations are idempotent and backward-compatible (Part B.5)
- [ ] Contract tests pass — API shapes match schema (Part C.1)
- [ ] Performance: no N+1, queries use indexes (Part B.6)
- [ ] Resilience: graceful degradation when dependencies fail (Part B.7)
- [ ] Security: auth enforced, RBAC correct, no injection vectors (Part B.8)
- [ ] POS: lists virtualized, state bounded, scanner debounced, idempotency keys (Part C.2.D)
- [ ] Deploy parity: Docker build + gateway routing + health checks pass (Part C.6)
- [ ] Evidence collected, appropriate to risk class (Part D)
- [ ] Regression guard in place (Part D.1)
- [ ] Scope limited to ticket (Part A.4)
- [ ] Definition of Done met (Part H, all 7 criteria)
- [ ] Commit message follows format (Part G.2)
- [ ] Pre-task scope analysis done — test plan announced (Part P.1)
- [ ] Change-impact router applied — all required tests derived (Part P.2)
- [ ] Post-task verification — no coverage gaps (Part P.4)

---

## RELATIONSHIP TO OTHER DOCS

| Document | Scope |
|----------|-------|
| **MASTER_PLAN.md** | What to do (batches, tickets, gates, status) |
| **ZERO_REGRESSION_RULES.md** | How deploys work (immutability, rollback, CI) |
| **CLAUDE_PRODUCTION_RULES.md** (this) | How Claude writes code (fix quality, tests, pipeline, discipline) |
| **OPERATOR_RUNBOOK.md** | ~~SUPERSEDED~~ — see MASTER_PLAN.md Part 2 + RELEASE_POLICY.md |
| **ROLLBACK_PLAYBOOK.md** | Incident response and rollback procedures |
| **RELEASE_POLICY.md** | End-to-end release flow, gates, freeze rules |
| **INCIDENTS.md** | Incident tracking and resolution log |
| **BLACKBOX-POS-RUNBOOK.md** | 7-journey manual verification protocol |
| **BATCH_LEDGER.md** | Per-batch status tracking and evidence links |

---

## REVISION HISTORY

| Version | Date | Change | Author |
|---------|------|--------|--------|
| 1.0 | 2026-02-10 | Initial creation from PDF strategy doc | Claude |
| 2.0 | 2026-02-10 | Comprehensive rewrite: added Parts B.2 (No Manual Infra Patches), B.5 (Migrations), B.6 (Performance), C (Test Policy by Change Type), C.3 (Test Pack Scripts), D.3 (Evidence Pack), G (Git Discipline), H (Definition of Done), I (Anti-Patterns), J (Operator Interaction), K (Incident Workflow), L (Staging-Ready While Blocked), M (Priority Order), N (Automation Workflows) | Claude |
| 3.0 | 2026-02-10 | Part L rewritten: "Staging-Ready While Blocked" → "Staging Transition Discipline" with Session Modes (A/B), First Deploy Protocol (mega-batch), Post Go-Live cadence. GCP setup now being resolved by operator. | Claude |
| 3.1 | 2026-02-10 | DOC-020: G.3 made mode-aware (Mode A: direct push, Mode B: PR branches). G.4: RC tag ownership assigned to Claude. | Claude |
| 3.2 | 2026-02-10 | DOC-021: D.3 Evidence Pack rewritten to MEGA-RC-aware structure. OPERATOR_RUNBOOK.md marked SUPERSEDED in relationship table. | Claude |
| 4.0 | 2026-02-11 | DOC-022: Part M Phase 1 updated — operator E2E review before CI push. Added Promotion Gate (full project completion required). | Claude |
| 5.0 | 2026-02-11 | DOC-023: B.6 expanded (load testing profiles, DB performance proof, 100k SKU dataset simulation). C.1 added contract-lock gate. C.2.A added transaction-safe integration scenarios. C.2.D added POS release build smoke + offline/flaky network testing + crash-proofing requirements. C.4 Critical E2E Paths defined (6 journeys). C.5 Three-Layer Catch Net principle. N.1 CI jobs added (contract, invariants). Part O Go-Live Safeguards (observability, feature flags, canary rollout). | Claude |
| 6.0 | 2026-02-11 | DOC-024: B.7 Resilience & Graceful Degradation (DB/Redis/service down tests). B.8 Security Enforcement (RBAC, input validation, secrets audit). C.2.D extended with POS scanner hardware tests (HID, camera, soak). C.3 added test:resilience, test:security, test:deploy-parity scripts. C.6 Deploy Parity Tests (gateway routing, config validation, CORS). C.7 Security Test Matrix. O.1.1 Observability Verification Tests. N.1 CI added test:security. | Claude |
| 7.0 | 2026-02-11 | DOC-025: Part P — Claude Completeness Protocol. P.1 Pre-Task Scope Analysis. P.2 Change-Impact Router (file-to-test mapping). P.3 Business Logic Registry (10 business functions). P.4 Post-Task Verification. P.5 Batch-Level Completeness Scan. P.6 Five Safety Nets. P.7 Session Navigation Workflow. Quick Reference Checklist extended with P.1/P.2/P.4 items. | Claude |
