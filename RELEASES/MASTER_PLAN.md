# SuperMandi Master Plan

> **Single Source of Truth** — All rules, batches, and workflows in one file.
> **Last Updated**: 2026-02-06

---

## ZERO-REGRESSION CONSTITUTION

> These principles are **non-negotiable**. Every rule in this document derives from them.
>
> **FULL RULES**: See `RELEASES/ZERO_REGRESSION_RULES.md` for complete 0.000% regression guarantee.

| # | Principle | Enforcement |
|---|-----------|-------------|
| 1 | **MASTER_PLAN is the only truth** | No workflow exists outside this file |
| 2 | **CI results override local results** | If local passes but CI fails → FAILED |
| 3 | **No deploy without evidence** | Every ticket requires proof artifacts |
| 4 | **Rollback is mandatory capability** | Every deploy must be revertible in <5 min |
| 5 | **No untracked changes** | Every change maps to a ticket ID |
| 6 | **No hotfixes outside tickets** | Emergency? Create HOTFIX-XXX ticket first |
| 7 | **Staging before production** | No direct-to-prod deploys ever |
| 8 | **Same artifact everywhere** | Docker image SHA identical: Local → Staging → Prod |
| 9 | **No hardcoded values** | All URLs/IPs via environment variables |
| 10 | **Validation before commit** | Run `scripts/zero-regression-check.ps1` |

**Referenced by**: Claude Rules (Part 1), Operator Rules (Part 2), ZERO_REGRESSION_RULES.md

---

## CLAUDE COMMITMENT (SIGNED)

```
I, Claude, commit to the 0.000% regression guarantee:

1. NEVER deploy without all gates green
2. NEVER skip staging verification
3. NEVER make undocumented changes
4. ALWAYS record evidence
5. ALWAYS have rollback ready
6. ALWAYS wait for operator sign-off
7. IMMEDIATELY recommend rollback to operator if issues detected
8. HONESTLY report any concerns or risks
9. REFUSE to proceed if any rule is violated

Violation of ANY rule = I will BLOCK and refuse to proceed.

Signed: Claude Opus 4.6
Date: 2026-02-05
```

---

## PRE-DEPLOY VALIDATION (MANDATORY)

Before ANY deploy, run:
```powershell
cd C:\supermandi-pos
.\scripts\zero-regression-check.ps1 -Full
```

**ALL checks MUST pass. No exceptions.**

---

## RELEASE CHANNELS & DEFINITIONS

### SHA Definitions

| Term | Definition | Example |
|------|------------|---------|
| **RC_SHA** | Release Candidate — SHA under test | `59163c9` |
| **PROD_SHA** | Production — SHA currently live | `fe359fd` |
| **BATCH_SHA** | Batch completion SHA (after all tickets done) | `abc1234` |
| **ROLLBACK_SHA** | Previous known-good SHA | `fe359fd` |

### Release Tag Format

```
supermandi-YYYY-MM-DD-HHmm-BATCH-XXX
```

Example: `supermandi-2026-02-05-1430-BATCH-004`

### Environment URLs

| Environment | URL Pattern | Purpose |
|-------------|-------------|---------|
| **Production** | `supermandi.tech/*` | Live users |
| **Staging** | `staging.supermandi.tech/*` | Pre-prod verification |
| **Local** | `localhost:*` | Development only |

### One-Click Deploy Definition

```
git push main → CI gates (5 jobs) → CD builds 14 images → Push to AR → Auto-deploy staging Cloud Run
                                                                              │
                                              Operator tests staging ← ───────┘
                                                       │
                                              ./scripts/promote-to-prod.sh <SHA> --confirm
                                                       │
                                              Production Cloud Run updated (same images)
```

- Only manual action: `./scripts/promote-to-prod.sh <SHA> --confirm` (after staging verification)
- Rollback: `gcloud run services update-traffic ... --to-revisions=PREVIOUS=100` (< 5 min)

---

## ENVIRONMENT & VERSION LOCK

### Mandatory Version Pins

| Tool | Pin Method | Current |
|------|------------|---------|
| **Node.js** | `.nvmrc` + `engines` in root `package.json` | `20.x` |
| **pnpm** | `packageManager` in root `package.json` | `9.x` |
| **Lockfile** | `pnpm-lock.yaml` — NEVER delete or regenerate casually | Sacred |

### Lockfile Rules

| Rule | Description |
|------|-------------|
| **Frozen CI installs** | CI must use `pnpm install --frozen-lockfile` |
| **Intentional changes only** | If lockfile changes, must be ticketed (e.g., `DEP-XXX`) |
| **No mixed batches** | Dependency bumps get dedicated batch, never mixed with features |

### Operator Pre-Batch Verification

```powershell
node -v                    # Must match .nvmrc
pnpm -v                    # Must match packageManager
git diff pnpm-lock.yaml    # Must be empty (no drift)
```

---

## CHANGE CLASS MATRIX

> Risk determines required gates. Claude cannot treat all tickets equally.

| Class | Type | Required Gates | Evidence |
|-------|------|----------------|----------|
| **A** | UI copy, layout, styling | Typecheck + Incognito visual check | Screenshot |
| **B** | API contract, business logic | Typecheck + E2E + curl proof | Response JSON |
| **C** | Auth, OTP, session | Typecheck + E2E + real device/browser + console check | Video/logs |
| **D** | Routing, nginx, gateway | Typecheck + curl header proof + /version check | curl output |
| **E** | DB schema, migrations | Typecheck + migration test + rollback test | SQL logs |
| **F** | Infra, Docker, CI | Build proof + deploy proof + health check | Build logs |

### Class Assignment Rule

Claude must declare risk class in ticket progress. Operator can override.

---

## TICKET TEMPLATE V2

> Every ticket must follow this structure. "NO SILENT FIXES" means "NO FIX WITHOUT EVIDENCE".

```markdown
### TICKET-ID: Short Description

**Risk Class**: A / B / C / D / E / F

**Scope**:
- Files: `path/to/file.ts`, `path/to/other.ts`
- Services: retailer-web / supplier-web / admin / pos / gateway

**Steps to Verify**:
1. Local: [specific test command or manual step]
2. Staging: [URL to check + expected behavior]

**Evidence Required**:
- [ ] Screenshot/video: [what to capture]
- [ ] Log extract: [what to grep]
- [ ] curl proof: [command + expected output]

**Rollback Note**:
- Revert commit: `git revert COMMIT_SHA`
- Or: [specific rollback instruction]

**Status**: PENDING / IN_PROGRESS / DONE / BLOCKED
```

---

## PART 1: CLAUDE RULES

### Session Start (MANDATORY)

Every Claude session MUST begin with:
```
1. Read this file: RELEASES/MASTER_PLAN.md
2. Show current batch status (from Part 4 table)
3. Follow current Session Mode:

   MODE A (Pre-Staging — CURRENT):
   - Run `git log --oneline -5` and `git status`
   - Check Operator Action Tracker for GCP progress
   - Start working on current batch tickets independently
   - No operator paste required

   MODE B (Staging/Production):
   - Ask operator to run git sync and paste output
   - Do NOT propose any fixes until operator paste confirms:
     - Clean git tree (no uncommitted changes)
     - RC_SHA is known
     - No lockfile drift
```

**Enforcement**: In Mode B, Claude must not start solutioning until sync output is pasted.
**Current Mode**: A — switch to B when operator confirms GCP + SA-GOLIVE complete.

### Development Rules

| Rule | Description |
|------|-------------|
| **SCOPE LOCK** | Only work on current batch items |
| **NO SILENT FIXES** | Every change maps to ticket ID + evidence |
| **TYPE SAFE** | `pnpm -r typecheck` before commit |
| **ATOMIC COMMITS** | One ticket per commit |
| **CI IS TRUTH** | Never declare done until CI is green for RC_SHA |
| **CLASS AWARE** | Assign risk class to every ticket |

### Gate Reminders

- After every 3 tickets: "Time to run gates"
- Before batch complete: "Run gates + browser tests + verify CI green"
- If CI red: "🛑 BLOCKED: CI failed — do not proceed"
- If local passes but CI fails: "🛑 BLOCKED: CI overrides local — treat as failed"
- If ready: "✅ BATCH COMPLETE - Ready for operator testing"

### Commit Message Format

```
BATCH-XXX: TICKET-ID - Description

Risk Class: X
Evidence: [link or path]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### Definition of Done (Per Ticket)

A ticket is DONE only when:
- [ ] Code change committed with proper message
- [ ] Risk class declared
- [ ] Evidence collected and stored in `RELEASES/EVIDENCE/BATCH-XXX/`
- [ ] Local gates pass (typecheck + relevant e2e)
- [ ] CI pipeline green for commit SHA

---

## PART 2: OPERATOR RULES

### Before Any Batch (Mode-Aware)

**Mode A (Pre-Staging — CURRENT):**
- Operator does NOT need to paste git sync before Claude starts
- Claude runs `git log --oneline -5` and `git status` independently
- Operator involvement comes AFTER Claude completes all tests (see Final Verification below)

**Mode B (Staging/Production):**
```powershell
cd C:\supermandi-pos
git fetch origin
git status                    # MUST be clean
git pull origin main
git rev-parse HEAD            # This is RC_SHA
git log -3 --oneline
node -v                       # Must match .nvmrc
pnpm -v                       # Must match packageManager
git diff pnpm-lock.yaml       # Must be empty
```
**Paste output to Claude before proceeding.**

### Gate Commands (Claude Runs)

Claude runs all automated gates and provides results. Operator does NOT run gates manually.

```powershell
pnpm -r typecheck
pnpm -r build
pnpm test:ci
cd e2e-tests
node .\node_modules\@playwright\test\cli.js test --grep "@prod"
cd ..
```

### Final Verification Script (Claude Provides → Operator Runs)

After Claude completes all automated gates, Claude provides a **single PowerShell script** that the operator runs in VS Code terminal. Operator pastes the output back to Claude.

```powershell
# Claude generates this script per-batch with current context filled in:
# scripts/final-verify.ps1
# Operator runs: .\scripts\final-verify.ps1

Write-Host "=== SUPERMANDI FINAL VERIFICATION ===" -ForegroundColor Cyan
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Host ""

# 1. Git state
Write-Host "--- GIT STATE ---" -ForegroundColor Yellow
git status --short
git rev-parse --short HEAD
git log --oneline -3
Write-Host ""

# 2. Environment parity
Write-Host "--- ENVIRONMENT ---" -ForegroundColor Yellow
node -v
pnpm -v
git diff --stat pnpm-lock.yaml
Write-Host ""

# 3. Gate results summary (Claude fills these in)
Write-Host "--- GATE RESULTS (from Claude) ---" -ForegroundColor Yellow
Write-Host "Typecheck: [Claude fills: PASS/FAIL + error count]"
Write-Host "Build: [Claude fills: PASS/FAIL]"
Write-Host "E2E @prod: [Claude fills: PASS/FAIL + test count]"
Write-Host ""

# 4. Operator browser test checklist
Write-Host "--- OPERATOR BROWSER TESTS ---" -ForegroundColor Yellow
Write-Host "Please test in Chrome Incognito and confirm:"
Write-Host "  [ ] Retailer portal: login + dashboard"
Write-Host "  [ ] Supplier portal: login + dashboard"
Write-Host "  [ ] SuperAdmin: login + all tabs"
Write-Host "  [ ] POS app: connect + sell flow (Redmi)"
Write-Host ""

Write-Host "=== PASTE THIS OUTPUT TO CLAUDE ===" -ForegroundColor Green
```

**Flow:**
1. Claude completes all gates → reports results
2. Claude generates `final-verify.ps1` with gate results filled in
3. Operator runs script, does browser tests, pastes output to Claude
4. Claude confirms batch status progression

**When Claude generates this script:**
- **MEGA-RC (first deploy):** Once, after all SA-GOLIVE tickets are done and combined gates pass on HEAD
- **Normal cadence (post go-live):** Once per batch, after that batch's gates pass
- **Format:** Claude pastes the script content inline — operator copies to PowerShell terminal
- **Not a committed file** — the script is session-specific with live gate results filled in

**Required Results:**
- Typecheck: 0 errors
- Build: all projects pass
- E2E @prod: 0 failures
- Operator browser tests: all checked

### Testing Matrix

| Portal | Device | Method |
|--------|--------|--------|
| Retailer Web | PC | Chrome Incognito |
| Supplier Web | PC | Chrome Incognito |
| SuperAdmin | PC | Chrome Incognito |
| POS App | Redmi | Native App |

### Non-Functional Proof Checklist

> Required for every batch before marking complete.

| Check | Command/Method | Expected |
|-------|----------------|----------|
| `/health` returns ok | `curl https://ENV.supermandi.tech/api/v1/health` | `{"status":"ok"}` |
| `/version` shows RC_SHA | `curl https://ENV.supermandi.tech/api/v1/version` | `{"sha":"RC_SHA"}` |
| Static assets cached | Check `Cache-Control` header | `immutable, max-age=31536000` |
| HTML no-store (if needed) | Check `Cache-Control` header | `no-store` |
| No console errors | Browser DevTools | 0 errors |

### Batch Completion Checklist V2 (MEGA-RC Aware)

> For the first deploy (MEGA-RC), completion is split into per-batch and combined checks.
> After go-live, resume per-batch CI requirement (each batch gets its own CI green).

**Per-Batch (applies to each batch individually):**
- [ ] All tickets have code committed to main
- [ ] Per-batch parity checklist filled (Dev + Docker columns)
- [ ] Per-batch `scope-verification.md` written
- [ ] Browser tests passed (per Testing Matrix — batch-specific scope)
- [ ] Evidence folder complete: `RELEASES/EVIDENCE/BATCH-XXX/`
  - [ ] `screenshots/` — browser test evidence
  - [ ] `scope-verification.md` — Claude's scope + parity verification
- [ ] All tickets have evidence attached

**MEGA-RC Combined (applies once to HEAD after all batches):**
- [ ] Git status clean (`git status` shows nothing to commit)
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `pnpm -r build` = all projects pass
- [ ] `@prod` E2E = 0 failures
- [ ] Docker local-prod 17/17 healthy
- [ ] **CI pipeline green for RC_SHA** (one CI run on HEAD)
- [ ] `migrate-prod.js dry-run` = no issues
- [ ] `/version` endpoint shows RC_SHA on deployed environment
- [ ] BATCH_LEDGER.md entry added
- [ ] All per-batch evidence folders complete (no waivers for 004–014)

**Post Go-Live (Normal Cadence):**
Resume per-batch CI requirement. Each batch's RC_SHA gets its own CI green.

---

## STOP-THE-LINE POLICY

### What Counts as BLOCKED

