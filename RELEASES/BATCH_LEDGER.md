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
| **Status** | `READY_FOR_DEPLOY` |
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

---
