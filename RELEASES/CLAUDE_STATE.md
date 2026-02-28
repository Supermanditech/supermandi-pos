---
name: supermandi-operating-system
description: The definitive operating system for Claude working on SuperMandi POS. Contains all rules, disciplines, architecture, testing protocols, deployment procedures, and navigation guidelines. Supersedes all previous rule files.
---

# CLAUDE STATE: The Definitive Operating System

> **Version**: 1.2 | **Date**: 2026-02-20
> **Status**: ACTIVE — This is the ONLY file Claude reads for rules, discipline, and navigation.
> **Scope**: SuperMandi POS — all platforms (Retailer, Supplier, SuperAdmin, POS App, Backend, Gateway)

---

## SUPERSEDES NOTICE

This file **replaces and supersedes** ALL of the following. Claude MUST NOT follow them independently:

| Superseded File | Was |
|----------------|-----|
| `memory/GO_LIVE_OPERATING_SYSTEM.md` | Go-Live OS |
| `memory/REAL_PRODUCTION_TESTING_RULES.md` | Testing Rules A-I |
| `memory/PRODUCTION_TEST_RUNBOOK.md` | 10-Step Runbook |
| `memory/TICKET_EXECUTION_RULES.md` | 12 Audit Fix Rules |
| `memory/CLAUDE_PRODUCTION_RULES.md` | Claude Execution Rules |
| `memory/DOCKER_GCP_STAGING_RULEBOOK.md` | Docker/GCP Staging Rulebook |
| `RELEASES/ZERO_REGRESSION_RULES.md` | Zero Regression Rules |
| `RELEASES/CLAUDE_PRODUCTION_RULES.md` | Claude Production Rules |
| `RELEASES/RELEASE_POLICY.md` | Release Policy |
| `RELEASES/ROLLBACK_PLAYBOOK.md` | Rollback Playbook |

**Everything Claude needs is in THIS file plus the machine-enforced workflow artifacts referenced by this file.**

---

# PART 0: BOOT SEQUENCE (MANDATORY — Before ANY Operator Interaction)

## 0.1 Claude's First Actions (Every Session, No Exceptions)

```
BEFORE Claude responds to ANY operator message, Claude MUST:

  1. READ this file fully (RELEASES/CLAUDE_STATE.md)
     → Internalize all 15 parts + appendices
     → Keep all rules in active context

  2. READ the live state (RELEASES/CLAUDE_CURRENT_STATE.json)
     → Know current ticket, phase, queue, blocked items
     → Know last 5 actions

  3. READ the memory sync pack (RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md)
     → Load authoritative workflow artifacts and startup commands
     → Load updated file list and contradiction remediations

  4. RUN: git log --oneline -10 && git status
     → Verify git matches state file
     → If mismatch → reconcile (git is truth)

  5. RUN workflow guards:
     → pnpm workflow:validate
     → pnpm workflow:monitor

  6. ANNOUNCE resumption:
     "Session started. Current: [ticket] at [step]. Phase: [N], Progress: [X/Y]."

  7. ONLY THEN respond to operator's message or begin work
```

**Claude NEVER skips this boot sequence.**
**Claude NEVER responds to operator before completing it.**
**Claude NEVER starts coding without knowing current state.**

## 0.1A Machine-Enforced Workflow Artifacts (Mandatory Reads)

For every coding session, Claude MUST load and use these files before ticket execution:

- `workflow/state/workflow_state.json`
- `workflow/state/staging_batch.json`
- `workflow/state/freeze_manifest.json`
- `workflow/schemas/ticket.schema.json`
- `workflow/schemas/screen_state.schema.json`
- `workflow/schemas/staging_batch.schema.json`
- `workflow/schemas/freeze_manifest.schema.json`
- `workflow/README.md`
- `workflow/production_boundary_iam.md`
- `scripts/workflow/guard.js`
- `scripts/workflow/session-boot.js`
- `scripts/workflow/ticket-monitor.js`

Before changing a ticket from `todo` to `in_progress`, Claude MUST run:

`pnpm workflow:session-boot -- --file workflow/tickets/<ticket>.json`

No ticket progression is allowed without this bootstrap stamp.

## 0.2 Prime Directive (Absolute, Every Action)

```
- Execute ONLY what is in the ticket
- No refactor, cleanup, rename, optimize unless explicitly required
- No reinterpretation of requirements
- Ambiguous → STOP and ask operator
- Not required for acceptance criteria → DO NOT DO IT
- ZERO REGRESSION > SPEED (always)
```

## 0.2A 100% Completion Gate (No Percentage Closures)

```
- Progress percentages are telemetry only, never acceptance criteria
- Claude MUST NOT stop because a cycle reports 78%, 83%, etc.
- A page/surface is complete only when required checks are either:
    PASS with evidence
    OR BLOCKED with owner + unblock plan
- Any unresolved required micro-check keeps the ticket/surface OPEN
- Any open P0/P1 blocks staging deploy for that active batch
- Completion must be binary:
    "100% required checks resolved"
    or "NOT COMPLETE" with remaining check IDs
```

## 0.2B Deploy-Then-Live Ticketization Gate (Mandatory)

```
- For active cumulative fix windows, Claude deploys once to staging before further implementation.
- After deploy, Claude must run full live testing across:
    retailer web, supplier web, superadmin web, POS app, and cross-function matrix flows.
- Claude must create/update micro tickets for every discovered issue:
    one issue per ticket, page/component/field granularity.
- Each new ticket must include live staging evidence:
    staging URL/flow, timestamp, runtime proof, and relevant Cloud Run revision IDs.
- Implementation starts only after:
    full-surface coverage map is complete
    AND all discovered issues are ticketized.
- No sampling and no page skipping are allowed.
```

## 0.3 Store Isolation (Security — Non-Negotiable)

```
- Server derives storeId ONLY from JWT token
- Client-sent storeId is NEVER trusted
- Every data query MUST include WHERE store_id = $token.storeId
- No endpoint may accept storeId from request body/params for auth purposes
- Violation = P0 security ticket, immediate fix
```

## 0.4 API Contract Safety (Backward Compatibility)

```
FORBIDDEN:
  - Rename fields in API responses
  - Remove fields from API responses
  - Change response shapes (object → array, etc.)
  - Repurpose existing endpoints for different behavior

ALLOWED:
  - Add new optional fields to responses
  - Add new endpoints
  - Add optional parameters to requests

Rule: POS and Retailer APIs MUST remain backward compatible at all times.
Any shape change requires:
  1. Contract test update
  2. ALL consumer portals verified
  3. Operator approval
```

---

# PART 1: THE ARCHITECTURE (Q1, Q2, Q5 — No Local Dependencies)

## 1.1 The Straight Solution

Production-grade development across all platforms uses a **3-layer cloud-only architecture**:

```
Layer 1: Git (Claude's workspace)
   Claude writes code → commits → pushes branches → opens PRs

Layer 2: GitHub Actions (CI — the gatekeeper)
   Builds Docker images → runs ALL tests → validates everything

Layer 3: GCP (staging + production)
   Cloud Run serves all services → same artifact everywhere
```

**There is NO Layer 0 (local development dependencies).**
- No local Docker builds
- No local `pnpm dev` testing
- No local database
- No local anything except code editing and `git push`

Claude edits code. CI builds and tests it. GCP runs it. That's it.

## 1.2 Build Once, Deploy Everywhere

```
Git SHA abc123 → CI builds Docker images → tags with abc123
   → Deploy to staging (image abc123)
   → Promote to production (SAME image abc123)
   → No rebuild between environments. Ever.
```

The SAME container image digest passes through: **CI → Staging → Production**.
If the digest differs at any stage → **BLOCKED**.

## 1.3 What CI Does (Not Claude, Not Operator)

| Step | Who | Where |
|------|-----|-------|
| Write code | Claude | Local (VS Code) |
| Build Docker images (14 services) | CI | GitHub Actions cloud runner |
| Run typecheck | CI | GitHub Actions cloud runner |
| Run lint | CI | GitHub Actions cloud runner |
| Run unit tests | CI | GitHub Actions cloud runner |
| Run integration tests | CI | GitHub Actions cloud runner |
| Run E2E tests | CI | GitHub Actions cloud runner |
| Deploy to staging | CI | GCP Cloud Run |
| Run staging smoke tests | CI | GitHub Actions → GCP |
| Health checks (every 5 min) | CI | GitHub Actions scheduled |

**Claude never builds. Operator never builds. CI builds.**

## 1.4 The Complete Development Cycle (Git ↔ GCP Only)

No local tools. No local Docker. No local database. Everything happens between Git and GCP:

```
┌─────────────────────────────────────────────────────────┐
│                  DEVELOPMENT CYCLE                       │
│                                                          │
│  Claude writes code (VS Code)                            │
│       ↓                                                  │
│  git push branch                                         │
│       ↓                                                  │
│  GitHub Actions CI:                                      │
│    • Builds 14 Docker images                             │
│    • Runs typecheck, lint, unit, integration, E2E        │
│    • All green → merge to main                           │
│       ↓                                                  │
│  [At phase boundary]                                     │
│  CI deploys to GCP Cloud Run staging                     │
│       ↓                                                  │
│  Operator tests NEW behavior on staging                  │
│       ↓                                                  │
│  Issues found? → Create tickets → Loop back to top       │
│  All green? → Promote to production (same artifact)      │
└─────────────────────────────────────────────────────────┘
```

**There is NO step that requires local Docker, local builds, or local testing infrastructure.**
**The operator's machine only needs: VS Code + Git + a browser (for staging testing).**

## 1.5 "Fix on Staging" Workflow (No Back-and-Forth)

When issues are found on staging, there is NO repeated deploy-test-fix-deploy cycle per ticket:

```
WRONG (old way — endless back-and-forth):
  Deploy → Test → Find bug → Fix → Deploy → Test → Find bug → Fix → Deploy → ...

RIGHT (phase-boundary approach):
  1. Deploy phase N to staging (one deploy)
  2. Operator tests all new features (one session)
  3. ALL issues logged as tickets (batch)
  4. Claude fixes ALL tickets on Git (one at a time, CI validates each)
  5. After ALL fixes merged: ONE re-deploy to staging
  6. Operator re-tests ONLY the reported issues
  7. If new issues → repeat from step 3 (but shrinking each round)
  8. Zero issues → promote to production
```

**Key: Staging deploys happen at phase boundaries and after fix batches. NOT per-ticket.**
**This means 5-10 staging deploys total, not 1000.**

## 1.6 Locked Test Suites on GCP (Q2 — "Lock and Never Change")

Once a phase of tickets passes CI and deploys to staging:
- Those tests are **locked** — they become permanent regression tests
- Every future PR runs ALL locked tests from ALL previous phases
- Tests accumulate: Phase 1 (70) → Phase 2 (220) → Phase 3 (530) → Phase 4 (800+)
- A locked test can NEVER be deleted without operator approval + replacement test

---

# PART 2: THE TICKET SYSTEM (Q6 — Tracking 1000+ Tickets)

## 2.1 Ticket Graph on GitHub

```
GitHub Issues:
  - Labels: phase/1-security, phase/2-broken-func, phase/3-data-integrity,
            phase/4-ux, phase/5-hardening
  - Labels: layer/schema, layer/backend, layer/gateway, layer/frontend, layer/pos
  - Labels: risk/A, risk/B, risk/C, risk/D, risk/E, risk/F
  - Labels: platform/retailer, platform/supplier, platform/superadmin, platform/pos,
            platform/backend, platform/cross-platform
  - Labels: priority/P0, priority/P1, priority/P2
  - Milestones: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5A, Phase 5B, ...
  - Sub-issues: parent-child tracking for spawned tickets
```

## 2.2 One Ticket = One Branch = One PR = One Tag

For EVERY ticket (no exceptions):

```
1. git checkout main && git pull
2. git checkout -b fix/TICKET-ID-slug
3. Write failing test FIRST (must fail on current main)
4. Write fix (minimal scope)
5. Push branch → CI runs ALL gates
6. All green → open PR
7. Merge → tag prestage-TICKET-ID-YYYY-MM-DD_HHMMIST
8. Next ticket
```

**Never:**
- Bundle multiple tickets into one PR
- Start next ticket before current is merged + tagged
- Push directly to main
- Create a second PR under the same ticket ID after first is merged

## 2.3 Sub-Ticket Spawning Protocol

When Claude discovers a new issue while fixing ticket X:

```
1. STOP fixing X
2. Classify: Is the new issue BLOCKING X or NON-BLOCKING?

IF BLOCKING:
   → Create issue immediately with spawned-from/TICKET-X label
   → Create reg/CASCADE-NNN branch
   → Fix cascade, merge, return to X

IF NON-BLOCKING:
   → Create issue with spawned-from/TICKET-X label
   → Add to backlog with correct phase/priority
   → Continue with X (do NOT fix inline)
```

## 2.4 Phase Execution Order

| Phase | Scope | Deploy to Staging? |
|-------|-------|--------------------|
| **Phase 1** | Security (P0+P1) | YES — after ALL green |
| **Phase 2** | Broken Functionality (P0+P1) | YES — after ALL green |
| **Phase 3** | Data Integrity & Auth (P1) | YES — after ALL green |
| **Phase 4** | UX & Polish (P1 + top P2) | YES — after ALL green |
| **Phase 5** | Hardening (P2s) | Batched deploys (5A, 5B, etc.) |

**Staging deploys happen at phase boundaries, not per-ticket.**

## 2.5 Layer Ordering Within Each Phase (Bottom-Up)

```
Layer 1: DB Migrations / Schema    (always first)
Layer 2: Backend Core (routes, middleware, services)
Layer 3: API Gateway (routing, auth)
Layer 4: Frontend Portals (Retailer → Supplier → SuperAdmin)
Layer 5: POS Mobile App
```

**Rule**: Never start a higher layer if a lower layer has failing gates.

## 2.6 High-Contention Files (Sequence These)

These files have 3+ tickets touching them. Fix ALL tickets for each file consecutively:

- `supermandi-superadmin/src/App.tsx` — ~15 tickets
- `backend/src/routes/v1/pos/bnpl.ts` — 3 tickets
- `supplier-portal/src/lib/api.ts` — 3 tickets
- `retailer-admin/src/lib/api.ts` — 3 tickets
- `src/services/api/apiClient.ts` — 3 tickets

---

# PART 3: OPERATOR-CLAUDE ROLES (Q7 — Breaking the Regression Trap)

## 3.1 The Problem This Solves

Old cycle (broken):
```
Operator tests → finds bugs → Claude fixes → introduces regressions →
Operator retests → finds more bugs → Claude fixes → more regressions →
∞ (never ends)
```

## 3.2 The Three Roles

| Role | Responsibility | Does NOT Do |
|------|---------------|-------------|
| **Claude** | Writes code, writes tests, runs local checks, pushes | Deploy, approve, sign off |
| **CI Pipeline** | Builds, tests EVERYTHING, deploys to staging | Write code, make decisions |
| **Operator** | Reviews evidence, tests NEW behavior only, approves | Write tests, fix bugs, debug |

**Key principle: If the operator finds a bug, the process already failed.**
The bug should have been caught by Claude's tests or CI. Finding it at operator review means Claude missed it.

## 3.3 Operator's Actual Workflow

**During fix cycles (Phase work):** Operator does NOTHING. Claude works. CI validates.

**At phase boundaries:** Operator reviews evidence pack (~1 minute per ticket):

```
Per-ticket operator checklist:
  [ ] CI green? (check GitHub Actions badge)
  [ ] PR description has evidence? (screenshot / curl / SQL)
  [ ] Risk assessment honest? (not "should work")
  [ ] Rollback noted? (revert commit hash)
  → APPROVE or REJECT with specific reason
```

**At staging deploy:** Operator does focused acceptance testing:
- Tests only NEW behavior from this phase
- Regression testing is CI's job (operator never retests old features)
- Any bug found → ticket with P0/P1/P2 → Claude fixes → CI re-validates

**At production promotion:** Single click. Same artifact. No rebuild.

## 3.4 When Operator Reports Issues

When operator reports N issues after staging:

```
1. Claude TRIAGES ALL N issues first (classify, prioritize, group)
2. Claude identifies which are duplicates, which are related, which are independent
3. Claude fixes ONE at a time (one ticket = one PR)
4. After each fix: CI runs ALL tests (including all previous locked tests)
5. After ALL N fixes merged: full regression pass on main
6. Redeploy to staging from new tag
7. Operator re-tests ONLY the N reported issues (not everything)
```

**Claude NEVER fixes operator issues blindly.** Triage first, then fix one by one.

---

# PART 4: CLAUDE'S 7 LAWS (Q3, Q8 — Zero Regression Discipline)

## 4.1 The 7 Laws (Inviolable)

| # | Law | Violation = |
|---|-----|-------------|
| **1** | No code without a test | Cannot push |
| **2** | No push without all local checks green | Cannot open PR |
| **3** | No merge without CI green | PR stays open |
| **4** | No staging deploy without immutable tag | Deploy blocked |
| **5** | No production without staging pass | Promote blocked |
| **6** | No skip on any failure (even "minor") | Create ticket |
| **7** | No "works on my machine" — only CI results matter | CI overrides local |

## 4.2 Per-Ticket Discipline (8 Steps)

For EVERY ticket Claude works on:

```
STEP 1: ANNOUNCE
   "Starting TICKET-ID: [description]
    Risk Class: [A-F]
    Files in scope: [list]
    Cross-platform impact: [analysis]"

STEP 2: WRITE FAILING TEST FIRST
   - Write a test that PROVES the bug exists (must fail on current main)
   - If it passes on main → the test doesn't test what you think

STEP 3: WRITE THE FIX
   - Minimal scope — fix ONLY what the ticket describes
   - No refactoring, no cleanup, no "while I'm here"
   - Production-grade from the start (no temp fixes)

STEP 4: RUN ALL GATES LOCALLY
   pnpm -r typecheck    → must pass
   pnpm -r build        → must pass
   pnpm test            → must pass (including new test)

   If ANY fails → fix → re-run ALL from typecheck (not just the failed one)

STEP 5: PUSH BRANCH
   git push -u origin fix/TICKET-ID-slug

STEP 6: CI VALIDATES
   - Wait for CI to complete (all 6 gates)
   - If CI fails → fix locally → push → repeat
   - NEVER merge with failing CI

STEP 7: MERGE
   - All CI green → merge PR to main
   - Tag: prestage-TICKET-ID-YYYY-MM-DD_HHMMIST

STEP 8: PER-TICKET REPORT
   "TICKET-ID DONE:
    - Fix: [one-line summary]
    - Test added: [test file + what it validates]
    - Evidence: [CI link / screenshot / curl]
    - Risk: [what could break if this is wrong]
    - Cross-platform: [which portals affected]"
```

## 4.3 Failure Scenarios (Claude MUST Follow These)

| Scenario | WRONG Response | RIGHT Response |
|----------|---------------|----------------|
| Test passes but you're not sure it tests the right thing | "Test passes, moving on" | Verify test fails when fix is reverted |
| CI fails on unrelated test | Skip it, merge anyway | Fix the unrelated failure FIRST (cascade) |
| Fix works but breaks another portal | "Will fix in next ticket" | STOP. Fix now. Same PR or cascade ticket. |
| Operator says "just ship it" | Ship it | "I cannot ship with failing tests. Here's what needs fixing." |
| You find an issue not in the ticket | Fix it inline | Create new ticket. Continue current ticket. |

---

# PART 5: 8 GUARDRAILS (Q4, Q9 — Preventing Claude Mistakes)

## 5.1 Guardrail 1: Cross-Platform Impact Matrix (Automated in CI)

CI automatically determines test scope based on changed files:

```
IF changed: backend/src/middleware/*
   → Run ALL tests (middleware affects everything)

IF changed: backend/src/routes/v1/pos/*
   → Run POS tests + Retailer tests (POS routes used by both)

IF changed: retailer-admin/src/*
   → Run Retailer E2E + Retailer unit tests

IF changed: backend/src/routes/v1/supplier/*
   → Run Supplier tests + SuperAdmin tests (admin manages suppliers)

IF changed: backend/migrations/*
   → Run ALL tests + verify backward compatibility

IF changed: api-gateway/*
   → Run ALL tests (gateway routes everything)
```

**If a file matches no pattern → Claude MUST explicitly state and manually determine tests.**

## 5.2 Guardrail 2: Pre-Code Checklist (Every PR)

Before writing any code, Claude answers these 5 questions:

```
1. Which portals does this touch? [Retailer / Supplier / SuperAdmin / POS / Backend]
2. Does it change an API response shape? [Yes → contract test required]
3. Does it change middleware order? [Yes → ALL portal tests required]
4. Does it change auth/session logic? [Yes → security test + ALL portal login tests]
5. Does it change DB schema? [Yes → migration test + backward compatibility check]
```

**If any answer is "I'm not sure" → research before coding. Never guess.**

## 5.3 Guardrail 3: Architecture Tests (Enforced by CI)

Automated tests that enforce project rules:

```
Rule: No storeId from client
   → Test: grep all routes for req.body.storeId usage (must be 0)

Rule: All mutation routes have auth middleware
   → Test: parse route files, verify auth middleware on POST/PUT/DELETE

Rule: No hardcoded URLs
   → Test: grep for http://localhost or hardcoded IPs in source (must be 0)

Rule: No test.skip()
   → Test: grep for test.skip / it.skip / describe.skip (must be 0)

Rule: All routes have tests
   → Test: compare registered routes vs test coverage

Rule: Portals use env vars for API URLs
   → Test: grep portal source for hardcoded API URLs (must be 0)
```

## 5.4 Guardrail 4: Contract Tests (API Shape Lock)

Every API endpoint has a contract test that locks its response shape:

```
Example: GET /api/v1/pos/dues
   Response MUST contain: { data: { dues: [{ id, amount, customer, ... }] } }

   If Claude changes the shape → contract test fails → CI blocks merge
   If shape change is intentional → update contract + update ALL consumers
```

**Contract tests prevent Claude from accidentally breaking portal-to-backend integration.**

## 5.5 Guardrail 5: Cross-Platform E2E Matrix

| Flow | Retailer | Supplier | SuperAdmin | POS |
|------|----------|----------|------------|-----|
| Login | Test | Test | Test | Test |
| Registration | Test | Test | N/A | N/A |
| Product CRUD | Test | Test | Test (view) | Test (scan) |
| Order flow | Test | Test (receive) | Test (view) | Test (create) |
| Payment | Test | N/A | Test (view) | Test (collect) |
| Stock | Test (view) | N/A | Test (view) | Test (adjust) |
| User mgmt | N/A | N/A | Test | N/A |

**Every cell marked "Test" has at least one automated E2E test in CI.**

## 5.6 Guardrail 6: Root Cause Enforcement (No Band-Aids)

Claude is forbidden from:
- TODO/FIXME/HACK comments (fix it now or create ticket)
- Empty catch blocks (`catch (e) {}`)
- `any` type in TypeScript (type it properly)
- `console.log` in production code (use proper logger)
- `// eslint-disable` without inline justification
- Wrapping errors in try-catch just to silence them
- Adding `?` optional chaining as a fix for null errors (fix the source)

**If Claude writes a band-aid → CI architecture test catches it → PR blocked.**

## 5.7 Guardrail 7: Regression Snapshot Lock

At each phase boundary:
```
1. All tests from Phase N are "snapshotted" (locked)
2. These locked tests run on EVERY PR from Phase N+1 onward
3. If a Phase N+1 ticket breaks a Phase N test → PR blocked
4. Claude must fix the regression before proceeding

Test accumulation:
  Phase 1 complete: 70 locked tests
  Phase 2 complete: 70 + 150 = 220 locked tests
  Phase 3 complete: 220 + 310 = 530 locked tests
  Phase 4 complete: 530 + 270 = 800 locked tests
  Phase 5: 800+ locked tests guard everything
```

**Result: Operator finds fewer bugs each phase (trending toward 0).**

## 5.8 Guardrail 8: Scoreboard (Visible to Operator)

CI maintains a quality dashboard:

```
Phase 1 Progress:
  Tickets completed: 12/15
  Tests added: 68
  CI passes: 12/12 (100%)
  Regressions caught by CI: 3 (all fixed)
  Regressions found by operator: 0

  Current ticket: SEC-013
  Last merge: 2h ago
  Next phase boundary: ~3 tickets away
```

**Operator can see progress at any time without asking Claude.**

---

# PART 6: CLAUDE'S STATE MACHINE (Q10 — Persistent Context)

## 6.1 Purpose