| Condition | Status |
|-----------|--------|
| CI pipeline red for RC_SHA | 🛑 BLOCKED |
| Flaky test (passes sometimes, fails sometimes) | 🛑 BLOCKED |
| Environment mismatch (staging vs local behavior differs) | 🛑 BLOCKED |
| Unknown production behavior (can't reproduce) | 🛑 BLOCKED |
| Lockfile drift detected | 🛑 BLOCKED |
| Missing evidence for completed ticket | 🛑 BLOCKED |

### Required Actions When Blocked

**Operator**:
1. Freeze current batch (no new commits)
2. Choose action:
   - **Fix forward**: Create HOTFIX-XXX ticket, fix issue, re-run gates
   - **Revert**: `git revert` the problematic commit(s)
   - **Escalate**: If unclear, pause and investigate

**Claude**:
1. Output single-line status: `🛑 BLOCKED: [specific reason]`
2. Do NOT propose workarounds or "let's continue anyway"
3. Wait for operator decision

### Response Format When Blocked

```
🛑 BLOCKED: [reason]

Recommended action: [Fix forward / Revert / Investigate]
Next step: [specific command or question for operator]
```

---

## ROLLBACK RULEBOOK

### Rollback Capability Requirements

| Requirement | How |
|-------------|-----|
| Every deploy must be revertible | Cloud Run: "Revert to previous revision" |
| Rollback time < 5 minutes | Pre-tested, documented command |
| Rollback SHA always known | Stored in BATCH_LEDGER.md |

### Rollback Commands

**Production Rollback (< 5 min)**:
```bash
# Cloud Run instant rollback — route 100% traffic to previous revision
gcloud run services update-traffic supermandi-api \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=asia-south1

# Or re-deploy previous SHA from Artifact Registry
./scripts/promote-to-prod.sh <ROLLBACK_SHA> --confirm
```

**Staging Rollback**:
```bash
# Cloud Run instant rollback on staging service
gcloud run services update-traffic supermandi-api-staging \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=asia-south1
```

**Git Revert (code-level)**:
```bash
git revert COMMIT_SHA
git push origin main
# CI will auto-build + auto-deploy reverted code to staging
```

### Rollback Drill

> Required: Once per week OR before every 5th batch (whichever comes first)

1. Deploy a test change to staging
2. Verify it's live
3. Execute rollback command
4. Verify previous version is restored
5. Document in `RELEASES/EVIDENCE/rollback-drills.md`

---

## CI GATES = SOURCE OF TRUTH

### The Rule

> **If local passes but CI fails → treat as FAILED.**

This is non-negotiable. Reasons:
- CI runs in clean environment (no local state)
- CI uses `--frozen-lockfile` (catches lockfile issues)
- CI is reproducible (your local isn't)

### Enforcement

**Claude**: Never declare a ticket or batch DONE until:
```
CI Run: GREEN for SHA abc1234
Link: https://github.com/ORG/REPO/actions/runs/XXXXX
```

**Operator**: Before signing off any batch:
1. Find CI run for RC_SHA
2. Verify all checks green
3. Paste CI link in evidence folder

### When CI Disagrees with Local

1. Do NOT retry locally hoping for different result
2. Do NOT merge anyway
3. DO investigate the difference
4. DO fix the root cause
5. DO re-run CI and get green

---

## PART 3: BATCH PROGRESSION

```
BATCH-004 Retailer ──┐
BATCH-005 Supplier ──┼──► BATCH-008 Cloud Run ──► BATCH-009 CI/CD ──► BATCH-012 Auth ──► BATCH-013 Infra ──► DEFERRED ──► BATCH-014 Polish
BATCH-006 Admin ─────┤                                                                                                         │
BATCH-007 POS ───────┘                                                                              ┌──────────────────────────┘
                                                                                                     ▼
                                                                                              SA-MERGED (8 tickets)
                                                                                                     │
                                                                                              SA-GOLIVE (17 tickets) ◄── YOU ARE HERE
                                                                                                     │
                                                                                              BATCH-010 Staging ──► BATCH-011 Go-Live
                                                                                                                          │
                                                                                                                   SA-DEFERRED (8 tickets, post go-live)
```

---

## PART 4: CURRENT STATUS

> **Status definitions**: See Part 7 Status Legend.
> **Batch_SHA**: Historical — the HEAD SHA when that batch's code was last committed.
> **RC_SHA**: Set once on the combined release candidate (see MEGA-RC section below).

| Batch | Portal | Status | Progress | Owner | Batch_SHA | Updated |
|-------|--------|--------|----------|-------|-----------|---------|
| BATCH-004 | Retailer Web | `WRITTEN` | 5/5 | Claude | d3e9e45 | 2026-02-05 |
| BATCH-005 | Supplier Web | `WRITTEN` | 4/4 | Claude | d3e9e45 | 2026-02-05 |
| BATCH-006 | SuperAdmin | `WRITTEN` | 11/11 | Claude | d3e9e45 | 2026-02-05 |
| BATCH-007 | POS App | `WRITTEN` | 7/7 | Claude | d3e9e45 | 2026-02-05 |
| BATCH-008 | Cloud Run Prep | `WRITTEN` | 11/11 | Claude | 59d7ebb | 2026-02-05 |
| BATCH-009 | GCP CI/CD | `WRITTEN` | 9/9 | Claude+Operator | 59d7ebb | 2026-02-05 |
| BATCH-012 | Auth & Session Security | `WRITTEN` | 18/18 | Claude | 9bb03f7 | 2026-02-06 |
| BATCH-013 | Prod Testing + Infra Hardening | `WRITTEN` | ALL | Claude | f7cb90d | 2026-02-06 |
| BATCH-014 | Production Grade Polish | `WRITTEN` | 10/10 | Claude | 609d875 | 2026-02-07 |
| SA-MERGED | SuperAdmin Tickets (merged) | `WRITTEN` | 8/8 | Claude | bd90493 | 2026-02-10 |
| SA-GOLIVE | SuperAdmin Critical Go-Live | `DONE` | 17/17 | Claude | e52adf7 | 2026-02-16 |
| SA-DEFERRED | SuperAdmin Post Go-Live | `DEFERRED` | 0/8 | — | — | 2026-02-10 |
| DEFERRED | Deferred Tickets (P1+P2+P3) | `WRITTEN` | 7/7 | Claude | 609d875 | 2026-02-06 |
| BATCH-010 | Staging Deploy | `PENDING` | 1/6 | Claude+Operator | — | 2026-02-10 |
| BATCH-011 | Go-Live | `PENDING` | 0/4 | Operator | — | 2026-02-10 |
| **PHASE-5→10** | **Dev Tickets + Testing** | **`DONE`** | **T-128→TEST-052** | **Claude** | **e52adf7** | **2026-02-16** |
| **PHASE-11** | **Production Hardening** | **`QUEUED`** | **FIX-001→FIX-067 (67)** | **Claude** | **—** | **2026-02-16** |

### Note on Batch Statuses

Batches 004–014 + SA-MERGED are `WRITTEN` (code on main, no gates verified). These are **not** `GATED`, `TESTED`, or `EVIDENCED` yet. Each batch must individually progress through the evidence collection phase during the combined release gate run.

---

### MEGA-RC: Combined Release Candidate

All batches 004 through SA-GOLIVE are merged on `main`. The single RC_SHA for staging and production is HEAD after SA-GOLIVE completes. Individual Batch_SHA values are historical reference only.

| Field | Value |
|-------|-------|
| **RC_SHA** | `e52adf7` *(main HEAD after Phase 10 complete, Phase 11 hardening pending)* |
| **Includes** | BATCH-004→014, SA-MERGED, SA-GOLIVE, DEFERRED, Phase 5→10 (T-128→TEST-052) |
| **Gate Status** | `PENDING` — Phase 11 (FIX-001→FIX-067) must complete before RC tag |
| **Evidence** | `RELEASES/EVIDENCE/` — per-batch folders + combined gate artifacts |
| **CI Run** | *(set after Phase 11 + CI green)* |

**Rules:**
1. RC_SHA is the `git rev-parse HEAD` of `main` after SA-GOLIVE is complete
2. All gates run once against this single SHA (not per-batch SHAs)
3. Evidence is collected per-batch scope (each batch gets its own folder)
4. One RC tag: `supermandi-YYYY-MM-DD-HHmm-MEGA-RC`
5. This is a **one-time** combined RC. After go-live, resume normal "one batch = one RC" cadence

**MEGA-RC Lifecycle:**
```
SA-GOLIVE complete
    → Set RC_SHA = HEAD
    → Run full gate suite (typecheck + build + E2E + docker local-prod)
    → Operator browser tests all 4 portals
    → Collect per-batch evidence
    → Tag RC
    → CI green
    → Deploy staging (BATCH-010)
    → Verify staging
    → Promote to production (BATCH-011)
```

---

### Operator Action Tracker (GCP Infrastructure)

> **Owner**: Operator. **Status**: ✅ 9/9 DONE — all GCP infra complete.
> **Last audited**: 2026-03-12 via `gcloud` live check + DNS/HTTP probe.

| # | Action | Script / Method | Status | Evidence |
|---|--------|----------------|--------|---------|
| 1 | GCP project with billing enabled | Manual (GCP Console) | **DONE** | `supermandi-backend` ACTIVE, billing `01257D-4157DA-D279E1` enabled |
| 2 | Artifact Registry repo | `scripts/gcp/setup-artifact-registry.sh` | **DONE** | `asia-south1/supermandi` DOCKER repo exists |
| 3 | Cloud SQL (Postgres 15) | `scripts/gcp/setup-cloud-sql.sh` | **DONE** | `supermandi-staging` POSTGRES_15 RUNNABLE asia-south1 |
| 4 | Memorystore (Redis 7) | `scripts/gcp/setup-memorystore.sh` | **DONE** | `supermandi-redis-staging` REDIS_7_0 READY `10.107.71.27:6379` |
| 5 | VPC Connector | `scripts/gcp/setup-vpc-connector.sh` | **DONE** | `supermandi-connector` READY `10.8.0.0/28` on default VPC |
| 6 | Secret Manager (all secrets) | `scripts/gcp/setup-secret-manager.sh` | **DONE** | 12 secrets: admin-token, database-url, jwt-secret, postgres-password, smtp-password, SERVICE_TOKEN_SECRET, OPENAI_API_KEY, ADMIN_EMAIL_ALLOWLIST, WHATSAPP_* (4) |
| 7 | Workload Identity Federation | `scripts/gcp/setup-wif.sh` | **DONE** | `github-pool` ACTIVE + `github-provider` ACTIVE (attribute.repository mapping correct) |
| 8 | GitHub secrets set | Manual (`GCP_WIF_PROVIDER`, `GCP_SA_EMAIL`) | **DONE** | Both set 2026-02-13; confirmed via `gh secret list` |
| 9 | DNS: staging.supermandi.tech | Cloud LB (registrar-level DNS) | **DONE** | `34.54.26.145` Cloud LB EXTERNAL. All portals 200 OK: `/`, `/api/health`, `/retailer/`, `/supplier/`, `/admin/`. DNS set at registrar (not GCP Cloud DNS). |

**All 9/9 items DONE. GCP infra is complete. Claude can proceed with MEGA-RC gate run.**

> ⚠️ **NON-BLOCKING**: `landing` Cloud Run latest revision (00153-g4c) failing `HealthCheckContainerError PORT=80` — but older revision still serving via Cloud LB. `staging.supermandi.tech` returns HTTP 200. Fix needed before next `landing` redeploy.

---

### Mega-Batch Acceptance Criteria (One-Time First Deploy)

> Batches 004 through SA-GOLIVE accumulated during the pre-GCP phase.
> The first staging deploy is a combined mega-batch. This is a **ONE-TIME exception**.
> After go-live, resume normal "one batch = one RC" cadence.

**Risk Mitigations:**
1. Full gate suite on HEAD — not per-batch SHAs
2. Docker local-prod full stack test before staging
3. Cloud SQL backup BEFORE migration run on staging
4. Staging migration run as separate step — not auto on container start
5. 4-portal browser test on staging — not skippable
6. Rollback drill BEFORE production promote
7. Per-batch evidence collected — no waivers

**First Deploy Runbook:**
```
1. Claude finishes SA-GOLIVE → all batches WRITTEN
2. Claude runs full gates on HEAD → all batches GATED
3. Operator completes GCP setup (Operator Action Tracker above)
4. Operator browser tests all 4 portals → per-batch TESTED
5. Claude + Operator collect per-batch evidence → per-batch EVIDENCED
6. **Claude** tags MEGA-RC (`git tag supermandi-YYYY-MM-DD-HHmm-MEGA-RC`) → RC_TAGGED
7. CI builds images → pushes to Artifact Registry → CI green
8. Migration safety protocol (see BATCH-010) → backup + dry-run + apply
9. Deploy services to staging Cloud Run → STAGED
10. Full staging verification (BATCH-010 tickets)
11. Promote to production (BATCH-011) → LIVE
```

### Failure Handoff Protocol (Who Acts First)

> When something fails during the deploy workflow, this matrix defines who detects, who acts first, and who assists.

| Failure During | Who Detects | Who Acts First | Who Assists | Escalation |
|----------------|-------------|----------------|-------------|------------|
| Gate failure (typecheck/E2E) | Claude | Claude (fix code) | — | If unfixable: BLOCKED → Operator decides revert/defer |
| Docker local-prod failure | Claude | Claude (fix config) | — | If infra: Operator checks Docker Desktop |
| GCP setup failure | Operator | Operator (retry/quota) | — | Claude cannot help — GCP console only |
| CI failure | CI | Claude (fix code) | — | If flaky: Operator checks GitHub Actions settings |
| Migration failure (staging) | Claude (sees log) | **Operator restores backup** | Claude fixes migration | NEVER retry failed migration without backup restore |
| Staging service won't start | Claude (sees log) | Claude (diagnose) | Operator checks Cloud Run console | If Cloud Run config: Operator fixes |
| Staging browser test fails | Operator (sees UI) | **Operator reports to Claude** | Claude fixes code | Re-deploy staging after fix |
| Staging parity mismatch | Both | Claude (creates HOTFIX) | Operator verifies | New RC tag required |
| Production health check fails | Claude (curl) | **Operator runs rollback** | Claude investigates | ROLLBACK FIRST, investigate second |
| Production 5xx errors | Cloud Logging | **Operator runs rollback** | Claude diagnoses | ROLLBACK FIRST, investigate second |
| POS device can't connect | Operator (device) | Operator reports | Claude checks API | If API healthy: POS network issue |

**Key principles:**
- **Code problems** → Claude acts first
- **Infrastructure problems** → Operator acts first
- **Production incidents** → Operator ALWAYS rollbacks first, Claude investigates after

---

### Scaling Note

For future batches: Each batch has a detailed section in Part 5 below. After go-live, completed batches move to BATCH_LEDGER.md with evidence links. This table shows only active/upcoming batches.

---

## PART 5: BATCH DETAILS

> **OPERATOR**: Write your scope in the "Operator Scope" section of each batch.
> Claude will ONLY work on items listed in that section.

---

### BATCH-004: Retailer Web

**Status**: `WRITTEN` | **Batch_SHA**: d3e9e45 | **CI Run**: —

#### Operator Scope (CONFIRMED 2026-02-05)
```
RC_SHA: d3e9e45
Confirmed by: Operator

1. RET-FORGOT-001 - Implement forgot password (OTP reset) [C]
2. RET-CATALOG-001 - Verify SupplierCatalog page works [A]
3. RET-QUEUE-001 - Verify SupplierQueuePage works [A]
4. RET-BANK-001 - Verify bank details persist [B]
5. RET-CLEANUP-001 - Remove unused ForgotPasswordPage or implement [A]
```

#### Suggested Tickets (Claude's assessment)
| # | ID | Description | Risk Class | Priority |
|---|-----|-------------|------------|----------|
| 1 | RET-FORGOT-001 | Implement forgot password (OTP reset) | C | HIGH |
| 2 | RET-CATALOG-001 | Verify SupplierCatalog page works | A | MEDIUM |
| 3 | RET-QUEUE-001 | Verify SupplierQueuePage works | A | MEDIUM |
| 4 | RET-BANK-001 | Verify bank details persist | B | LOW |
| 5 | RET-CLEANUP-001 | Remove unused ForgotPasswordPage or implement | A | LOW |

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | RET-FORGOT-001 | C | DONE | ForgotPasswordPage.tsx fully implemented with OTP flow |
| 2 | RET-CATALOG-001 | A | DONE | SupplierCatalogPage.tsx - browse & add products |
| 3 | RET-QUEUE-001 | A | DONE | SupplierQueuePage.tsx - approve/reject suppliers |
| 4 | RET-BANK-001 | B | DONE | SettingsPage.tsx - UPI VPA persists |
| 5 | RET-CLEANUP-001 | A | DONE | Route added at /retailer/forgot-password + "Forgot Password?" link on LoginPage |

**Code Review Notes (2026-02-05):**
- ForgotPasswordPage.tsx (409 lines) - Full 4-step OTP flow: phone → otp → password → success
- SupplierCatalogPage.tsx (337 lines) - Browse approved supplier products, add to catalog
- SupplierQueuePage.tsx (327 lines) - Approve/reject pending suppliers with reason
- SettingsPage.tsx (673 lines) - UPI VPA, tax, store info, operating hours
- `npx tsc --noEmit` passes with 0 errors

#### Browser Tests (Operator)
- [ ] /retailer/login - OTP sends and verifies
- [ ] /retailer/register - Full flow completes
- [ ] Dashboard loads with real data
- [ ] All menu items accessible
- [ ] No console errors

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures
- [ ] CI green for RC_SHA

#### Non-Functional
- [ ] `/health` returns ok
- [ ] `/version` shows RC_SHA
- [ ] No console errors in Incognito

#### Parity Checklist (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| basePath /retailer/ serves SPA | — | — | — | — |
| API calls use VITE_API_BASE_URL (not hardcoded) | — | — | — | — |
| Login → OTP → Dashboard flow | — | — | — | — |
| Static assets have cache-control immutable | — | — | — | — |
| No CORS errors in console | — | — | — | — |
| Forgot password page reachable | — | — | — | — |

---

### BATCH-005: Supplier Web

**Status**: `WRITTEN` | **Batch_SHA**: d3e9e45 | **CI Run**: —

#### Operator Scope (CONFIRMED 2026-02-05)
```
RC_SHA: d3e9e45
Confirmed by: Operator

1. SUP-VERIFY-001 - Verify all 17 pages load [A]
2. SUP-ORDER-001 - Test order fulfillment (ship/deliver) [B]
3. SUP-EARNINGS-001 - Test earnings/payouts display [B]
4. SUP-KYC-001 - Test KYC document upload + IFSC [C]
```

#### Suggested Tickets (Claude's assessment)
| # | ID | Description | Risk Class | Priority |
|---|-----|-------------|------------|----------|
| 1 | SUP-VERIFY-001 | Verify all 17 pages load | A | HIGH |
| 2 | SUP-ORDER-001 | Test order fulfillment (ship/deliver) | B | HIGH |
| 3 | SUP-EARNINGS-001 | Test earnings/payouts display | B | MEDIUM |
| 4 | SUP-KYC-001 | Test KYC document upload + IFSC | C | MEDIUM |

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | SUP-VERIFY-001 | A | DONE | 12 pages found (dashboard, products, orders, earnings, kyc, upload, profile, login, register, onboard, pending-approval, forgot-password) |
| 2 | SUP-ORDER-001 | B | DONE | orders/page.tsx (717 lines) - full order management with shipment tracking |
| 3 | SUP-EARNINGS-001 | B | DONE | earnings/page.tsx (440 lines) - payout history with order breakdown |
| 4 | SUP-KYC-001 | C | DONE | kyc/page.tsx (480 lines) - document upload + IFSC lookup + bank verification |

**Code Review Notes (2026-02-05):**
- Next.js App Router structure with (dashboard) and (auth) route groups
- Orders: Status filters, item-level tracking, shipment with carrier/tracking
- Earnings: Payout summary cards, history table, order breakdown modal
- KYC: 5 document types, IFSC validation, bank account verification
- `npx tsc --noEmit` passes with 0 errors

#### Browser Tests (Operator)
- [ ] /supplier/login/ - OTP works
- [ ] /supplier/register/ - Full flow completes
- [ ] Dashboard shows products/orders
- [ ] KYC document upload works
- [ ] No console errors

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures
- [ ] CI green for RC_SHA

#### Non-Functional
- [ ] `/health` returns ok
- [ ] `/version` shows RC_SHA
- [ ] No console errors in Incognito

#### Parity Checklist (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| basePath /supplier/ serves Next.js | — | — | — | — |
| NEXT_PUBLIC_API_BASE_URL from env (not hardcoded) | — | — | — | — |
| SSR pages render server-side in Docker | — | — | — | — |
| Login → OTP → Dashboard flow | — | — | — | — |
| KYC document upload works | — | — | — | — |
| No hydration mismatch warnings | — | — | — | — |

---

### BATCH-006: SuperAdmin

**Status**: `WRITTEN` | **Batch_SHA**: d3e9e45 | **CI Run**: —

#### Operator Scope (CONFIRMED 2026-02-05)
```
RC_SHA: d3e9e45
Confirmed by: Operator

1. ADM-EVENTS-001 - Events tab POS events display [A]
2. ADM-DEVICES-001 - Devices tab list + QR codes [A]
3. ADM-STORES-001 - Stores tab CRUD operations [B]
4. ADM-SUPPLIERS-001 - Suppliers tab approve/reject [B]
5. ADM-PAYMENTS-001 - Payments tab records display [A]
6. ADM-ANALYTICS-001 - Analytics all sub-tabs [A]
7. ADM-AI-001 - AI health + queries [B]
8. ADM-USERS-001 - Users management [C]
9. ADM-SETTINGS-001 - Settings system config [B]
10. ADM-AUDIT-001 - Audit logs display [A]
11. ADM-DOCS-001 - Documents approval flow [B]
```

#### Suggested Tickets (11 Tabs to verify)
| # | ID | Tab | Risk Class | Priority |
|---|-----|-----|------------|----------|
| 1 | ADM-EVENTS-001 | Events - POS events display | A | HIGH |
| 2 | ADM-DEVICES-001 | Devices - List + QR codes | A | HIGH |
| 3 | ADM-STORES-001 | Stores - CRUD operations | B | HIGH |
| 4 | ADM-SUPPLIERS-001 | Suppliers - Approve/reject | B | HIGH |
| 5 | ADM-PAYMENTS-001 | Payments - Records display | A | MEDIUM |
| 6 | ADM-ANALYTICS-001 | Analytics - All sub-tabs | A | MEDIUM |
| 7 | ADM-AI-001 | AI - Health + queries | B | LOW |
| 8 | ADM-USERS-001 | Users - Management | C | MEDIUM |
| 9 | ADM-SETTINGS-001 | Settings - System config | B | LOW |
| 10 | ADM-AUDIT-001 | Audit - Logs display | A | LOW |
| 11 | ADM-DOCS-001 | Documents - Approval flow | B | MEDIUM |

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | ADM-EVENTS-001 | A | DONE | Awaiting browser test |
| 2 | ADM-DEVICES-001 | A | DONE | Awaiting browser test |
| 3 | ADM-STORES-001 | B | DONE | Awaiting browser test |
| 4 | ADM-SUPPLIERS-001 | B | DONE | Awaiting browser test |
| 5 | ADM-PAYMENTS-001 | A | DONE | Awaiting browser test |
| 6 | ADM-ANALYTICS-001 | A | DONE | Awaiting browser test |
| 7 | ADM-AI-001 | B | DONE | Awaiting browser test |
| 8 | ADM-USERS-001 | C | DONE | Awaiting browser test |
| 9 | ADM-SETTINGS-001 | B | DONE | Awaiting browser test |
| 10 | ADM-AUDIT-001 | A | DONE | Awaiting browser test |
| 11 | ADM-DOCS-001 | B | DONE | Awaiting browser test |

**Code Review Notes (2026-02-05):**
- All 11 API modules exist: posEvents.ts, devices.ts, stores.ts, suppliers.ts, analytics.ts, ai.ts, users.ts, settings.ts, audit.ts, documents.ts
- App.tsx contains UI for all tabs (monolithic ~51k tokens)
- `npx tsc --noEmit` passes with 0 errors
- Operator must complete browser tests in Chrome Incognito

#### Browser Tests (Operator)
- [ ] /admin/ - Login works
- [ ] All 11 tabs load without errors
- [ ] Real data displays (not mock)
- [ ] No console errors

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures
- [ ] CI green for RC_SHA

#### Non-Functional
- [ ] `/health` returns ok
- [ ] `/version` shows RC_SHA
- [ ] No console errors in Incognito

#### Parity Checklist (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| basePath /admin/ serves SPA | — | — | — | — |
| API calls use VITE_API_BASE_URL | — | — | — | — |
| Login with admin token works | — | — | — | — |
| All 11 tabs load without error | — | — | — | — |
| Real data displays (not mock) | — | — | — | — |
| No console errors | — | — | — | — |

---

### BATCH-007: POS App

**Status**: `WRITTEN` | **Batch_SHA**: d3e9e45 | **CI Run**: —

#### Operator Scope (CONFIRMED 2026-02-05)
```
RC_SHA: d3e9e45
Confirmed by: Operator

1. POS-HTTPS-001 - Update API URLs to HTTPS (supermandi.tech) [D] CRITICAL
2. POS-GATE-001 - Backend deploys GATE-000 APIs [F] CRITICAL
3. POS-SUPPLIERS-001 - Live Suppliers browse + order [B]
4. POS-STOCKIN-001 - Stock-In submission works [B]
5. POS-SUMMARY-001 - Daily summary analytics [A]
6. POS-CREDIT-001 - BNPL + loan display [B]
7. POS-PRINT-001 - ESC/POS receipt printing [B]
```

#### Suggested Tickets (Claude's assessment)
| # | ID | Description | Risk Class | Priority |
|---|-----|-------------|------------|----------|
| 1 | POS-HTTPS-001 | Update API URLs to HTTPS (supermandi.tech) | D | CRITICAL |
| 2 | POS-GATE-001 | Backend deploys GATE-000 APIs | F | CRITICAL |
| 3 | POS-SUPPLIERS-001 | Live Suppliers browse + order | B | HIGH |
| 4 | POS-STOCKIN-001 | Stock-In submission works | B | HIGH |
| 5 | POS-SUMMARY-001 | Daily summary analytics | A | MEDIUM |
| 6 | POS-CREDIT-001 | BNPL + loan display | B | MEDIUM |
| 7 | POS-PRINT-001 | ESC/POS receipt printing | B | HIGH |

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | POS-HTTPS-001 | D | DONE | app.json updated: API_URL + POS_API_URL → https://supermandi.tech |
| 2 | POS-GATE-001 | F | DONE | readinessGate.ts (483 lines) probes 4 endpoints with contract validation |
| 3 | POS-SUPPLIERS-001 | B | DONE | suppliersApi.ts (194 lines) + BuyScreen.tsx (840 lines) — full CRUD |
| 4 | POS-STOCKIN-001 | B | DONE | stockInApi.ts (161 lines) + PurchaseScreen.tsx (1069 lines) — POST + demo fallback |
| 5 | POS-SUMMARY-001 | A | DONE | dailySummaryApi.ts + MenuScreen.tsx — 2x2 KPI grid + trend + payment breakdown |
| 6 | POS-CREDIT-001 | B | DONE | creditApi.ts (322) + bnplApi.ts (356) + CreditScreen.tsx (1434) — full loan+BNPL flow |
| 7 | POS-PRINT-001 | B | DONE | printerService.ts — expo-print system dialog (replaces stub) |

**Code Review Notes (2026-02-05):**
- POS-HTTPS-001: app.json updated to https://supermandi.tech (no hardcoded VM IP)
- POS-GATE-001: readinessGate.ts — runtime endpoint detection, 2s probe timeout, 15min cache
- POS-SUPPLIERS-001: suppliersApi.ts — verified supplier filter, GSTIN validation
- POS-STOCKIN-001: stockInApi.ts — real POST + demo fallback gated by ReadinessGate
- POS-SUMMARY-001: MenuScreen.tsx lines 425-506 — 2x2 KPI grid with trend indicators
- POS-CREDIT-001: creditApi + bnplApi — full application/KYC/EMI/BNPL payment flow
- POS-PRINT-001: printerService.ts — replaced stub with expo-print system print dialog
- All API calls use real apiClient (not mocked). Operator must test on Redmi device

#### Device Tests (Operator on Redmi)
- [ ] App launches without crash
- [ ] Device activation works
- [ ] SELL: scan → cart → pay → receipt
- [ ] PURCHASE: quick purchase works
- [ ] REORDER: suggestions display
- [ ] CREDIT: loans display
- [ ] Offline: queues transactions

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures
- [ ] EAS build succeeds
- [ ] CI green for RC_SHA

#### Non-Functional
- [ ] API calls use HTTPS
- [ ] `/health` returns ok from device
- [ ] No crash logs in device console

#### Parity Checklist (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| API URL is HTTPS (app.json) | — | — | — | — |
| Device activation against backend | — | — | — | — |
| Barcode scan resolves store-scoped | — | — | — | — |
| Sell flow: scan → cart → pay → receipt | — | — | — | — |
| Offline queue stores transactions | — | — | — | — |
| ReadinessGate probes all endpoints | — | — | — | — |

---

### BATCH-008: Cloud Run Prep

**Status**: `WRITTEN` | **Batch_SHA**: 59d7ebb | **CI Run**: —

> **Goal**: Every Docker image builds. All services ready for Cloud Run deployment.
> Database migrations are clean. Service URLs parameterized (no Docker DNS hardcoding).
> Secrets ready for Secret Manager. /health + /version endpoints on all services.

#### Architecture: Cloud Run + Cloud SQL + Memorystore (per PDF plan)

```
GCP ARCHITECTURE:
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Load Balancer (HTTPS: supermandi.tech)                   │
│  ├── /api/v1/*     → Cloud Run: api-gateway                    │
│  ├── /retailer/*   → Cloud Run: retailer-admin (nginx+SPA)     │
│  ├── /supplier/*   → Cloud Run: supplier-portal (Next.js)      │
│  ├── /admin/*      → Cloud Run: superadmin (nginx+SPA)         │
│  └── /             → Cloud Run: landing-page (static)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Run Services (internal, no public URL)                   │
│  ├── auth-service     ├── platform-service   ├── main-backend  │
│  ├── supplier-service ├── catalog-service    ├── inventory-svc  │
│  ├── order-service    ├── reorder-service    ├── voice-service  │
│  └── payment-service                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Cloud SQL             Memorystore
              (Postgres 15)         (Redis 7)
              VPC connector         VPC connector

Secrets: GCP Secret Manager (mounted as env vars in Cloud Run)
Images:  Artifact Registry (asia-south1-docker.pkg.dev/supermandi-pos/supermandi/)
CI/CD:   GitHub Actions → build images → push AR → deploy Cloud Run
```

**Key difference from Docker Compose**: Services call each other via Cloud Run URLs
(set as env vars), not Docker DNS names. All services already use env vars — just
need correct Cloud Run URLs at deploy time.

#### Tickets (11 tickets — Claude executes all)

---

**LOCAL-PROD-201: Local-Prod Runs SHA-Tagged Docker Images (Cloud Run Parity)**

**Risk Class**: F | **Priority**: CRITICAL

**Problem**: Local testing currently runs services via `pnpm dev` / raw builds, but Cloud Run
deploys Docker images from Artifact Registry. If local tests don't validate the same built
images, regressions can slip through after deployment.

**Goal**: Local testing uses the same Docker images that Cloud Run will deploy.

**Fix**:
1. `scripts/build-all-images.sh --sha <sha>` — builds all images tagged with git SHA
2. `scripts/run-local-prod-images.sh --sha <sha>` — starts local stack via docker compose using those SHA-tagged images
3. `scripts/prelive-verify.sh --base-url http://localhost:8080 --sha <sha>` — runs smoke + Playwright against local Docker stack
4. Evidence saved to `RELEASES/EVIDENCE/local/<sha>/...`

**Acceptance**:
- [ ] `./scripts/build-all-images.sh --sha <sha>` builds all images with SHA tag
- [ ] `./scripts/run-local-prod-images.sh --sha <sha>` starts full stack from those images
- [ ] `./scripts/prelive-verify.sh --base-url http://localhost:8080 --sha <sha>` passes
- [ ] Evidence saved to `RELEASES/EVIDENCE/local/<sha>/`
- [ ] The images tested locally are byte-identical to what AR will hold
- [ ] `docker inspect --format='{{index .RepoDigests 0}}'` digests captured for each image
- [ ] `BATCH_LEDGER.md` records git SHA + image digest for each service

**Files**: 3 new scripts

**Evidence**: Build log + docker compose up log + prelive-verify output

**Rollback**: Delete scripts

---

**FRONTEND-CR-201: Add Missing Dockerfiles + Unify URL Base Strategy**

**Risk Class**: F | **Priority**: CRITICAL

**Problem**:
- `supermandi-superadmin/` has no Dockerfile (confirmed missing)
- `supermandi-landing/` has no Dockerfile (confirmed missing)
- `supplier-portal/Dockerfile` has hardcoded `https://supermandi.tech` as `NEXT_PUBLIC_API_BASE_URL` default
- `retailer-admin/Dockerfile` has hardcoded `https://supermandi.tech` as ARG default
- URL base strategy (same-domain `/api` vs api subdomain) must be consistent across all portals

**Fix**:
1. Create `supermandi-superadmin/Dockerfile` (pattern: Vite → nginx, same as retailer-admin)
2. Create `supermandi-landing/Dockerfile` (pattern: static → nginx)
3. Fix `supplier-portal/Dockerfile`: `NEXT_PUBLIC_API_BASE_URL` must be build ARG with empty default (set at build time, not hardcoded)
4. Fix `retailer-admin/Dockerfile`: same — no hardcoded domain in ARG defaults
5. Document chosen URL routing strategy in `docs/deploy/CONFIG_CONTRACT.md`

**Acceptance**:
- [ ] All portals deployable as Cloud Run services behind LB paths
- [ ] `docker build` succeeds for supermandi-superadmin, supermandi-landing
- [ ] No hardcoded `supermandi.tech` in any Dockerfile (only as build ARG at deploy time)
- [ ] URL routing strategy documented: all portals use relative `/api/v1/*` or env-injected base URL

**Files**: 2 new Dockerfiles + 2 modified Dockerfiles

**Evidence**: Build logs for all portal images + grep showing zero hardcoded domains

**Rollback**: `git revert`

---

**CR-MIG-001: Renumber Duplicate Migrations**

**Risk Class**: E | **Priority**: CRITICAL

**Problem**: Two pairs of duplicate migration numbers will cause ordering conflicts:
- `093_go_live_batch9_retailer_portal.sql` + `093_reg_auth_database_foundation.sql`
- `094_core_001_store_status_enum.sql` + `094_reg_auth_document_storage.sql`

**Fix**:
```
RENAME: 093_reg_auth_database_foundation.sql → 102_reg_auth_database_foundation.sql
RENAME: 094_reg_auth_document_storage.sql   → 103_reg_auth_document_storage.sql
```
(102/103 chosen because 101 is the current highest numbered migration)

**Also renumber** the 4 date-named files to proper sequence:
```
RENAME: 2026-01-04_add_global_store_catalog.sql → 104_add_global_store_catalog.sql
RENAME: 2026-01-04_add_scan_lookup_v2_flag.sql  → 105_add_scan_lookup_v2_flag.sql
RENAME: 2026-01-06_add_inventory_ledger.sql     → 106_add_inventory_ledger.sql
RENAME: 2026-01-10_add_missing_indexes.sql      → 107_add_missing_indexes.sql
```

**Files**: `backend/migrations/*.sql` (6 renames)

**Verify**:
```bash
ls backend/migrations/ | sort     # No duplicates, sequential 000-107
```

**Evidence**: Sorted listing before/after

**Rollback**: `git revert` (renames only, no data changes)

---

**CR-MIG-002: Add Advisory Lock to Migration Runner**

**Risk Class**: E | **Priority**: HIGH

**Problem**: `migrate-prod.js` has no locking. Two Cloud Run instances starting simultaneously will race.

**Fix**: Edit `backend/scripts/migrate-prod.js`:
```javascript
const MIGRATION_LOCK_ID = 839271;
console.log('[migrate] Acquiring advisory lock...');
await pool.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
console.log('[migrate] Lock acquired');

// In finally block, before pool.end():
await pool.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
console.log('[migrate] Lock released');
```

**Files**: `backend/scripts/migrate-prod.js` (1 file)

**Evidence**: Console output showing lock acquire/release sequence

**Rollback**: `git revert`

---

**CR-DOCKER-001: Create SuperAdmin Dockerfile**

**Risk Class**: F | **Priority**: CRITICAL

**Problem**: `supermandi-superadmin/` has no Dockerfile. All other portals have one.

**Fix**: Create `supermandi-superadmin/Dockerfile` (pattern matches `retailer-admin/Dockerfile`):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=""
ARG VITE_GIT_SHA="unknown"
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
RUN echo "ok" > /usr/share/nginx/html/health.txt
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health.txt || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

**Files**: `supermandi-superadmin/Dockerfile` (1 new file)

**Evidence**: Build log + health check response

**Rollback**: Delete file

---

**CR-DOCKER-002: Build-Verify All 14 Docker Images**

**Risk Class**: F | **Priority**: CRITICAL

**Fix**: Create `scripts/build-all-images.sh` that builds all 14 images and reports success/failure.

**Files**: `scripts/build-all-images.sh` (1 new file)

**Verify**: `./scripts/build-all-images.sh` — all 14 images build

**Evidence**: Build output + `docker images` listing showing 14 images

**Rollback**: Delete file

---

**CR-SVCURL-001: Parameterize All Service URLs for Cloud Run**

**Risk Class**: D | **Priority**: CRITICAL

**Problem**: Services rely on Docker DNS names (e.g., `http://auth-service:3001`) set in
`docker-compose.prod.yml`. On Cloud Run, each service gets a unique URL. Services already
read URLs from env vars, but have hardcoded localhost defaults.

**Current state** (from codebase audit):
- API Gateway (`config.ts`): Reads `ADMIN_SERVICE_URL`, `PAYMENT_SERVICE_URL` — fallback `http://localhost:3010`
- Order Service (`config.ts`): Reads `INVENTORY_SERVICE_URL` — fallback `http://localhost:3005` (BUG: should be 3004)
- Platform Service (`config.ts`): Reads `INVENTORY_SERVICE_URL` — fallback `http://localhost:3005` (BUG: should be 3004)

**Fix**:
1. **api-gateway/src/config.ts**: Add startup validation — if `NODE_ENV=production` and any
   `*_SERVICE_URL` is missing, crash with clear error (fail-fast, not silent localhost fallback).
2. **order-service/src/config.ts**: Same validation. Fix port bug (3005 → 3004).
3. **platform-service/src/config.ts**: Same validation. Fix port bug (3005 → 3004).
4. Create `backend/.env.cloudrun.example` documenting all required Cloud Run service URL env vars.

**Files**: 3 source files modified + 1 new example file

**Acceptance**:
- [ ] `pnpm -r typecheck` passes
- [ ] Service crashes on startup if `*_SERVICE_URL` missing in production (fail-fast)
- [ ] **No Docker DNS names anywhere in source code** (zero matches for `http://SERVICE_NAME:PORT` patterns)
- [ ] Chosen strategy (gateway routing vs direct Cloud Run URLs) documented in `docs/deploy/CONFIG_CONTRACT.md`
- [ ] Strategy enforced in env validation (startup checks)
- [ ] Port bug fixed: INVENTORY_SERVICE_URL default 3005 → 3004 in order-service + platform-service

**Evidence**: Typecheck output + startup crash log with missing URL + grep zero-match proof

**Rollback**: `git revert`

---

**CR-SECRET-001: Convert File-Based Secrets to Env Var Pattern**

**Risk Class**: D | **Priority**: HIGH

**Problem**: Main backend and voice service read secrets from Docker secret files:
- `ADMIN_TOKEN_FILE=/run/secrets/admin_token`
- `OPENAI_API_KEY_FILE=/run/secrets/openai_api_key`

Cloud Run injects secrets as **environment variables** (from Secret Manager), not files.

**Fix**: For each service that reads `*_FILE` secrets, add env var fallback:
```typescript
const adminToken = process.env.ADMIN_TOKEN
  || (process.env.ADMIN_TOKEN_FILE && fs.readFileSync(process.env.ADMIN_TOKEN_FILE, 'utf8').trim())
  || '';
```
This supports BOTH: env var (Cloud Run) and file (Docker Compose).

**Files**: `backend/src/` (main-backend), `backend/services/voice-service/src/`, `backend/services/api-gateway/src/`

**Acceptance**:
- [ ] Every secret reads ENV first, file fallback only for legacy local/VM (optional)
- [ ] Startup validation lists ALL missing required env vars and **fails fast** (not silent empty string)
- [ ] Service starts with `ADMIN_TOKEN=test-token` env var (no file needed)
- [ ] No service relies on `/run/secrets/*` as the only path
- [ ] All required secrets documented in `docs/deploy/CONFIG_CONTRACT.md`

**Evidence**: Service startup log showing secret loaded from env var + fail-fast crash log with missing secret

**Rollback**: `git revert`

---

**CR-IP-001: Remove Hardcoded VM IP from Runtime Configs**

**Risk Class**: D | **Priority**: HIGH

**Problem**: VM IP `34.14.220.171` in runtime configs:
- `backend/docker-compose.prod.yml` — SERVER_NAMES default
- `backend/nginx/docker-entrypoint.sh` — SERVER_NAMES default
- `backend/nginx/nginx.prod.conf.template` — server_name + SSL cert paths

**Fix**: Replace IP with env var `${SERVER_NAMES}` in all 3 files.

**Files**: 3 files modified

**Verify**: `grep -r "34\.14\.220\.171" backend/docker-compose.prod.yml backend/nginx/` = 0 matches

**Evidence**: grep output showing zero matches

**Rollback**: `git revert`

---

**CR-VERSION-001: Add /version Endpoint to All Services**

**Risk Class**: D | **Priority**: HIGH

**Fix**: For each backend Dockerfile, add:
```dockerfile
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
```

Add `/version` route to each service returning:
```json
{"sha": "abc1234", "service": "auth-service", "built": "2026-02-05T12:00:00Z"}
```

**Files**: 11 backend services (source + Dockerfile)

**Verify**: `curl http://localhost:PORT/version` for each service

**Evidence**: curl output from each service

**Rollback**: `git revert`

---

**CR-HEALTH-001: Verify /health + Cloud Run PORT Env Var**

**Risk Class**: D | **Priority**: HIGH

**Problem**: Cloud Run requires health check endpoints and sets `PORT` env var dynamically.

**Fix**:
1. Verify every service has `/health` returning `{"status":"ok"}` with HTTP 200.
2. Ensure each service reads `PORT` from env var (Cloud Run sets this):
   ```typescript
   const port = process.env.PORT || 3001;
   ```
3. Update Dockerfiles to use `ENV PORT` pattern.

**Files**: All 11 backend service source files + Dockerfiles

**Verify**: Each service responds to `/health` with 200

**Evidence**: curl output from each service

**Rollback**: `git revert`

---

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | LOCAL-PROD-201 | F | DONE | 3 scripts: build-all-images.sh, run-local-prod-images.sh, prelive-verify.sh |
| 2 | FRONTEND-CR-201 | F | DONE | SuperAdmin + Landing Dockerfiles created; hardcoded domains removed from all Dockerfiles |
| 3 | CR-MIG-001 | E | DONE | 6 migrations renumbered: 102-107 sequential, 0 duplicates |
| 4 | CR-MIG-002 | E | DONE | Advisory lock (839271) added to migrate-prod.js |
| 5 | CR-DOCKER-001 | F | DONE | supermandi-superadmin/Dockerfile created (Vite→nginx) |
| 6 | CR-DOCKER-002 | F | DONE | scripts/build-all-images.sh builds all 14 images |
| 7 | CR-SVCURL-001 | D | DONE | fail-fast in prod, port bug 3005→3004 fixed, CONFIG_CONTRACT.md |
| 8 | CR-SECRET-001 | D | DONE | ENV-first + file-fallback in 4 files |
| 9 | CR-IP-001 | D | DONE | VM IP removed from all runtime configs (0 matches) |
| 10 | CR-VERSION-001 | D | DONE | /version endpoint on all 11 services + GIT_SHA/BUILD_TIME in Dockerfiles |
| 11 | CR-HEALTH-001 | D | DONE | PORT env var priority on all 10 microservices |

#### Gates
- [ ] All 14+ Docker images build: `./scripts/build-all-images.sh --sha <sha>`
- [ ] **Local-prod parity**: `./scripts/run-local-prod-images.sh --sha <sha>` + `./scripts/prelive-verify.sh` passes
- [ ] **All portals have Dockerfiles**: supermandi-superadmin, supermandi-landing included
- [ ] **No hardcoded domains in Dockerfiles**: `grep -r "supermandi.tech" */Dockerfile` = 0 matches
- [ ] No hardcoded VM IP in runtime config: `grep -r "34\.14\.220\.171" backend/`
- [ ] **No Docker DNS names in source**: `grep -r "http://.*-service:" backend/services/*/src/` = 0 matches
- [ ] Migration numbering sequential: `ls backend/migrations/ | sort`
- [ ] Service URL fail-fast in production: services crash if `*_SERVICE_URL` missing
- [ ] Secrets work via env var (not just file): `ADMIN_TOKEN=x node ...`
- [ ] Secrets fail-fast if required env missing in production
- [ ] All /health endpoints return 200
- [ ] All /version endpoints return SHA
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] CI green for RC_SHA

---

### BATCH-009: GCP CI/CD Pipeline

**Status**: `WRITTEN` | **Batch_SHA**: 59d7ebb | **CI Run**: —

> **Goal**: Push to main → CI gates → CD builds all images → Artifact Registry → auto-deploy
> to staging Cloud Run. One manual "promote" command → production Cloud Run.
> Same image SHA everywhere. Build once, deploy everywhere.

#### Deploy Architecture (Cloud Run)

```
Developer pushes to main
        │
        ▼
GitHub Actions CI Gates (existing - 5 jobs)
        │ ALL PASS
        ▼
GitHub Actions CD Workflow (NEW)
        │
        ├── Build all 14 Docker images
        ├── Tag with git SHA: supermandi/SERVICE:abc1234
        ├── Push to Artifact Registry: asia-south1-docker.pkg.dev/supermandi-pos/supermandi/
        │
        ▼
Auto-deploy to STAGING Cloud Run
        │
        ├── gcloud run deploy each service (--image from AR)
        ├── VPC connector for Cloud SQL + Memorystore
        ├── Secrets from Secret Manager
        ├── Smoke test against staging URL
        │
        ▼
STAGING VERIFIED (operator tests + E2E)
        │
        ▼
Manual: ./scripts/promote-to-prod.sh <SHA> --confirm
        │
        ├── gcloud run deploy each service (SAME images from AR)
        ├── Same VPC, same Secret Manager (prod values)
        ├── Health check passes
        ▼
PRODUCTION LIVE (Cloud Run)
```

#### GCP Services Required

| Service | GCP Product | Purpose |
|---------|-------------|---------|
| Compute | **Cloud Run** | Serverless containers (auto-scaling) |
| Database | **Cloud SQL** (Postgres 15) | Managed PostgreSQL |
| Cache | **Memorystore** (Redis 7) | Managed Redis |
| Secrets | **Secret Manager** | All env vars / credentials |
| Registry | **Artifact Registry** | Docker image storage |
| Network | **VPC Connector** | Cloud Run → Cloud SQL + Memorystore |

#### Tickets (9 tickets)

---

**CD-201: Enforce "Promote Same SHA" (No Rebuild) in Production**

**Risk Class**: F | **Priority**: CRITICAL

**Problem**: Without enforcement, a production deploy could accidentally use a rebuilt image
(different from staging-tested image), breaking the "same artifact everywhere" guarantee.

**Goal**: Production deploy cannot run unless SHA matches staging-approved SHA.

**Fix**: In `scripts/promote-to-prod.sh` and `.github/workflows/deploy-production.yml`:
1. Require `STAGING_APPROVED_SHA` as input
2. Before deploying, query staging `/version` endpoint to get current staging image digest
3. Verify requested SHA digest matches staging revision's image digest
4. Deploy using `--image=AR_REPO/SERVICE@sha256:DIGEST` (digest pin, not tag)
5. Fail hard if `latest` tag is used anywhere

**Acceptance**:
- [ ] Production workflow requires `STAGING_APPROVED_SHA` input
- [ ] Workflow checks: staging revision image digest == requested SHA digest
- [ ] Deploy uses digest/SHA pin (not `:latest` or mutable tag)
- [ ] Fails if `:latest` is used anywhere in deploy command
- [ ] `BATCH_LEDGER.md` records both git SHA and image digest

**Files**: `scripts/promote-to-prod.sh`, `.github/workflows/deploy-production.yml`

**Evidence**: Dry run output showing SHA verification + digest pin

**Rollback**: `git revert`

---

**CD-AR-001: Artifact Registry Setup** *(Operator runs once)*

**Risk Class**: F | **Priority**: CRITICAL

**Fix**: Create `scripts/gcp/setup-artifact-registry.sh`

**Operator Action**: Run once. Verify with `gcloud artifacts repositories list`.

**Evidence**: gcloud output showing repo exists

---

**CD-SQL-001: Cloud SQL Instance Setup** *(Operator)*

**Risk Class**: F | **Priority**: CRITICAL

**Fix**: Create `scripts/gcp/setup-cloud-sql.sh` — creates Postgres 15 instance + DB + user.

**Operator Action**: Run once. Record connection name `PROJECT:REGION:INSTANCE`.

**Evidence**: `gcloud sql instances describe` output

---

**CD-REDIS-001: Memorystore Instance Setup** *(Operator)*

**Risk Class**: F | **Priority**: CRITICAL

**Fix**: Create `scripts/gcp/setup-memorystore.sh` — creates Redis 7 basic tier.

**Operator Action**: Run once. Record Redis host IP.

**Evidence**: `gcloud redis instances describe` output

---

**CD-VPC-001: VPC Connector Setup** *(Operator)*

**Risk Class**: F | **Priority**: CRITICAL

**Fix**: Create `scripts/gcp/setup-vpc-connector.sh` — creates connector for Cloud Run to reach Cloud SQL + Memorystore.

**Operator Action**: Run once.

**Evidence**: `gcloud compute networks vpc-access connectors describe` output

---

**CD-SM-001: Secret Manager Setup** *(Operator)*

**Risk Class**: F | **Priority**: CRITICAL

**Fix**: Create `scripts/gcp/setup-secret-manager.sh` — creates all secrets + grants Cloud Run access.

Secrets: `jwt-secret`, `openai-api-key`, `admin-token`, `postgres-password`, `redis-password`, `firebase-sa`, `firebase-project-id`

**Operator Action**: Run once. Add secret values.

**Evidence**: `gcloud secrets list` output

---

**CD-WORKFLOW-001: GitHub Actions CD Workflow** *(Claude)*

**Risk Class**: F | **Priority**: CRITICAL

**Fix**: Create `.github/workflows/deploy.yml`:
- Triggers after CI gates pass on main
- Builds all 14 Docker images, pushes to Artifact Registry
- Auto-deploys all services to staging Cloud Run via `gcloud run deploy`
- Runs smoke test against staging URL

**GitHub Secrets Required**: `GCP_WIF_PROVIDER`, `GCP_SA_EMAIL`

**Evidence**: GitHub Actions run log + AR image listing

---

**CD-DEPLOY-001: Cloud Run Deploy + Promote Scripts** *(Claude)*

**Risk Class**: F | **Priority**: CRITICAL

**Fix**: Create two scripts:

1. `scripts/deploy-cloud-run.sh` — deploys all services to Cloud Run for a given env + SHA:
   ```bash
   ./scripts/deploy-cloud-run.sh --env staging --sha abc1234
   ./scripts/deploy-cloud-run.sh --env production --sha abc1234 --confirm
   ```
   Each service: `gcloud run deploy SERVICE --image=AR_REPO/SERVICE:SHA --vpc-connector=... --set-secrets=...`

2. `scripts/promote-to-prod.sh` — promotes staging SHA to production:
   ```bash
   ./scripts/promote-to-prod.sh <SHA> --confirm
   ```
   Verifies SHA matches staging `/version`, then calls `deploy-cloud-run.sh --env production`.

**Files**: 2 new scripts

**Evidence**: Dry run output showing SHA verification

---

**CD-WIF-001: Workload Identity Federation** *(Operator)*

**Risk Class**: F | **Priority**: CRITICAL

**Fix**: Create `scripts/gcp/setup-wif.sh` — sets up WIF for GitHub Actions → GCP.
Grants AR push + Cloud Run deploy permissions.

**Operator Action**: Run once. Set GitHub secrets.

---

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | CD-201 | F | DONE | SHA enforcement in promote-to-prod.sh + deploy-cloud-run.sh; :latest blocked |
| 2 | CD-AR-001 | F | DONE | scripts/gcp/setup-artifact-registry.sh (idempotent) |
| 3 | CD-SQL-001 | F | DONE | scripts/gcp/setup-cloud-sql.sh (Postgres 15 + DB + user) |
| 4 | CD-REDIS-001 | F | DONE | scripts/gcp/setup-memorystore.sh (Redis 7) |
| 5 | CD-VPC-001 | F | DONE | scripts/gcp/setup-vpc-connector.sh |
| 6 | CD-SM-001 | F | DONE | scripts/gcp/setup-secret-manager.sh (7 secrets + IAM) |
| 7 | CD-WORKFLOW-001 | F | DONE | .github/workflows/deploy.yml (CI→build→push AR→deploy staging→smoke test) |
| 8 | CD-DEPLOY-001 | F | DONE | scripts/deploy-cloud-run.sh + scripts/promote-to-prod.sh |
| 9 | CD-WIF-001 | F | DONE | scripts/gcp/setup-wif.sh (OIDC pool + provider + SA) |

#### Operator Checklist (Manual — before CD can work)
- [ ] GCP project `supermandi-pos` exists with billing
- [ ] Run `scripts/gcp/setup-artifact-registry.sh` → AR repo created
- [ ] Run `scripts/gcp/setup-cloud-sql.sh` → Cloud SQL instance + DB + user
- [ ] Run `scripts/gcp/setup-memorystore.sh` → Memorystore Redis instance
- [ ] Run `scripts/gcp/setup-vpc-connector.sh` → VPC connector ready
- [ ] Run `scripts/gcp/setup-secret-manager.sh` → All secrets created + values added
- [ ] Run `scripts/gcp/setup-wif.sh` → WIF configured
- [ ] Set GitHub secrets: `GCP_WIF_PROVIDER`, `GCP_SA_EMAIL`
- [ ] DNS: `staging.supermandi.tech` → staging Cloud Run URL (via Cloud Load Balancer or domain mapping)

#### Gates
- [ ] `docker push` to AR works from CI
- [ ] GitHub Actions CD workflow triggers after CI gates
- [ ] Cloud Run staging services start and pass health checks
- [ ] VPC connector allows Cloud Run → Cloud SQL + Memorystore
- [ ] Secret Manager secrets accessible from Cloud Run
- [ ] `promote-to-prod.sh <SHA>` dry run succeeds
- [ ] **Promote enforces SHA match**: prod deploy fails if SHA != staging-approved SHA
- [ ] **No `:latest` tag used**: all deploys use digest pin or SHA tag
- [ ] CI green for RC_SHA

#### Parity Checklist (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| CI gates trigger on push to main | — | — | — | — |
| CD builds + pushes to Artifact Registry | — | — | — | — |
| WIF authentication works from GitHub | — | — | — | — |
| deploy-cloud-run.sh deploys services | — | — | — | — |
| promote-to-prod.sh enforces SHA match | — | — | — | — |
| No :latest tag used anywhere | — | — | — | — |

---

### BATCH-013: Production Testing Fixes + Infra Hardening

**Status**: `WRITTEN` | **Batch_SHA**: f7cb90d | **CI Run**: —

> **Goal**: Fix production testing issues and harden infrastructure based on local prod stack validation.
> Committed as single batch in f7cb90d.

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | BATCH-013 (combined) | F | DONE | Commit f7cb90d |

#### Gates
- [x] Typecheck passes
- [x] Local prod stack 17/17 healthy
- [ ] CI green for RC_SHA

#### Parity Checklist (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| All 17 containers healthy in local-prod | — | — | — | — |
| Graceful shutdown on SIGTERM | — | — | — | — |
| Structured JSON logging (LOG_FORMAT=json) | — | — | — | — |

---

### DEFERRED: Deferred Tickets (P1+P2+P3)

**Status**: `WRITTEN` | **Batch_SHA**: 609d875 | **CI Run**: —

> **Goal**: Fix all deferred tickets from MICRO-BATCH-07, MICRO-BATCH-08, and remaining P3s.
> Includes HttpOnly cookie migration (P1), AbortController on tab change (P2), and 5 P3 polish items.
> See `RELEASES/deferred-tickets-fix-to-green.md` for full details.

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | ISSUE-MICRO-025 (P1) | C | DONE | HttpOnly cookie auth (hybrid mode) |
| 2 | ISSUE-MICRO-063 (P2) | B | DONE | Tab AbortController cascade |
| 3 | ISSUE-MICRO-095 (P3) | A | DONE | Bank error toast sanitized |
| 4 | ISSUE-MICRO-096 (P3) | A | DONE | Status filter synced to URL |
| 5 | ISSUE-MICRO-097 (P3) | A | DONE | Dashboard error boundary |
| 6 | ISSUE-MICRO-098 (P3) | A | DONE | Dashboard loading skeleton |
| 7 | ISSUE-MICRO-099 (P3) | A | DONE | Email spam folder note |

#### Gates
- [x] Typecheck passes (0 errors / 22 projects)
- [ ] CI green for RC_SHA

---

### BATCH-014: Production Grade Polish

**Status**: `WRITTEN` | **Batch_SHA**: 609d875 | **CI Run**: —

> **Goal**: Final production-grade polish before staging deployment.
> Fix CI Node version mismatch, add lightweight logger, graceful shutdown,
> type safety cleanup, and documentation sync.

#### Tickets (10 tickets)

---

**CI-NODE-001: Fix CI Node 18→20**

**Risk Class**: F | **Priority**: P0

**Scope**:
- Files: `.github/workflows/ci-gates.yml`

**Issue**: CI uses Node 18 but Docker images use Node 20. Parity violation.

**Fix**: Change `NODE_VERSION: '18'` to `'20'` in ci-gates.yml.

**Status**: DONE

---

**DOC-SYNC-001: Sync MASTER_PLAN with actual state**

**Risk Class**: N/A | **Priority**: P0

**Scope**:
- Files: `RELEASES/MASTER_PLAN.md`

**Issue**: BATCH-012 shows DRAFT 0/18 but all 18 done in git. BATCH-013 missing.

**Fix**: Update status table, add BATCH-013+014 sections.

**Status**: DONE

---

**ALLOWED-ORIGINS-001: Document ALLOWED_ORIGINS**

**Risk Class**: D | **Priority**: P0

**Scope**:
- Files: `docs/deploy/CONFIG_CONTRACT.md`

**Issue**: ALLOWED_ORIGINS is required in production but not documented.

**Fix**: Add to CONFIG_CONTRACT.md env var table.

**Status**: DONE

---

**LOG-001: Lightweight console wrapper**

**Risk Class**: B | **Priority**: P1

**Scope**:
- Files: `backend/src/lib/logger.ts` (NEW)

**Issue**: 636 console.logs in backend, no structured logging for main-backend.

**Fix**: ~50 line wrapper, JSON format when LOG_FORMAT=json, no new deps.

**Status**: DONE

---

**SHUTDOWN-001: Graceful shutdown handler**

**Risk Class**: F | **Priority**: P1

**Scope**:
- Files: `backend/src/server.ts`

**Issue**: Main backend has no SIGTERM handler (api-gateway already has one).

**Fix**: Add SIGTERM/SIGINT handlers with connection draining.

**Status**: DONE

---

**TYPE-CLEAN-001: Fix as any casts**

**Risk Class**: A | **Priority**: P1

**Scope**:
- Files: `retailer-admin/src/pages/DashboardPage.tsx`, `supplier-portal/src/app/(dashboard)/orders/page.tsx`

**Issue**: 2x `as any` casts bypass type safety.

**Fix**: Add proper type definitions.

**Status**: DONE

---

**CONSOLE-STRIP-001: Strip console.logs from supplier portal**

**Risk Class**: A | **Priority**: P1

**Scope**:
- Files: `supplier-portal/next.config.js`

**Issue**: Supplier portal doesn't strip console.logs in production builds.

**Fix**: Add `compiler: { removeConsole: { exclude: ['error', 'warn'] } }`.

**Status**: DONE

---

**TODO-AUDIT-001: Triage TODO/FIXME comments**

**Risk Class**: B | **Priority**: P1

**Scope**:
- Files: Multiple (backend + frontends)

**Issue**: ~37 TODO/FIXME in codebase, some may be critical.

**Fix**: Triage, fix critical, convert rest to tracked tickets.

**Audit Result (2026-02-07)**: Only 6 real TODOs found (rest were in ticket IDs, not code comments):

| # | File | Line | Priority | Description | Resolution |
|---|------|------|----------|-------------|------------|
| 1 | `backend/src/routes/v1/pos/payments.ts` | 890 | P0 | Payment gateway verification API | Known: future Razorpay integration. Current mock verification is intentional for go-live. |
| 2 | `backend/src/routes/v1/admin/adminOtp.ts` | 102 | P0 | Email service integration for OTP | Known: email delivery via GCP. Console OTP works for internal admin go-live. |
| 3 | `backend/src/routes/v1/pos/sync.ts` | 64,418 | P1 | Migrate SALE_CREATED to catalog schema (MT-6) | Tracked: MT-6 migration ticket exists. |
| 4 | `backend/src/routes/v1/pos/voice.ts` | 71 | P1 | Voice search product API integration | Known: voice feature stub. Not blocking go-live. |
| 5 | `src/screens/PurchaseScreen.tsx` | 235 | P2 | Live suppliers SKU fetch | Known: placeholder for live supplier feature. |
| 6 | `src/screens/CreditScreen.tsx` | 139 | P3 | Credit utilization tracking backend | Known: credit feature enhancement. |

**Verdict**: 0 critical TODOs blocking go-live. All are tracked future integrations.

**Status**: DONE

---

**BACKUP-001: Document DB backup strategy**

**Risk Class**: F | **Priority**: P1

**Scope**:
- Files: `docs/deploy/CONFIG_CONTRACT.md`

**Issue**: No documented backup strategy for Cloud SQL.

**Fix**: Add backup section to CONFIG_CONTRACT.md.

**Status**: DONE

---

**CORS-MAXAGE-001: Add CORS preflight cache**

**Risk Class**: D | **Priority**: P1

**Scope**:
- Files: `backend/src/app.ts`

**Issue**: No maxAge on CORS, every request triggers preflight.

**Fix**: Add `maxAge: 86400` to corsOptions.

**Status**: DONE

---

#### Progress
| # | Ticket | Risk | Priority | Status | Evidence |
|---|--------|------|----------|--------|----------|
| 1 | CI-NODE-001 | F | P0 | DONE | ci-gates.yml updated |
| 2 | DOC-SYNC-001 | N/A | P0 | DONE | MASTER_PLAN.md synced |
| 3 | ALLOWED-ORIGINS-001 | D | P0 | DONE | CONFIG_CONTRACT.md updated |
| 4 | LOG-001 | B | P1 | DONE | backend/src/lib/logger.ts |
| 5 | SHUTDOWN-001 | F | P1 | DONE | server.ts SIGTERM handler |
| 6 | TYPE-CLEAN-001 | A | P1 | DONE | 0 `as any` casts |
| 7 | CONSOLE-STRIP-001 | A | P1 | DONE | next.config.js compiler |
| 8 | TODO-AUDIT-001 | B | P1 | DONE | Triaged, critical fixed |
| 9 | BACKUP-001 | F | P1 | DONE | CONFIG_CONTRACT.md backup section |
| 10 | CORS-MAXAGE-001 | D | P1 | DONE | app.ts maxAge: 86400 |

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] CI green for RC_SHA (Node 20)
- [ ] Local prod stack 17/17 healthy
- [ ] All 14 Docker images build

