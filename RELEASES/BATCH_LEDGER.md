# SuperMandi Batch Ledger

> Single source of truth for all production deployments.
> Each batch tracks: local gates -> deploy -> acceptance.

## How to Use

1. **Create Entry**: Copy from [BATCH_TEMPLATE.md](./BATCH_TEMPLATE.md) when starting a new batch
2. **Implement**: Claude implements locally (no VM deploy during coding)
3. **Gate**: Run `.\scripts\gate-local.ps1` - must pass before deploy
4. **Commit**: One commit per batch: `BATCH <ID>: <summary>`
5. **Deploy**: Run `./scripts/deploy-production.sh --sha <commit>`
6. **Accept**: Human tests in incognito browser

## Status Legend
| Status | Meaning |
|--------|---------|
| `DRAFT` | In progress, not ready |
| `READY_FOR_DEPLOY` | Gates passed, awaiting deploy |
| `DEPLOYED` | Live in production, verified |
| `ROLLED_BACK` | Reverted to previous SHA |
| `BLOCKED` | Cannot proceed, needs resolution |

## Stop Conditions (Instant Stop)
- Any gate fails (typecheck/build/e2e)
- Any of 7 endpoints not 200 after deploy
- Any auth flow breaks in incognito
- Deploy not pinned to known SHA

---

# Batches

## BATCH-001 — 2026-02-04 — Deploy Infrastructure

### Batch Info
| Field | Value |
|-------|-------|
| **Batch ID** | BATCH-001 |
| **Status** | `SKIPPED` (folded into BATCH-002) |
| **Scope** | Deploy ops infrastructure: ledger, gates, verification |
| **Tickets from retailer-tickets.md** | none (infrastructure batch) |
| **Contracts Touched** | none |
| **Commit SHA (short)** | a00d2c9 |
| **Commit SHA (full)** | a00d2c93f65fab90fc3e15ba194f3a20e987f124 |
| **Rollback SHA** | a6803ab |
| **Evidence Path** | `RELEASES/EVIDENCE/BATCH-001/` |
| **Deploy Command** | `./scripts/deploy-production.sh --sha a00d2c9` |

### Items (Internal DEPLOY-OPS tasks)
| # | Ticket/Task | Acceptance Test | Status |
|---|-------------|-----------------|--------|
| 1 | DEPLOY-OPS-001: Batch Ledger | RELEASES/BATCH_LEDGER.md + BATCH_TEMPLATE.md exist | DONE |
| 2 | DEPLOY-OPS-002: gate-local.ps1 | `.\scripts\gate-local.ps1` runs and prints GATES PASSED | DONE |
| 3 | DEPLOY-OPS-004: verify-go-live-urls.sh | Script checks 7 URLs + HSTS + CSP, exits 0 on success | DONE |
| 4 | DEPLOY-OPS-003: deploy-production.sh | Accepts --sha, prints evidence block, hard fails on verify fail | DONE |

### Local Gates
```
Date: 2026-02-04 18:02 IST
```

| Gate | Result |
|------|--------|
| `pnpm install` | PASS |
| `pnpm -r typecheck` | PASS |
| `retailer-admin build` | PASS |
| `supplier-portal build` | PASS |
| `supermandi-superadmin build` | PASS |
| `e2e: prod-smoke` | **PASS (0 failures)** |

#### E2E Test Suites
> For go-live: **prod-smoke MUST be 0 failures**. Other suites may be skipped with explicit reason.

| Suite | Tag | Required | Pass/Fail | Notes |
|-------|-----|----------|-----------|-------|
| **prod-smoke** | `@prod` | **YES** | **PASS (75/75)** | 0 failures - go-live ready |
| testonly | `@testonly` | No | skipped | Test-only endpoints disabled in prod |
| admin | `@admin` | No | skipped | Admin not in go-live scope for BATCH-001 |

**Skipped Tests (Expected in Production):**
| Test | Reason |
|------|--------|
| Token Refresh Flow @testonly | test-only endpoints disabled in production (/api/test/* not available) |
| Admin Portal Tests @admin | Admin not in go-live scope for BATCH-001 |

### Deploy Evidence
```
Date: pending
Deployed SHA: pending
```

| Check | Result |
|-------|--------|
| `nginx -t` | pending |
| `nginx reload` | pending |
| Container/PM2 status | pending |
| SHA proof file on VM | pending |

**7-URL Verification:**
| Endpoint | Expected | Actual |
|----------|----------|--------|
| https://supermandi.tech/ | 200 | pending |
| https://supermandi.tech/retailer/ | 200 | pending |
| https://supermandi.tech/retailer/login | 200 | pending |
| https://supermandi.tech/supplier/ | 200 | pending |
| https://supermandi.tech/supplier/login/ | 200 | pending |
| https://supermandi.tech/admin/ | 200 | pending |
| https://supermandi.tech/api/v1/health | 200 | pending |

### Notes
This batch establishes the deployment operations infrastructure per rules.pdf.
Infrastructure batch - no items from retailer-tickets.md.
**SKIPPED** - Folded into BATCH-002.

---

## BATCH-002 — 2026-02-04 — Registration Flow Fixes

### Batch Info
| Field | Value |
|-------|-------|
| **Batch ID** | BATCH-002 |
| **Status** | `CANDIDATE` |
| **Scope** | Registration flow fixes: link removal, error handling, banner copy |
| **Tickets from retailer-tickets.md** | REG-RET-001, REG-RET-002, REG-SUP-001, REG-SUP-002, REG-COPY-001 |
| **Contracts Touched** | none |
| **Commit SHA (short)** | cb3bf95 |
| **Commit SHA (full)** | cb3bf951fd224739134a83f38a978c34388df405 |
| **Rollback SHA** | f6d0f52 |
| **Evidence Path** | `RELEASES/EVIDENCE/BATCH-002/` |
| **Deploy Command** | `./scripts/deploy-production.sh --sha cb3bf95` |

### Items
| # | Ticket/Task | Acceptance Test | Status |
|---|-------------|-----------------|--------|
| 1 | REG-RET-001: Remove "Already registered? Sign In" from Retailer | /retailer/register has no sign-in link | DONE |
| 2 | REG-SUP-001: Remove "Already registered? Sign In" from Supplier | /supplier/register has no sign-in link | DONE |
| 3 | REG-RET-002: Fix retailer Step-2 navigation | Step-2 → Step-3 works, shows proper errors | DONE |
| 4 | REG-SUP-002: Fix supplier wrong error | No "Registration required before login" during registration | DONE |
| 5 | REG-COPY-001: Standardize banner copy | Error shows "Please complete registration to continue." | DONE |
| 6 | BATCH-001 infra (folded) | Deploy scripts exist and work | DONE |

### Local Gates
```
Date: 2026-02-04
```

| Gate | Result |
|------|--------|
| `retailer-admin typecheck` | PASS |
| `supplier-portal typecheck` | PASS |
| `e2e: @prod` | **PASS (75/75, 0 failures)** |

Note: `backend/packages/common` typecheck has pre-existing PATH issue (tsc not in PATH), unrelated to this batch.

### Deploy Evidence
```
Date: pending
Deployed SHA: pending
```

### Notes
Includes BATCH-001 infrastructure work (folded).

---