Claude loses context between sessions. This state machine ensures Claude always knows:
- Where it is in the overall plan
- What it was doing when context was lost
- What to do next
- What NOT to do

## 6.2 State File Structure

Claude maintains this state in `RELEASES/CLAUDE_CURRENT_STATE.json`:

```json
{
  "currentPhase": "Phase 1: Security",
  "currentTicket": {
    "id": "SEC-007",
    "status": "IN_PROGRESS",
    "branch": "fix/SEC-007-xss-sanitize",
    "step": "STEP 4: Running gates",
    "startedAt": "2026-02-13T10:00:00Z"
  },
  "ticketQueue": [
    { "id": "SEC-008", "priority": "P0", "layer": "backend" },
    { "id": "SEC-009", "priority": "P1", "layer": "frontend" }
  ],
  "operatorIssues": [],
  "phaseSnapshot": {
    "totalTickets": 15,
    "completed": 6,
    "inProgress": 1,
    "testsLocked": 42,
    "ciPasses": 6,
    "operatorBugsFound": 0
  },
  "blockedItems": [],
  "lastActions": [
    "Merged SEC-006 → main (tag prestage-SEC-006-2026-02-13)",
    "Started SEC-007",
    "Wrote failing test for XSS in supplier name field",
    "Implementing sanitization in backend/src/middleware/sanitize.ts"
  ],
  "regressionTracker": {
    "cascadesThisPhase": 0,
    "operatorBugsThisPhase": 0,
    "ciCatchesThisPhase": 3
  }
}
```

## 6.3 Context Recovery Protocol

When Claude starts a new session (or loses context):

```
1. Read RELEASES/CLAUDE_STATE.md (this file — rules)
2. Read RELEASES/CLAUDE_CURRENT_STATE.json (live state)
3. Run: git log --oneline -10 && git status
4. Compare git state with CLAUDE_CURRENT_STATE.json
5. If mismatch → reconcile (git is truth, update state file)
6. Announce: "Resuming [ticket] at [step]. Phase progress: [X/Y]."
7. Continue from where state file says
```

**Claude NEVER starts from scratch. Always resumes from state.**

## 6.4 State Update Rules

Claude updates `CLAUDE_CURRENT_STATE.json` at these moments:
- Starting a new ticket (update currentTicket)
- Completing a step within a ticket (update step)
- Merging a PR (move ticket to completed, advance queue)
- Discovering a blocking issue (add to blockedItems)
- Receiving operator issues (add to operatorIssues with triage)
- Completing a phase (update phaseSnapshot, archive)

---

# PART 7: 10 NAVIGATION RULES (Q10 — Dynamic Decision-Making)

## Rule 1: One Thing At a Time

```
ALWAYS: Work on exactly ONE ticket
NEVER:  Start ticket B while ticket A is in progress
NEVER:  "I'll fix this other thing while I'm here"
```

## Rule 2: Never Start Next While Current Is Pending

```
IF currentTicket.status == "IN_PROGRESS" OR "WAITING_CI" OR "WAITING_REVIEW":
   → Continue working on current ticket
   → Do NOT pick up next ticket
   → Do NOT explore other issues
```

## Rule 3: Operator Issues Are Triaged, Not Blindly Fixed

```
When operator reports issues:
  1. STOP current work (save state)
  2. Triage ALL reported issues:
     - Classify: P0 (blocker) / P1 (critical) / P2 (important)
     - Group: Which are related? Which are duplicates?
     - Order: Fix P0s first, then P1s, then P2s
  3. Present triage to operator for confirmation
  4. Fix ONE at a time (one ticket = one PR)
  5. After ALL fixed: full regression on main
```

## Rule 4: Regression Fix Gets Root Cause Analysis

```
When a regression is found (by CI or operator):
  1. STOP
  2. Identify: Which commit introduced it? (git bisect)
  3. Classify: Is it a real regression or a pre-existing bug?
  4. If regression: Fix the ROOT CAUSE, not the symptom
  5. Add test that catches this specific regression pattern
  6. Verify fix doesn't introduce new regressions
```

**NO band-aid fixes. NO "just add a null check." Find WHY it broke.**

## Rule 5: Context Recovery Is Automatic

```
At session start:
  1. Read this file (rules)
  2. Read CLAUDE_CURRENT_STATE.json (live state)
  3. git log + git status (verify)
  4. Resume from state

Claude NEVER asks operator "where were we?"
Claude NEVER re-reads the entire codebase.
Claude ALWAYS knows exactly where it left off.
```

## Rule 6: 10-Issue Batch Protocol

When operator reports 10+ issues at once:

```
1. Create all 10 as GitHub Issues (with labels, priority, platform)
2. Triage: group by root cause (10 symptoms might be 3 root causes)
3. Order by dependency: fix backends before frontends
4. Present summary to operator:
   "10 issues reported → 7 unique (3 duplicates)
    3 backend, 2 retailer, 2 POS
    Estimated: 7 PRs, fix order: B-001, B-002, B-003, R-001, R-002, P-001, P-002"
5. Fix ONE at a time
6. After each fix: CI runs ALL tests (including locked phase tests)
7. After ALL 7 fixed: full regression on main
8. Redeploy to staging
9. Operator re-tests ONLY the 10 reported issues
```

## Rule 7: Scope Lock

```
During a ticket fix:
  - Fix ONLY what the ticket describes
  - If you see a bug → create new ticket, do NOT fix inline
  - If you see ugly code → leave it, do NOT refactor
  - If you see a missing test → create ticket for it, do NOT write it now

  EXCEPTION: Cascade regression (blocking current ticket)
  → Fix in separate branch, merge, return to current ticket
```

## Rule 8: Cross-Platform Awareness Check

Before EVERY commit, Claude asks itself these 5 questions:

```
1. Does this change affect the API response shape?
   → If yes: check all 4 portal consumers

2. Does this change affect middleware execution order?
   → If yes: run ALL portal tests

3. Does this change affect auth/session/token logic?
   → If yes: test login on ALL 4 portals

4. Does this change affect database schema?
   → If yes: verify backward compatibility with all services

5. Does this change affect shared utilities (lib/, utils/)?
   → If yes: trace all importers, test each
```

## Rule 9: Never Guess, Always Verify

```
BANNED: "This should work"        → Prove it with a test
BANNED: "I think this is fine"    → Run the gate
BANNED: "Probably won't break"    → Check cross-platform matrix
BANNED: "Seems correct"           → Show evidence
BANNED: "I assume"                → Verify assumption

IF you cannot verify → mark as BLOCKED → create ticket
```

## Rule 10: State File Updated in Real Time

```
After EVERY significant action:
  - Update CLAUDE_CURRENT_STATE.json
  - Update lastActions array
  - Update counters (completed, tests, etc.)

Claude's state file is ALWAYS current.
If Claude crashes → next session reads state file → resumes exactly.
```

---

# PART 8: TESTING RULES (Consolidated from Q2, Q3, Q8)

## 8.1 Evidence Triplet (Every Test Claim)

| Evidence Type | Required Content |
|---------------|-----------------|
| **UI Evidence** | Screenshot or Playwright screenshot |
| **API Evidence** | Method + endpoint + status code + response shape |
| **DB Evidence** (if data changes) | SQL query + result proving the change |

**No evidence → no PASS. No exceptions.**

## 8.2 Banned Phrases in Test Results

These phrases are FORBIDDEN in any Claude output about test results:
- "should work"
- "looks fine"
- "seems"
- "likely"
- "probably"
- "I assume"
- "I think it's okay"

**If Claude cannot verify → BLOCKED → create ticket.**

## 8.3 Evidence Per Risk Class

| Risk Class | Fix Type | Required Evidence |
|------------|----------|-------------------|
| A | UI/copy only | Screenshot before + after |
| B | API/logic | Screenshot + API response JSON |
| C | Auth/OTP | Video + console logs + network tab |
| D | Routing | curl with headers showing correct routing |
| E | DB/schema | SQL query + result proof |
| F | Infra/Docker | Build logs + container health |

## 8.4 Failure Injection (Mandatory)

For each portal's primary flow, these MUST be tested:

| Failure | Expected UX | If Unsafe → |
|---------|-------------|-------------|
| Invalid/expired token (401) | Redirect to login + message | P0 ticket |
| Backend 500 | Error boundary, safe UI | P1 ticket |
| Network drop mid-submit | No double-write, retry safe | P0 ticket |
| Duplicate click/submit | Idempotency holds | P1 ticket |
| Timeout | Loading state → timeout message | P2 ticket |

## 8.5 10,000 Store Readiness (P0 if Missing)

| Requirement | Check |
|-------------|-------|
| Pagination everywhere | No unbounded list fetches |
| Search debounce | Search inputs debounced, results capped |
| List virtualization | Large lists use virtual scroll |
| No "load all rows" | Every list query has LIMIT/OFFSET |
| API timeouts | Timeouts set, retries idempotent |
| Store isolation | Store A cannot see Store B data (storeId from JWT only) |

---

# PART 9: GCP DEPLOYMENT RULES (Consolidated from Q2, Q3, Q5)

## 9.1 Artifact Rules

```
- Build container image from RC SHA in CI
- Tag with: :<GIT_SHA> AND store digest @sha256:...
- PROHIBITED: deploying :latest, rebuilding "same SHA" with different contents
- /version endpoint MUST return the deployed SHA
```

## 9.2 Database Migration Rules

```
Policy: Expand → Deploy → Contract
  1. Expand: add columns/tables/indexes (no breaking changes)
  2. Deploy: new code reads/writes new + supports old
  3. Contract: remove old columns AFTER everything upgraded (separate ticket)

Mandatory:
  - Migration is idempotent (safe to re-run)
  - Rollback strategy exists
  - No long locks
  - Forward-only in production (no ALTER COLUMN TYPE in peak hours)

FORBIDDEN:
  - DROP/RENAME columns used by current services in same deploy
  - Breaking enum changes without compatibility layer
```

## 9.3 Config Drift Prevention

Claude maintains env var parity between environments:
- Every new env var → documented in PR + set in staging before deploy
- Secret values → GCP Secret Manager (never in code)
- Feature flags → documented with expected state per environment
- URLs → env vars (never hardcoded)

## 9.4 Staging Deploy Protocol

At phase boundary (all tickets green on main):

```
1. Tag: git tag phase-N-complete-YYYY-MM-DD on main
2. Push tag: git push origin --tags
3. CI builds from tag (NOT from HEAD)
4. CI deploys to staging from built artifact
5. CI runs staging smoke tests
6. Operator reviews evidence + tests NEW behavior
7. Operator sign-off → ready for production promotion

IF staging fails:
  → Create fix ticket(s)
  → Fix using same one-ticket-one-PR flow
  → Re-tag, re-deploy, re-verify
  → NEVER hot-patch staging directly
```

## 9.5 Production Promotion

```
1. Same artifact from staging (no rebuild)
2. Single traffic shift (Cloud Run revision)
3. Post-deploy health checks (automated)
4. Rollback available: single action (shift back to previous revision)
5. Monitor for 15 minutes after promotion
```

## 9.6 CI Trigger Health Check

After pushing a branch / opening a PR:
```
1. Confirm CI check-suites appear within 2-3 minutes
2. If NO checks after 3 minutes → STOP + label as INFRA-CI-BLOCKED
3. Never merge a PR that has zero CI runs without operator sign-off
```

---

# PART 10: EMERGENCY PROCEDURES

## 10.1 Emergency Rule

```
IF something breaks under pressure:
  1. STOP immediately
  2. Revert to last green tag (Cloud Run → shift traffic to previous revision)
  3. Do NOT hot-patch production
  4. Do NOT "quick fix" and redeploy
  5. Create ticket, fix properly, go through full CI cycle
```

## 10.2 Rollback Protocol

```
Staging rollback:
  gcloud run services update-traffic <service> --to-revisions=<previous>=100

Production rollback:
  gcloud run services update-traffic <service> --to-revisions=<previous>=100

Time target: < 5 minutes from decision to rollback complete
```

## 10.3 When Claude MUST Stop and Ask Operator

- Any P0 blocker discovered
- CI infrastructure not triggering (INFRA-CI-BLOCKED)
- Merge conflict on main that requires human judgment
- Ticket requirements are ambiguous
- Operator-reported issue doesn't reproduce
- Fix would require breaking an API contract

---

# PART 11: FORBIDDEN ACTIONS (Absolute)

Claude MUST NEVER:

| Category | Forbidden Action |
|----------|-----------------|
| **Deploy** | Deploy without all CI gates green |
| **Deploy** | Skip staging → go direct to production |
| **Deploy** | Deploy from HEAD instead of immutable tag |
| **Deploy** | Use `:latest` tag for any deployment |
| **Code** | Fix things not in an approved ticket |
| **Code** | Make "quick fixes" without ticket ID |
| **Code** | Hardcode URLs, IPs, or secrets in source code |
| **Code** | Use `test.skip()`, `it.skip()`, `describe.skip()` |
| **Code** | Add TODO/FIXME/HACK comments instead of fixing |
| **Code** | Use `any` type as a fix |
| **Code** | Silence errors with empty catch blocks |
| **Process** | Auto-advance past a sign-off boundary |
| **Process** | Expand scope during a fix cycle |
| **Process** | Bundle multiple tickets into one PR |
| **Process** | Start next ticket before current is merged |
| **Process** | Merge PR with zero CI runs |
| **Process** | Declare "done" without CI green |
| **Database** | Modify production database directly |
| **Database** | Drop/rename columns in same deploy as code change |
| **Testing** | Claim PASS without Evidence Triplet |
| **Testing** | Use banned phrases in test results |
| **Testing** | Skip failure injection tests |
| **Testing** | Delete locked phase tests without operator approval |
| **Git** | Push directly to main |
| **Git** | Force push to any shared branch |
| **Git** | Create second PR under same ticket ID |

---

# PART 12: DECISION ALGORITHM (Claude's Flowchart)

At every decision point, Claude follows this algorithm:

```
START
  │
  ├─ Am I in the middle of a ticket?
  │   YES → Continue that ticket (go to current step)
  │   NO  → ▼
  │
  ├─ Are there operator-reported issues?
  │   YES → Triage ALL first → Fix highest priority → One at a time
  │   NO  → ▼
  │
  ├─ Are there blocked items?
  │   YES → Can I unblock? → YES: unblock → NO: ask operator
  │   NO  → ▼
  │
  ├─ Am I at a phase boundary?
  │   YES → Full regression on main → Deploy to staging → STOP (wait for operator)
  │   NO  → ▼
  │
  ├─ What's the next ticket in the queue?
  │   → Pick it → Announce → Start from Step 1
  │
  └─ Queue empty?
      → Phase complete → Run completion checklist → STOP (wait for operator)
```

---

# PART 13: COMMUNICATION PROTOCOL

## 13.1 Starting a Ticket

```
Starting TICKET-ID: [description]
Risk Class: [A-F]
Phase: [1-5]
Layer: [schema/backend/gateway/frontend/pos]
Files in scope: [list]
Cross-platform impact: [which portals affected]
```

## 13.2 When Blocked

```
BLOCKED: [specific reason]
Affected ticket: TICKET-ID
Options:
  1. [option with pros/cons]
  2. [option with pros/cons]
Recommended: [which option and why]
```

## 13.3 When Done

```
TICKET-ID DONE:
- Fix: [one-line summary]
- Test: [test file + what it validates]
- Evidence: [CI link / screenshot / curl]
- Risk: [what could break]
- Cross-platform: [portals affected/tested]
- Rollback: git revert <hash>
```

## 13.4 Phase Boundary Report

```
PHASE N COMPLETE:
- Tickets: [X/Y completed]
- Tests locked: [count]
- CI passes: [X/X]
- Regressions caught by CI: [count]
- Regressions found by operator: [count]
- Ready for staging deploy: [YES/NO]
```

---

# PART 14: SESSION STARTUP CHECKLIST

Every new Claude session, EXACTLY this sequence:

```
1. Read RELEASES/CLAUDE_STATE.md           (this file — rules)
2. Read RELEASES/CLAUDE_CURRENT_STATE.json (live state)
3. Read RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md (memory sync pack)
4. Run pnpm workflow:validate && pnpm workflow:monitor
5. git log --oneline -10 && git status     (verify git matches state)
6. Reconcile any differences (git is truth)
7. Announce: "Resuming [ticket] at [step]. Phase: [N], Progress: [X/Y]"
8. Continue work
```

**Claude NEVER asks "what should I work on?" — the state file tells it.**
**Claude NEVER re-reads the entire codebase — it knows exactly where it was.**

---

# PART 15: DEFINITION OF DONE

## 15.1 Per-Ticket Done

- [ ] Failing test written (proves the bug)
- [ ] Fix implemented (minimal scope)
- [ ] All gates green (typecheck + build + test)
- [ ] CI green (all 6 gates on GitHub Actions)
- [ ] PR merged to main
- [ ] Tag created on main
- [ ] State file updated
- [ ] Per-ticket report posted

## 15.2 Per-Phase Done

- [ ] All tickets in phase merged + tagged
- [ ] Full gate suite green on main HEAD
- [ ] Phase tag on main
- [ ] Staging deployed from tag
- [ ] CI staging smoke tests pass
- [ ] Operator reviews evidence
- [ ] Operator sign-off recorded
- [ ] Phase tests locked (snapshot)

## 15.3 Project Done (Go-Live)

- [ ] All phases complete (1-5)
- [ ] All portals pass acceptance testing (Retailer, Supplier, SuperAdmin, POS)
- [ ] POS money flow verified (scan → sell → bill → payment)
- [ ] 800+ locked tests all green
- [ ] Production promotion: same artifact as staging
- [ ] Post-deploy health checks pass
- [ ] Operator sign-off on production
- [ ] Rollback plan documented and tested

---

# PART 16: MCP INFERENCE PROTOCOL (Gather Before Code — Never Guess)

> **Rule:** Before writing ANY code for a ticket, Claude MUST query live infrastructure via MCP tools to understand the ACTUAL state. No assumptions. No guessing. Code only what the evidence proves is needed.

## 16.1 The Three MCP Sources

Claude has three MCP interfaces for gathering live state:

| MCP Tool | What It Queries | When to Use |
|----------|----------------|-------------|
| `mcp__gcloud__run_gcloud_command` | GCP Cloud Run, Cloud SQL, Secrets, IAM, Load Balancer | Service config, env vars, deployed state, infra |
| `mcp__staging-db__query` | Staging PostgreSQL database directly | Schema, constraints, indexes, sample data |
| `mcp__github__*` | GitHub issues, PRs, code, reviews | Ticket details, existing fixes, PR status |

## 16.2 Pre-Ticket Inference Checklist

**Before writing the FIRST line of code for any ticket, Claude MUST complete:**

### Step 1: Read the GitHub Issue
```
→ mcp__github__issue_read (method: "get", issue_number: N)
→ Extract: files to modify, GCP parity aspects, ZRP gates, acceptance criteria
```

### Step 2: Query GCP for Affected Services
For backend tickets:
```
→ gcloud run services describe main-backend --region=asia-south1 --format=json(spec.template.spec.containers[0].env)
→ Extract: current env vars, secrets, resource limits
```
For portal tickets:
```
→ gcloud run services describe <service-name> --region=asia-south1 --format=json
→ Extract: image digest, env vars, resource config
```
For routing/CORS tickets:
```
→ gcloud compute url-maps describe supermandi-staging-urlmap --format=json
→ gcloud compute backend-services list --format=json(name,backends)
→ Extract: current routing rules, backend mappings
```

### Step 3: Query Staging DB for Schema (if data/query ticket)
```
→ mcp__staging-db__query: SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '<table>'
→ mcp__staging-db__query: SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '<table>'
→ mcp__staging-db__query: SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = '<table>'::regclass
→ Extract: actual columns, types, indexes, constraints
```

### Step 4: Read the Actual Source Files
```
→ Read each file listed in the ticket
→ Find the exact lines referenced
→ Understand the current code before changing it
```

### Step 5: Cross-Reference GCP vs Code
```
→ Compare: env vars in GCP vs env vars referenced in code
→ Compare: secrets in Secret Manager vs secret references in code
→ Compare: routing rules in URL map vs routes in code
→ Flag any mismatches as additional fixes
```

## 16.3 Per-Category Inference Queries

### Security Tickets (#104-#110)
```bash
# What secrets exist in GCP?
gcloud secrets list --format=json(name)

# What env vars does the service actually have?
gcloud run services describe main-backend --region=asia-south1 --format=json(spec.template.spec.containers[0].env)

# Is CORS configured at LB level or app level?
gcloud compute backend-services describe api-gateway-backend --global --format=json(securityPolicy,customResponseHeaders)
```

### Store Isolation Tickets (#108, #112, #149)
```sql
-- What tables are store-scoped?
SELECT table_name FROM information_schema.columns WHERE column_name = 'store_id';

-- Do store-scoped tables have store_id indexes?
SELECT tablename, indexdef FROM pg_indexes WHERE indexdef LIKE '%store_id%';

-- What constraints exist on store_id?
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint WHERE pg_get_constraintdef(oid) LIKE '%store_id%';
```

### Connection / DB Tickets (#111, #115)
```sql
-- Current connection pool state
SELECT count(*) as active_connections FROM pg_stat_activity WHERE datname = 'supermandi';

-- Table sizes for pagination decisions
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;

-- Check for missing indexes on frequently queried columns
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats WHERE tablename IN ('stores','store_products','inventory_ledger','sales','bnpl_transactions');
```

### Portal Tickets (#117-#141)
```bash
# What does the portal actually serve? (check Dockerfile/server config)
gcloud run services describe <portal> --region=asia-south1 --format=json(spec.template.spec.containers[0])

# What headers does the portal return?
curl -sI https://staging.supermandi.tech/<portal-path>/ | grep -iE '(x-frame|content-security|strict-transport|cache-control)'

# Is the portal returning the latest build?
curl -s https://staging.supermandi.tech/<portal-path>/ | grep -oE 'index-[A-Za-z0-9]+\.(js|css)'
```

### Auth Tickets (#121, #129, #137, #148)
```bash
# Test current auth flow
curl -sI https://staging.supermandi.tech/api/v1/auth/me -H "Authorization: Bearer <expired-token>"
# → Should return 401 with JSON body

# Test CORS on auth endpoints
curl -sI -X OPTIONS https://staging.supermandi.tech/api/v1/auth/login -H "Origin: https://staging.supermandi.tech"
```

```sql
-- Auth-related tables and their structure
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name IN ('users','sessions','refresh_tokens','devices') ORDER BY table_name, ordinal_position;
```

## 16.4 Inference-to-Code Contract

After gathering MCP evidence, Claude MUST produce:

```
TICKET: #NNN
MCP EVIDENCE GATHERED:
  - GCP: [what was queried, key findings]
  - DB:  [schema/data findings, or "N/A — no DB changes"]
  - GitHub: [issue details, related PRs]
  - Live test: [curl/endpoint test results]

INFERRED FIX:
  - File: path/to/file.ts
  - Change: [precise description based on evidence]
  - Why: [evidence proves this change is needed]

GCP ALIGNMENT:
  - Env var X = Y in GCP ✓ (matches code reference)
  - Secret Z configured ✓ (matches code reference)
  - Route /path → service ✓ (matches URL map)

RISKS:
  - [What could break, based on actual deployed state]
```

## 16.5 Forbidden Actions (Never Do Without MCP Check)

| Action | MUST Query First |
|--------|-----------------|
| Change env var reference | `gcloud run services describe` → verify var exists |
| Change SQL query | `mcp__staging-db__query` → verify table/column exists |
| Change API route | `gcloud compute url-maps describe` → verify routing |
| Change secret reference | `gcloud secrets list` → verify secret exists |
| Change CORS config | `curl -X OPTIONS` → verify current CORS behavior |
| Change auth middleware | `curl -H "Authorization: Bearer ..."` → verify current auth |
| Add pagination | `SELECT count(*) FROM <table>` → verify row counts justify it |
| Add index | `SELECT * FROM pg_indexes WHERE tablename = ...` → verify doesn't exist |
| Change error format | `curl <endpoint>` → verify current error format |

## 16.6 GCP Quick-Reference (Actual Values)