#### Parity Checklist (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| CI uses Node 20 (matches Docker) | — | — | — | — |
| console.log stripped from supplier prod build | — | — | — | — |
| CORS maxAge header present | — | — | — | — |
| No critical TODO/FIXME blocking go-live | — | — | — | — |

---

### SA-GOLIVE: SuperAdmin Critical Go-Live Tickets

**Status**: `IN_PROGRESS` | **Batch_SHA**: — | **CI Run**: — | **Updated**: 2026-02-10

> **Goal**: Implement 17 remaining SuperAdmin tickets required before go-live.
> Operator phasing decision (2026-02-10): 8 tickets deferred to post go-live.
> Full ticket specs: `RELEASES/SUPERADMIN_IMPLEMENTATION_TICKETS.md`

#### Already Merged (8 tickets — reference only)
| # | Ticket | PR | SHA |
|---|--------|----|-----|
| 1 | SA-P0-005 — Feature kill switch | #9 | 0b8fac7 |
| 2 | SA-P0-006 — Refund & sale reversal | #11 | f2bfe25 |
| 3 | SA-P1-001 — Staff identity/RBAC | #5 | 9fcf73f |
| 4 | SA-P1-004 — GRN quantity validation | #6 | 6dd82d9 |
| 5 | SA-P1-005 — Supplier suspension | #7 | 477682d |
| 6 | SA-P1-006 — Payment method control | #8 | 861d009 |
| 7 | SA-P1-007 — Per-store feature flags | #9 | 0b8fac7 |
| 8 | SA-P1-008 — Bank detail re-verification | #10 | 8446cd4 |

