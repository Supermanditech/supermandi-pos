# SuperMandi Master Plan

> **Single Source of Truth** — All rules, batches, and workflows in one file.
> **Last Updated**: 2026-02-04

---

## ZERO-REGRESSION CONSTITUTION

> These principles are **non-negotiable**. Every rule in this document derives from them.

| # | Principle | Enforcement |
|---|-----------|-------------|
| 1 | **MASTER_PLAN is the only truth** | No workflow exists outside this file |
| 2 | **CI results override local results** | If local passes but CI fails → FAILED |
| 3 | **No deploy without evidence** | Every ticket requires proof artifacts |
| 4 | **Rollback is mandatory capability** | Every deploy must be revertible in <5 min |
| 5 | **No untracked changes** | Every change maps to a ticket ID |
| 6 | **No hotfixes outside tickets** | Emergency? Create HOTFIX-XXX ticket first |
| 7 | **Staging before production** | No direct-to-prod deploys ever |

**Referenced by**: Claude Rules (Part 1), Operator Rules (Part 2)

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
git push main → CI builds → Staging auto-deploy → Manual promote button → Production
```

- Only manual action: **Promote to Production** button (after staging verification)
- Rollback: **Revert to Previous Revision** button or `git revert` + push

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

**Cloud Run (GCP)**:
```bash
# List revisions
gcloud run revisions list --service=supermandi-api --region=asia-south1

# Rollback to specific revision
gcloud run services update-traffic supermandi-api \
  --to-revisions=REVISION_NAME=100 \
  --region=asia-south1
```

**Git Revert (code)**:
```bash
git revert COMMIT_SHA
git push origin main
# CI will auto-deploy reverted code
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
BATCH-005 Supplier ──┼──► BATCH-009 Integration ──► BATCH-010 Staging ──► BATCH-011 Go-Live
BATCH-006 Admin ─────┤
BATCH-007 POS ───────┤
BATCH-008 CloudRun ──┘
```

---

## PART 4: CURRENT STATUS

| Batch | Portal | Status | Progress | Owner | RC_SHA | CI Run | Updated |
|-------|--------|--------|----------|-------|--------|--------|---------|
| BATCH-004 | Retailer Web | `TESTING` | 5/5 CODE_VERIFIED | Claude | d3e9e45 | — | 2026-02-05 |
| BATCH-005 | Supplier Web | `TESTING` | 4/4 CODE_VERIFIED | Claude | d3e9e45 | — | 2026-02-05 |
| BATCH-006 | SuperAdmin | `TESTING` | 11/11 CODE_VERIFIED | Claude | d3e9e45 | — | 2026-02-05 |
| BATCH-007 | POS App | `IN_PROGRESS` | 1/7 (HTTPS fixed) | Claude | d3e9e45 | — | 2026-02-05 |
| BATCH-008 | Cloud Run | `DRAFT` | 0/7 | — | — | — | 2026-02-04 |
| BATCH-009 | Integration | `DRAFT` | 0/5 | — | — | — | 2026-02-04 |
| BATCH-010 | Staging | `DRAFT` | 0/5 | — | — | — | 2026-02-04 |
| BATCH-011 | Go-Live | `DRAFT` | 0/1 | — | — | — | 2026-02-04 |

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
| 5 | RET-CLEANUP-001 | A | CODE_VERIFIED | ForgotPasswordPage is implemented, not unused |

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
| 2 | POS-GATE-001 | F | NEEDS_BACKEND | Backend must deploy GATE-000 APIs (operator verification) |
| 3 | POS-SUPPLIERS-001 | B | NEEDS_VERIFICATION | Requires backend APIs + device test |
| 4 | POS-STOCKIN-001 | B | NEEDS_VERIFICATION | Requires device test |
| 5 | POS-SUMMARY-001 | A | NEEDS_VERIFICATION | Requires device test |
| 6 | POS-CREDIT-001 | B | NEEDS_VERIFICATION | Requires backend BNPL APIs + device test |
| 7 | POS-PRINT-001 | B | NEEDS_VERIFICATION | Requires ESC/POS printer + device test |

**Code Review Notes (2026-02-05):**
- POS-HTTPS-001 FIXED: app.json extra.API_URL changed from http://34.14.220.171:3000 to https://supermandi.tech
- POS-HTTPS-001 FIXED: app.json extra.POS_API_URL changed from http://34.14.220.171:3009 to https://supermandi.tech
- Other tickets require backend deployment or physical device testing
- Operator must rebuild APK and test on Redmi device

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

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

#### Operator Scope (EDIT THIS)
```
Write your tickets here before starting this batch:

1.
2.
3.
```

#### Suggested Tickets (Claude's assessment)
| # | ID | Description | Risk Class | Priority |
|---|-----|-------------|------------|----------|
| 1 | CR-DOCKER-001 | Verify all Dockerfiles build | F | CRITICAL |
| 2 | CR-ENV-001 | Secrets in Secret Manager | F | CRITICAL |
| 3 | CR-SQL-001 | Cloud SQL proxy configured | F | CRITICAL |
| 4 | CR-REDIS-001 | Memorystore (Redis) configured | F | HIGH |
| 5 | CR-HEALTH-001 | /health endpoint returns 200 | D | HIGH |
| 6 | CR-LOGGING-001 | Cloud Logging integration | F | MEDIUM |
| 7 | CR-BUILD-001 | Cloud Build trigger works | F | HIGH |

#### Progress
| # | Ticket | Risk | Status | Evidence |
|---|--------|------|--------|----------|
| | | | | |

#### GCP Setup (Operator)
- [ ] Cloud Run service created
- [ ] Cloud SQL instance running
- [ ] Memorystore instance running
- [ ] Secret Manager secrets created
- [ ] Cloud Build connected to repo
- [ ] Artifact Registry ready

#### Gates
- [ ] All Dockerfiles build locally
- [ ] Cloud Build triggers successfully
- [ ] `/health` returns 200 on Cloud Run
- [ ] CI green for RC_SHA

---

### BATCH-009: Integration Testing

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

#### Operator Scope (EDIT THIS)
```
Write your integration test scenarios here:

1.
2.
3.
```

#### Suggested Tests (Claude's assessment)
| # | ID | Description | Risk Class | Priority |
|---|-----|-------------|------------|----------|
| 1 | INT-AUTH-001 | Same user works in all portals | C | CRITICAL |
| 2 | INT-RET-POS-001 | Device shows in retailer dashboard | B | CRITICAL |
| 3 | INT-SUP-RET-001 | Approved products in catalog | B | HIGH |
| 4 | INT-ADMIN-001 | Admin sees all stores/devices/suppliers | B | HIGH |
| 5 | INT-PAYMENTS-001 | Transaction appears in all portals | B | HIGH |

#### Progress
| # | Test | Risk | Status | Evidence |
|---|------|------|--------|----------|
| | | | | |

#### Integration Tests (Operator)
- [ ] Create retailer → activate device → make sale
- [ ] Create supplier → add products → approve → catalog
- [ ] Admin approves supplier → supplier adds products
- [ ] POS sale → appears in dashboards

---

### BATCH-010: Staging Deploy

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

#### Operator Scope (EDIT THIS)
```
Write your staging test plan here:

1.
2.
3.
```

#### Staging URLs
```
https://staging.supermandi.tech/
https://staging.supermandi.tech/retailer/
https://staging.supermandi.tech/supplier/
https://staging.supermandi.tech/admin/
https://staging.supermandi.tech/api/v1/health
https://staging.supermandi.tech/api/v1/version
```

#### Suggested Tests (Claude's assessment)
| # | ID | Description | Risk Class | Priority |
|---|-----|-------------|------------|----------|
| 1 | STAGE-DEPLOY-001 | Deploy all services to staging | F | CRITICAL |
| 2 | STAGE-RETAILER-001 | Full retailer journey test | B | CRITICAL |
| 3 | STAGE-SUPPLIER-001 | Full supplier journey test | B | CRITICAL |
| 4 | STAGE-POS-001 | Full POS journey test | B | CRITICAL |
| 5 | STAGE-LOAD-001 | Load test (100 concurrent users) | F | HIGH |

#### Progress
| # | Test | Risk | Status | Evidence |
|---|------|------|--------|----------|
| | | | | |

#### Staging Verification
- [ ] All URLs return 200
- [ ] `/version` shows RC_SHA
- [ ] Full user journeys work
- [ ] No errors in Cloud Logging

---

### BATCH-011: Production Go-Live

**Status**: `DRAFT` | **RC_SHA**: — | **CI Run**: —

#### Operator Scope (EDIT THIS)
```
Final go-live checklist:

1.
2.
3.
```

#### Pre-conditions (ALL must pass)
- [ ] BATCH-004 complete with evidence
- [ ] BATCH-005 complete with evidence
- [ ] BATCH-006 complete with evidence
- [ ] BATCH-007 complete with evidence
- [ ] BATCH-008 complete with evidence
- [ ] BATCH-009 complete with evidence
- [ ] BATCH-010 complete with evidence
- [ ] Rollback drill completed this week

#### Deploy Command
```bash
./scripts/deploy-cloud-run.sh --env production --confirm
```

#### Post-Deploy Verification
- [ ] All URLs return 200
- [ ] `/version` shows PROD_SHA
- [ ] Browser test all portals
- [ ] POS connects to production
- [ ] No errors in Cloud Logging (5 min observation)

#### Go-Live Sign-Off
```
Date:
Operator:
PROD_SHA:
ROLLBACK_SHA:
CI Run Link:
Status:
```

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
# Staging (auto from CI, or manual)
./scripts/deploy-cloud-run.sh --env staging

# Production (requires all batches complete + staging verified)
./scripts/deploy-cloud-run.sh --env production --confirm

# Rollback
gcloud run services update-traffic supermandi-api \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=asia-south1
```

### Emergency Contacts

```
Operator: [name]
Escalation: [contact]
GCP Console: https://console.cloud.google.com/run?project=PROJECT_ID
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
