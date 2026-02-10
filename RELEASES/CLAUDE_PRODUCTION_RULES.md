# Claude Production Rules

> **Discipline contract for every Claude session on SuperMandi.**
> This file is MANDATORY reading at session start — referenced by MASTER_PLAN.md.
> Claude MUST internalize every rule before writing a single line of code.
> Last Updated: 2026-02-10

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

---

## PART C: TEST POLICY — AFTER EVERY FIX

### C.1 Always Run (Every Change)

```
pnpm -r typecheck          # Zero errors across all projects
pnpm -r lint               # Zero warnings (errors are blocked)
pnpm -r build              # All projects build successfully
pnpm test:ci               # Unit test suite
```

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
| `test:contract` | API contract tests |
| `test:e2e:retailer` | Retailer admin Playwright smoke |
| `test:e2e:supplier` | Supplier portal Playwright smoke |
| `test:e2e:superadmin` | SuperAdmin Playwright smoke |
| `test:pos:smoke` | POS API smoke tests |
| `release:gate` | Full release gate (typecheck + lint + build + @prod E2E) |

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
8. When batch complete → run full release:gate → prepare evidence pack
```

---

## PART N: AUTOMATION WORKFLOWS

### N.1 CI Gate (on every push to main)

```yaml
Jobs:
  - typecheck (pnpm -r typecheck)
  - lint (pnpm -r lint)
  - build (pnpm -r build)
  - test:ci (unit tests)
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

## QUICK REFERENCE CHECKLIST

Before declaring any fix complete, verify:

- [ ] No temp fix / hack / workaround (Part A.1)
- [ ] No hardcoded values (Part B.1)
- [ ] No manual infra patches — fix exists in repo (Part B.2)
- [ ] Works in Docker, not just dev server (Part A.2)
- [ ] Business invariants preserved (Part B.3)
- [ ] Full integration: UI → API → DB → UI (Part B.4)
- [ ] Migrations are idempotent and backward-compatible (Part B.5)
- [ ] Evidence collected, appropriate to risk class (Part D)
- [ ] Regression guard in place (Part D.1)
- [ ] Scope limited to ticket (Part A.4)
- [ ] Definition of Done met (Part H, all 7 criteria)
- [ ] Commit message follows format (Part G.2)

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