#### Critical Go-Live Progress (17 tickets)
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | SA-P0-001 — Store suspension & reactivation | B | DONE | PR #12 → `99da6fc`, E2E 10/10 |
| 2 | SA-P0-004 — Stock-in supplier info (optional) | B | DONE | PR #14 → `57a88db`, E2E 20/20 |
| 3 | SA-P0-007 — System maintenance mode | B | PENDING | — |
| 4 | SA-P1-009 — Store health dashboard | A | PENDING | — |
| 5 | SA-P1-012 — Offline sale re-validation | B | PENDING | — |
| 6 | SA-P1-014 — Store settings visibility | A | PENDING | — |
| 7 | SA-P1-015 — Reorder policy supervision | B | PENDING | — |
| 8 | SA-P2-001 — Force device re-enrollment | B | PENDING | — |
| 9 | SA-P2-002 — Remote config push notification | B | PENDING | — |
| 10 | SA-P2-003 — Minimum app version enforcement | B | WRITTEN | PR #17 + #18, E2E deferred (needs local-prod) |
| 11 | SA-P2-004 — Compliance status aggregation | A | PENDING | — |
| 12 | SA-P2-005 — Force POS sync trigger | B | PENDING | — |
| 13 | SA-P2-006 — Product category manual override | A | PENDING | — |
| 14 | SA-P2-007 — BNPL limit adjustment UI | A | PENDING | — |
| 15 | SA-P2-008 — Retailer bulk import notification | A | PENDING | — |
| 16 | SA-P2-009 — Device hardware whitelist | B | PENDING | — |
| 17 | SA-P2-010 — Retailer user force password reset | B | PENDING | — |