```
PROJECT:           supermandi-backend
REGION:            asia-south1
STAGING_URL:       https://staging.supermandi.tech
AR_REPO:           asia-south1-docker.pkg.dev/supermandi-backend/supermandi

CLOUD RUN SERVICES:
  api-gateway      — API routing, JWT auth, CORS
  main-backend     — All 10 microservices (single container)
  retailer-admin   — Vite SPA (port 8080)
  supplier-portal  — Next.js (port 3000)
  superadmin       — Vite SPA (port 8080)
  landing          — Static HTML (port 8080)

CLOUD SQL:
  Instance:        supermandi-staging
  DB:              supermandi
  User:            postgres
  Connection:      /cloudsql/supermandi-backend:asia-south1:supermandi-staging

REDIS:
  Host:            10.107.71.27
  Port:            6379

SECRETS (Secret Manager):
  jwt-secret, database-url, postgres-password, admin-token, smtp-password

LOAD BALANCER:
  URL Map:         supermandi-staging-urlmap
  SSL Cert:        supermandi-staging-cert (staging.supermandi.tech, ACTIVE)
  Routes:
    /api/*, /health, /version → api-gateway-backend
    /retailer/*              → retailer-backend
    /supplier/*              → supplier-backend
    /admin/*                 → superadmin-backend
    / (default)              → landing-backend
```

## 16.7 Batch Execution MCP Cadence

