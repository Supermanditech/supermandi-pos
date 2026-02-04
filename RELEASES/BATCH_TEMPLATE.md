# BATCH {ID} — {DATE}

## Batch Info
| Field | Value |
|-------|-------|
| **Batch ID** | BATCH-{ID} |
| **Status** | `DRAFT` / `READY_FOR_DEPLOY` / `DEPLOYED` / `ROLLED_BACK` / `BLOCKED` |
| **Scope** | {brief description} |
| **Contracts Touched** | none / {list if any} |
| **Commit SHA (short)** | {7-char} |
| **Commit SHA (full)** | {40-char} |
| **Rollback SHA** | {previous known-good SHA} |
| **Deploy Command** | `./scripts/deploy-production.sh --sha {SHA}` |

## Items (5-12 items)
| # | Ticket/Task | Acceptance Test | Status |
|---|-------------|-----------------|--------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

## Local Gates
```
Date: {YYYY-MM-DD HH:MM IST}
```

| Gate | Result |
|------|--------|
| `pnpm install` | |
| `pnpm -r typecheck` | |
| `retailer-admin build` | |
| `supplier-portal build` | |
| `supermandi-superadmin build` | |
| `e2e: prod-smoke` | **MUST BE 0 FAILURES** |

### E2E Test Suites
> For go-live: **prod-smoke MUST be 0 failures**. Other suites may be skipped with explicit reason.

| Suite | Tag | Required | Pass/Fail | Notes |
|-------|-----|----------|-----------|-------|
| **prod-smoke** | `@prod` | **YES** | | Must pass 100% for go-live |
| testonly | `@testonly` | No | skipped | Test-only endpoints disabled in prod |
| admin | `@admin` | If in scope | | Admin portal tests |

**Skipped Tests (Expected in Production):**
| Test | Reason |
|------|--------|
| Token Refresh Flow | test-only endpoints disabled in production (/api/test/* not available) |
| Admin Portal Tests | Admin not in go-live scope for this batch |

**Gate Output:**
```
{paste gate-local.ps1 output here}
```

## Deploy Evidence
```
Date: {YYYY-MM-DD HH:MM IST}
Deployed SHA: {SHA}
```

| Check | Result |
|-------|--------|
| `nginx -t` | |
| `docker ps` (if backend) | |

**URL Verification (7 endpoints):**
| Endpoint | Expected | Actual |
|----------|----------|--------|
| https://supermandi.tech/ | 200 | |
| https://supermandi.tech/retailer/ | 200 | |
| https://supermandi.tech/retailer/login | 200 | |
| https://supermandi.tech/supplier/ | 200 | |
| https://supermandi.tech/supplier/login/ | 200 | |
| https://supermandi.tech/admin/ | 200 | |
| https://supermandi.tech/api/v1/health | 200 | |

**Headers Verification:**
| Header | Present |
|--------|---------|
| HSTS | |
| CSP | |

**Deploy Script Output:**
```
{paste deploy-production.sh evidence block here}
```

## Incognito Flow Checklist (Human Proof)
| Flow | Browser | Result | Tester |
|------|---------|--------|--------|
| Retailer Login (existing user) | Chrome Incognito | | |
| Retailer Register (new user) | Chrome Incognito | | |
| Supplier Login | Chrome Incognito | | |
| Supplier Register | Chrome Incognito | | |
| Admin Login | Chrome Incognito | | |

## Notes
{any additional notes}

---
**Status History:**
- `DRAFT` — {date} — Created
- `READY_FOR_DEPLOY` — {date} — Gates passed, ready for deploy
- `DEPLOYED` / `ROLLED_BACK` / `BLOCKED` — {date} — {reason}