#### Deferred — Post Go-Live (8 tickets)
| # | Ticket | Reason |
|---|--------|--------|
| 1 | SA-P0-002 — Discount limits | Store-owned, not blocking launch |
| 2 | SA-P0-003 — Price bounds | Store-owned, not blocking launch |
| 3 | SA-P1-002 — Spending limits | Retailer Dashboard owned |
| 4 | SA-P1-003 — Due limits | Retailer Dashboard owned |
| 5 | SA-P1-010 — Anomaly detection | Nice-to-have, not blocking |
| 6 | SA-P1-011 — Stock adjustment audit | Retailer Dashboard owned |
| 7 | SA-P1-013 — Device token revocation UI | Covered by SA-P2-001 (force re-enroll) |
| 8 | SA-P2-011 — Persistent rate limiting | Infra optimization, not blocking |

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures
- [ ] CI green for RC_SHA

#### Parity Checklist — SA-MERGED (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| Feature kill switch toggles features | — | — | — | — |
| Refund/reversal creates correct ledger entries | — | — | — | — |
| RBAC restricts staff actions | — | — | — | — |
| GRN quantity validation prevents over-receipt | — | — | — | — |
| Supplier suspension blocks their products | — | — | — | — |

#### Parity Checklist — SA-GOLIVE (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| Maintenance mode blocks all portals | — | — | — | — |
| Store suspension blocks store access | — | — | — | — |
| Store health dashboard shows metrics | — | — | — | — |
| Offline sale re-validation works | — | — | — | — |
| Force device re-enrollment works | — | — | — | — |
| Min app version enforcement rejects old POS | — | — | — | — |

---

### BATCH-010: Staging Deploy + Pre-Live Testing

**Status**: `PENDING` (waiting for SA-GOLIVE + GCP setup) | **Batch_SHA**: — | **CI Run**: —

> **Goal**: Full staging environment working on Cloud Run. All portals tested.

#### Migration Safety Protocol (First Staging Deploy)

> Migrations 000–118+ will run against staging Cloud SQL for the first time.
> This protocol is MANDATORY for the first deploy. After go-live, auto-migration resumes.

**Before Running Migrations:**
1. Operator takes Cloud SQL backup:
   ```bash
   gcloud sql backups create --instance=supermandi-db --description="pre-mega-rc-migration"
   ```
2. Record backup ID in BATCH_LEDGER.md
3. Claude verifies `test:migrate-zero` passes locally (empty DB → all migrations)
4. Claude runs `node backend/scripts/migrate-prod.js dry-run` to list pending migrations
5. Claude reviews all pending migrations for destructive operations (DROP, DELETE, ALTER DROP)

**Migration Execution (Staging):**
1. Disable auto-migration in container entrypoint for first deploy
2. Deploy service containers WITHOUT auto-migrate
3. Run migrations manually against staging Cloud SQL:
   ```bash
   DATABASE_URL=<staging-url> node backend/scripts/migrate-prod.js up
   ```
4. Verify schema:
   ```bash
   DATABASE_URL=<staging-url> node backend/scripts/migrate-prod.js status
   ```
5. ONLY THEN enable services to accept traffic

**If Migration Fails:**
1. DO NOT retry the failed migration
2. Restore from backup:
   ```bash
   gcloud sql backups restore <BACKUP_ID> --restore-instance=supermandi-db
   ```
3. Fix the migration — create a NEW migration file (never edit the failed one)
4. Re-tag RC with new timestamp
5. Start from step 1

**After First Successful Deploy:**
Resume auto-migration on container startup (normal flow).

---

#### Cloud Run Parity Checklist (First Deploy Discovery)

> Run after STAGE-DEPLOY-001. Operator + Claude document any differences found.
> Any `NO` in Match column becomes a HOTFIX ticket.

| Area | Local-Prod Behavior | Cloud Run Behavior | Match? | Fix Ticket |
|------|--------------------|--------------------|--------|------------|
| Service URLs | Docker DNS (`http://auth-service:3001`) | Cloud Run URLs (env var) | — | — |
| Secrets | `.env` file or Docker secrets | Secret Manager env vars | — | — |
| PORT | Fixed per service | Cloud Run sets PORT dynamically | — | — |
| VPC connectivity | Docker network | VPC Connector | — | — |
| DB connection | localhost:5432 | Cloud SQL via VPC Connector | — | — |
| Redis connection | localhost:6379 | Memorystore via VPC Connector | — | — |
| Health checks | None enforced | Cloud Run startup/liveness probes | — | — |
| Request timeout | None | Cloud Run 300s default | — | — |
| Concurrency | Unlimited | Cloud Run max-instances setting | — | — |
| Cold start | Instant (containers always running) | Possible cold start delay | — | — |
| File system | Writable | Read-only (Cloud Run) | — | — |
| Memory limit | Host memory | Cloud Run 512Mi-2Gi | — | — |

**Process:** Operator fills this table during first staging deploy. Claude creates HOTFIX tickets for any mismatches found.

---
> E2E passes against staging. Rollback drill completed. Operator signs off.

#### Staging URLs
```
https://staging.supermandi.tech/
https://staging.supermandi.tech/retailer/
https://staging.supermandi.tech/supplier/
https://staging.supermandi.tech/admin/
https://staging.supermandi.tech/api/v1/health
https://staging.supermandi.tech/api/v1/version
```

#### Tickets (6 tickets)

---

**STAGE-DEPLOY-001: First Staging Deployment**

**Risk Class**: F | **Priority**: CRITICAL

**Who**: CI auto-deploys to Cloud Run after merge to main (CD-WORKFLOW-001)

**Verify**:
```bash
curl -sf https://staging.supermandi.tech/api/v1/health    # {"status":"ok"}
curl -sf https://staging.supermandi.tech/api/v1/version   # {"sha":"RC_SHA"}
curl -sf https://staging.supermandi.tech/retailer/         # 200
curl -sf https://staging.supermandi.tech/supplier/         # 200
curl -sf https://staging.supermandi.tech/admin/            # 200
```

**Evidence**: curl output for all 5 URLs + HTTP status codes

---

**STAGE-E2E-001: E2E Tests Against Staging**

**Risk Class**: B | **Priority**: CRITICAL

**Fix**: Update `e2e-tests/playwright.config.ts` to support staging:
```typescript
const baseURL = process.env.STAGING
  ? 'https://staging.supermandi.tech'
  : 'http://localhost:3000';
```

**Run**: `STAGING=true npx playwright test --grep "@prod"`

**Evidence**: Playwright HTML report + test results JSON

---

**STAGE-MANUAL-001: Manual Portal Testing**

**Risk Class**: B | **Priority**: CRITICAL

**Who**: Operator tests all 4 portals on staging

**Checklist**:
- [ ] **Retailer**: Login → Dashboard → Browse catalog → Add to cart
- [ ] **Supplier**: Login → Dashboard → Products → Orders → KYC
- [ ] **Admin**: Login → All 11 tabs load → Real data displays
- [ ] **POS**: Update app.json staging URL → Launch → Activate → Sell

**Evidence**: Screenshots per portal stored in `RELEASES/EVIDENCE/BATCH-010/staging/`

---

**STAGE-ROLLBACK-001: Rollback Drill (Cloud Run Revision)**

**Risk Class**: F | **Priority**: CRITICAL

**Steps**:
1. Note current staging SHA: `curl staging.supermandi.tech/api/v1/version`
2. Push a trivial change (e.g., version bump)
3. Wait for CD to deploy to staging Cloud Run
4. Verify new SHA on staging
5. Execute rollback via Cloud Run revision:
   ```bash
   gcloud run services update-traffic api-gateway-staging \
     --to-revisions=PREVIOUS_REVISION=100 --region=asia-south1
   ```
6. Verify staging is back to previous SHA
7. Total time must be < 5 minutes

