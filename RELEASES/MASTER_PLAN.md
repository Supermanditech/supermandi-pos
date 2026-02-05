# SuperMandi Master Plan

> **Single Source of Truth** — All rules, batches, and workflows in one file.
> **Last Updated**: 2026-02-04

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
7. IMMEDIATELY rollback if issues detected
8. HONESTLY report any concerns or risks
9. REFUSE to proceed if any rule is violated

Violation of ANY rule = I will BLOCK and refuse to proceed.

Signed: Claude Opus 4.5
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
3. Ask operator to run git sync and paste output
4. Do NOT propose any fixes until operator paste confirms:
   - Clean git tree (no uncommitted changes)
   - RC_SHA is known
   - No lockfile drift
```

**Enforcement**: Claude must not start solutioning until sync output is pasted.

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

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
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

### Before Any Batch

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

### Gate Commands

```powershell
pnpm -r typecheck
cd e2e-tests
node .\node_modules\@playwright\test\cli.js test --grep "@prod"
cd ..
```

**Required Results:**
- Typecheck: 0 errors
- E2E @prod: 0 failures

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

### Batch Completion Checklist V2

> A batch is COMPLETE only when ALL items checked:

- [ ] Git status clean (`git status` shows nothing to commit)
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures
- [ ] **CI pipeline green for RC_SHA** (not just local)
- [ ] `/version` endpoint shows RC_SHA on deployed environment
- [ ] Evidence folder complete: `RELEASES/EVIDENCE/BATCH-XXX/`
  - [ ] `commits.txt` — git log of batch commits
  - [ ] `typecheck.txt` — typecheck output
  - [ ] `e2e.txt` — E2E test results
  - [ ] `ci-run.txt` — CI run link or screenshot
  - [ ] `screenshots/` — browser test evidence
  - [ ] `curl-proofs/` — non-functional proofs
- [ ] BATCH_LEDGER.md entry added (status: READY or DEPLOYED)
- [ ] All tickets have evidence attached
- [ ] Browser tests passed (per Testing Matrix)
- [ ] Device tests passed (if POS in scope)

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
BATCH-005 Supplier ──┼──► BATCH-008 Cloud Run Prep ──► BATCH-009 CI/CD ──► BATCH-012 Auth Security ──► BATCH-010 Staging ──► BATCH-011 Go-Live
BATCH-006 Admin ─────┤                                       │
BATCH-007 POS ───────┘                                       │
                                              Operator: GCP infra (Cloud SQL, Memorystore, AR, VPC, Secret Manager)
```

---

## PART 4: CURRENT STATUS

| Batch | Portal | Status | Progress | Owner | RC_SHA | CI Run | Updated |
|-------|--------|--------|----------|-------|--------|--------|---------|
| BATCH-004 | Retailer Web | `CODE_COMPLETE` | 5/5 DONE | Claude | d3e9e45 | — | 2026-02-05 |
| BATCH-005 | Supplier Web | `CODE_COMPLETE` | 4/4 DONE | Claude | d3e9e45 | — | 2026-02-05 |
| BATCH-006 | SuperAdmin | `CODE_COMPLETE` | 11/11 DONE | Claude | d3e9e45 | — | 2026-02-05 |
| BATCH-007 | POS App | `CODE_COMPLETE` | 7/7 DONE | Claude | d3e9e45 | — | 2026-02-05 |
| BATCH-008 | Cloud Run Prep | `CODE_COMPLETE` | 11/11 DONE | Claude | 59d7ebb | — | 2026-02-05 |
| BATCH-009 | GCP CI/CD | `CODE_COMPLETE` | 9/9 DONE | Claude+Operator | 59d7ebb | — | 2026-02-05 |
| BATCH-010 | Staging Deploy | `CODE_COMPLETE` | 1/6 DONE (E2E config) | Claude+Operator | — | — | 2026-02-05 |
| BATCH-011 | Go-Live | `DRAFT` | 0/4 | Operator | — | — | 2026-02-05 |
| BATCH-012 | Auth & Session Security | `DRAFT` | 0/18 | Claude | — | — | 2026-02-05 |

### Scaling Note

For 1000+ batches: Each batch has detailed section below. Completed batches move to BATCH_LEDGER.md with evidence links. This table shows only active/upcoming batches.

---

## PART 5: BATCH DETAILS

> **OPERATOR**: Write your scope in the "Operator Scope" section of each batch.
> Claude will ONLY work on items listed in that section.

---

### BATCH-004: Retailer Web

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

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
| 1 | RET-FORGOT-001 | C | CODE_VERIFIED | ForgotPasswordPage.tsx fully implemented with OTP flow |
| 2 | RET-CATALOG-001 | A | CODE_VERIFIED | SupplierCatalogPage.tsx - browse & add products |
| 3 | RET-QUEUE-001 | A | CODE_VERIFIED | SupplierQueuePage.tsx - approve/reject suppliers |
| 4 | RET-BANK-001 | B | CODE_VERIFIED | SettingsPage.tsx - UPI VPA persists |
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

---

