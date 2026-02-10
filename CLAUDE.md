# SuperMandi POS — Claude Session Instructions

> **This file is read automatically at the start of every Claude Code session.**
> It ensures Claude operates with full context of the project's rules, pipeline, and current state.

---

## MANDATORY: Read These Files First

Before writing ANY code, Claude MUST read and internalize:

1. **`RELEASES/CLAUDE_PRODUCTION_RULES.md`** — How Claude writes code (14 parts: safety rules, test policy, evidence requirements, debugging stages, git discipline, anti-patterns, incident workflow, priority order)
2. **`RELEASES/MASTER_PLAN.md`** — What to do (batches, tickets, gates, current status, change class matrix)
3. **`RELEASES/ZERO_REGRESSION_RULES.md`** — How deploys work (immutability, rollback, CI gates, forbidden actions)

## Secondary References (Read When Relevant)

4. **`RELEASES/RELEASE_POLICY.md`** — End-to-end staging-first release flow, 5 gates, freeze rules
5. **`RELEASES/ROLLBACK_PLAYBOOK.md`** — Incident response, rollback procedures
6. **`RELEASES/INCIDENTS.md`** — Active/resolved incident log
7. **`RELEASES/BATCH_LEDGER.md`** — Per-batch status tracking and evidence

## Superseded Files (Historical Only — Do NOT Follow)

These files are from the pre-Cloud Run VM era. They remain in the repo for historical reference but are **NOT authoritative**. Each file contains a SUPERSEDED header redirecting to the correct source.

- **`RELEASES/OPERATOR_RUNBOOK.md`** — Replaced by MASTER_PLAN.md Part 2 + RELEASE_POLICY.md
- **`RELEASES/BATCH_TEMPLATE.md`** — Replaced by MASTER_PLAN.md Part 5 (batch detail sections)

---

## Project Architecture

**SuperMandi POS** is a multi-service e-commerce platform:

### Backend Services (Node.js/Express, PostgreSQL)
- `backend/` — Monorepo with 10 microservices under `backend/services/`
- `backend/services/api-gateway/` — API Gateway (port 3000)
- Backend Main (port 3001) — runs all services via `concurrently`
- Services: auth-service, platform-service, supplier-service, catalog-service, inventory-service, order-service, reorder-service, pos-service, voice-service, analytics-service

### Frontend Portals
- `retailer-admin/` — Vite + React (port 5173, base `/retailer/`)
- `supplier-portal/` — Next.js (port 4001, base `/supplier/`)
- `supermandi-superadmin/` — Vite + React (port 5174, base `/admin/`)
- `supermandi-landing/` — Static HTML landing page

### Mobile
- Root `./` — Expo/React Native POS app (port 8081)

### Infrastructure
- `docker-compose.local-prod.yml` — Local-prod simulation
- `.github/workflows/` — CI/CD pipelines
- `scripts/` — Deploy, migrate, gate scripts
- `e2e-tests/` — Playwright E2E test suite
- `backend/migrations/` — Sequential SQL migrations

---

## Key Rules Summary (From CLAUDE_PRODUCTION_RULES.md)

### Non-Negotiable
- **No temp fixes** — every commit must be production-grade
- **No hardcoded values** — use env vars and named constants
- **No manual infra patches** — every fix exists in the repo, no GCP console edits
- **No partial integrations** — UI to DB, complete chain or nothing
- **No broken business logic** — 6 domain invariants must hold (stock, ledger, store isolation, idempotency, scan scope, price integrity)

### Store Isolation (Critical)
- Server derives `storeId` ONLY from JWT token
- Client-sent storeId is NEVER trusted
- Every data query must include `WHERE store_id = $token.storeId`

### Test Discipline
- Every fix: `pnpm -r typecheck` + applicable test packs
- Backend changes: migrate-from-zero + schema verify + integration + invariants
- Portal changes: production build + Playwright smoke
- POS changes: typecheck + API smoke + emulator E2E