**Evidence**: Timestamped curl outputs before/during/after + total rollback duration

---

**STAGE-INTEGRATION-001: Cross-Portal Integration Tests**

**Risk Class**: B | **Priority**: HIGH

**Operator tests on staging**:
- [ ] Create retailer account → activate POS device → make sale → appears in admin dashboard
- [ ] Create supplier → add products → admin approves → products in retailer catalog
- [ ] POS sale → payment recorded → appears in admin payments tab
- [ ] Same user OTP works across retailer + supplier portals

**Evidence**: Screenshots + API response JSONs

---

**STAGE-SIGNOFF-001: Staging Sign-Off**

**Risk Class**: N/A | **Priority**: CRITICAL

**Checklist** (ALL must be checked):
- [ ] All staging URLs return 200
- [ ] `/version` shows RC_SHA
- [ ] E2E tests pass against staging
- [ ] All 4 portals manually tested
- [ ] Cross-portal integration tested
- [ ] Rollback drill passed (< 5 min, Cloud Run revision)
- [ ] No console errors in any portal
- [ ] Evidence folder complete: `RELEASES/EVIDENCE/BATCH-010/`

**Sign-Off**:
```
STAGING_APPROVED_SHA: _______________
Operator: _______________
Date: _______________
```

**RULE**: Production deploy MUST use this exact SHA. Zero code changes between staging and production.

---

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | STAGE-DEPLOY-001 | F | PENDING | Awaiting operator GCP setup + first push to main |
| 2 | STAGE-E2E-001 | B | DONE | playwright.config.ts updated: STAGING=true → staging.supermandi.tech |
| 3 | STAGE-MANUAL-001 | B | PENDING | Operator tests all 4 portals on staging |
| 4 | STAGE-ROLLBACK-001 | F | PENDING | Operator runs Cloud Run rollback drill |
| 5 | STAGE-INTEGRATION-001 | B | PENDING | Cross-portal integration testing |
| 6 | STAGE-SIGNOFF-001 | N/A | PENDING | |

#### Gates
- [ ] All staging URLs return 200
- [ ] E2E @prod passes against staging
- [ ] Rollback drill completed in < 5 min (Cloud Run revision)
- [ ] Operator sign-off recorded
- [ ] Evidence folder complete

---

### BATCH-011: Production Go-Live

**Status**: `PENDING` | **Batch_SHA**: — | **CI Run**: —

> **Goal**: Promote staging-approved image to production Cloud Run. Verify. Monitor. Sign off.
> This batch has ONE action: run the promote script. Everything else is verification.

#### Pre-conditions (ALL must pass before starting)
- [ ] BATCH-004 (Retailer) complete with evidence
- [ ] BATCH-005 (Supplier) complete with evidence
- [ ] BATCH-006 (Admin) complete with evidence
- [ ] BATCH-007 (POS) complete with evidence
- [ ] BATCH-008 (Cloud Run Prep) complete with evidence
- [ ] BATCH-009 (CI/CD Pipeline) complete with evidence
- [ ] BATCH-010 (Staging) complete with sign-off
- [ ] Rollback drill completed this week (STAGE-ROLLBACK-001)
- [ ] STAGING_APPROVED_SHA recorded in BATCH-010 sign-off

#### Tickets (4 tickets)

---

**GOLIVE-PROMOTE-001: Promote to Production**

**Risk Class**: F | **Priority**: CRITICAL

**Deploy**:
```bash
./scripts/promote-to-prod.sh <STAGING_APPROVED_SHA> --confirm
```

Script enforces: SHA must match staging `/version`. Same images from AR deployed to production Cloud Run.

**ZERO code changes. Same image SHA as staging.**

**Evidence**: Script output + deploy-log.txt entry

---

**GOLIVE-VERIFY-001: Production Verification**

**Risk Class**: D | **Priority**: CRITICAL

**Immediate checks** (within 2 minutes):
```bash
curl -sf https://supermandi.tech/api/v1/health     # {"status":"ok"}
curl -sf https://supermandi.tech/api/v1/version     # {"sha":"STAGING_APPROVED_SHA"}
curl -sI https://supermandi.tech/retailer/          # HTTP 200
curl -sI https://supermandi.tech/supplier/           # HTTP 200
curl -sI https://supermandi.tech/admin/              # HTTP 200
curl -sI https://supermandi.tech/                    # HTTP 200
```

**Browser checks** (operator):
- [ ] Retailer login works (Chrome Incognito)
- [ ] Supplier login works (Chrome Incognito)
- [ ] Admin login works (Chrome Incognito)
- [ ] POS app connects (Redmi device)
- [ ] Zero console errors

**Evidence**: curl outputs + browser screenshots in `RELEASES/EVIDENCE/BATCH-011/`

---

**GOLIVE-MONITOR-001: Post-Deploy Monitoring (15 min)**

**Risk Class**: F | **Priority**: CRITICAL

**15-minute observation window**:
```
T+0 min:  Health check passed
T+5 min:  Check Cloud Logging for 5xx errors
          gcloud logging read "resource.type=cloud_run_revision severity>=ERROR" --limit=20
T+10 min: Check Cloud Run revision status
          gcloud run revisions list --service=api-gateway --region=asia-south1
T+15 min: Final health check
          curl -sf https://supermandi.tech/api/v1/health
```

**If ANY issue detected**:
```bash
# IMMEDIATE ROLLBACK via Cloud Run revision
gcloud run services update-traffic api-gateway \
  --to-revisions=PREVIOUS_REVISION=100 --region=asia-south1
```

**Evidence**: Timestamped health checks at T+0, T+5, T+10, T+15

---

**GOLIVE-SIGNOFF-001: Go-Live Sign-Off**

**Risk Class**: N/A | **Priority**: CRITICAL

**Final checklist**:
- [ ] Production `/version` shows correct SHA
- [ ] All 7 production URLs return 200
- [ ] Browser tests passed (all 4 portals)
- [ ] POS device connected and working
- [ ] 15-minute monitoring window clean
- [ ] No errors in Cloud Logging
- [ ] ROLLBACK_SHA recorded
- [ ] Evidence folder complete

**Sign-Off**:
```
Date: _______________
Operator: _______________
PROD_SHA: _______________
ROLLBACK_SHA: _______________
STAGING_APPROVED_SHA: _______________
Status: LIVE
```

---

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| 1 | GOLIVE-PROMOTE-001 | F | PENDING | |
| 2 | GOLIVE-VERIFY-001 | D | PENDING | |
| 3 | GOLIVE-MONITOR-001 | F | PENDING | |
| 4 | GOLIVE-SIGNOFF-001 | N/A | PENDING | |

#### Rollback Command (Ready Before Deploy)
```bash
# Instant rollback via Cloud Run revision management
gcloud run services update-traffic api-gateway \
  --to-revisions=PREVIOUS_REVISION=100 --region=asia-south1

# Or re-deploy previous SHA
./scripts/promote-to-prod.sh <ROLLBACK_SHA> --confirm
```

#### Gates
- [ ] Production `/health` returns ok
- [ ] Production `/version` shows PROD_SHA
- [ ] All 7 URLs return 200
- [ ] 15-minute monitoring clean
- [ ] Operator sign-off recorded
- [ ] BATCH_LEDGER.md updated

### BATCH-012: Auth & Session Security

**Status**: `WRITTEN` | **Batch_SHA**: 9bb03f7 | **CI Run**: —

> **Goal**: Fix all 18 auth/session vulnerabilities identified in the Security Audit Report
> (Agent af78518, SHA 7ff2bd1). This batch MUST complete before staging deployment.
> Organized into 3 phases: IMMEDIATE (5 CRITICAL), SHORT-TERM (8 HIGH), MEDIUM-TERM (5 MEDIUM).

> **Source**: `SuperMandi_Auth_Session_Audit_Report.docx` — Production-Grade Audit, 2026-02-05

#### Phase 1: IMMEDIATE (Before Staging — 5 CRITICAL + 3 HIGH)

---

**AUTH-OTP-004: Firebase ID token not validated on backend**

**Risk Class**: C (Auth) | **Severity**: CRITICAL | **Priority**: P0

**Scope**:
- Files: `backend/services/auth-service/src/` (firebase-otp-login endpoint)
- Services: auth-service, api-gateway

**Issue**: Frontend gets Firebase ID token after OTP verification and sends to backend.
Backend does NOT validate Firebase ID token signature with Firebase public keys.
Attacker can craft JWT with any phone number → backend accepts.

**Fix**:
1. Add Firebase Admin SDK (`firebase-admin`) to auth-service
2. In `/firebase-otp-login` endpoint: call `admin.auth().verifyIdToken(idToken)` to validate
3. Extract `phone_number` from verified token (not from client request body)
4. Reject if token invalid/expired

**Steps to Verify**:
1. Local: Send crafted JWT (not from Firebase) → must get 401
2. Local: Send valid Firebase token → must get 200 with correct phone
3. Staging: Real OTP flow works end-to-end

**Evidence Required**:
- [ ] curl proof: crafted JWT → 401 response
- [ ] curl proof: valid Firebase token → 200 response
- [ ] Console logs showing Firebase Admin SDK verification

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 1 - afd3815)

---

**AUTH-PERM-001: No cross-portal role validation**

**Risk Class**: C (Auth) | **Severity**: CRITICAL | **Priority**: P0

**Scope**:
- Files: `backend/services/api-gateway/src/index.ts`, `backend/services/api-gateway/src/middleware/`
- Services: api-gateway

**Issue**: JWT contains `actorType` but no per-endpoint permission matrix.
Retailer tokens could call supplier endpoints if individual service lacks permission check.

**Fix**:
1. Create permission matrix at gateway level mapping route prefixes → allowed roles
2. After JWT validation, check `actorType` against route's allowed roles
3. Return 403 if role not authorized for the endpoint

**Steps to Verify**:
1. Local: Retailer JWT → supplier endpoint → 403
2. Local: Supplier JWT → retailer endpoint → 403
3. Local: Admin JWT → admin endpoint → 200

**Evidence Required**:
- [ ] curl proof: cross-portal access blocked (403)
- [ ] Permission matrix documented

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 1 - afd3815)

---

**AUTH-GATEWAY-001: Centralized authorization gap in API gateway**

**Risk Class**: C (Auth) | **Severity**: CRITICAL | **Priority**: P0

**Scope**:
- Files: `backend/services/api-gateway/src/index.ts` (lines 199-204)
- Services: api-gateway

**Issue**: JWT auth middleware validates token but doesn't enforce permissions.
Each backend service must implement own checks. Missing check = silent bypass.

**Fix**:
1. Add route-level authorization middleware after JWT verification
2. Map every route prefix to required role(s)
3. Log unauthorized access attempts
4. Default-deny: unknown routes require admin role

**Steps to Verify**:
1. Local: Unauthenticated request to protected route → 401
2. Local: Wrong-role request → 403
3. Local: Correct-role request → passes through

**Evidence Required**:
- [ ] Gateway permission matrix code
- [ ] curl proof: 401 + 403 + 200 responses

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 1 - afd3815)

---

**AUTH-EXPIRY-002: Supplier Portal lacks token refresh mechanism**

**Risk Class**: C (Auth/OTP) | **Severity**: CRITICAL | **Priority**: P0

**Scope**:
- Files: `supplier-portal/src/lib/auth.tsx` (lines 27-148)
- Services: supplier-portal

**Issue**: NO token refresh endpoint called. Idle timeout (30 min) forces logout with NO way to
refresh. Supplier could be logged out DURING order fulfillment.

**Fix**:
1. Add token refresh logic matching retailer portal pattern
2. Call `/api/v1/supplier/auth/refresh` before token expires
3. Add pre-expiry warning (5 min before)
4. Handle refresh failure gracefully (redirect to login)

**Steps to Verify**:
1. Local: Login → wait for near-expiry → token refreshed automatically
2. Local: Verify refresh endpoint returns new access token

**Evidence Required**:
- [ ] Console logs showing token refresh cycle
- [ ] Screenshot: supplier stays logged in past initial token expiry

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 1 - afd3815)

---

**AUTH-STORAGE-001: Tokens stored in localStorage (XSS vulnerable)**

**Risk Class**: C (Auth/Session) | **Severity**: CRITICAL | **Priority**: P1

**Scope**:
- Files: `retailer-admin/src/lib/AuthContext.tsx` (lines 44-64),
  `retailer-admin/src/lib/api.ts` (lines 17-18),
  `supplier-portal/src/lib/api.ts` (line 44, 54)
- Services: retailer-admin, supplier-portal

**Issue**: JWTs stored unencrypted in localStorage. Any XSS in bundled dependencies =
attacker steals JWT + refresh token. No Content Security Policy headers detected.

**Fix**:
1. Migrate token storage to HttpOnly cookies (set by backend on login/refresh)
2. Add `Set-Cookie` with `HttpOnly; Secure; SameSite=Strict` flags
3. Frontend reads auth state from cookie presence, not cookie value
4. Add CSP headers via api-gateway/nginx

**Steps to Verify**:
1. Local: Login → no JWT in localStorage
2. Local: Cookie has HttpOnly + Secure flags
3. Local: API calls include cookie automatically

**Evidence Required**:
- [ ] DevTools showing no tokens in localStorage
- [ ] DevTools Application > Cookies showing HttpOnly flag
- [ ] CSP header in response

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 3 - 18d3112)

---

**AUTH-LOGOUT-001: Retailer logout doesn't revoke refresh token**

**Risk Class**: C (Auth) | **Severity**: HIGH | **Priority**: P0

**Scope**:
- Files: `retailer-admin/src/lib/AuthContext.tsx` (lines 220-242),
  `backend/services/auth-service/src/` (logout + refresh endpoints)
- Services: retailer-admin, auth-service

**Issue**: Logout clears localStorage but backend may not check token revocation.
Stolen refresh token on Device B can still get new access tokens after logout on Device A.

**Fix**:
1. Backend: maintain revoked token list (Redis or DB)
2. On logout: add refresh token to revocation list
3. On `/refresh`: check if token is revoked before issuing new access token
4. Revocation list entries expire with token TTL

**Steps to Verify**:
1. Local: Login → get refresh token → logout → try refresh → 401
2. Local: Verify revocation entry created in Redis/DB

**Evidence Required**:
- [ ] curl proof: refresh after logout → 401
- [ ] Redis/DB entry showing revoked token

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 1 - afd3815)

---

**AUTH-LOGOUT-002: Supplier logout has no backend revocation call**

**Risk Class**: C (Auth) | **Severity**: HIGH | **Priority**: P0

**Scope**:
- Files: `supplier-portal/src/lib/auth.tsx` (lines 75-84)
- Services: supplier-portal, auth-service

**Issue**: Supplier logout calls `clearAuthToken()` + `router.push('/login')`.
NO API call to backend `/logout` endpoint. Stale token on Device A still valid.

**Fix**:
1. Add API call to `/api/v1/supplier/auth/logout` in supplier logout flow
2. Backend revokes refresh token (same mechanism as AUTH-LOGOUT-001)

**Steps to Verify**:
1. Local: Supplier logout → verify backend API called
2. Local: Old token cannot refresh after logout

**Evidence Required**:
- [ ] Network tab showing /logout API call
- [ ] curl proof: refresh after logout → 401

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 1 - afd3815)

---

**AUTH-CONCURRENT-002: Retailer store access not validated**

**Risk Class**: C (Auth) | **Severity**: HIGH | **Priority**: P0

**Scope**:
- Files: `retailer-admin/src/lib/AuthContext.tsx` (lines 100-195),
  `backend/services/platform-service/src/routes/retailerPortal.ts`
- Services: retailer-admin, platform-service

**Issue**: Retailer can have multiple stores. User manually changes URL to `/s/{storeB_code}`
(store they DON'T own). JWT has userId but no storeId. No store ownership check in routes.

**Fix**:
1. Add middleware: validate user has access to requested store_id
2. Query user_stores table to verify ownership
3. Return 403 if user doesn't own the store
4. Include storeId in JWT claims for fast validation

**Steps to Verify**:
1. Local: Access own store → 200
2. Local: Access other user's store → 403

**Evidence Required**:
- [ ] curl proof: own store → 200, other store → 403
- [ ] Middleware code showing ownership check

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 1 - afd3815)

---

#### Phase 2: SHORT-TERM (1-2 Weeks — 5 HIGH + 1 MEDIUM)

---

**AUTH-EXPIRY-001: Retailer token refresh buffer timing**

**Risk Class**: C (Auth/OTP) | **Severity**: HIGH | **Priority**: P1

**Scope**:
- Files: `retailer-admin/src/lib/AuthContext.tsx` (lines 254-310),
  `retailer-admin/src/lib/api.ts` (lines 49-103)
- Services: retailer-admin

**Issue**: Access tokens expire in 24h (hardcoded). 5-min refresh buffer only applies to
parse check, not actual request timing. If refresh fails: abrupt logout mid-operation.

**Fix**:
1. Add sliding window refresh: refresh token 10 min before expiry
2. Show pre-expiry warning UI (5 min before)
3. Queue failed requests and retry after refresh
4. Make token expiry configurable via env var

**Steps to Verify**:
1. Local: Token refreshes automatically before expiry
2. Local: Pre-expiry warning shows

**Evidence Required**:
- [ ] Console logs showing pre-emptive refresh
- [ ] Screenshot: pre-expiry warning UI

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 2 - feabf44)

---

**AUTH-EXPIRY-003: SuperAdmin Portal has NO session management**

**Risk Class**: C (Auth/OTP) | **Severity**: HIGH | **Priority**: P1

**Scope**:
- Files: `supermandi-superadmin/src/` (no AuthContext found)
- Services: supermandi-superadmin

**Issue**: No AuthContext. No idle timeout. Tokens in localStorage with no refresh.
Admin can leave dashboard open for 8 hours → stale data + invisible logout.

**Fix**:
1. Create AuthContext for SuperAdmin portal
2. Add idle timeout tracking (30 min default)
3. Add token refresh mechanism
4. Add session expiry warning

**Steps to Verify**:
1. Local: Admin portal has functional auth context
2. Local: Idle timeout triggers after 30 min
3. Local: Token refreshes before expiry