During the batch audit fix sprint (#104-#150):

```
FOR EACH TICKET:
  1. Read GitHub issue (#N)
  2. Run category-specific MCP queries (16.3)
  3. Read affected source files
  4. Produce inference-to-code contract (16.4)
  5. Implement fix
  6. Verify fix aligns with GCP state
  7. Commit with message: "fix(#N): <description>"
  8. Move to next ticket

NO TICKET STARTS WITHOUT MCP EVIDENCE.
NO CODE CHANGES WITHOUT READING THE FILE FIRST.
NO ASSUMPTIONS ABOUT GCP STATE — QUERY IT.
```

---

# APPENDIX A: CROSS-PLATFORM TEST MATRIX

| Portal | Device | Method | Login Test | CRUD Test | Flow Test |
|--------|--------|--------|------------|-----------|-----------|
| Retailer Web | PC | Chrome Incognito | Yes | Yes | Yes |
| Supplier Web | PC | Chrome Incognito | Yes | Yes | Yes |
| SuperAdmin | PC | Chrome Incognito | Yes | Yes | Yes |
| POS App | Mobile | Expo Go | Yes | Yes | Yes |

## Business Logic Registry (10 Functions)

| # | Function | Portals Affected | Test Required |
|---|----------|-----------------|---------------|
| 1 | Barcode scan/resolve | POS, Retailer | Scan E2E |
| 2 | Product search | POS, Retailer, Supplier | Search E2E |
| 3 | Checkout/billing | POS | Checkout E2E |
| 4 | Stock-in/adjustment | POS, Retailer | Stock E2E |
| 5 | Store provisioning | SuperAdmin, Retailer | Provision E2E |
| 6 | Auth/login/OTP | ALL portals | Auth E2E |
| 7 | Supplier product catalog | Supplier, POS | Catalog E2E |
| 8 | Retailer SKU management | Retailer, POS | SKU E2E |
| 9 | Ledger/dues tracking | POS, Retailer | Ledger E2E |
| 10 | Pricing (MRP/selling) | POS, Retailer, Supplier | Price E2E |

---

# APPENDIX B: GCP INFRASTRUCTURE

| Service | GCP Resource | MCP Query |
|---------|-------------|-----------|
| API Gateway | Cloud Run `api-gateway` | `gcloud run services describe api-gateway --region=asia-south1` |
| Backend | Cloud Run `main-backend` | `gcloud run services describe main-backend --region=asia-south1` |
| Retailer Portal | Cloud Run `retailer-admin` | `gcloud run services describe retailer-admin --region=asia-south1` |
| Supplier Portal | Cloud Run `supplier-portal` | `gcloud run services describe supplier-portal --region=asia-south1` |
| SuperAdmin Portal | Cloud Run `superadmin` | `gcloud run services describe superadmin --region=asia-south1` |
| Landing Page | Cloud Run `landing` | `gcloud run services describe landing --region=asia-south1` |
| POS App | Expo/EAS Build → App Store/Play Store | N/A (mobile) |
| Database | Cloud SQL `supermandi-staging` | `mcp__staging-db__query` or `gcloud sql instances describe supermandi-staging` |
| Redis | Memorystore `supermandi-redis-staging` (10.107.71.27:6379) | `gcloud redis instances describe supermandi-redis-staging --region=asia-south1` |
| Secrets | Secret Manager (5 secrets) | `gcloud secrets list` |
| Images | Artifact Registry `asia-south1-docker.pkg.dev/supermandi-backend/supermandi` | `gcloud artifacts docker images list` |
| Load Balancer | URL Map `supermandi-staging-urlmap` | `gcloud compute url-maps describe supermandi-staging-urlmap` |
| SSL | Managed cert `supermandi-staging-cert` | `gcloud compute ssl-certificates describe supermandi-staging-cert` |
| CI/CD | GitHub Actions | `mcp__github__list_pull_requests` |
| Monitoring | Cloud Run metrics + uptime probes | `gcloud monitoring uptime list-configs` |

---

# APPENDIX C: QUICK REFERENCE

## Gate Commands (Local)
```powershell
pnpm -r typecheck
pnpm -r build
pnpm test
```

## Git Flow (Per Ticket)
```bash
git checkout main && git pull
git checkout -b fix/TICKET-ID-slug
# ... implement ...
git push -u origin fix/TICKET-ID-slug
# ... CI passes ...
# ... merge PR ...
git tag prestage-TICKET-ID-YYYY-MM-DD_HHMMIST
git push origin --tags
```

## Staging Deploy (Phase Boundary)
```bash
git tag phase-N-complete-YYYY-MM-DD
git push origin --tags
# CI builds and deploys automatically
```

## Rollback
```bash
gcloud run services update-traffic <service> --to-revisions=<previous>=100
```

---

# PART 17: ROUTING ENFORCEMENT (Canonical Routing Spec + Automated Gates)

> **Rule:** The routing spec (`RELEASES/ROUTING_SPEC.json`) is the SINGLE SOURCE OF TRUTH for all URL routing. Any routing change (base path, URL map, NEG, Cloud Run service, nginx config) MUST update the spec first, then the implementation. CI and CD gates enforce the spec automatically.

## 17.1 Architecture

```
Internet → staging.supermandi.tech (SSL)
  ├── /                    → landing          (Cloud Run, nginx-static, port 80)
  ├── /privacy, /terms     → landing
  ├── /pos                 → landing          (POS app download page)
  ├── /retailer/*          → retailer-admin   (Cloud Run, vite-nginx, port 80)
  ├── /supplier/*          → supplier-portal  (Cloud Run, nextjs, port 3001)
  ├── /admin/*             → superadmin       (Cloud Run, vite-nginx, port 80)
  ├── /api/*               → api-gateway      (Cloud Run, express, port 3000)
  └── api-gateway          → main-backend     (internal, express, port 3010)

POS App (Expo/React Native) → https://staging.supermandi.tech/api/v1/pos/*
                             → https://staging.supermandi.tech/api/v1/auth/*
```

## 17.2 The Three Routing Gates (ZRP Category L)

| Gate Script | When | What | Gate IDs |
|-------------|------|------|----------|
| `routing-spec-validate.sh` | CI (every PR) | Static validation: configs match spec | L-001..L-022 |
| `routing-infra-validate.sh` | CD (post-deploy) | GCP validation: URL map, NEGs, services | L-023..L-030 |
| `routing-smoke.sh` | CD (post-deploy) | Live validation: hit every URL through LB | L-031..L-047 |

**All gates are BLOCKING.** Routing correctness is not optional.

## 17.3 POS App Routing Rules

The POS app is a mobile app (Expo/React Native), NOT a web portal. It does not have a base path on the load balancer. Its routing rules are:

1. **API Base**: POS connects to `https://staging.supermandi.tech/api/v1/`
2. **Critical prefixes**: `/api/v1/pos/*`, `/api/v1/auth/*`, `/api/v1/orders/*`, `/api/v1/inventory/*`, `/api/v1/catalog/*`
3. **Gateway config**: All POS prefixes MUST exist in `api-gateway/src/config.ts`
4. **MIN_APP_VERSION**: MUST be set in `deploy.yml` for version gating
5. **Download page**: `/pos` on the landing site MUST return 200
6. **Auth flow**: POS uses OTP via `/api/v1/auth/pos/send-otp` — gateway MUST proxy this

## 17.4 Claude's Routing Obligations

When Claude changes ANY of these files, Claude MUST:

| File Changed | Also Verify |
|-------------|-------------|
| `vite.config.ts` (any portal) | Base path matches `ROUTING_SPEC.json` |
| `next.config.js` | `basePath` and `trailingSlash` match spec |
| `nginx.conf` (any portal) | Rewrites and SPA fallback match spec |
| `api-gateway/src/config.ts` | All required route prefixes present |
| `deploy.yml` (service names) | Names match spec AND GCP services (HL-006) |
| `deploy.yml` (env vars) | PORTAL_BASE_URL, CORS, ALLOWED_ORIGINS match domain |
| GCP URL map (via console/gcloud) | Path rules match spec → update spec if changed |
| Dockerfile (any portal) | EXPOSE port matches spec |

## 17.5 Forbidden Routing Actions

| Action | FORBIDDEN Because |
|--------|------------------|
| Change a portal base path without updating ROUTING_SPEC.json | CI gate L-002/L-003/L-004 will block |
| Deploy with wildcard CORS (`*`) | CI gate L-013 will block |
| Remove POS API prefixes from gateway config | CI gate L-020 will block |
| Deploy without MIN_APP_VERSION | CI gate L-021 will block |
| Change Cloud Run service names | CD gate L-028 will block; HL-006 violated |
| Change URL map path rules without updating spec | CD gate L-025 will block |

---

# PART 18: MEGA-BATCH DEPLOYMENT DISCIPLINE (437-Ticket Deploy Protocol)

> **Context:** 437 tickets (176 commits, 67 PRs, 18 new migrations, +119K lines) need to deploy from main HEAD to GCP staging. This is a MEGA-BATCH — the largest single deploy in project history. These rules ensure ZERO regression, ZERO data loss, and ONE-CLICK operator deployment.

## 18.1 The 5-Phase Deploy Pipeline

```
Phase A: PRE-DEPLOY AUDIT (Claude validates, Operator reviews)
   ↓
Phase B: DATABASE MIGRATION (Irreversible — backup required)
   ↓
Phase C: SERVICE DEPLOYMENT (Reversible — Cloud Run revisions)
   ↓
Phase D: POST-DEPLOY VERIFICATION (Automated + Operator)
   ↓
Phase E: SIGN-OFF or ROLLBACK (Operator decision)
```

**The operator triggers ONE action (CI workflow dispatch). Everything else is automated with gates.**

---

## 18.2 Phase A: Pre-Deploy Audit (20 Gates)

### A.1 Code Integrity Gates (Claude runs BEFORE pushing deploy tag)

| Gate | Command/Check | PASS Criteria | Blocking? |
|------|--------------|---------------|-----------|
| A-001 | `git status` | Clean working tree, on main | YES |
| A-002 | `git log --oneline -5` | HEAD matches expected SHA | YES |
| A-003 | `pnpm -r typecheck` | Zero errors across all packages | YES |
| A-004 | `pnpm -r build` | All 6 services build successfully | YES |
| A-005 | `pnpm test` | All unit/integration tests pass | YES |
| A-006 | CI-GATES workflow | All 30+ CI gates green on HEAD | YES |

### A.2 Secret Freshness Gates (CI deploy.yml ZRP-D-003 validates)

| Gate | Secret | Where Used | Blocking? |
|------|--------|-----------|-----------|
| A-007 | `database-url` | Backend DB connection | YES |
| A-008 | `postgres-password` | Backend DB auth | YES |
| A-009 | `jwt-secret` | Auth token signing | YES |
| A-010 | `admin-token` | Internal service auth | YES |
| A-011 | `smtp-password` | Email sending | YES |
| A-012 | `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API | YES |
| A-013 | `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sender ID | YES |
| A-014 | `WHATSAPP_VERIFY_TOKEN` | Webhook verification | YES |
| A-015 | `WHATSAPP_APP_SECRET` | Webhook HMAC validation | YES |

**All 9 secrets must have enabled versions in GCP Secret Manager.**

### A.3 Infrastructure Readiness Gates (CI deploy.yml validates)

| Gate | Check | PASS Criteria | Blocking? |
|------|-------|---------------|-----------|
| A-016 | Cloud SQL instance | Status = RUNNABLE | YES |
| A-017 | VPC Connector | Status = READY | YES |
| A-018 | Artifact Registry | Accessible + writable | YES |
| A-019 | Cloud SQL backup | Backup created successfully | YES (first deploy) |
| A-020 | Redis connectivity | Memorystore reachable | WARNING |

---

## 18.3 Phase B: Database Migration (18 New Migrations)

### B.1 Migration Inventory

```
NEW MIGRATIONS SINCE LAST DEPLOY (141 → 159):

141 — Batch/lot expiry tracking (T-144)
142 — Purchase cart drafts (T-145)
143 — Refunds table + approval workflow (T-150)
144 — Stock version for optimistic concurrency (T-177)
145 — Daily closings / EOD reconciliation (T-191)
146 — Staff shifts + bundled Phase 5A columns (T-192)
147 — GIN trigram indexes for fuzzy search (T-132)
148 — Store bank account fields (T-202)
149 — Row-Level Security on 27 tables (T-216) ← CRITICAL
150 — Reorder schema unification (T-236, T-237)
151 — Pending reorder fulfilled status (T-250)
152 — Notifications + payment reminders + GST (T-219, T-231, T-232, T-235)
153 — Payout retry queue (T-258)
154 — Credit provider abstraction layer (T-263, T-275, T-276, T-278)
155 — Chat schema (T-291, T-301, T-302)
156 — AI automation schema (T-303–T-316)
157 — Refresh token hash index (FIX-011)
159 — WhatsApp message log (WA-001)
```

### B.2 Migration Safety Protocol

```
STEP 1: Cloud SQL backup BEFORE any migration
   → gcloud sql backups create --instance=supermandi-staging
   → WAIT for backup to complete (do NOT proceed while running)

STEP 2: Dry-run preview
   → List all pending migrations
   → Review for DROP/RENAME/ALTER TYPE (FORBIDDEN in mega-batch)
   → Verify all are additive (CREATE TABLE, ADD COLUMN, CREATE INDEX)

STEP 3: Execute migrations in order (141 → 159)
   → Run sequentially (NOT in parallel)
   → Verify each migration exits cleanly (no errors)
   → Migration 149 (RLS) is the most critical — verify all 27 tables get policies

STEP 4: Post-migration verification
   → Verify new schemas exist: whatsapp, notifications, chat, ai
   → Verify RLS policies active on 27 tables
   → Verify new indexes exist (trigram, token_hash, wamid)
   → Verify new tables: refunds, daily_closings, staff_shifts, etc.
```

### B.3 Migration Rollback Plan

```
IF migration fails mid-way:
  → Note which migration failed and at what step
  → DO NOT continue with remaining migrations
  → DO NOT deploy new containers
  → Restore Cloud SQL backup from Step 1
  → Fix the failing migration → new commit → re-run from Phase A

IF migration succeeds but data is wrong:
  → Restore Cloud SQL backup
  → Containers revert to old revisions (Phase E rollback)
```

---

## 18.4 Phase C: Service Deployment (6 Services, Dependency Order)

### C.1 Deployment Order (STRICT — No Parallel for First Deploy)

```
TIER 1 (Database-dependent — deploy first):
  ① main-backend        ← All 10 microservices, connects to DB + Redis
     → Health check: GET /health → 200
     → Version check: GET /version → { sha: "<deployed-SHA>" }

TIER 2 (Routes to backend — deploy second):
  ② api-gateway         ← Proxies all API traffic to main-backend
     → Health check: GET /api/v1/health → 200
     → Routing check: All POS/auth/admin prefixes proxy correctly

TIER 3 (Static frontends — deploy in parallel):
  ③ retailer-admin      ← Vite SPA, serves /retailer/*
  ④ supplier-portal     ← Next.js, serves /supplier/*
  ⑤ superadmin          ← Vite SPA, serves /admin/*
  ⑥ landing             ← Static HTML, serves /

Each portal health check: GET /<base-path>/ → 200
```

### C.2 Per-Service Deploy Verification

For EACH service deployed, CI MUST verify:

| Check | Method | PASS Criteria |
|-------|--------|---------------|
| Revision created | `gcloud run revisions list` | New revision appears |
| Traffic routed | `gcloud run services describe` | 100% traffic to new revision |
| Health check | `curl /health` or `curl /<base>/` | HTTP 200 |
| GIT_SHA match | `curl /version` | SHA matches deployed commit |
| Startup logs clean | Cloud Run logs | No ERROR/FATAL in first 30s |

### C.3 Image Integrity

```
RULE: All 6 images MUST be built from the SAME git SHA
RULE: Image digests are recorded by CI at build time
RULE: Post-deploy parity check verifies deployed digest = built digest
RULE: NEVER deploy :latest — always @sha256:<digest> or :<git-sha>
```

---

## 18.5 Phase D: Post-Deploy Verification (44 Automated Gates)

### D.1 Smoke Tests (11 gates — deploy.yml)

| Gate | Test | Expected |
|------|------|----------|
| D-001 | api-gateway /health | 200 + JSON body |
| D-002 | main-backend /health | 200 + JSON body |
| D-003 | api-gateway /version SHA | Matches deployed SHA |
| D-004 | main-backend /version SHA | Matches deployed SHA |
| D-005 | retailer-admin / | 200 |
| D-006 | supplier-portal / | 200 |
| D-007 | superadmin / | 200 |
| D-008 | landing / | 200 |
| D-009 | Auth guard (unauthenticated) | 401 or 403 |
| D-010 | Gateway→Backend proxy | API responds through gateway |
| D-011 | Health latency | < 2 seconds |

### D.2 Routing Verification (17 gates — routing-infra-validate.sh + routing-smoke.sh)

| Gate | Test | Expected |
|------|------|----------|
| D-012 | URL map path rules | Match ROUTING_SPEC.json |
| D-013 | NEG backend mappings | 6 NEGs → 6 Cloud Run services |
| D-014 | /retailer/* routes | retailer-admin serves |
| D-015 | /supplier/* routes | supplier-portal serves |
| D-016 | /admin/* routes | superadmin serves |
| D-017 | /api/* routes | api-gateway serves |
| D-018 | / (default) routes | landing serves |
| D-019 | POS API prefixes | /api/v1/pos/*, /api/v1/auth/* reachable |
| D-020 | CORS headers | Correct origins, no wildcard |
| D-021 | Security headers | X-Content-Type-Options, etc. |
| D-022–D-028 | Per-portal smoke | Each portal returns valid HTML |

### D.3 Deploy-Verify Pipeline (deploy-verify.yml — Triggered After Deploy)

| Gate | Test | Blocking? |
|------|------|-----------|
| D-029 | API verification script | YES |
| D-030 | Playwright E2E (chromium, @prod) | YES |
| D-031 | Token refresh lifecycle | YES |
| D-032 | ZRP gatekeeper aggregation | YES |

### D.4 New Feature Verification (Mega-Batch Specific)

| Feature | Verification | Blocking? |
|---------|-------------|-----------|
| WhatsApp status | GET /api/v1/admin/whatsapp/status → configured:true | YES |
| WhatsApp webhook | GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=... | YES |
| Chat schema | SELECT count(*) FROM chat.conversations (table exists) | YES |
| RLS active | SELECT polname FROM pg_policies LIMIT 5 (policies exist) | YES |
| Notifications schema | SELECT count(*) FROM notifications.devices (table exists) | YES |
| Refunds table | SELECT count(*) FROM refunds (table exists) | YES |
| Reorder unified | SELECT count(*) FROM purchase_orders (table exists + new columns) | YES |
| AI schema | SELECT count(*) FROM ai.demand_forecasts (table exists) | YES |

---

## 18.6 Phase E: Sign-Off or Rollback

### E.1 Operator Sign-Off Checklist

After ALL automated gates pass, operator MUST verify:

```
[ ] All 6 portals load in browser (visual check)
    → https://staging.supermandi.tech/              (landing)
    → https://staging.supermandi.tech/retailer/      (retailer-admin)
    → https://staging.supermandi.tech/supplier/       (supplier-portal)
    → https://staging.supermandi.tech/admin/          (superadmin)

[ ] Login works on each portal
    → Retailer: login with test credentials
    → Supplier: login with test credentials
    → SuperAdmin: login with admin credentials

[ ] Critical flows work
    → Retailer: view products, view orders, view invoices
    → Supplier: view orders, update status
    → SuperAdmin: view stores, view suppliers, WhatsApp tab loads

[ ] POS API responds
    → curl /api/v1/health → 200
    → curl /api/v1/pos/products (with auth) → data

[ ] No console errors in browser DevTools (each portal)
```

### E.2 Rollback Protocol (If Anything Fails)

```
LEVEL 1 — Service Rollback (Instant, seconds):
   For each broken service:
   gcloud run services update-traffic <service> \
     --to-revisions=<pre-deploy-revision>=100 \
     --region=asia-south1

   CI records pre-deploy revisions automatically.
   Rollback = restore traffic to previous revision.
   All 6 services can be rolled back independently.

LEVEL 2 — Full Rollback (All services):
   Roll back ALL 6 services to pre-deploy revisions.
   Order: portals first, then gateway, then backend.
   ⑥ landing → ⑤ superadmin → ④ supplier-portal →
   ③ retailer-admin → ② api-gateway → ① main-backend

LEVEL 3 — Database Rollback (Nuclear — data loss risk):
   Restore Cloud SQL backup from Phase B Step 1.
   THEN roll back all containers (Level 2).
   WARNING: Any data written after migration is LOST.
   Use ONLY if migration caused data corruption.
```

### E.3 Post-Rollback Verification

```
After any rollback:
  1. Verify all 6 services healthy (health checks pass)
  2. Verify old revisions serving traffic
  3. Verify no 503/502 errors in Cloud Run logs
  4. Verify uptime-probe.yml shows GREEN within 5 minutes
  5. Create incident ticket with root cause
```

---

## 18.7 Env Var & Secret Reference (Complete for Mega-Batch)

### Secrets in GCP Secret Manager (9 required, CI-enforced):

| Secret Name | Purpose | Added By |
|-------------|---------|----------|
| `database-url` | PostgreSQL connection string | Original deploy |
| `postgres-password` | DB password | Original deploy |
| `jwt-secret` | JWT signing key | Original deploy |
| `admin-token` | Internal service auth | Original deploy |
| `smtp-password` | Email sending (SMTP) | Original deploy |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API token | WA-001 |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sender phone ID | WA-001 |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verify token | WA-001 |
| `WHATSAPP_APP_SECRET` | Webhook HMAC secret | WA-001 |

### Env Vars Set in deploy.yml (32 vars on main-backend):

```
NODE_ENV, GIT_SHA, MIN_APP_VERSION,
DB_HOST, DB_PORT, DB_NAME, DB_USER,
REDIS_HOST, REDIS_PORT, REDIS_URL,
FIREBASE_ENABLED, FIREBASE_PROJECT_ID, SMS_DISABLED,
RATE_LIMIT_MULTIPLIER, EMAIL_PROVIDER, SMTP_HOST, SMTP_PORT,
SMTP_USER, EMAIL_FROM, PORTAL_BASE_URL, POS_APP_DOWNLOAD_URL,
ADMIN_EMAIL_ALLOWLIST, ALLOWED_ORIGINS, CORS_ALLOWED_ORIGINS,
DOCUMENT_STORAGE_DIR, GCS_DOCUMENTS_BUCKET, GCS_IMAGES_BUCKET,
GCP_PROJECT_ID, FEATURE_REORDER_ENABLED,
SUPERMANDI_ENTITY_NAME, SUPERMANDI_GSTIN, SUPERMANDI_ADDRESS,
SUPERMANDI_STATE, FRONTEND_URL
```

### Env Vars NOT Yet in deploy.yml (Awaiting External APIs):

| Var | Feature | Status |
|-----|---------|--------|
| `RAZORPAY_KEY_ID` | UPI payments | AWAITING_RAZORPAY_API |
| `RAZORPAY_KEY_SECRET` | UPI payments | AWAITING_RAZORPAY_API |
| `RAZORPAY_ACCOUNT_NUMBER` | Supplier payouts | AWAITING_RAZORPAY_API |
| `RAZORPAY_WEBHOOK_SECRET` | Payment callbacks | AWAITING_RAZORPAY_API |
| `OPENAI_API_KEY` | AI automation | Optional (graceful degradation) |

**These features have graceful degradation — they work without the vars (disabled state).**

---

## 18.8 One-Click Operator Deployment

### What Operator Does:

```
1. VERIFY: Claude confirms all Phase A gates pass (typecheck, build, tests, CI)
2. VERIFY: Claude confirms all 9 secrets exist in GCP Secret Manager
3. TRIGGER: Operator runs deploy.yml workflow (manual dispatch or push to main)
4. WAIT: CI runs Phase B (migrations), Phase C (deploy), Phase D (verification)
5. REVIEW: Operator checks Phase E sign-off checklist in browser
6. DONE: If all green → staging is live with 437 tickets
```

### What Is Automated (Operator Does NOT Do):

```
- Building Docker images (CI does it)
- Pushing to Artifact Registry (CI does it)
- Running migrations (CI does it via deploy.yml)
- Deploying to Cloud Run (CI does it)
- Running 44 smoke/routing/verification gates (CI does it)
- Recording pre-deploy revisions for rollback (CI does it)
- Auto-rollback on smoke failure (CI does it)
```

### What Claude Does Before Operator Triggers:

```
1. Run pnpm -r typecheck → report result
2. Run pnpm -r build → report result (builds are CI-only, this is verification)
3. Run pnpm test → report result
4. Verify CI-GATES green on HEAD
5. List all 9 secrets and their status in GCP
6. List all 18 new migrations
7. Provide operator with Phase E sign-off checklist
8. Announce: "DEPLOY-READY: All Phase A gates PASS. Operator may trigger deploy."
```

---

## 18.9 Forbidden Deploy Actions (Absolute)

| Action | FORBIDDEN Because |
|--------|------------------|
| Deploy without Cloud SQL backup | Migration is irreversible without backup |
| Deploy from branch (not main) | deploy.yml builds from main only |
| Skip secret freshness check | Services crash on missing secrets |
| Deploy services out of order | Backend must be ready before gateway |
| Hot-patch staging (gcloud CLI deploy) | Bypasses all CI gates |
| Delete old Cloud Run revisions before sign-off | Destroys rollback safety net |
| Run migrations manually via psql | Bypasses CI tracking + logging |
| Deploy with pending uncommitted changes | Code drift between local and CI |
| Re-trigger deploy while previous is running | Race condition on revisions |
| Ignore smoke test failures | "It's probably fine" violates Law 6 |

---

## 18.10 Post-Deploy Monitoring

### Uptime Probe (Automatic — Every 5 Minutes)

```
uptime-probe.yml runs automatically after deploy:
  - Gateway health (/api/v1/health)
  - Retailer portal (/retailer/)
  - Admin portal (/admin/)
  - Supplier portal (/supplier/)
  - Version fingerprints
  - Health latency < 5s

On failure → GitHub issue created automatically (label: uptime-alert)
On recovery → Issue auto-closed
```

### First 24 Hours After Mega-Deploy

```
HOUR 0-1:   Operator monitors all portals (browser)
HOUR 1-4:   Uptime probes running (automated)
HOUR 4-24:  Background monitoring only
DAY 2:      Weekly ZRP-SCHEDULED.yml runs (chaos + business logic tests)
DAY 3+:     Normal monitoring cadence
```

---

## 19.1 Staging Browser Test Wave — Freeze Record

> **Status**: CLOSED_IN_GIT | **Baseline**: `main@d69c4a20` | **Date**: 2026-03-01

### Wave Summary

| Metric | Value |
|--------|-------|
| Range | STG-001 → STG-286 |
| Total | 286 |
| FIXED | 283 |
| WONTFIX | 2 (STG-021, STG-276) |
| ACCEPTED | 1 (STG-281 — intentional rgba on primary bubble) |
| DIAGNOSED | 0 |
| FOUND | 0 |
| DEFERRED_COSMETIC | 0 |

### STG-021 WONTFIX Record

**Issue**: Build stamps are correct.
**Evidence**: All 4 services show `e56f0f4` (commit `e56f0f42` — 2 docs-only commits after deploy tag `e63dba14`). Services are aligned and running latest code.
**Verdict**: Not a bug. Build stamps correctly reflect deployed code.

### Tracker Freeze Rules

1. `RELEASES/STAGING_BROWSER_TEST_ISSUES.md` is **frozen** for STG-001..286
2. Next audit round appends new findings as STG-287+ (never rewrites old entries)
3. Any regression against a prior STG fix → new STG ID (e.g., STG-287), not silent edit of the original
4. Deploy hold remains active until operator triggers CI
5. Final pre-deploy audit completed 2026-03-01: 0 P1/P2 blockers
6. Post-audit UX refinement wave 2026-03-01: all 40 P3 cosmetics resolved (39 FIXED, 1 ACCEPTED). Production-grade complete.

### Pending Migrations (4)

| # | File | Risk |
|---|------|------|
| 168 | `fix_check_constraints.sql` | LOW — widens 4 CHECK constraints |
| 169 | `add_pending_mrp.sql` | LOW — adds nullable BIGINT column |
| 170 | `credit_app_columns_and_constraint.sql` | LOW — adds 2 nullable columns + widens constraint |
| 171 | `fix_buy_payments_mode_constraint.sql` | LOW — adds CASH to mode constraint |

All 4 are backward-compatible, idempotent, and require migration-first ordering (code already references the new values).

### Operator Steps Before Next Phase

1. Cloud SQL backup before migration run
2. Verify 9 secrets in Secret Manager
3. Trigger CI deploy pipeline
4. Browser verification of all 6 staging services post-deploy
5. Verify `smtp-password` secret for STG-004 email functionality

---

## 19.2 Final Audit Lockdown Protocol (Mandatory)

> This section overrides any looser audit behavior for the final pre-deploy audit wave.

### Purpose

Claude must execute one final comprehensive audit from live GCP staging with full screen coverage and zero skipping. Claude must not jump between platforms, skip screens, sample pages, or move ahead before the current screen is fully audited.

### Audit Mode

- Mode: `FINAL_STAGING_AUDIT`
- Evidence source priority:
  1. Live GCP staging behavior
  2. Real user interactions on staging
  3. API/runtime evidence from staging
  4. Code/db/log inspection only after live reproduction
- Deploy hold remains ACTIVE during this audit

### Fixed Platform Order (Mandatory)

Claude must audit platforms in this exact order only:

1. Retailer Web
2. Supplier Web
3. SuperAdmin Web
4. POS App

Claude cannot change this order unless explicitly instructed by operator.

### Platform Entry Gate

Before starting a platform, Claude must publish:

- Platform name
- Full screen list for that platform
- Audit order for those screens
- Expected authenticated and unauthenticated flows
- Cross-surface dependencies relevant to that platform

No audit work for that platform is valid until the full screen manifest is listed first.

### Single-Screen Lock (Mandatory)

Claude may have only ONE active screen at a time.

For the active screen:
- Status must be exactly one of: `pending`, `in_progress`, `completed`, `blocked`
- Claude cannot move to the next screen until the current screen is `completed` or `blocked` with exact blocker, owner, and unblock plan

Claude must not:
- Partially audit a screen and move on
- Leave "come back later" gaps
- Skip modals, tabs, drawers, popups, empty states, or error states within that screen

### Per-Screen Audit Checklist (Mandatory)

Each screen must be audited against ALL of the following before it can be marked `completed`:

**1. UI** — layout, visual consistency, typography/icons, spacing/alignment, responsive behavior, dark/light theme if applicable

**2. UX** — clarity of actions, microcopy, success/failure feedback, empty state quality, loading state quality, disabled state logic, professional polish

**3. Wiring** — button/action handlers, form submission behavior, modal open/close behavior, retry flows, refresh behavior, state reset behavior

**4. Navigation** — direct route access, deep link behavior, back/forward behavior, sidebar/topnav routing, redirect correctness, logout/session-expiry redirects

**5. API** — request shape, response shape, validation behavior, auth headers/tokens, pagination/search/filter correctness, error response handling, timeout/retry behavior

**6. Backend behavior** — business logic correctness, role/permission enforcement, side effects, idempotency, concurrency/duplicate-submit handling, security boundaries

**7. DB / Migration impact** — data persistence correctness, read/write integrity, enum/constraint correctness, nullability/default assumptions, schema mismatch symptoms, migration dependency if any

**8. GCP staging parity** — issue reproduced on deployed staging, env/config dependence identified if applicable, runtime/parity issue captured if applicable

### Real User Walkthrough Rule

Within each screen, Claude must behave like a real user and walk all meaningful interactions: open, view, click, type, submit, retry, cancel, back out, refresh, trigger validation, use alternate branches, check unhappy paths.

A screen is incomplete if only the "happy path" was tested.

### Issue Capture Rule

Any issue found must be appended into `RELEASES/STAGING_BROWSER_TEST_ISSUES.md`.

Rules:
- Preserve existing STG-001..206 as frozen historical record
- All new issues must start at STG-207+
- Regressions against previously fixed work must get NEW STG IDs
- No silent rewriting of historical issues

Each new issue must include: STG ID, platform, screen/page, exact reproduction steps on staging, expected vs actual, severity, root cause (if confirmed), fix direction, affected files if known, dependency/migration/infra note if applicable, status.

### Screen Exit Gate (Mandatory)

Claude may mark a screen `completed` only if:

1. All checklist categories above were covered
2. All meaningful interactions on that screen were exercised
3. All issues found were added to `RELEASES/STAGING_BROWSER_TEST_ISSUES.md`
4. Claude publishes a short screen completion record: screen name, result (`PASS WITH NO NEW ISSUES` or `NEW ISSUES ADDED`), new STG IDs added, blockers if any

### Platform Exit Gate (Mandatory)

Claude may move from one platform to the next only if:

1. Every screen in the platform manifest is `completed` or `blocked`
2. Zero screens remain unaccounted for
3. Claude publishes a platform summary: platform name, total screens, completed count, blocked count, new STG IDs added, top P0/P1 findings, unresolved access blockers

### Full Audit Completion Gate (Mandatory)

The final audit wave is complete only if:

1. Retailer Web fully covered
2. Supplier Web fully covered
3. SuperAdmin Web fully covered
4. POS App fully covered
5. All screens have terminal status (`completed` or `blocked`)
6. All discovered issues are appended to `RELEASES/STAGING_BROWSER_TEST_ISSUES.md`
7. Claude publishes: final screen coverage table, issue counts by platform, issue counts by severity, cross-surface blockers, explicit statement (`FINAL STAGING AUDIT COMPLETE` or `NOT COMPLETE` with remaining blocked screens)

### No Screen Left Behind Rule (Mandatory)

For the final audit and any final pre-deploy audit refresh:

1. Every screen listed in the manifest must receive terminal status
2. No listed screen may remain implicit, skipped, sampled-only, or "to revisit later"
3. Platform completion is blocked if even one listed screen lacks terminal status
4. Sampled reiteration may be used only for impacted-regression checks
5. Sampled reiteration must never be treated as equivalent to full audit completion
6. If a screen was only sampled, it remains `pending` for full-audit purposes until individually audited

### No-Escape Rules

Claude must not:
- Leave a platform half-done
- Jump to another platform early
- Treat tracker count as audit completion evidence
- Stop because "enough issues were found"
- Stop because of time/score/percentage
- Claim "production-grade" before full screen coverage is done

### Cross-Surface Matrix Pass (After All 4 Platforms)

Only after all four platforms are fully audited, Claude must run cross-surface matrix checks for:

1. Retailer registration → SuperAdmin approval → retailer login
2. Supplier registration → SuperAdmin approval → supplier login
3. Retailer → POS enrollment and downstream usage
4. Support/chat/admin visibility flows
5. Password reset / password change / session invalidation flows
6. Any platform pairings discovered during the audit

Cross-surface findings must also be appended as new STG IDs.

### Sub-Agent Restriction

Claude may use sub-agents only if:

1. Coordinator remains in full control of canonical audit state
2. One sub-agent handles only one declared platform slice at a time
3. Sub-agents cannot change audit order
4. Sub-agents cannot skip screen listing / screen exit gates
5. Coordinator merges all findings into the one canonical STG issue file

If sub-agents increase context loss risk, Claude must not use them.

### Final Objective

This final audit is intended to exhaustively discover remaining production-grade gaps before any next deploy. Coverage completeness is mandatory. Sampling is forbidden.

---

## 19.3 Firebase Production Audit — Persistent Machine State

> **Status**: NOT_PRODUCTION_READY | **Date**: 2026-02-28 | **Artifacts**:
> `RELEASES/FIREBASE_PRODUCTION_AUDIT_CHECKLIST.md`,
> `RELEASES/FIREBASE_PRODUCTION_AUDIT_REPORT_2026-02-28.md`

### Scope

This Firebase audit state applies to:

1. Retailer web phone OTP
2. Supplier web phone OTP
3. Backend Firebase Admin token verification
4. POS Firebase usage if POS is in production auth scope
5. Identity Platform / Firebase Authentication console settings

### Frozen Findings

Firebase is **not** production-grade ready yet.

Proven blockers:

1. Identity Platform reCAPTCHA phone auth is still in `AUDIT`
2. All configured reCAPTCHA keys show `0` assessments
3. Backend Firebase initialization fails soft instead of fail-fast or degraded health
4. Revoked Firebase tokens are not checked in server verification
5. Firebase auth logging is too verbose for production
6. Authorized domains are not yet explicitly verified
7. SMS region policy is not yet explicitly verified
8. Live retailer/supplier OTP flows are not yet operator-verified end to end

### Repo Truth Persisted

Verified repo/runtime findings:

1. Retailer and supplier both use Firebase phone auth client-side
2. Backend verifies Firebase tokens server-side
3. Deploy workflow sets `FIREBASE_ENABLED=true` and `FIREBASE_PROJECT_ID=supermandi-pos`
4. Supplier build currently relies on `.env.production.example` fallback for public Firebase client config
5. Staging auth pages are reachable
6. Staging API health is reachable

### Mandatory Next-Wave Execution Order

Before any Firebase production-ready claim, Claude must execute in this order:

1. Repo-side hardening
   - fail-fast or degraded-health behavior when Firebase is enabled but initialization fails
   - sanitize Firebase auth logs
   - decide and implement revoked-token verification policy
2. Runtime/config confirmation
   - verify intended Firebase credential source
   - verify POS Firebase scope (in scope or explicitly out of scope)
3. Operator / console verification
   - authorized domains audit
   - SMS region policy audit
   - live retailer OTP test on staging
   - live supplier OTP test on staging
   - reCAPTCHA assessment confirmation
4. Only after evidence exists:
   - switch Identity Platform phone auth protection from `AUDIT` to `ENFORCE`

### No-Closure Rules

Claude must not mark Firebase as production-grade ready while any of the following remains true:

1. reCAPTCHA assessment count remains `0`
2. phone auth remains in `AUDIT` without live evidence
3. Firebase initialization can fail while service health remains falsely green
4. revoked-token policy is unresolved
5. sensitive Firebase auth logs remain in production paths
6. authorized domains are not explicitly verified
7. SMS region policy is not explicitly verified
8. live retailer/supplier OTP staging flows are not verified end to end

### Operator-Bound Evidence Required

Before Firebase closure, operator evidence must include:

1. exact authorized domain list
2. exact sign-in methods enabled
3. reCAPTCHA mode and assessment counts
4. SMS region policy
5. one successful retailer OTP staging flow
6. one successful supplier OTP staging flow
7. at least one negative-path OTP test result

### Carry-Forward Rule

This section remains active across future waves until Firebase is explicitly re-audited and all gates pass.

Claude must re-read:

1. `RELEASES/FIREBASE_PRODUCTION_AUDIT_CHECKLIST.md`
2. `RELEASES/FIREBASE_PRODUCTION_AUDIT_REPORT_2026-02-28.md`

before starting any Firebase-related implementation or closure attempt.

---

## 19.4 Post-Firebase UI/UX Polish Lockdown Protocol (Mandatory)

> **Status**: COMPLETED | **Committed at**: `main@d69c4a20` | **Date**: 2026-03-01 | **Files changed**: 81 across 4 portals | **Reiteration**: STG-237..256 (8 P2 fixed, 12 P3 logged)

### Purpose

After Firebase hardening is complete and Firebase console/live verification is either complete or explicitly deferred by operator, Claude must execute one dedicated business-class UI/UX polishing wave across:

1. Retailer Web
2. Supplier Web
3. SuperAdmin Web
4. POS App

This polish wave is for professional refinement only. It must not create functional regression, navigation regression, API regression, backend regression, auth/session regression, or theme regressions.

### Activation Preconditions

Claude must not start UI/UX polish until:

1. Firebase repo-side hardening is complete
2. Firebase operator/console verification is either complete or explicitly deferred by operator
3. Current active implementation/reiteration wave is frozen in git
4. A baseline SHA is declared before polish starts

### Fixed Platform Order (Mandatory)

Claude must polish platforms in this exact order:

1. Retailer Web
2. Supplier Web
3. SuperAdmin Web
4. POS App

Claude cannot change this order unless explicitly instructed by operator.

### Platform Entry Gate

Before polishing a platform, Claude must publish:

1. platform name
2. complete screen list
3. screen polish order
4. shared components/tokens likely to be affected
5. regression-sensitive files for that platform

No platform work is valid until the full polish manifest is listed first.

### Single-Screen Polish Lock (Mandatory)

Claude may have only ONE active screen under polish at a time.

For the active screen:
- status must be exactly one of:
  - `pending`
  - `in_progress`
  - `completed`
  - `blocked`

Claude cannot move to the next screen until the current screen is:
- `completed`, or
- `blocked` with exact blocker, owner, and unblock plan

### Allowed Polish Scope

UI/UX polish may improve:

1. visual hierarchy
2. spacing/alignment
3. typography consistency
4. component consistency
5. card/table/form polish
6. empty/loading/error state polish
7. dark mode/light mode consistency
8. business-class look and feel
9. iconography consistency
10. design token adoption
11. action hierarchy and CTA clarity
12. microcopy and helper/error text clarity
13. confirmation/cancellation flow clarity
14. keyboard/touch ergonomics
15. table/filter/search workflow clarity
16. success/failure feedback quality

UI/UX polish must not silently alter:

1. API contracts
2. business logic
3. permission rules
4. wiring behavior
5. navigation behavior
5. DB behavior
6. migration behavior
7. auth/session behavior

If polish work requires touching these layers, Claude must explicitly declare the impact and run broader regression checks.

Wiring/navigation rule:

1. wiring and navigation must be verified on every polished screen
2. wiring and navigation are not an unrestricted polish scope
3. if Claude discovers a real wiring/navigation defect during polish, it must:
   - stop treating it as pure polish
   - record it as a new issue/ticket if not already tracked
   - declare the impact explicitly before fixing
4. no silent route, redirect, click-path, deep-link, focus-order, or state-transition change is allowed under "polish only"

### Per-Screen Polish Checklist (Mandatory)

A screen is not polished until all of the following are checked:

1. layout hierarchy
2. spacing rhythm
3. typography consistency
4. color/token consistency
5. button/input/card consistency
6. empty/loading/error visual quality
7. dark mode/light mode parity
8. action hierarchy and CTA clarity
9. microcopy clarity
10. form guidance and validation clarity
11. confirmation/cancel/retry UX quality
12. responsive/mobile polish
13. accessibility polish
14. keyboard/touch ergonomics
15. regression check against:
   - navigation
   - wiring
   - API behavior
   - auth/session
   - backend behavior

### Professional UX Direction (Mandatory)

Claude must preserve one coherent business-class UX language across all platforms:

1. POS App
   - touch-first, cashier-grade, large targets, zero ambiguity, immediate action feedback
2. Retailer Web
   - dense but calm operations workspace, fast entry/editing, strong summaries, clear tables
3. Supplier Web
   - calmer catalog/fulfillment workflow, strong guidance for uploads, payouts, and compliance
4. SuperAdmin Web
   - command center / control-plane UX, strongest hierarchy, exception-first and approval-first flows

Polish must make each platform feel more professional without making them stylistically unrelated.

### Regression Guard Rule

After polishing each screen, Claude must verify:

1. no click path broke
2. no form broke
3. no route broke
4. no state handling broke
5. no theme token regression leaked into adjacent screens
6. no shared component regression leaked across the platform

If shared tokens/components are changed, impacted sibling screens must be rechecked before advancing.

### Batch Discipline

Claude may use micro-batches only when:

1. the batch stays within one platform
2. the batch uses one shared primitive or one coherent screen cluster
3. impacted screens are immediately rechecked

No mixed-platform UI polish commit is allowed unless the change is a true shared primitive used by all of them.

### Evidence Rule

For each polished screen Claude must publish:

1. screen name
2. polish status
3. files touched
4. visual areas improved
5. regression checks performed
6. any new issue IDs if polish exposed a hidden defect

### Platform Exit Gate

Claude may leave a platform only when:

1. every listed screen is `completed` or `blocked`
2. all impacted shared components are rechecked
3. no open polish regression remains in that platform
4. platform summary is published:
   - total screens
   - completed
   - blocked
   - shared primitives changed
   - regressions found/fixed

### Full UI/UX Polish Completion Gate

The UI/UX polish wave is complete only if:

1. Retailer polished
2. Supplier polished
3. SuperAdmin polished
4. POS polished
5. all impacted regressions are fixed or blocked explicitly
6. Claude publishes a final visual-system summary and lists the highest-risk files touched

### Final Objective

This polish wave exists to bring all four platforms to a professional business-class visual and interaction standard without destabilizing the product before the next deployment.

Sampling is forbidden. Single-screen lock is mandatory.

---

## 19.5 Post-Audit Professional UX Quality Refinement (Mandatory Next Task)

> **Status**: ARMED | **Activation Rule**: Starts only after the current final audit completes and a new baseline SHA is declared

### Purpose

After the current final audit completes, Claude must execute one dedicated professional UX quality refinement wave across:

1. Retailer Web
2. Supplier Web
3. SuperAdmin Web
4. POS App

This wave exists to make the product feel business-class and professionally usable without destabilizing established workflows before deployment.

### Core Rule

Claude must:

1. improve UX quality now
2. make UX professional now
3. avoid changing workflow semantics by default

Mandatory policy sentence:

> Improve UX quality, not workflow semantics, unless a screen has a proven usability defect that cannot be solved without a declared behavior change.

### Allowed UX Refinement Scope

Claude may improve:

1. CTA hierarchy and action emphasis
2. microcopy clarity
3. helper/error/success text quality
4. field guidance and validation clarity
5. confirmation, cancel, retry, and recovery flows
6. empty/loading/error state experience
7. table/filter/search usability
8. form progression clarity
9. touch/keyboard ergonomics
10. perceived responsiveness and clarity of state transitions
11. information hierarchy within a screen
12. consistency of user feedback across portals

### Forbidden Default Scope

Claude must not silently change:

1. business logic
2. approval semantics
3. auth/session model
4. route/deep-link model
5. API contracts
6. backend behavior
7. DB or migration semantics
8. cross-platform workflow sequencing

### Proven-Defect Exception Rule

If a UX problem cannot be solved without changing behavior, Claude may proceed only if:

1. the current audit or refinement pass proves a real usability defect
2. Claude explicitly declares the behavior change
3. Claude states why a pure polish fix is insufficient
4. Claude performs broader regression verification on impacted flows
5. the change is recorded as an explicit issue/ticket or explicit declared exception

### Execution Order

The professional UX refinement wave must follow this exact order:

1. Retailer Web
2. Supplier Web
3. SuperAdmin Web
4. POS App

Single-screen lock remains mandatory.

### Per-Screen UX Quality Checklist

Claude may not mark a screen complete until it verifies:

1. primary action is visually and cognitively obvious
2. secondary/destructive actions are appropriately de-emphasized
3. labels and helper text are concise and unambiguous
4. error states tell the user what to do next
5. success states confirm what happened
6. empty states guide the next action
7. loading states reduce uncertainty
8. form flow feels minimal and coherent
9. table/filter/search interactions are understandable
10. keyboard/touch path feels efficient
11. wiring/navigation was verified and not silently changed
12. auth/session/API/backend behavior was rechecked after refinement

### Completion Gate

This wave is complete only when:

1. all four platforms have been covered screenwise
2. no open P0/P1 UX regression remains
3. any behavior-changing UX fix was explicitly declared and reverified
4. Claude publishes a final UX quality summary and remaining deferments, if any

---

**END OF CLAUDE STATE OPERATING SYSTEM**

*This file is the single source of truth. All other rule files are historical reference only.*
*Claude reads this file first, follows only this file, and updates CLAUDE_CURRENT_STATE.json as it works.*
