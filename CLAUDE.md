# SuperMandi POS — Claude Session Instructions

> **This file is read automatically at the start of every Claude Code session.**
> It ensures Claude operates with full context of the project's rules, pipeline, and current state.

---

## MANDATORY: Read These Files First

Before writing ANY code, Claude MUST read and internalize:

1. **`RELEASES/CLAUDE_PRODUCTION_RULES.md`** — How Claude writes code (16 parts: safety rules, test policy, evidence requirements, debugging stages, git discipline, anti-patterns, incident workflow, priority order, go-live safeguards, completeness protocol)
2. **`RELEASES/MASTER_PLAN.md`** — What to do (batches, tickets, gates, current status, change class matrix)
3. **`RELEASES/ZERO_REGRESSION_RULES.md`** — How deploys work (immutability, rollback, CI gates, forbidden actions)
4. **`RELEASES/FIX_LEDGER.json`** — Machine state: every active fix with file:line checksums (SEE: Zero-Drift Protocol below)
5. **`RELEASES/CLAUDE_WORKFLOW.md`** — End-to-end 8-phase workflow for every ticket (MANDATORY process)
6. **`RELEASES/STAGING_TICKETS.md`** — Active ticket registry (operator inputs + Claude outputs)
7. **`RELEASES/LIVE_TEST_INSTRUCTIONS.md`** — Live staging test protocol (149 surfaces, strict screen-lock)

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

### Development Mode: Cascading E2E Hardening (A.5)
- **Every ticket** gets end-to-end tests — no exceptions, no "too small" tickets
- **Test against production-grade builds** — docker-compose local-prod, not pnpm dev
- **Cascade fix regressions** — if E2E exposes regression in feature Y while testing ticket X, fix Y immediately (not "fix later")
- **Full re-run after every fix** — re-run ENTIRE test suite after each cascade fix, not just the failed test
- **Zero failures = eligible** — ticket is PRE-STAGING ELIGIBLE only when full E2E = zero failures on prod build
- **No shortcuts** — no test.skip(), no isolated changes, no "works in dev"

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
- Every fix: `pnpm -r typecheck` + `pnpm test:contract` + applicable test packs
- Backend changes: migrate-from-zero + schema verify + integration + invariants + contract + security
- Portal changes: production build + Playwright smoke + **UI wiring** + **navigation guards** + **UX 4-state** + **render smoke** (C.8)
- POS changes: typecheck + API smoke + emulator E2E + release build smoke + offline/flaky + scanner hardware + **UI elements** + **UI wiring** + **POS navigation** + **UX 4-state** (C.8)
- **UI/UX (C.8)**: Every screen change requires UI element verification (buttons, fields, headers, footers) + wiring (click → API → state) + navigation guards + UX 4-state (loading/success/empty/error) + portal render smoke
- Resilience: graceful degradation when DB/Redis/service down (test:resilience)
- Security: auth enforcement + RBAC + input validation + secrets audit (test:security)
- Deploy parity: Docker build + gateway routing + config validation before CI push
- Three-layer catch net: contract tests → integration tests → load tests + big dataset

### Completeness Protocol (Part P)
- **Pre-task**: Announce scope + derive test plan from Change-Impact Router (P.2) before coding
- **Post-task**: git diff → router → verify all required tests ran, check Business Logic Registry (P.3)
- **Batch-level**: Full completeness scan before declaring GATED (P.5)
- **Five safety nets**: Pre-task → Post-task → Batch scan → Operator E2E → CI pipeline
- **Business Logic Registry**: 10 business functions tracked (scan, search, checkout, stock-in, provisioning, auth, supplier products, retailer SKU, ledger, pricing)
- If a file matches no router pattern → Claude MUST explicitly state and manually determine tests

### Evidence
- Every fix needs evidence appropriate to risk class
- Evidence Triplet: UI proof + API proof + DB proof
- "I think it works" is not evidence

### Ticket Pickup Strategy (Part M.0)
- **Bottom-up, dependency-aware**: Schema → System infra → Backend core → Cross-service → Frontend → Push → Hardening
- **Progressive gates**: Run increasing gate coverage after each layer (not just at the end)
- **Layer rule**: Never start a higher layer if a lower layer has failing gates
- **One-click pre-staging**: Single run of all gates must pass before involving operator
- **SA-GOLIVE ordering**: 6 phases (A-F) mapped to 7 layers, 15 remaining tickets

