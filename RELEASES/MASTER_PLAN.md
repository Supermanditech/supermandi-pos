# SuperMandi Master Plan

> **Single Source of Truth** — All rules, batches, and workflows in one file.
> **Last Updated**: 2026-02-04

---

## PART 1: CLAUDE RULES

### Session Start (MANDATORY)
Every Claude session MUST begin with:
```
1. Read this file: RELEASES/MASTER_PLAN.md
2. Show current batch status
3. Ask operator to run git sync
4. Wait for paste before proceeding
```

### Development Rules
| Rule | Description |
|------|-------------|
| **SCOPE LOCK** | Only work on current batch items |
| **NO SILENT FIXES** | Every change maps to ticket ID |
| **TYPE SAFE** | `pnpm -r typecheck` before commit |
| **ATOMIC COMMITS** | One feature per commit |

### Gate Reminders
- After every 3 tickets: "Time to run gates"
- Before batch complete: "Run gates + browser tests"
- If blocked: "🛑 BLOCKED: [reason]"
- If ready: "✅ BATCH COMPLETE - Ready for operator testing"

### Commit Message Format
```
BATCH-XXX: TICKET-ID - Description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

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

### Sign-Off Checklist
Before marking any batch complete:
- [ ] Git status clean
- [ ] Typecheck passed
- [ ] E2E @prod passed
- [ ] Browser tests passed
- [ ] Device tests passed (if POS in scope)

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

| Batch | Portal | Status | Progress |
|-------|--------|--------|----------|
| BATCH-004 | Retailer Web | `DRAFT` | 0/5 tickets |
| BATCH-005 | Supplier Web | `DRAFT` | 0/4 tickets |
| BATCH-006 | SuperAdmin | `DRAFT` | 0/11 tickets |
| BATCH-007 | POS App | `DRAFT` | 0/7 tickets |
| BATCH-008 | Cloud Run | `DRAFT` | 0/7 tickets |
| BATCH-009 | Integration | `DRAFT` | 0/5 tickets |
| BATCH-010 | Staging | `DRAFT` | 0/5 tickets |
| BATCH-011 | Go-Live | `DRAFT` | 0/1 tickets |

---

## PART 5: BATCH DETAILS

> **OPERATOR**: Write your scope in the "Operator Scope" section of each batch.
> Claude will ONLY work on items listed in that section.

---

### BATCH-004: Retailer Web

**Status**: `DRAFT` | **RC_SHA**: PENDING

#### Operator Scope (EDIT THIS)
```
Write your tickets here before starting this batch:

1.
2.
3.
4.
5.
```

#### Suggested Tickets (Claude's assessment)
| # | ID | Description | Priority |
|---|-----|-------------|----------|
| 1 | RET-FORGOT-001 | Implement forgot password (OTP reset) | HIGH |
| 2 | RET-CATALOG-001 | Verify SupplierCatalog page works | MEDIUM |
| 3 | RET-QUEUE-001 | Verify SupplierQueuePage works | MEDIUM |
| 4 | RET-BANK-001 | Verify bank details persist | LOW |
| 5 | RET-CLEANUP-001 | Remove unused ForgotPasswordPage or implement | LOW |

#### Progress
| # | Ticket | Status |
|---|--------|--------|
| | | |

#### Browser Tests (Operator)
- [ ] /retailer/login - OTP sends and verifies
- [ ] /retailer/register - Full flow completes
- [ ] Dashboard loads with real data
- [ ] All menu items accessible
- [ ] No console errors

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures

---

### BATCH-005: Supplier Web

**Status**: `DRAFT` | **RC_SHA**: PENDING

#### Operator Scope (EDIT THIS)
```
Write your tickets here before starting this batch:

1.
2.
3.
4.
```

#### Suggested Tickets (Claude's assessment)
| # | ID | Description | Priority |
|---|-----|-------------|----------|
| 1 | SUP-VERIFY-001 | Verify all 17 pages load | HIGH |
| 2 | SUP-ORDER-001 | Test order fulfillment (ship/deliver) | HIGH |
| 3 | SUP-EARNINGS-001 | Test earnings/payouts display | MEDIUM |
| 4 | SUP-KYC-001 | Test KYC document upload + IFSC | MEDIUM |

#### Progress
| # | Ticket | Status |
|---|--------|--------|
| | | |

#### Browser Tests (Operator)
- [ ] /supplier/login/ - OTP works
- [ ] /supplier/register/ - Full flow completes
- [ ] Dashboard shows products/orders
- [ ] KYC document upload works
- [ ] No console errors

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures

---

### BATCH-006: SuperAdmin

**Status**: `DRAFT` | **RC_SHA**: PENDING

#### Operator Scope (EDIT THIS)
```
Write your tickets here before starting this batch:

1.
2.
3.
```

#### Suggested Tickets (11 Tabs to verify)
| # | ID | Tab | Priority |
|---|-----|-----|----------|
| 1 | ADM-EVENTS-001 | Events - POS events display | HIGH |
| 2 | ADM-DEVICES-001 | Devices - List + QR codes | HIGH |
| 3 | ADM-STORES-001 | Stores - CRUD operations | HIGH |
| 4 | ADM-SUPPLIERS-001 | Suppliers - Approve/reject | HIGH |
| 5 | ADM-PAYMENTS-001 | Payments - Records display | MEDIUM |
| 6 | ADM-ANALYTICS-001 | Analytics - All sub-tabs | MEDIUM |
| 7 | ADM-AI-001 | AI - Health + queries | LOW |
| 8 | ADM-USERS-001 | Users - Management | MEDIUM |
| 9 | ADM-SETTINGS-001 | Settings - System config | LOW |
| 10 | ADM-AUDIT-001 | Audit - Logs display | LOW |
| 11 | ADM-DOCS-001 | Documents - Approval flow | MEDIUM |

#### Progress
| # | Ticket | Status |
|---|--------|--------|
| | | |

#### Browser Tests (Operator)
- [ ] /admin/ - Login works
- [ ] All 11 tabs load without errors
- [ ] Real data displays (not mock)
- [ ] No console errors

#### Gates
- [ ] `pnpm -r typecheck` = 0 errors
- [ ] `@prod` E2E = 0 failures

---

### BATCH-007: POS App

**Status**: `DRAFT` | **RC_SHA**: PENDING

#### Operator Scope (EDIT THIS)
```
Write your tickets here before starting this batch:

1.
2.
3.
```

#### Suggested Tickets (Claude's assessment)
| # | ID | Description | Priority |
|---|-----|-------------|----------|
| 1 | POS-HTTPS-001 | Update API URLs to HTTPS (supermandi.tech) | CRITICAL |
| 2 | POS-GATE-001 | Backend deploys GATE-000 APIs | CRITICAL |
| 3 | POS-SUPPLIERS-001 | Live Suppliers browse + order | HIGH |
| 4 | POS-STOCKIN-001 | Stock-In submission works | HIGH |
| 5 | POS-SUMMARY-001 | Daily summary analytics | MEDIUM |
| 6 | POS-CREDIT-001 | BNPL + loan display | MEDIUM |
| 7 | POS-PRINT-001 | ESC/POS receipt printing | HIGH |

#### Progress
| # | Ticket | Status |
|---|--------|--------|
| | | |

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

---

### BATCH-008: Cloud Run Prep

**Status**: `DRAFT` | **RC_SHA**: PENDING

#### Operator Scope (EDIT THIS)
```
Write your tickets here before starting this batch:

1.
2.
3.
```

#### Suggested Tickets (Claude's assessment)
| # | ID | Description | Priority |
|---|-----|-------------|----------|
| 1 | CR-DOCKER-001 | Verify all Dockerfiles build | CRITICAL |
| 2 | CR-ENV-001 | Secrets in Secret Manager | CRITICAL |
| 3 | CR-SQL-001 | Cloud SQL proxy configured | CRITICAL |
| 4 | CR-REDIS-001 | Memorystore (Redis) configured | HIGH |
| 5 | CR-HEALTH-001 | /health endpoint returns 200 | HIGH |
| 6 | CR-LOGGING-001 | Cloud Logging integration | MEDIUM |
| 7 | CR-BUILD-001 | Cloud Build trigger works | HIGH |

#### Progress
| # | Ticket | Status |
|---|--------|--------|
| | | |

#### GCP Setup (Operator)
- [ ] Cloud Run service created
- [ ] Cloud SQL instance running
- [ ] Memorystore instance running
- [ ] Secret Manager secrets created
- [ ] Cloud Build connected to repo
- [ ] Artifact Registry ready

---

### BATCH-009: Integration Testing

**Status**: `DRAFT` | **RC_SHA**: PENDING

#### Operator Scope (EDIT THIS)
```
Write your integration test scenarios here:

1.
2.
3.
```

#### Suggested Tests (Claude's assessment)
| # | ID | Description | Priority |
|---|-----|-------------|----------|
| 1 | INT-AUTH-001 | Same user works in all portals | CRITICAL |
| 2 | INT-RET-POS-001 | Device shows in retailer dashboard | CRITICAL |
| 3 | INT-SUP-RET-001 | Approved products in catalog | HIGH |
| 4 | INT-ADMIN-001 | Admin sees all stores/devices/suppliers | HIGH |
| 5 | INT-PAYMENTS-001 | Transaction appears in all portals | HIGH |

#### Progress
| # | Test | Status |
|---|------|--------|
| | | |

#### Integration Tests (Operator)
- [ ] Create retailer → activate device → make sale
- [ ] Create supplier → add products → approve → catalog
- [ ] Admin approves supplier → supplier adds products
- [ ] POS sale → appears in dashboards

---

### BATCH-010: Staging Deploy

**Status**: `DRAFT` | **RC_SHA**: PENDING

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
```

#### Suggested Tests (Claude's assessment)
| # | ID | Description | Priority |
|---|-----|-------------|----------|
| 1 | STAGE-DEPLOY-001 | Deploy all services to staging | CRITICAL |
| 2 | STAGE-RETAILER-001 | Full retailer journey test | CRITICAL |
| 3 | STAGE-SUPPLIER-001 | Full supplier journey test | CRITICAL |
| 4 | STAGE-POS-001 | Full POS journey test | CRITICAL |
| 5 | STAGE-LOAD-001 | Load test (100 concurrent users) | HIGH |

#### Progress
| # | Test | Status |
|---|------|--------|
| | | |

---

### BATCH-011: Production Go-Live

**Status**: `DRAFT` | **RC_SHA**: PENDING

#### Operator Scope (EDIT THIS)
```
Final go-live checklist:

1.
2.
3.
```

#### Pre-conditions (ALL must pass)
- [ ] BATCH-004 complete
- [ ] BATCH-005 complete
- [ ] BATCH-006 complete
- [ ] BATCH-007 complete
- [ ] BATCH-008 complete
- [ ] BATCH-009 complete
- [ ] BATCH-010 complete

#### Deploy Command
```bash
./scripts/deploy-cloud-run.sh --env production --confirm
```

#### Post-Deploy Verification
- [ ] All URLs return 200
- [ ] Version endpoints show correct SHA
- [ ] Browser test all portals
- [ ] POS connects to production
- [ ] No errors in Cloud Logging

#### Go-Live Sign-Off
```
Date:
Operator:
SHA:
Status:
```

---

## PART 6: EVIDENCE

Evidence stored in: `RELEASES/EVIDENCE/BATCH-XXX/`

Each batch folder contains:
- `commits.txt` - Git log of changes
- `typecheck.txt` - Typecheck output
- `e2e.txt` - E2E test results
- `screenshots/` - Browser test evidence
- `signoff.md` - Operator sign-off

---

## PART 7: QUICK REFERENCE

### Status Legend
| Status | Meaning |
|--------|---------|
| `DRAFT` | Not started |
| `IN_PROGRESS` | Claude implementing |
| `GATES_PENDING` | Awaiting gate run |
| `TESTING` | Operator testing |
| `COMPLETE` | Ready for next batch |
| `BLOCKED` | Issue found |

### Gate Commands
```powershell
pnpm -r typecheck
cd e2e-tests && node .\node_modules\@playwright\test\cli.js test --grep "@prod" && cd ..
```

### Deploy Commands
```bash
# Staging
./scripts/deploy-cloud-run.sh --env staging

# Production (requires all batches complete)
./scripts/deploy-cloud-run.sh --env production --confirm
```

---

## CHANGELOG

| Date | Change |
|------|--------|
| 2026-02-04 | Created unified MASTER_PLAN.md |
| | Defined BATCH-004 through BATCH-011 |
| | Set rules for Claude and Operator |