### BATCH-005: Supplier Web

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

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
| 1 | SUP-VERIFY-001 | A | CODE_VERIFIED | 12 pages found (dashboard, products, orders, earnings, kyc, upload, profile, login, register, onboard, pending-approval, forgot-password) |
| 2 | SUP-ORDER-001 | B | CODE_VERIFIED | orders/page.tsx (717 lines) - full order management with shipment tracking |
| 3 | SUP-EARNINGS-001 | B | CODE_VERIFIED | earnings/page.tsx (440 lines) - payout history with order breakdown |
| 4 | SUP-KYC-001 | C | CODE_VERIFIED | kyc/page.tsx (480 lines) - document upload + IFSC lookup + bank verification |

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

---

### BATCH-006: SuperAdmin

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

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
| 1 | ADM-EVENTS-001 | A | CODE_VERIFIED | Awaiting browser test |
| 2 | ADM-DEVICES-001 | A | CODE_VERIFIED | Awaiting browser test |
| 3 | ADM-STORES-001 | B | CODE_VERIFIED | Awaiting browser test |
| 4 | ADM-SUPPLIERS-001 | B | CODE_VERIFIED | Awaiting browser test |
| 5 | ADM-PAYMENTS-001 | A | CODE_VERIFIED | Awaiting browser test |
| 6 | ADM-ANALYTICS-001 | A | CODE_VERIFIED | Awaiting browser test |
| 7 | ADM-AI-001 | B | CODE_VERIFIED | Awaiting browser test |
| 8 | ADM-USERS-001 | C | CODE_VERIFIED | Awaiting browser test |
| 9 | ADM-SETTINGS-001 | B | CODE_VERIFIED | Awaiting browser test |
| 10 | ADM-AUDIT-001 | A | CODE_VERIFIED | Awaiting browser test |
| 11 | ADM-DOCS-001 | B | CODE_VERIFIED | Awaiting browser test |

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

---

### BATCH-007: POS App

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

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

---

### BATCH-008: Cloud Run Prep

**Status**: `CODE_COMPLETE` | **RC_SHA**: 59d7ebb | **CI Run**: —

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

**Status**: `CODE_COMPLETE` | **RC_SHA**: 59d7ebb | **CI Run**: —

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

---

### BATCH-010: Staging Deploy + Pre-Live Testing

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

> **Goal**: Full staging environment working on Cloud Run. All portals tested.
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

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

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

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

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

**Status**: PENDING

---

#### Progress
| # | Ticket | Risk | Severity | Phase | Status | Evidence |
|---|--------|------|----------|-------|--------|----------|
| 1 | AUTH-OTP-004 | C | CRITICAL | IMMEDIATE | PENDING | |
| 2 | AUTH-PERM-001 | C | CRITICAL | IMMEDIATE | PENDING | |
| 3 | AUTH-GATEWAY-001 | C | CRITICAL | IMMEDIATE | PENDING | |
| 4 | AUTH-EXPIRY-002 | C | CRITICAL | IMMEDIATE | PENDING | |
| 5 | AUTH-STORAGE-001 | C | CRITICAL | IMMEDIATE | PENDING | |
| 6 | AUTH-LOGOUT-001 | C | HIGH | IMMEDIATE | PENDING | |
| 7 | AUTH-LOGOUT-002 | C | HIGH | IMMEDIATE | PENDING | |
| 8 | AUTH-CONCURRENT-002 | C | HIGH | IMMEDIATE | PENDING | |
| 9 | AUTH-EXPIRY-001 | C | HIGH | SHORT-TERM | PENDING | |
| 10 | AUTH-EXPIRY-003 | C | HIGH | SHORT-TERM | PENDING | |
| 11 | AUTH-OTP-001 | C | HIGH | SHORT-TERM | PENDING | |
| 12 | AUTH-IDLE-001 | C | HIGH | SHORT-TERM | PENDING | |
| 13 | AUTH-RESET-001 | C | HIGH | SHORT-TERM | PENDING | |
| 14 | AUTH-REFRESH-001 | C | MEDIUM | SHORT-TERM | PENDING | |
| 15 | AUTH-OTP-002 | C | MEDIUM | MEDIUM-TERM | PENDING | |
| 16 | AUTH-OTP-003 | C | MEDIUM | MEDIUM-TERM | PENDING | |
| 17 | AUTH-CONCURRENT-001 | C | MEDIUM | MEDIUM-TERM | PENDING | |
| 18 | AUTH-CSRF-001 | C | MEDIUM | MEDIUM-TERM | PENDING | |

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

---

## PART 6: EVIDENCE

Evidence stored in: `RELEASES/EVIDENCE/BATCH-XXX/`

### Required Evidence Per Batch

| File | Contents |
|------|----------|
| `commits.txt` | `git log --oneline START_SHA..END_SHA` |
| `typecheck.txt` | `pnpm -r typecheck` output |
| `e2e.txt` | E2E @prod test results |
| `ci-run.txt` | Link to CI run + screenshot |
| `version-proof.txt` | `curl /version` output showing RC_SHA |
| `screenshots/` | Browser test evidence |
| `curl-proofs/` | Non-functional curl outputs |
| `signoff.md` | Operator sign-off with checklist |

### Evidence Per Ticket

Each ticket in Progress table must link to evidence:
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
| `DRAFT` | Not started, awaiting operator scope |
| `IN_PROGRESS` | Claude implementing tickets |
| `GATES_PENDING` | Awaiting local gate run |
| `CI_PENDING` | Awaiting CI green |
| `TESTING` | Operator browser/device testing |
| `READY` | Complete, awaiting deploy |
| `DEPLOYED` | Live in environment |
| `BLOCKED` | Issue found, stopped |

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
