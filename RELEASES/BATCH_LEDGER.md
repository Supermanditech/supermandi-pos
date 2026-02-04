# SuperMandi Batch Ledger

> **Deployment History** — Records of all deployed batches.
> **For new batches (004+)**: See `RELEASES/MASTER_PLAN.md`

---

## Quick Links

- **New Batches & Rules**: [MASTER_PLAN.md](./MASTER_PLAN.md)
- **Evidence Folder**: `RELEASES/EVIDENCE/`

---

## Infrastructure Batches

### BATCH-000 — 2026-02-05 — INFRA FOUNDATION

| Field | Value |
|-------|-------|
| **Status** | `PUSHED` |
| **Environment** | Local development tooling (no deploy) |
| **HEAD_SHA** | `789f08f` |
| **Base SHA** | `42a5bae` (BATCH-004/005/006/007 code verification) |
| **Pushed** | 2026-02-05 |

**Commits (4):**
- `d70444b` HOTFIX-TSC-001: Add missing TypeScript devDependencies to workspace packages
- `bcdec29` chore: Add production verification script
- `8203ead` INFRA-LOCAL-001: Configure local development stack
- `789f08f` INFRA-ZR-001: Zero-regression framework + local stack tooling

**Items:**
- HOTFIX-TSC-001: Missing TypeScript devDependencies across workspace packages
- INFRA-LOCAL-001: Docker Compose (Postgres + Redis), `start-local-stack.bat`
- INFRA-ZR-001: `ZERO_REGRESSION_RULES.md`, `zero-regression-check.ps1`, MASTER_PLAN principles 8-10, Claude commitment, Vite gitignore

**Purpose:** Stable infrastructure base for all subsequent portal batches (004-011).

---

## Deployed Batches

### BATCH-003 — 2026-02-04 — Go-Live Zero-Regression Fixes

| Field | Value |
|-------|-------|
| **Status** | `DEPLOYED` |
| **Environment** | Production |
| **PROD_SHA** | `fe359fd` |
| **ROLLBACK_SHA** | `8c90592` (BATCH-002) |
| **Deployed** | 2026-02-04 21:10 IST |
| **CI Run** | — (pre-CI era) |
| **Evidence** | `RELEASES/EVIDENCE/BATCH-003/` |

**Items:**
- AUTH-LOGIN-001: Remove supplier login auto-redirect ✅
- AUTH-LOGIN-002: Add missing return after pending-approval ✅
- AUTH-LOGIN-003: Remove retailer login auto-redirect ✅
- FIREBASE-VM-001: Verify env files on VM ✅

**Verification:**
- All 7 URLs: ✅ 200
- Version endpoints: ✅ fe359fd

---

### BATCH-002 — 2026-02-04 — Registration Flow Fixes

| Field | Value |
|-------|-------|
| **Status** | `DEPLOYED` |
| **Environment** | Production |
| **PROD_SHA** | `8c90592` |
| **ROLLBACK_SHA** | `a00d2c9` (BATCH-001) |
| **Deployed** | 2026-02-04 19:30 IST |
| **CI Run** | — (pre-CI era) |
| **Evidence** | `RELEASES/EVIDENCE/BATCH-002/` |

**Items:**
- REG-RET-001: Remove sign-in link from retailer register ✅
- REG-SUP-001: Remove sign-in link from supplier register ✅
- REG-RET-002: Fix retailer Step-2 navigation ✅
- REG-SUP-002: Fix supplier wrong error ✅
- REG-COPY-001: Standardize banner copy ✅
- FIREBASE-OTP-001: Fix OTP error messages ✅

**Verification:**
- All 7 URLs: ✅ 200
- OTP working: ✅

---

### BATCH-001 — 2026-02-04 — Deploy Infrastructure

| Field | Value |
|-------|-------|
| **Status** | `SKIPPED` (folded into BATCH-002) |
| **BATCH_SHA** | `a00d2c9` |

**Items:**
- DEPLOY-OPS-001: Batch Ledger ✅
- DEPLOY-OPS-002: gate-local.ps1 ✅
- DEPLOY-OPS-003: deploy-production.sh ✅
- DEPLOY-OPS-004: verify-go-live-urls.sh ✅

---

## Current Production State

| URL | Status |
|-----|--------|
| https://supermandi.tech/ | ✅ 200 |
| https://supermandi.tech/retailer/ | ✅ 200 |
| https://supermandi.tech/retailer/login | ✅ 200 |
| https://supermandi.tech/supplier/ | ✅ 200 |
| https://supermandi.tech/supplier/login/ | ✅ 200 |
| https://supermandi.tech/admin/ | ✅ 200 |
| https://supermandi.tech/api/v1/health | ✅ 200 |

**Current PROD_SHA**: `fe359fd` (BATCH-003)
**ROLLBACK_SHA**: `8c90592` (BATCH-002)

---

## Rollback History

| Date | From SHA | To SHA | Reason | Duration |
|------|----------|--------|--------|----------|
| — | — | — | No rollbacks yet | — |

---

## Rollback Drills

| Date | Environment | Result | Notes |
|------|-------------|--------|-------|
| — | — | — | No drills yet |

---

## Next Steps

See [MASTER_PLAN.md](./MASTER_PLAN.md) for:
- BATCH-004: Retailer Web Production-Grade
- BATCH-005: Supplier Web Production-Grade
- BATCH-006: SuperAdmin Production-Grade
- BATCH-007: POS App Production-Grade
- BATCH-008: Cloud Run Prep
- BATCH-009: Integration Testing
- BATCH-010: Staging Deploy
- BATCH-011: Production Go-Live