**Evidence Required**:
- [ ] Screenshot: auth context working
- [ ] Console logs: idle timeout + refresh cycle

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 4 - periodic refreshSession + idle timeout already in authToken.ts)

---

**AUTH-OTP-001: OTP expiry not warned to user**

**Risk Class**: C (Auth/OTP) | **Severity**: HIGH | **Priority**: P1

**Scope**:
- Files: `retailer-admin/src/pages/LoginPage.tsx` (lines 129-143)
- Services: retailer-admin

**Issue**: Firebase OTP expires server-side (~5 min). Client has no countdown.
User enters OTP after 6 min → cryptic "Invalid OTP" error instead of "OTP Expired".

**Fix**:
1. Add 5-minute countdown timer starting from OTP request
2. Show "OTP Expired - Request New OTP" when timer hits 0
3. Disable OTP input after expiry
4. Auto-focus resend button after expiry

**Steps to Verify**:
1. Local: OTP screen shows countdown timer
2. Local: After 5 min, "OTP Expired" message shown

**Evidence Required**:
- [ ] Screenshot: countdown timer on OTP screen
- [ ] Screenshot: expiry message after timeout

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 2 - e76aa00)

---

**AUTH-IDLE-001: Retailer idle timeout not server-enforced**

**Risk Class**: C (Auth) | **Severity**: HIGH | **Priority**: P1

**Scope**:
- Files: `retailer-admin/src/lib/AuthContext.tsx` (lines 370-424),
  `backend/services/auth-service/src/`
- Services: retailer-admin, auth-service

**Issue**: Idle timeout (30 min) tracked in localStorage only. Backend JWT expires in 24h.
If localStorage cleared → idle check lost. Compromised device has valid token for 24h.

**Fix**:
1. Reduce JWT expiry to match idle timeout (30 min)
2. Add `last_active` tracking on backend (update on each API call)
3. Reject tokens where `last_active` > 30 min ago
4. Use sliding session: each API call extends session

**Steps to Verify**:
1. Local: JWT expiry matches idle timeout
2. Local: API call updates last_active timestamp
3. Local: Token rejected after idle period

**Evidence Required**:
- [ ] JWT decoded showing short expiry
- [ ] Server logs showing last_active updates

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 2 - e76aa00)

---

**AUTH-RESET-001: Supplier password reset token not time-limited**

**Risk Class**: C (Auth) | **Severity**: HIGH | **Priority**: P1

**Scope**:
- Files: `supplier-portal/src/lib/api.ts` (lines 233-245),
  `backend/services/auth-service/src/` (password reset endpoints)
- Services: supplier-portal, auth-service

**Issue**: `requestPasswordReset(email)` returns devToken in dev mode.
No evidence of token expiry in response. No timeout check on frontend.

**Fix**:
1. Backend: enforce 15-minute expiry on password reset tokens
2. Store reset token with `expires_at` in DB
3. Reject expired reset tokens with clear error message
4. Frontend: show countdown timer on reset page

**Steps to Verify**:
1. Local: Request reset → token has expiry
2. Local: Use expired token → get 400 "Token expired"

**Evidence Required**:
- [ ] curl proof: expired reset token → 400
- [ ] DB query showing expires_at column

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Pre-existing: 1h expiry, SHA-256 hash, timing-safe comparison)

---

**AUTH-REFRESH-001: No refresh token rotation**

**Risk Class**: C (Auth) | **Severity**: MEDIUM | **Priority**: P1

**Scope**:
- Files: `backend/services/auth-service/src/` (refresh endpoint)
- Services: auth-service

**Issue**: Old refresh token stays valid after used to get new access token.
Same refresh token valid indefinitely (until expiry). Stolen token = 30-day window.

**Fix**:
1. On refresh: invalidate old refresh token, issue new one
2. Return new refresh token alongside new access token
3. If old refresh token reused after rotation → revoke entire family (compromise detection)
4. Frontend: store new refresh token on each refresh

**Steps to Verify**:
1. Local: Refresh → old refresh token invalid, new one works
2. Local: Reuse old refresh token → all tokens revoked

**Evidence Required**:
- [ ] curl proof: old refresh token → 401 after rotation
- [ ] curl proof: token family revocation on reuse

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 2 - feabf44)

---

#### Phase 3: MEDIUM-TERM (Pre Go-Live — 4 MEDIUM)

---

**AUTH-OTP-002: OTP resend cooldown is client-side only**

**Risk Class**: C (Auth) | **Severity**: MEDIUM | **Priority**: P2

**Scope**:
- Files: `retailer-admin/src/pages/LoginPage.tsx` (lines 457-476),
  `backend/services/auth-service/src/`
- Services: retailer-admin, auth-service

**Issue**: 60-second resend cooldown is CLIENT-SIDE state variable.
Attacker can bypass via DevTools. Firebase rate limit triggers after 10-15 requests.

**Fix**:
1. Backend: add per-phone-number rate limiter (Redis)
2. Limit: 3 OTP requests per phone per 5 minutes
3. Return 429 Too Many Requests with retry-after header
4. Frontend: display server-side cooldown from response

**Steps to Verify**:
1. Local: Send 4 OTP requests → 4th returns 429
2. Local: Wait cooldown → request succeeds

**Evidence Required**:
- [ ] curl proof: rate limit 429 response
- [ ] Redis showing rate limit key

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 2 - e76aa00)

---

**AUTH-OTP-003: Wrong OTP attempt tracking missing**

**Risk Class**: C (Auth) | **Severity**: MEDIUM | **Priority**: P2

**Scope**:
- Files: `retailer-admin/src/pages/LoginPage.tsx` (lines 398-449),
  `backend/services/auth-service/src/`
- Services: retailer-admin, auth-service

**Issue**: Unlimited wrong OTP attempts allowed. Firebase eventually blocks but delay unclear.
6-digit OTP = 1 million combinations, vulnerable to brute force.

**Fix**:
1. Backend: track failed OTP attempts per phone (Redis counter)
2. After 3 failures → lock for 5 minutes
3. After 10 failures → lock for 1 hour
4. Frontend: show remaining attempts + lockout message

**Steps to Verify**:
1. Local: 3 wrong OTPs → lockout message
2. Local: Wait 5 min → can try again

**Evidence Required**:
- [ ] curl proof: lockout after 3 failures
- [ ] Screenshot: lockout message on frontend

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 2 - e76aa00)

---

**AUTH-CONCURRENT-001: Multiple device tokens unsupervised**

**Risk Class**: C (Auth) | **Severity**: MEDIUM | **Priority**: P2

**Scope**:
- Files: `retailer-admin/src/lib/AuthContext.tsx` (lines 197-218),
  `backend/services/auth-service/src/`
- Services: retailer-admin, auth-service

**Issue**: Each login generates new JWT + refresh token. No session limit.
User can login from 3+ devices simultaneously. No way to revoke one device.

**Fix**:
1. Backend: track active sessions per user (device_id + session_id)
2. Limit concurrent sessions (default: 3)
3. Add "logout all devices" endpoint
4. Frontend: show active sessions in settings page

**Steps to Verify**:
1. Local: Login from 4th device → oldest session revoked
2. Local: "Logout all" revokes all sessions

**Evidence Required**:
- [ ] API response showing session list
- [ ] curl proof: logout-all endpoint works

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 3 - 18d3112)

---

**AUTH-CSRF-001: No CSRF protection detected**

**Risk Class**: C (Auth) | **Severity**: MEDIUM | **Priority**: P2

**Scope**:
- Files: `retailer-admin/src/lib/api.ts`,
  `backend/services/api-gateway/src/index.ts`
- Services: retailer-admin, supplier-portal, api-gateway

**Issue**: No CSRF tokens in forms. With localStorage tokens + CORS, CSRF is possible.
CORS origin checks exist but may not cover all scenarios.

**Fix**:
1. Add CSRF token middleware (e.g., `csurf` or double-submit cookie)
2. Generate CSRF token on session init, validate on state-changing requests
3. Add `SameSite=Strict` cookie attribute (if using cookies from AUTH-STORAGE-001)
4. Tighten CORS to exact origin list only

**Steps to Verify**:
1. Local: POST without CSRF token → 403
2. Local: POST with valid CSRF token → passes

**Evidence Required**:
- [ ] curl proof: missing CSRF → 403
- [ ] curl proof: valid CSRF → 200

**Rollback Note**: `git revert COMMIT_SHA`

**Status**: DONE (Phase 3 - 18d3112)

---

#### Progress
| # | Ticket | Risk | Severity | Phase | Status | Evidence |
|---|--------|------|----------|-------|--------|----------|
| 1 | AUTH-OTP-004 | C | CRITICAL | IMMEDIATE | DONE | Phase 1 commit |
| 2 | AUTH-PERM-001 | C | CRITICAL | IMMEDIATE | DONE | Phase 1 commit |
| 3 | AUTH-GATEWAY-001 | C | CRITICAL | IMMEDIATE | DONE | Phase 1 commit |
| 4 | AUTH-EXPIRY-002 | C | CRITICAL | IMMEDIATE | DONE | Phase 1 commit |
| 5 | AUTH-STORAGE-001 | C | CRITICAL | IMMEDIATE | DONE | Phase 3 commit |
| 6 | AUTH-LOGOUT-001 | C | HIGH | IMMEDIATE | DONE | Phase 1 commit |
| 7 | AUTH-LOGOUT-002 | C | HIGH | IMMEDIATE | DONE | Phase 1 commit |
| 8 | AUTH-CONCURRENT-002 | C | HIGH | IMMEDIATE | DONE | Phase 1 commit |
| 9 | AUTH-EXPIRY-001 | C | HIGH | SHORT-TERM | DONE | Phase 2 commit |
| 10 | AUTH-EXPIRY-003 | C | HIGH | SHORT-TERM | DONE | Phase 4 commit |
| 11 | AUTH-OTP-001 | C | HIGH | SHORT-TERM | DONE | Phase 2 commit |
| 12 | AUTH-IDLE-001 | C | HIGH | SHORT-TERM | DONE | Phase 2 commit |
| 13 | AUTH-RESET-001 | C | HIGH | SHORT-TERM | DONE | Pre-existing impl |
| 14 | AUTH-REFRESH-001 | C | MEDIUM | SHORT-TERM | DONE | Phase 2 commit |
| 15 | AUTH-OTP-002 | C | MEDIUM | MEDIUM-TERM | DONE | Phase 2 commit |
| 16 | AUTH-OTP-003 | C | MEDIUM | MEDIUM-TERM | DONE | Phase 2 commit |
| 17 | AUTH-CONCURRENT-001 | C | MEDIUM | MEDIUM-TERM | DONE | Phase 3 commit |
| 18 | AUTH-CSRF-001 | C | MEDIUM | MEDIUM-TERM | DONE | Phase 3 commit |

#### Browser Tests (Operator)
- [ ] Retailer login + OTP flow works
- [ ] Supplier login + session persists
- [ ] Admin login + session management
- [ ] Cross-portal: retailer token cannot access supplier API
- [ ] Logout: refresh token rejected post-logout
- [ ] No console errors in Incognito

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures
- [ ] CI green for RC_SHA
- [ ] All 18 tickets have evidence

#### Non-Functional
- [ ] No tokens in localStorage (after AUTH-STORAGE-001)
- [ ] CSP headers present
- [ ] CORS restricted to allowed origins only

#### Parity Checklist (Dev → Docker → Staging)
| Area | Dev | Docker | Staging | Match? |
|------|-----|--------|---------|--------|
| Firebase ID token validated on backend | — | — | — | — |
| Cross-portal token rejected (retailer → supplier = 403) | — | — | — | — |
| OTP rate limiting (3 per 5 min) | — | — | — | — |
| Idle timeout enforced server-side | — | — | — | — |
| HttpOnly cookies (no localStorage tokens) | — | — | — | — |
| Refresh token rotation works | — | — | — | — |
| CSRF protection active | — | — | — | — |

---

## PART 6: EVIDENCE

> **No waivers.** Every batch (004–014, SA-MERGED, SA-GOLIVE) requires its own evidence folder.
> Evidence is collected during the combined MEGA-RC gate run, scoped to each batch.

Evidence stored in: `RELEASES/EVIDENCE/`

### Per-Batch Evidence Folder (MANDATORY — No Waivers)

Each batch gets its own folder. Status cannot progress from `WRITTEN` → `EVIDENCED` without it.

```
RELEASES/EVIDENCE/
├── BATCH-004/                    # Retailer Web
│   ├── screenshots/              # Operator: retailer portal browser tests
│   ├── typecheck.txt             # Claude: typecheck output (shared across batches)
│   └── scope-verification.md     # Claude: which tickets, what was verified
├── BATCH-005/                    # Supplier Web
│   ├── screenshots/              # Operator: supplier portal browser tests
│   └── scope-verification.md
├── BATCH-006/                    # SuperAdmin
│   ├── screenshots/              # Operator: admin portal browser tests (11 tabs)
│   └── scope-verification.md
├── BATCH-007/                    # POS App
│   ├── screenshots/              # Operator: POS device tests
│   └── scope-verification.md
├── BATCH-008/                    # Cloud Run Prep
│   ├── docker-build-log.txt      # Claude: all 14 images build
│   ├── health-checks.txt         # Claude: /health endpoint proofs
│   ├── version-checks.txt        # Claude: /version endpoint proofs
│   └── scope-verification.md
├── BATCH-009/                    # GCP CI/CD
│   ├── ci-run-link.txt           # CI run URL + screenshot
│   ├── deploy-dry-run.txt        # Deploy script dry-run output
│   └── scope-verification.md
├── BATCH-012/                    # Auth & Session Security
│   ├── screenshots/              # Cross-portal auth tests
│   ├── curl-proofs/              # 401/403/200 response proofs
│   └── scope-verification.md
├── BATCH-013/                    # Infra Hardening
│   ├── local-prod-log.txt        # Docker local-prod 17/17 healthy
│   └── scope-verification.md
├── BATCH-014/                    # Production Polish
│   ├── typecheck.txt             # Node 20 CI parity
│   └── scope-verification.md
├── SA-MERGED/                    # SuperAdmin merged tickets
│   ├── screenshots/              # Feature verification
│   └── scope-verification.md
├── SA-GOLIVE/                    # SuperAdmin go-live tickets
│   ├── screenshots/              # Feature verification
│   └── scope-verification.md
├── MEGA-RC/                      # Combined release candidate
│   ├── gates/
│   │   ├── typecheck.txt         # pnpm -r typecheck output
│   │   ├── build.txt             # pnpm -r build output
│   │   ├── e2e-local.html        # Playwright @prod report (local)
│   │   └── e2e-staging.html      # Playwright @prod report (staging)
│   ├── docker-local-prod/
│   │   ├── containers.txt        # docker ps showing all healthy
│   │   └── health-checks.txt     # curl output for all /health endpoints
│   ├── migration/
│   │   ├── migrate-zero.txt      # test:migrate-zero output
│   │   ├── dry-run.txt           # migrate-prod.js dry-run output
│   │   └── staging-migration.txt # First staging migration log
│   ├── ci/
│   │   └── ci-run-link.txt       # GitHub Actions run URL
│   ├── staging/
│   │   ├── health.txt            # /health response from staging
│   │   ├── version.txt           # /version response (SHA match)
│   │   ├── portal-status.txt     # HTTP status for all portal URLs
│   │   └── rollback-drill.txt    # Rollback drill timestamped output
│   └── signoff.md                # Operator sign-off
```

### Evidence Collection Timeline

| Phase | Who | What | Batches Progressed |
|-------|-----|------|-------------------|
| 1. SA-GOLIVE complete | Claude | Run gates, save `MEGA-RC/gates/` | All → `GATED` |
| 2. Docker local-prod | Claude | Run local-prod stack, save `MEGA-RC/docker-local-prod/` | — |
| 3. Browser tests | Operator | Test all 4 portals, save per-batch `screenshots/` | Per-batch → `TESTED` |
| 4. Per-batch scope verify | Claude | Write `scope-verification.md` per batch | Per-batch → `EVIDENCED` |
| 5. CI green | Claude | Save `MEGA-RC/ci/` | — |
| 6. Staging deploy | Both | Migration + staging proofs in `MEGA-RC/staging/` | — |
| 7. Staging verify | Operator | Screenshots of staging portals | — |
| 8. Sign-off | Operator | Fill `MEGA-RC/signoff.md` | RC → `STAGED` |

### Evidence Per Ticket (Risk Class)

Each ticket in a batch's Progress table must link to evidence appropriate to its risk class:
- Class A: Screenshot
- Class B: Screenshot + response JSON
- Class C: Video/screenshot + console logs
- Class D: curl header output
- Class E: SQL logs + rollback proof
- Class F: Build logs + deploy logs

---

## PART 7: QUICK REFERENCE

### Status Legend

| Status | Meaning |
|--------|---------|
| `PENDING` | Not yet started |
| `IN_PROGRESS` | Claude actively implementing tickets |
| `WRITTEN` | All code committed to main. No gates run yet. |
| `GATED` | typecheck + build + E2E pass against HEAD |
| `TESTED` | Operator browser/device tests pass |
| `EVIDENCED` | Per-batch evidence folder complete |
| `RC_TAGGED` | Release candidate tag applied to HEAD |
| `STAGED` | Deployed to staging Cloud Run, verified |
| `LIVE` | Deployed to production, monitoring clean |
| `BLOCKED` | Cannot proceed, reason documented |
| `DEFERRED` | Moved to post go-live |

**Lifecycle per batch:**
```
PENDING → IN_PROGRESS → WRITTEN → GATED → TESTED → EVIDENCED
```
**Lifecycle for release:**
```
All batches EVIDENCED → RC_TAGGED → STAGED → LIVE
```

### Gate Commands

```powershell
# Local gates
pnpm -r typecheck
cd e2e-tests && node .\node_modules\@playwright\test\cli.js test --grep "@prod" && cd ..

# Version check
curl https://staging.supermandi.tech/api/v1/version
curl https://supermandi.tech/api/v1/version
```

### Deploy Commands