### Pipeline
- DEBUG → FIND → FIX → RETEST → GUARD (every issue)
- Debugging stages: 0 (dev) → 1 (Docker) → 2 (CI) → 3 (staging) → 4 (production)
- Release (13 steps, see RELEASE_POLICY.md): code-complete → Claude gates → **operator E2E** → CI → tag RC → staging → staging E2E → verify → sign-off → promote → post-deploy → close

### Operator E2E Gate (Pre-CI)
- Claude provides PowerShell E2E script → operator runs in VS Code terminal → pastes results
- Claude fixes ANY issues (even minor) before pushing to CI
- Same E2E review repeats after staging deploy (staging E2E gate)
- **Promotion to production only after ALL portals + POS app complete**

### Git Discipline (Part G — Production-Grade)
- **One ticket = one branch = one PR = one tag** — no mixed scope, no direct pushes to main (both modes)
- **Per-ticket flow**: clean main → create branch → commit (chore → fix → test → docs) → pre-PR gates → open PR → merge → tag → next ticket
- **No jumping ahead**: Next ticket MUST NOT start until current ticket's pre-stage tag exists on main
- **Branch naming**: `feat/<ticket-id>-<slug>`, `fix/<ticket-id>-<slug>`, `reg/<reg-id>-<slug>`
- **Tag naming**: `prestage-<TICKET-ID>-YYYY-MM-DD_HHMMIST` on every merged ticket
- **Cascade regression triage**: Blocking = separate `reg/` branch (Case A), Non-blocking = backlog ticket (Case B)
- **Semantic commits**: `chore(TICKET)`, `fix(TICKET)`, `test(TICKET)`, `docs(TICKET)`
- **Mode A**: Claude self-merges PRs (no external review needed, but branches/PRs still required)
- **Mode B**: Requires CI green + operator review before merge

---

## Hard Lessons (Incident-Driven Rules)

> Rules added after real mistakes. Claude MUST follow these without exception.

### HL-001: One Ticket = One PR (No Exceptions)
**Incident**: SA-P2-003 was merged via PR #17, then a follow-up change (auto-version) was merged as PR #18 under the same ticket ID. This violates G.1 "One ticket = one branch = one PR = one tag."

**Rule**:
- If the operator requests a change to a ticket that is **already merged**, Claude MUST either:
  1. **Fold the change into the original PR** (amend/rebase before merge), OR
  2. **Create a new ticket ID** for the follow-up change (e.g. SA-P2-003-A or a new ticket)
- Claude MUST NEVER create a second PR under the same ticket ID after the first PR is merged
- If Claude realizes mid-implementation that the ticket scope has expanded, STOP and ask the operator whether to expand the current PR or create a new ticket

