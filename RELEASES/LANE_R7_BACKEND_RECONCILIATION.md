# lane/r7-backend Branch Reconciliation

> Branch: `origin/lane/r7-backend`
> Divergence: 105 commits ahead of main, ~138 commits behind main
> Generated: 2026-02-27
> Decision: **DEFERRED** — cherry-pick recommended as follow-up batch before production

---

## 1. Branch Overview

| Metric | Value |
|--------|-------|
| Commits ahead of main | 105 |
| Source files changed (vs main) | 202 |
| Lines added | 4,231 |
| Lines removed | 6,526 |
| Net delta | −2,295 (branch is SMALLER — it reverts main additions) |

---

## 2. Commit Categories

### Category A: NEW Backend Security Fixes (6 commits) — NOT on main

| Commit | Fix | File | Severity |
|--------|-----|------|----------|
| `ae0820d0` | Fail-closed store isolation on reorder policy GET-by-ID | `reorder-service/src/routes/policies.ts` | CRITICAL |
| `97e4cee7` | Enforce service auth on voice endpoints | `voice-service/src/routes/voice.ts` | CRITICAL |
| `e2103eb9` | Enforce trusted retailer context for portal routes | `platform-service/src/routes/retailerPortal.ts` | CRITICAL |
| `5b45baae` | Validate admin identity context in retailer-admin routes | `platform-service/src/routes/retailerAdmin.ts` | CRITICAL |
| `807a26aa` | Block shared catalog mutation in retailer PATCH | `platform-service/src/routes/retailerPortal.ts` | CRITICAL |
| `4b5bc316` | Redact supplier endpoint postgres error details | `platform-service/src/routes/retailerPortal.ts` | HIGH |

**Status**: These are genuine defense-in-depth fixes NOT replicated on main.

**Mitigation on main**: RLS (migration 149) provides DB-level store isolation; API gateway validates JWT and sets auth context for all requests. These lane/r7 fixes add APPLICATION-level enforcement as defense-in-depth.

### Category B: NEW POS Hardening (14 commits) — NOT on main

| Commits | Scope | New Components |
|---------|-------|----------------|
| r7-pos-011 to r7-pos-024 | Async guard, dialog standardization, any-cast removal | `WorkflowAlertModal.tsx`, `WorkflowConfirmModal.tsx` (NEW) |

**Status**: UX/safety improvements. These components don't exist on main. Safe to cherry-pick.

### Category C: Console Logging Fixes (3 commits) — SUPERSEDED on main

| Commit | Lane/r7 Approach | Main Approach | Verdict |
|--------|-----------------|---------------|---------|
| `ab7d6837` | Remove console in voice | Global structured logger migration (`20c26ad3`) | SUPERSEDED |
| `456d38e2` | Remove console in supplier | Global structured logger migration (`cd72771c`) | SUPERSEDED |
| `48362906` | Remove residual console | ESLint no-console rule (`a3061d5d`) | SUPERSEDED |

**Status**: Main's approach is superior (global migration + ESLint enforcement > targeted removals).

### Category D: Workflow/Ticket Metadata (82 commits) — SKIP

Non-code commits (ticket JSON updates, workflow state changes). Not relevant to source code merge.

---

## 3. REGRESSION RISK: Files That Would Be DELETED

Merging `lane/r7-backend` into main would DELETE these production-critical files:

| File | Added to Main By | Purpose | Impact if Deleted |
|------|-----------------|---------|-------------------|
| `supplier-portal/src/lib/reconnectingEventSource.ts` | W4 audit (`188246c7`) | SSE reconnection for supplier orders | **Orders page loses real-time updates** |
| `supplier-portal/src/middleware.ts` | W4 audit (`188246c7`) | Next.js auth middleware | **Auth guard bypass** |
| `supplier-portal/src/lib/fileLimits.ts` | W4 audit (`188246c7`) | Env-configurable file size limits | **Upload limits hardcoded** |

**Verdict**: Raw merge is **FORBIDDEN**. Branch is 138 commits behind main and does not have W4/W5 fixes.

---

## 4. Reconciliation Decision

### Option A: Cherry-Pick 20 Commits (RECOMMENDED)

Create `fix/r7-backend-cherry-picks` branch, cherry-pick:
- 6 backend security commits (Category A)
- 14 POS hardening commits (Category B)
- Skip Category C (superseded) and Category D (metadata)

**Pros**: Gains real security fixes without regression risk
**Cons**: Cherry-pick conflicts on files modified by both branches (3-5 files estimated)
**Effort**: ~1-2 hours including conflict resolution + CI verification

### Option B: Defer to Post-Deploy Batch

Deploy main as-is to staging, cherry-pick after staging validation.

**Pros**: No risk of introducing regressions before first staging deploy
**Cons**: 6 backend security fixes not in staging (mitigated by RLS + gateway auth)
**Effort**: Zero now, ~1-2 hours later

### Option C: Full Rebase (NOT RECOMMENDED)

Rebase lane/r7-backend on main. Would require resolving 100+ conflicts.

**Pros**: Clean branch history
**Cons**: Massive conflict resolution effort, high regression risk
**Effort**: 4-8 hours

---

## 5. Risk Assessment for Deferral

| Fix | Risk Without It | Mitigating Control |
|-----|-----------------|-------------------|
| Reorder policy store isolation | Reorder policy leak across stores | RLS on `reorder.reorder_policies` (M149) |
| Voice endpoint auth | Unauthenticated voice API access | API gateway JWT middleware blocks unauthenticated requests |
| Retailer portal context | Context spoofing in retailer routes | JWT-derived user identity set by gateway |
| Admin identity validation | Admin context bypass | Admin auth middleware in gateway validates admin token |
| Catalog mutation blocking | Retailer mutates shared catalog | Catalog service validates ownership on mutations |
| Error detail redaction | Postgres errors leaked to client | Gateway error handler strips stack traces |

**Overall deferral risk**: **LOW** — all 6 fixes have existing mitigating controls (RLS, gateway auth, error handlers). These are defense-in-depth improvements, not fixes for actively exploitable vulnerabilities.

---

## 6. Verdict

**DECISION: DEFER (Option B)**

Deploy main as-is to staging. Schedule cherry-pick batch as immediate follow-up (before production promotion).

**Justification**:
1. All 6 backend fixes have mitigating controls already on main
2. Cherry-pick introduces risk of CI failure / conflict regression before first staging deploy
3. RLS (migration 149) provides DB-level store isolation that supersedes most of these
4. Post-staging cherry-pick allows isolated testing of each fix

**Follow-Up Action Required**:
- Create ticket `R7-CHERRY-PICK-001` for 20-commit cherry-pick batch
- Must complete BEFORE production promotion
- Block production go-live on this ticket