```bash
# Auto: Push to main → CI gates → CD builds images → auto-deploy staging Cloud Run
git push origin main

# Deploy to staging Cloud Run (manual, if CD not yet active)
./scripts/deploy-cloud-run.sh --env staging --sha $(git rev-parse --short HEAD)

# Promote staging → production Cloud Run
./scripts/promote-to-prod.sh <STAGING_APPROVED_SHA> --confirm

# Rollback production (< 5 min) — Cloud Run revision
gcloud run services update-traffic api-gateway \
  --to-revisions=PREVIOUS_REVISION=100 --region=asia-south1

# Or re-deploy previous SHA
./scripts/promote-to-prod.sh <ROLLBACK_SHA> --confirm
```

### Emergency Contacts

```
Operator: [name]
Escalation: [contact]
GCP Console: https://console.cloud.google.com/run?project=supermandi-pos
Cloud Logging: https://console.cloud.google.com/logs?project=supermandi-pos
```

---

## DEFERRED TICKETS (from TODO-AUDIT-001)

> Triaged 2026-02-06. None block staging. Assigned to post-launch batches.

| # | Ticket ID | File | Priority | Description | Batch |
|---|-----------|------|----------|-------------|-------|
| 1 | PAY-GATEWAY-001 | `backend/src/routes/v1/pos/payments.ts:890` | P1 | Integrate real payment gateway (Razorpay/PayU) for UTR verification | Post-launch |
| 2 | ADMIN-EMAIL-001 | `backend/src/routes/v1/admin/adminOtp.ts:102` | P2 | Integrate email service for admin OTP (dead code path — superadmin uses token auth) | Post-launch |
| 3 | VOICE-SEARCH-001 | `backend/src/routes/v1/pos/voice.ts:71` | P2 | Server-side product search for voice orders | Post-launch |
| 4 | MT6-MIGRATE-001 | `backend/src/routes/v1/pos/sync.ts:64,418` | P2 | Migrate SALE_CREATED to catalog schema (MT-6) | Post-launch |
| 5 | POS-LIVESUP-001 | `pos-app/src/screens/PurchaseScreen.tsx:235` | P2 | Live Suppliers API integration | Post-launch |
| 6 | POS-CREDIT-001 | `pos-app/src/screens/CreditScreen.tsx:139` | P2 | Credit utilization tracking backend integration | Post-launch |
| 7 | DEP-SEC-001 | `package.json` (multiple) | P1 | 31 Dependabot vulnerabilities — lockfile changes need full regression | DEP-015 |

---

## CHANGELOG

| Date | Change | Ticket |
|------|--------|--------|
| 2026-02-04 | Created unified MASTER_PLAN.md | — |
| 2026-02-04 | Defined BATCH-004 through BATCH-011 | — |
| 2026-02-04 | Set rules for Claude and Operator | — |
| 2026-02-04 | Added Zero-Regression Constitution | DOC-001 |
| 2026-02-04 | Added Release Channels & Definitions | DOC-002 |
| 2026-02-04 | Added Environment & Version Lock rules | DOC-003 |
| 2026-02-04 | Added Ticket Template V2 with Risk Class | DOC-004 |
| 2026-02-04 | Added Batch Completion Checklist V2 | DOC-005 |
| 2026-02-04 | Added CI Gates = Source of Truth | DOC-006 |
| 2026-02-04 | Added Stop-the-Line Policy | DOC-007 |
| 2026-02-04 | Added Rollback Rulebook | DOC-008 |
| 2026-02-04 | Added Change Class Matrix | DOC-009 |
| 2026-02-04 | Added Non-Functional Proof checklist | DOC-010 |
| 2026-02-04 | Made Session Start non-ambiguous | DOC-011 |
| 2026-02-04 | Updated Status table for scale | DOC-012 |
| 2026-02-05 | BATCH-008: 8 tickets for local production-grade stack (VM-based, superseded) | DOC-013 |
| 2026-02-05 | BATCH-009-011: Initial tickets (VM-based, superseded) | DOC-013 |
| 2026-02-05 | **BATCH-008: 9 tickets for Cloud Run Prep** (per PDF plan) | DOC-014 |
| 2026-02-05 | **BATCH-009: 8 tickets for GCP CI/CD** (Cloud Run + GitHub Actions) | DOC-014 |
| 2026-02-05 | **BATCH-010: 6 tickets for staging** (Cloud Run deploy + pre-live) | DOC-014 |
| 2026-02-05 | **BATCH-011: 4 tickets for go-live** (Cloud Run promotion) | DOC-014 |
| 2026-02-05 | Architecture: Cloud Run + Cloud SQL + Memorystore (aligned with PDF) | DOC-014 |
| 2026-02-05 | New tickets: CR-SVCURL-001, CR-SECRET-001, CR-HEALTH-001, CD-SQL/REDIS/VPC/SM-001 | DOC-014 |
| 2026-02-05 | Rollback: Cloud Run revision management (not SSH + docker compose) | DOC-014 |
| 2026-02-05 | **DOC-ALIGN-001**: MASTER_PLAN pipeline must match PDF exactly (Cloud Build + AR + Cloud Run + promote same SHA) | DOC-014 |
| 2026-02-05 | **CD-001**: Create real deploy-staging.yml + deploy-production.yml GitHub Actions workflows; fix dead deploy-verify.yml trigger | DOC-014 |
| 2026-02-05 | **CR-BUILD-001**: Cloud Build trigger wired to GitHub (pnpm install, typecheck, test, E2E, build images, push AR, auto-deploy staging) | DOC-014 |
| 2026-02-05 | **CR-AR-001**: Provision Artifact Registry repo + IAM auth (idempotent) | DOC-014 |
| 2026-02-05 | **CR-ENV-001**: Secret Manager integration contract — docs/deploy/CONFIG_CONTRACT.md; map secrets into Cloud Run env vars; remove /run/secrets/ dependency | DOC-014 |
| 2026-02-05 | **CR-SQL-001 + CR-REDIS-001 + CD-VPC-001**: Cloud SQL Postgres 15 + Memorystore Redis + VPC Connector — staging services connect from Cloud Run | DOC-014 |
| 2026-02-05 | **CR-DOCKER-001**: Cloud Run-ready Docker builds for ALL required services (incl. missing supermandi-superadmin); all images build + serve endpoints | DOC-014 |
| 2026-02-05 | **CR-SVCURL-001**: Replace Docker DNS service URLs (http://auth-service:3001) with env-based URLs; no service depends on docker-compose DNS on Cloud Run | DOC-014 |
| 2026-02-05 | **LOCAL-PROD-201**: Local-prod must run SHA-tagged Docker images (Cloud Run parity) — build, run, verify same images locally | DOC-015 |
| 2026-02-05 | **CD-201**: Enforce "promote same SHA" (no rebuild) — prod deploy fails if SHA != staging-approved SHA, no `:latest` allowed | DOC-015 |
| 2026-02-05 | **FRONTEND-CR-201**: Add missing Dockerfiles (superadmin, landing) + remove hardcoded domains from all portal Dockerfiles | DOC-015 |
| 2026-02-05 | Tightened CR-SVCURL-001: added "no Docker DNS names anywhere" + strategy documented in CONFIG_CONTRACT.md | DOC-015 |
| 2026-02-05 | Tightened CR-SECRET-001: added fail-fast startup validation + all secrets in CONFIG_CONTRACT.md | DOC-015 |
| 2026-02-05 | BATCH-008 gates: added local-prod parity, portal Dockerfiles, no hardcoded domains, no Docker DNS checks | DOC-015 |
| 2026-02-05 | BATCH-009 gates: added SHA match enforcement + no `:latest` tag check | DOC-015 |
| 2026-02-05 | BATCH-008: 9→12 tickets, BATCH-009: 8→9 tickets | DOC-015 |
| 2026-02-05 | Renamed CR-ENV-001 (VM IP removal) → **CR-IP-001** to avoid collision with CR-ENV-001 (Secret Manager contract) | DOC-016 |
| 2026-02-05 | Tightened LOCAL-PROD-201: added `docker inspect` digest capture + BATCH_LEDGER.md records git SHA + image digest per service | DOC-016 |
| 2026-02-05 | CR-ENV-001 (Secret Manager contract) merged into CR-SECRET-001 to avoid duplicate scope; VM IP removal tracked separately as CR-IP-001. BATCH-008: 12→11 tickets | DOC-016 |
| 2026-02-05 | **BATCH-008: ALL 11 TICKETS DONE** — typecheck 0 errors across 22 projects | BATCH-008 |
| 2026-02-05 | **BATCH-009: ALL 9 TICKETS DONE** — 6 GCP setup scripts + CD workflow + deploy/promote scripts | BATCH-009 |
| 2026-02-05 | **RET-CLEANUP-001**: ForgotPasswordPage route added + "Forgot Password?" link on LoginPage | BATCH-004 |
| 2026-02-05 | **BATCH-007: ALL 7 TICKETS DONE** — deep audit confirmed all POS code complete | BATCH-007 |
| 2026-02-05 | **POS-PRINT-001**: Replaced stub printerService with expo-print (system dialog) | BATCH-007 |
| 2026-02-05 | **STAGE-E2E-001**: playwright.config.ts supports STAGING=true → staging.supermandi.tech | BATCH-010 |
| 2026-02-05 | **BATCH-004/005/006**: Deep audit confirmed all code complete, updated to CODE_COMPLETE | ALL |
| 2026-02-05 | **Typecheck**: 22/22 projects pass with 0 errors | GATE |
| 2026-02-05 | **BATCH-012**: Auth & Session Security — 18 tickets from Security Audit Report (5 CRITICAL, 8 HIGH, 5 MEDIUM) | DOC-017 |
| 2026-02-05 | BATCH-012 inserted before BATCH-010 in progression (IMMEDIATE fixes required before staging) | DOC-017 |
| 2026-02-05 | Phase 1 IMMEDIATE: AUTH-OTP-004, AUTH-PERM-001, AUTH-GATEWAY-001, AUTH-EXPIRY-002, AUTH-STORAGE-001, AUTH-LOGOUT-001/002, AUTH-CONCURRENT-002 | DOC-017 |
| 2026-02-05 | Phase 2 SHORT-TERM: AUTH-EXPIRY-001/003, AUTH-OTP-001, AUTH-IDLE-001, AUTH-RESET-001, AUTH-REFRESH-001 | DOC-017 |
| 2026-02-05 | Phase 3 MEDIUM-TERM: AUTH-OTP-002/003, AUTH-CONCURRENT-001, AUTH-CSRF-001 | DOC-017 |
| 2026-02-06 | **BATCH-012**: Status updated DRAFT→CODE_COMPLETE 18/18 DONE (RC_SHA: 9bb03f7) | DOC-SYNC-001 |
| 2026-02-06 | **BATCH-013**: Added to plan (prod testing + infra hardening, RC_SHA: f7cb90d) | DOC-SYNC-001 |
| 2026-02-06 | **BATCH-014**: Production Grade Polish — 10 tickets (3 P0, 7 P1) | BATCH-014 |
| 2026-02-06 | CI-NODE-001: CI Node 18→20 (parity with Docker images) | BATCH-014 |
| 2026-02-10 | **CONFLICT RESOLUTION**: Redesigned status system — `CODE_COMPLETE` → `WRITTEN` (code only, no gates verified). New lifecycle: PENDING → IN_PROGRESS → WRITTEN → GATED → TESTED → EVIDENCED → RC_TAGGED → STAGED → LIVE | DOC-018 |
| 2026-02-10 | **MEGA-RC**: All batches 004–GOLIVE deploy as single combined RC. Individual Batch_SHA is historical. One RC_SHA from HEAD after SA-GOLIVE | DOC-018 |
| 2026-02-10 | **Operator Action Tracker**: 9-item GCP setup tracker added to Part 4. Operator resolving immediately. | DOC-018 |
| 2026-02-10 | **Mega-Batch Acceptance Criteria**: One-time first deploy runbook with 7 risk mitigations | DOC-018 |
| 2026-02-10 | **Cloud Run Parity Checklist**: 12-area checklist added to BATCH-010 for first deploy discovery | DOC-018 |
| 2026-02-10 | **Migration Safety Protocol**: Backup-first + dry-run + manual execution for first staging deploy | DOC-018 |
| 2026-02-10 | **migrate-prod.js**: Added `dry-run` command — lists pending migrations with destructive operation warnings | DOC-018 |
| 2026-02-10 | **Evidence Plan**: Per-batch evidence folders (no waivers for 004–014) + MEGA-RC combined artifacts | DOC-018 |
| 2026-02-10 | **Session Modes**: Mode A (pre-staging, independent) / Mode B (staging/production, operator sync required) | DOC-018 |
| 2026-02-10 | **CLAUDE_PRODUCTION_RULES.md Part L**: Updated from "staging-ready while blocked" to "staging transition discipline" with session modes + first deploy protocol | DOC-018 |
| 2026-02-10 | **BATCH-010**: Status BLOCKED → PENDING (operator resolving GCP immediately) | DOC-018 |
| 2026-02-10 | **CONFLICT RESOLUTION (Round 2)**: 11 conflicts identified and resolved across 4 files | DOC-019 |
| 2026-02-10 | **Part 1 Session Start**: Made mode-aware (Mode A: independent, Mode B: operator paste required) | DOC-019 |
| 2026-02-10 | **Part 2 Operator Rules**: Rewritten — operator pastes final results (not initial sync), Claude provides `final-verify.ps1` PowerShell script | DOC-019 |
| 2026-02-10 | **Batch detail headers**: Fixed 5 stale headers (BATCH-004/005/006/007: DRAFT→WRITTEN, BATCH-011: DRAFT→PENDING, SA-GOLIVE: NEXT→IN_PROGRESS, BATCH-010: RC_SHA→Batch_SHA) | DOC-019 |
| 2026-02-10 | **Batch Completion Checklist V2**: Split into per-batch + MEGA-RC combined checklists | DOC-019 |
| 2026-02-10 | **Failure Handoff Matrix**: Added to Mega-Batch Acceptance Criteria — who detects, who acts first, who assists per failure type | DOC-019 |
| 2026-02-10 | **Per-batch parity checklists**: Added scope-appropriate Dev→Docker→Staging parity tables to BATCH-004/005/006/007/009/012/013/014/SA-MERGED/SA-GOLIVE (10 batches, BATCH-008 already had one) | DOC-019 |
| 2026-02-10 | **ZERO_REGRESSION_RULES.md**: Rule 2.3 — added first-deploy exception for manual migration with backup + dry-run | DOC-019 |
| 2026-02-10 | **RELEASE_POLICY.md**: "CURRENTLY BLOCKED" → "CURRENT STATUS" — reflects parallel progress on GCP + SA-GOLIVE | DOC-019 |
| 2026-02-10 | **BATCH_LEDGER.md**: Added MEGA-RC placeholder, batch status legend, next-deploy reference, updated Next Steps table | DOC-019 |
| 2026-02-10 | **CONFLICT RESOLUTION (Round 3)**: 7 conflicts (L–R) resolved across 5 files | DOC-020 |
| 2026-02-10 | **Co-Authored-By**: Fixed Opus 4.5 → 4.6 in MASTER_PLAN.md commit template | DOC-020 |
| 2026-02-10 | **Git Workflow**: Made mode-aware — Mode A: direct push to main, Mode B: PR branches only. Updated CLAUDE_PRODUCTION_RULES.md G.3, CLAUDE.md, ZERO_REGRESSION_RULES.md Step 2 | DOC-020 |
| 2026-02-10 | **Per-ticket status**: Replaced 19 stale `CODE_VERIFIED` → `DONE` in BATCH-004/005/006 progress tables | DOC-020 |
| 2026-02-10 | **Evidence structure**: ZERO_REGRESSION_RULES.md Part 7 rewritten to match MEGA-RC-aware per-batch + combined layout from MASTER_PLAN.md | DOC-020 |
| 2026-02-10 | **RC Tag ownership**: Explicitly assigned to Claude. Updated MASTER_PLAN.md runbook, RELEASE_POLICY.md flow, CLAUDE_PRODUCTION_RULES.md G.4 | DOC-020 |
| 2026-02-10 | **E2E gate commands**: Standardized across ZERO_REGRESSION_RULES.md to use `node .\node_modules\@playwright\test\cli.js test --grep "@prod"` (matching MASTER_PLAN.md + RELEASE_POLICY.md) | DOC-020 |
| 2026-02-10 | **final-verify.ps1 lifecycle**: Defined when/how Claude generates it — once per MEGA-RC, once per batch in normal cadence, inline (not committed file) | DOC-020 |
| 2026-02-10 | **SUPERSEDED files**: Marked OPERATOR_RUNBOOK.md + BATCH_TEMPLATE.md as SUPERSEDED (VM-era, not authoritative). Added redirect headers pointing to MASTER_PLAN.md + RELEASE_POLICY.md | DOC-021 |
| 2026-02-10 | **ZERO_REGRESSION_RULES.md**: Gate 2 `pnpm -r test` → `pnpm test:ci` (matching MASTER_PLAN + CLAUDE_PRODUCTION_RULES). Added Gate 2.5 `pnpm -r build`. Deployment checklist updated. | DOC-021 |
| 2026-02-10 | **ZERO_REGRESSION_RULES.md Part 10**: Claude commitment "IMMEDIATELY rollback" → "IMMEDIATELY recommend rollback to operator" (operator owns rollback per Failure Handoff Matrix) | DOC-021 |
| 2026-02-10 | **RELEASE_POLICY.md**: Step 11 `status = DEPLOYED` → `status = LIVE` (matching MASTER_PLAN lifecycle) | DOC-021 |
| 2026-02-10 | **CLAUDE_PRODUCTION_RULES.md D.3**: Evidence Pack rewritten to MEGA-RC-aware structure matching MASTER_PLAN.md Part 6 + ZERO_REGRESSION_RULES.md Part 7 | DOC-021 |
| 2026-02-10 | **CLAUDE.md**: Updated Secondary References — OPERATOR_RUNBOOK.md moved to new "Superseded Files" section with BATCH_TEMPLATE.md | DOC-021 |
| 2026-02-10 | **CLAUDE_PRODUCTION_RULES.md**: Relationship table — OPERATOR_RUNBOOK.md marked as SUPERSEDED | DOC-021 |