### HL-002: Operator E2E Gate Is Mandatory Before Merge
**Incident**: SA-P2-003 was merged (both PR #17 and PR #18) without providing the operator any E2E verification script. The automated gates (typecheck, unit tests, build) passed, but the operator E2E gate from ZERO_REGRESSION_RULES.md Gate 3 was skipped entirely.

**Rule**:
- After all automated gates pass (typecheck + tests + build), Claude MUST provide the operator with a verification script **before pushing or merging**
- The script should be a PowerShell block the operator can paste into VS Code terminal
- If the feature requires docker local-prod to be running, Claude MUST state that prerequisite and provide the docker-compose up command
- Claude MUST NOT push to remote or merge until operator pastes back the E2E results
- If E2E is not possible in the current environment (no Docker, no DB), Claude MUST explicitly flag this as **"E2E DEFERRED — requires local-prod"** and note it in the PR description
- "Automated gates passed" is NOT a substitute for operator E2E

---

## MANDATORY AUTO-CONTINUATION PROTOCOL

> **This section overrides all other session-start behavior. Claude MUST follow this protocol at the start of EVERY session — whether triggered by compaction, layer completion, manual restart, or any other reason — until all 551 tickets across all 19 layers are implemented.**

### On Every Session Start (No Exceptions):

1. **Read machine state**: `cat RELEASES/IMPLEMENTATION_STATE.json` — determine `current_layer`, `tickets_done`, `tickets_remaining`, and `status`
2. **Run fix-guard**: `node scripts/fix-guard.js session-start` then `node scripts/fix-guard.js check`
3. **Check git state**: `git log --oneline -5` and `git status`
4. **Read ticket registry**: `RELEASES/STAGING_TICKETS.md` — find the next OPEN ticket in the current layer
5. **Resume implementation immediately** — do NOT wait for operator input, do NOT ask questions, do NOT summarize prior work

### Continuation Rules:

- **If `status` = "READY_FOR_NEXT_LAYER"**: Start the next PENDING layer. Read the layer's ticket list from STAGING_TICKETS.md and begin with the first OPEN ticket.
- **If `status` = "IN_PROGRESS"**: Resume from `current_ticket` — check if it's partially done (check git diff), complete it, then continue to next ticket.
- **If `status` = "BLOCKED"**: Read the `blocked_reason` field, attempt to resolve, or skip to next non-blocked ticket.
- **If `tickets_remaining` = 0**: All done. Report completion to operator and stop.

### After Each Commit Batch:

1. Update `RELEASES/IMPLEMENTATION_STATE.json`:
   - Increment `tickets_done` by the number of tickets committed
   - Decrement `tickets_remaining`
   - Update `current_layer` and layer status if layer is complete
   - Set `last_commit_sha` to HEAD
   - Set `last_updated` to today's date
   - Increment `version`
2. Continue to next ticket — do NOT stop unless blocked or context limit reached

### Before Session Ends (Compaction Warning):

If you detect you're running low on context:
1. Commit any in-progress work
2. Update IMPLEMENTATION_STATE.json with current position
3. The next session will automatically pick up from this state

### System-Level Auto-Trigger:

The system automatically restarts Claude sessions until `tickets_remaining` hits 0. No manual intervention required after initial launch.

**Auto-start options (pick one):**

1. **VS Code auto-run** (recommended): The `.vscode/tasks.json` has `"runOn": "folderOpen"` — opening this project in VS Code automatically starts the loop. Accept the "Run automatic task" prompt once.

2. **Terminal one-liner**: Run once, walks away:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/auto-implement.ps1
   ```

3. **Windows Task Scheduler** (survives reboots): Create a scheduled task that runs `auto-implement.ps1` at logon:
   ```powershell
   $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File C:\supermandi-pos\scripts\auto-implement.ps1"
   $trigger = New-ScheduledTaskTrigger -AtLogOn
   Register-ScheduledTask -TaskName "SuperMandi-AutoImplement" -Action $action -Trigger $trigger -Description "Auto-implement staging tickets"
   ```

**How it works**: `scripts/auto-implement.ps1` runs an infinite `while($true)` loop → launches `claude --yes --max-turns 200 -p <prompt>` → Claude reads `IMPLEMENTATION_STATE.json` → implements tickets → updates state → session ends → script reads state → if `tickets_remaining > 0` → launches next session → repeat until 0.

### Key Principle:
**The system never stops until all 551 tickets are done.** Claude implements as many tickets as possible per session. When context fills up, it saves state and exits. The wrapper script immediately launches the next session. Zero human intervention between sessions.

---

## Session Mode

### Mode A: Pre-Staging (CURRENT)
- **Session start**: Follow AUTO-CONTINUATION PROTOCOL above FIRST
- Claude starts independently — no operator paste required
- Claude can work on staging tickets directly
- No deploy risk — but branches + PRs still required (Claude self-merges)
- One ticket = one branch = one PR = one tag (no direct pushes to main)
- Follow `RELEASES/CLAUDE_WORKFLOW.md` for every ticket (8 phases, no skipping)
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

**DEPLOYED.** All 6 Cloud Run services live on staging.supermandi.tech (SHA `81c3a2a4`, deployed 2026-03-13). 187/187 migrations applied. CD pipeline #970 — 7/7 jobs GREEN.

## Current Phase: Comprehensive Audit Fix Implementation (STG-493 → STG-551)

- **551 total tickets** organized in **19 layers** — Layers 0-18 COMPLETE (492 PARKED), Layer 19 ACTIVE (59 OPEN)
- **Layer 19**: Comprehensive Audit Fixes — 3 CRITICAL, 10 HIGH, 29 MEDIUM, 17 LOW
- **Implementation order**: P0 (STG-493..498) → P1 (STG-499..507) → P2 (STG-508..534) → P3 (STG-535..551)
- **Active ticket registry**: `RELEASES/STAGING_TICKETS.md`
- **Next ticket number**: STG-552 (check `<!-- next ticket -->` comment at bottom)
- **Git model**: Linear commits on main, one ticket = one commit = one tag
- **Current focus**: Layer 19 — Payment safety, GRN dedup, security hardening, GCP migration deploy

### First Deploy Protocol (Mega-Batch)
When GCP is ready AND SA-GOLIVE is complete:
1. Claude runs automated gates (typecheck + unit tests + build) on HEAD
2. Claude provides E2E script → operator runs → pastes results → Claude fixes until clean
3. Push to CI → all CI gates green
4. Operator browser tests all 4 portals → per-batch `TESTED`
5. Collect per-batch evidence → per-batch `EVIDENCED`
6. Tag MEGA-RC → deploy staging with Migration Safety Protocol
7. Repeat E2E gate on staging (Claude provides staging script → operator runs → fix loop)
8. Operator sign-off → promote to production (only after ALL portals + POS complete)
9. After go-live → switch to Mode B, resume normal cadence

### Migration Safety (First Deploy Only)
- Cloud SQL backup BEFORE migration run
- `migrate-prod.js dry-run` to preview pending migrations
- Manual migration execution (not auto on container start)
- See MASTER_PLAN.md BATCH-010 for full protocol

---

## Zero-Drift Protocol (ZDP)

> **Purpose**: Prevent Claude from regressing previous fixes. Every fix is registered with a file-region checksum. Before modifying any file, Claude checks if it contains registered fixes. After every fix, Claude registers it.

### The Fix Ledger (`RELEASES/FIX_LEDGER.json`)
Machine-readable state file tracking every active fix:
```json
{
  "ticket": "STG-001",
  "file": "backend/src/routes/v1/admin/suppliers.ts",
  "start_line": 227,
  "end_line": 301,
  "checksum": "a1b2c3d4e5f6g7h8",
  "description": "Self-registered supplier verify fallback from auth.applications",
  "test_file": "backend/src/__tests__/admin/suppliers.verify.test.ts",
  "status": "ACTIVE"
}
```

### Claude MUST follow this protocol for EVERY code change:

#### BEFORE modifying any file:
1. Run `node scripts/fix-guard.js check` — if drift detected, STOP and investigate
2. Read `RELEASES/FIX_LEDGER.json` — identify any ACTIVE fixes in the file you're about to modify
3. If the file has registered fixes:
   - Read the fixed regions (start_line to end_line)
   - Understand WHY that code exists (read the description)
   - Plan your change to PRESERVE those regions, or explicitly mark the old fix as SUPERSEDED with a reason

#### AFTER every fix:
1. Register the fix: `node scripts/fix-guard.js register '<json>'`
2. Run `node scripts/fix-guard.js check` — confirm zero drift
3. Run the test file associated with the fix
4. Run ALL test files associated with other fixes in the same file

#### BEFORE every commit:
1. `node scripts/fix-guard.js pre-commit` — MUST exit 0
2. If exit non-zero, Claude MUST fix the drift before committing

### Rules:
- **NEVER modify a registered fix region without reading the ledger first**
- **NEVER delete a fix entry** — mark as SUPERSEDED with reason
- **Every fix MUST have a test_file** — no test = no registration = no commit
- **Checksum = truth** — if the checksum doesn't match, the fix has drifted
- **Claude reads the ledger at session start** — this is mandatory, not optional
- **The ledger is committed to git** — it travels with the code

### Guard Script Commands:
```bash
node scripts/fix-guard.js check          # Verify all fixes intact
node scripts/fix-guard.js report         # Print fix ledger summary
node scripts/fix-guard.js register '{}'  # Register a new fix
node scripts/fix-guard.js snapshot <file> <start> <end>  # Get checksum for a region
node scripts/fix-guard.js pre-commit     # Pre-commit validation (exit 0/1)
```