### Evidence
- Every fix needs evidence appropriate to risk class
- Evidence Triplet: UI proof + API proof + DB proof
- "I think it works" is not evidence

### Pipeline
- DEBUG → FIND → FIX → RETEST → GUARD (every issue)
- Debugging stages: 0 (dev) → 1 (Docker) → 2 (CI) → 3 (staging) → 4 (production)
- Release: code-complete → local gates → CI → tag RC → staging → verify → promote

### Git Discipline
- **Mode A**: Direct push to `main` allowed (no deploy risk)
- **Mode B**: Work via PR branches (`feat/`, `fix/`, `hotfix/`), CI green before merge
- Commit format: `BATCH-XXX: TICKET-ID - Description`
- RC tags are immutable

---

## Session Mode

### Mode A: Pre-Staging (CURRENT)
- Claude starts independently — no operator paste required
- Claude can work on SA-GOLIVE tickets directly
- No deploy risk (code-only work on main)
- Run `git log --oneline -5` and `git status` at session start

### Mode B: Staging/Production (activate after GCP + SA-GOLIVE done)
- Claude MUST wait for operator to paste `git sync` output before any work
- Claude MUST NOT propose fixes until clean git tree confirmed and RC_SHA aligned
- Deploy risk exists — SHA alignment between Claude and operator is critical

**Switch to Mode B when**: Operator confirms GCP setup complete AND SA-GOLIVE is code-complete.

---

## Current State Awareness

At session start, Claude should also check:
- `git log --oneline -5` — recent commits
- `git status` — working tree state
- Current batch status in MASTER_PLAN.md (Part 4 table)
- Operator Action Tracker status (GCP setup progress)

### Batch Status Lifecycle
```
PENDING → IN_PROGRESS → WRITTEN → GATED → TESTED → EVIDENCED
```
Release lifecycle:
```
All batches EVIDENCED → RC_TAGGED → STAGED → LIVE
```

### Current Release Model: MEGA-RC (One-Time)
All batches 004 through SA-GOLIVE deploy as a single combined RC.
- Individual Batch_SHA values are historical reference only
- Single RC_SHA = HEAD of main after SA-GOLIVE completes
- Per-batch evidence is MANDATORY (no waivers for 004–014)
- After go-live, resume normal "one batch = one RC" cadence

---

## Communication Protocol

### When Starting a Fix
```
Starting TICKET-ID: [description]
Risk Class: X
Files in scope: [list]
```

### When Blocked
```
BLOCKED: [specific reason]
Recommended: [Fix forward / Revert / Ask operator]
```

### When Done
```
TICKET-ID DONE:
- Fix: [one-line summary]
- Evidence: [screenshot/curl/SQL reference]
- Guard: [test added or proof path]
- Risk: [what could break if this is wrong]
```

### Forbidden Phrases
- "This should work" (prove it)
- "I think this is fine" (test it)
- "Let's move on and fix this later" (fix now or create ticket)

---

## GCP Status

**Operator resolving immediately.** GCP infrastructure setup in progress — see Operator Action Tracker in MASTER_PLAN.md (Part 4).

### First Deploy Protocol (Mega-Batch)
When GCP is ready AND SA-GOLIVE is complete:
1. Run full gates on HEAD → all batches `GATED`
2. Operator browser tests all 4 portals → per-batch `TESTED`
3. Collect per-batch evidence → per-batch `EVIDENCED`
4. Tag MEGA-RC → deploy staging with Migration Safety Protocol
5. Verify staging → promote to production
6. After go-live → switch to Mode B, resume normal cadence

### Migration Safety (First Deploy Only)
- Cloud SQL backup BEFORE migration run
- `migrate-prod.js dry-run` to preview pending migrations
- Manual migration execution (not auto on container start)
- See MASTER_PLAN.md BATCH-010 for full protocol
