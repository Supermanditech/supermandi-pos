# Claude Production Workflow — Zero-Drift, End-to-End

> **This is the MANDATORY workflow for every ticket. No shortcuts. No skips.**
> Every ticket must be deployable independently and must not regress any previous ticket.

---

## Session Start (MANDATORY — before ANY work)

Every Claude session MUST begin with:

```bash
node scripts/fix-guard.js session-start
```

This command:
1. Checks all registered fixes for drift (auto-corrects line shifts)
2. Lists all protected files and their regions
3. Reports fixes missing test coverage
4. Exits 0 (ready) or 1 (blocked — fix issues first)

**If session-start exits non-zero, Claude MUST NOT start any new work until resolved.**

---

## Overview: One Ticket Lifecycle

```
SESSION-START → OPERATOR INPUT → TICKET CREATED → PRE-FLIGHT → SCOPE → IMPLEMENT → TEST → REGISTER → REGRESSION GATE → PARK → NEXT TICKET
```

Each ticket goes through **9 mandatory phases** (0-8). Claude cannot skip or reorder phases.

---

## Phase 0: Operator Input

**Who**: Operator (human)
**What**: Operator navigates the app (POS / Retailer / Supplier / SuperAdmin) and reports what's wrong or what's needed.
**Output**: A ticket entry in `RELEASES/STAGING_TICKETS.md`

### Ticket Format:
```markdown
### STG-XXX: [Short Title]
- **Portal**: POS | Retailer | Supplier | SuperAdmin
- **Screen**: [exact screen path, e.g., Sell > Product Tile]
- **Type**: BUG | MISSING | UX | LOGIC | DATA | PERF
- **Severity**: P0 (blocks testing) | P1 (wrong behavior) | P2 (cosmetic/UX)
- **Description**: [what operator sees / what's wrong]
- **Expected**: [what it should do]
- **Screenshot**: [if applicable]
- **Status**: OPEN
```

---

## Phase 1: Pre-Flight Check (BEFORE writing any code)

Claude MUST run these checks before touching any file:

```bash
# 1. Verify zero drift on all existing fixes
node scripts/fix-guard.js check
# MUST exit 0. If not, STOP and fix drift first.

# 2. Verify clean working tree
git status
# MUST be clean. If not, stash or commit pending work.

# 3. Read the fix ledger
# Claude reads RELEASES/FIX_LEDGER.json to know all protected regions

# 4. Typecheck baseline
pnpm -r typecheck
# MUST pass. If not, fix typecheck first.
```

**Gate**: All 4 checks pass → proceed. Any failure → fix first, do not start ticket.

---

## Phase 2: Scope Analysis (BEFORE writing any code)

Claude announces to the operator:

```
Starting STG-XXX: [title]

SCOPE ANALYSIS:
├── Files to modify: [list with line ranges]
├── Files with registered fixes: [list from FIX_LEDGER.json]
│   └── Will preserve: [ticket IDs and their regions]
├── New files to create: [list]
├── Migration needed: YES/NO
│   └── Migration number: [next available, e.g., 188]
├── Tables affected: [schema.table list]
├── API endpoints affected: [method + path]
├── UI components affected: [component names]
├── Business logic touched: [from Business Logic Registry]
└── Test plan:
    ├── Unit tests: [what to test]
    ├── Integration tests: [API chain tests]
    ├── UI tests: [render + wiring + navigation + 4-state]
    └── Edge cases: [list]
```

**Gate**: Operator reviews scope. If scope is wrong, Claude adjusts before coding.

---

## Phase 3: Implementation

### 3A: Database Layer (if needed)
1. Determine next migration number: `ls backend/migrations/ | tail -5` → use next sequential number
2. Create migration file: `backend/migrations/NNN-stg-xxx-description.sql`
3. Migration MUST be idempotent (use IF NOT EXISTS, IF NOT EXISTS column, etc.)
4. Migration MUST include rollback comment at top: `-- ROLLBACK: DROP TABLE/ALTER TABLE DROP COLUMN ...`
5. Test migrate-from-zero: `pnpm run migrate:test` (if available)
6. Record migration number in ticket: "Migration: 188 — added supplier.supplier_store_links.auto_reorder column"

### 3B: Backend Layer
1. Modify/create route handlers, services, models
2. Follow existing patterns in the codebase
3. Server derives storeId from JWT — NEVER trust client
4. Every query includes `WHERE store_id = $token.storeId`
5. Input validation at API boundary
6. Proper error responses with meaningful codes

### 3C: Frontend Layer
1. Modify/create components, screens, API calls
2. Every screen must handle 4 states: Loading, Success, Empty, Error
3. Navigation guards (auth check, role check)
4. API wiring (button → API call → state update → UI feedback)
5. Mobile responsive (if portal)
6. Accessibility basics (labels, contrast)

### 3D: Cross-Layer Wiring
1. Verify full chain: UI button → API call → backend handler → DB query → response → UI update
2. No orphan endpoints (backend route with no frontend caller)
3. No orphan UI (button that calls nonexistent endpoint)

### Rules During Implementation:
- **Check FIX_LEDGER before modifying any file** — if file has registered fixes, preserve those regions
- **If you must modify a registered region**: mark old fix as SUPERSEDED with reason, register new fix
- **One commit per logical change** — don't bundle unrelated changes
- **No hardcoded values** — env vars and named constants only

---

## Phase 4: Test Suite (MANDATORY — no exceptions)

Every ticket requires ALL applicable test types:

### 4A: Type Safety
```bash
pnpm -r typecheck
```

### 4B: Unit Tests
- Test the specific function/component changed
- Test edge cases and error paths
- Test business logic invariants
- File: colocated with source or in `__tests__/` directory

### 4C: Integration Tests (if API changed)
- Test the full API chain: request → middleware → handler → DB → response
- Test auth enforcement (unauthenticated, wrong role)
- Test input validation (missing fields, invalid types, boundary values)
- Test store isolation (request with store A token cannot access store B data)

### 4D: UI Tests (if frontend changed)
- **Render smoke**: component mounts without crashing
- **UI elements**: all buttons, fields, headers, footers present
- **Wiring**: click button → API called → state updated → UI reflects change
- **Navigation guards**: unauthorized user redirected
- **4-state UX**: loading spinner, success content, empty state, error message

### 4E: Business Logic Tests (if logic changed)
- Stock invariant: stock cannot go negative
- Ledger invariant: sum(deltas) = current balance
- Store isolation: no cross-store data leakage
- Idempotency: duplicate request = same result
- Price integrity: sell_price <= mrp

### 4F: Edge Case Tests
- Null/undefined inputs
- Empty strings, zero quantities
- Maximum length strings (VARCHAR constraints)
- Concurrent operations (if applicable)
- Offline/retry scenarios (if POS)

### Test Naming Convention:
```
<module>.stg-xxx.<aspect>.test.ts
```
Example: `suppliers.stg-038.verify-fallback.test.ts`

**Gate**: ALL tests pass. Zero failures. No test.skip(). No test.todo().

---

## Phase 5: Fix Registration

After implementation AND tests pass:

```bash
# Register every modified region
node scripts/fix-guard.js register '{
  "ticket": "STG-XXX",
  "file": "path/to/file.ts",
  "start_line": 100,
  "end_line": 150,
  "description": "What this fix does and why",
  "test_file": "path/to/__tests__/file.test.ts"
}'

# Verify all fixes (old + new) are intact
node scripts/fix-guard.js check
# MUST show zero drift

# Full report
node scripts/fix-guard.js report
```

**Gate**: `fix-guard.js check` exits 0 with all fixes intact.

---

## Phase 6: Full Regression Gate

Run the COMPLETE test suite — not just the new tests:

```bash
# 1. Fix guard (with auto line-shift correction)
node scripts/fix-guard.js check

# 2. Typecheck everything
pnpm -r typecheck

# 3. All backend tests
cd backend && pnpm test

# 4. All portal tests (whichever portal was modified)
cd retailer-admin && pnpm test      # if retailer changed
cd supplier-portal && pnpm test     # if supplier changed
cd supermandi-superadmin && pnpm test # if superadmin changed

# 5. Production build check (must succeed — this is what GCP Docker builds)
cd backend && pnpm build
cd retailer-admin && pnpm build     # if retailer changed
cd supplier-portal && pnpm build    # if supplier changed
cd supermandi-superadmin && pnpm build # if superadmin changed

# 6. GCP staging parity check
#    - Verify no hardcoded localhost/dev URLs in committed code
#    - Verify env vars used match what's in GCP Secret Manager
#    - Verify migration number is sequential (no gaps, no collisions)
#    - Verify Dockerfile builds succeed: docker build -f backend/Dockerfile .
```

**Gate**: ALL pass. Any failure = investigate and fix before proceeding.

### GCP Staging Parity Checklist:
- [ ] No `localhost`, `127.0.0.1`, or dev ports hardcoded in committed code
- [ ] All env vars referenced exist in GCP Secret Manager or Cloud Run env
- [ ] Migration files are sequentially numbered with no gaps
- [ ] API routes match what api-gateway proxies (no orphan routes)
- [ ] CORS origins include `staging.supermandi.tech`
- [ ] All new npm dependencies are in `package.json` (not just local installs)

---

## Phase 7: Git Discipline & Ticket Completion

### Git Model: Linear Commits on Main

We commit directly to `main` — no feature branches per ticket. Why:
- 100+ tickets would create 100+ branches → merge hell
- All tickets are heading to the SAME mega deploy
- fix-guard.js + pre-commit hook protects against regressions
- Every commit is individually revertable via `git revert <SHA>`

**But this requires strict discipline:**

### 7A: Stage ONLY ticket files (never `git add .` or `git add -A`)

```bash
# List exactly what changed
git status

# Stage ONLY files for THIS ticket — by name, one by one
git add backend/src/routes/v1/pos/sell.ts
git add backend/src/__tests__/pos/sell.stg-042.test.ts
git add RELEASES/FIX_LEDGER.json
git add RELEASES/STAGING_TICKETS.md

# NEVER do this:
# git add .          ← catches untracked junk, .env files, temp files
# git add -A         ← same problem
# git add backend/   ← too broad, might catch unrelated changes
```

**Rule**: If `git status` shows files you didn't touch for this ticket, DO NOT stage them. Either:
- They belong to a different ticket → leave them for later
- They're untracked junk → add to `.gitignore`
- They're accidental changes → `git checkout -- <file>` to discard

### 7B: One Ticket = One Commit = One Revert Unit

```bash
# Commit message format: type(TICKET): description
git commit -m "$(cat <<'EOF'
fix(STG-042): add brand and stock badge to POS sell tile

- Modified SellTile component to show brand below product name
- Added stock status badge (LOW/OUT) with color coding
- Backend: added brand field to /pos/products response
- Migration: 188 — added catalog.store_products.display_brand
- Tests: sell-tile.stg-042.render.test.tsx (4 tests)
- Fix Ledger: 2 regions registered (SellTile.tsx L45-89, products.ts L112-130)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Commit message rules:**
- First line: `fix(STG-XXX):` or `feat(STG-XXX):` — max 72 chars
- Body lists: what changed, migration number, test files, fix ledger entries
- **NEVER** mix two ticket IDs in one commit
- **NEVER** commit without the fix-guard pre-commit hook passing

### 7C: Tag the Commit (Rollback Anchor)

```bash
# Tag format: stg-XXX-YYYY-MM-DD
git tag stg-042-2026-03-14

# This tag is the rollback anchor:
# To undo ONLY ticket STG-042 later:
#   git revert <SHA of stg-042 commit>
#   (other tickets are untouched because they're separate commits)
```

**Why tags matter:**
- `git log --oneline` gets messy after 100 commits
- Tags let you find any ticket's commit instantly: `git show stg-042-2026-03-14`
- Tags are immutable — even if `main` gets rebased, the tag points to the right SHA

### 7D: Verify Clean State After Commit

```bash
# After committing, verify:
git status                          # clean tree — nothing left unstaged
git log --oneline -3                # latest commit is your ticket
node scripts/fix-guard.js check     # zero drift after commit
```

### 7E: Update Ticket Status

In `RELEASES/STAGING_TICKETS.md`, update the ticket:
```markdown
- **Status**: PARKED
- **Commit**: a1b2c3d (short SHA)
- **Tag**: stg-042-2026-03-14
- **Fix Ledger**: 2 regions registered
- **Tests**: sell-tile.stg-042.render.test.tsx
- **Migration**: 188 (if applicable)
```

### 7F: Report to Operator

```
STG-042 PARKED:
- Fix: Added brand and stock badge to POS sell tile
- Commit: a1b2c3d
- Tag: stg-042-2026-03-14
- Files: 4 modified, 1 created
- Tests: 4 new, 5196 total passing
- Fix Ledger: 2 regions registered, 3 total active, zero drift
- Migration: 188
- Risk: SellTile layout could overflow on small screens with long brand names
- Revert: git revert a1b2c3d (safe, isolated commit)
```

---

## Phase 8: Next Ticket Pre-Flight

Before starting the next ticket:

```bash
# 1. Verify clean state
git status                          # clean tree
git log --oneline -3                # confirm last commit is tagged

# 2. Fix guard with auto line-shift correction
node scripts/fix-guard.js check     # zero drift
# (If previous ticket shifted lines in files with registered fixes,
#  this auto-corrects the line numbers in the ledger)

# 3. Typecheck baseline
pnpm -r typecheck                   # zero errors
```

**All 3 must pass. If any fails, fix it before starting the next ticket.**

**This is the loop.** Every ticket follows Phases 1-8. No exceptions.

---

## Rollback Protocol (Per-Ticket)

Because each ticket is ONE commit with ONE tag, rollback is surgical:

### Scenario A: Ticket STG-042 broke something, other tickets are fine
```bash
# Revert only STG-042 — other tickets untouched
git revert stg-042-2026-03-14

# The revert creates a NEW commit (doesn't destroy history)
# Fix guard will flag STG-042's regions as drifted — that's expected
# Update FIX_LEDGER: mark STG-042 entries as SUPERSEDED with reason "REVERTED"
```

### Scenario B: Need to redo STG-042 differently
```bash
# 1. Revert the original
git revert stg-042-2026-03-14

# 2. Create the new fix (same ticket ID, new approach)
# ... implement ...
git commit -m "fix(STG-042): [new approach description]"
git tag stg-042-v2-2026-03-14

# 3. Re-register in fix ledger with new checksum
```

### Scenario C: Nuclear — revert everything after a certain point
```bash
# Find the last known-good tag
git log --oneline --decorate

# Revert all commits after that point (newest first)
git revert HEAD~3..HEAD --no-commit
git commit -m "revert: roll back STG-044, STG-043, STG-042 — [reason]"
```

---

## Mega-Batch Deploy (After N Tickets Parked)

When operator decides to deploy (all tickets parked on main):

```bash
# 1. Full integrity check
node scripts/fix-guard.js session-start    # all fixes intact
pnpm -r typecheck                          # zero errors

# 2. Full test suite
cd backend && pnpm test                    # all backend tests
cd retailer-admin && pnpm test             # if retailer tickets exist
cd supplier-portal && pnpm test            # if supplier tickets exist
cd supermandi-superadmin && pnpm test      # if superadmin tickets exist

# 3. Production builds
cd backend && pnpm build
cd retailer-admin && pnpm build
cd supplier-portal && pnpm build
cd supermandi-superadmin && pnpm build

# 4. GCP parity check (see Phase 6 checklist)

# 5. Tag the mega-batch
git tag MEGA-RC-v2-2026-03-15
```

Then:
6. Push to CI → all CI gates green
7. Claude provides E2E verification script → operator runs in terminal
8. Fix any issues found → new ticket → loop back to step 1
9. Deploy to GCP staging
10. Operator tests all portals + POS on staging
11. Fix any staging issues → new tickets → loop back
12. Operator sign-off → promote to production

### Push Discipline:
- **DO NOT push after every ticket** — accumulate locally
- **Push only at mega-batch deploy time** (step 6)
- **Exception**: push if operator needs to test on staging mid-batch
- When pushing: `git push origin main --tags` (push tags too)

---

## Git Anti-Patterns (FORBIDDEN)

| Forbidden | Why | Do Instead |
|---|---|---|
| `git add .` or `git add -A` | Catches .env, temp files, unrelated changes | Stage files by name |
| Two tickets in one commit | Can't revert one without the other | One ticket = one commit |
| Commit without fix-guard passing | Drift enters git history | Pre-commit hook blocks this |
| `git push` after every ticket | Triggers CI 100 times, wastes resources | Push at mega-batch time only |
| Amending a previous ticket's commit | Rewrites history, breaks tags | New commit, even for small fixes to same ticket |
| `git rebase -i` to squash ticket commits | Loses individual revert ability | Keep commits separate |
| Committing STAGING_TICKETS.md without FIX_LEDGER.json | Ticket says PARKED but no checksum guard | Always commit both together |
| Modifying a registered fix region without reading ledger | Causes silent regression | Read ledger first, preserve or explicitly supersede |
| Skipping tests for "simple" changes | Every "simple" change has caused regressions | Write the test, no exceptions |
| `test.skip()` or `test.todo()` | Hides broken tests | Fix the test or don't commit |
| "Will add tests later" | Later never comes | Tests are part of the fix, not a follow-up |
| Touching files outside ticket scope | Scope creep causes untracked regressions | Create a new ticket for the other issue |
| Parallel agents on overlapping files | Merge conflicts cause silent overwrites | Serialize work on shared files |

---

## Git Commit History (What It Should Look Like)

After 10 tickets, `git log --oneline --decorate` should look like:

```
f4e3d2c (HEAD -> main, tag: stg-050-2026-03-14) fix(STG-050): add empty state to supplier list screen
b1a2c3d (tag: stg-049-2026-03-14) fix(STG-049): fix POS checkout payment mode selection
9e8f7g6 (tag: stg-048-2026-03-14) feat(STG-048): add customer due balance to sell screen
7d6e5f4 (tag: stg-047-2026-03-14) fix(STG-047): fix barcode scan returning wrong product
5c4d3e2 (tag: stg-046-2026-03-14) fix(STG-046): retailer dashboard stock count mismatch
3b2c1d0 (tag: stg-045-2026-03-14) feat(STG-045): add daily closing report screen
1a0b9c8 (tag: stg-044-2026-03-14) fix(STG-044): fix supplier portal login redirect loop
e9d8c7b (tag: stg-043-2026-03-14) fix(STG-043): superadmin store list pagination
c7b6a5f (tag: stg-042-2026-03-14) fix(STG-042): add brand and stock badge to sell tile
a5f4e3d (tag: MEGA-RC-v1-2026-03-13) fix(CI): resolve jsdom teardown errors
```

**Each line = one ticket. Each tag = one rollback anchor. Clean, linear, auditable.**

---

## What Can Go Wrong — Failure Modes & Mitigations

> Every failure mode below has happened or WILL happen at scale. Each has a specific mitigation.

### FM-01: Migration Revert Is Impossible
**Scenario**: Ticket STG-045 adds migration 189 (new column). Deployed to staging. Later we `git revert stg-045` — the code reverts, but the column STILL EXISTS in the staging DB. Backend code no longer references it, but it's orphaned. Worse: if the migration DROP'd something, reverting the file doesn't un-drop it.

**Mitigation**:
- Every migration file MUST have a rollback comment: `-- ROLLBACK: ALTER TABLE x DROP COLUMN y`
- When reverting a ticket with a migration, Claude MUST create a NEW forward migration (e.g., 190) that undoes 189
- NEVER assume `git revert` handles DB state — it only handles files
- Tag migration numbers in the ticket so we know which tickets have DB impact

### FM-02: Revert Breaks Dependent Tickets
**Scenario**: STG-045 adds column `brand` to `store_products`. STG-048 queries `brand` in a new API. Reverting STG-045 breaks STG-048 — the column disappears but STG-048's code still references it.

**Mitigation**:
- Before reverting any ticket, Claude MUST check: "Do any later tickets reference files/tables/columns introduced by this ticket?"
- Run `git log --oneline stg-045..HEAD -- <files touched by 045>` to see if later commits touched the same files
- If dependencies exist: revert must be done in reverse order (newest dependent first), or the revert must be combined with fixes to all dependents
- In Phase 2 (Scope Analysis), record dependencies: "Depends on: STG-045 (uses brand column)"

### FM-03: FIX_LEDGER.json Merge Conflicts on Revert
**Scenario**: Every ticket modifies FIX_LEDGER.json (adding its entries). `git revert stg-045` tries to revert the ledger change, but tickets 046-050 also modified it. Git can't cleanly revert → merge conflict.

**Mitigation**:
- When reverting a ticket, handle FIX_LEDGER.json MANUALLY — don't let git auto-revert it
- Steps: `git revert --no-commit stg-045` → manually edit FIX_LEDGER.json (mark the reverted ticket's entries as SUPERSEDED, keep all others) → `git commit`
- NEVER let a revert blindly touch FIX_LEDGER.json

### FM-04: Context Window Compaction Mid-Ticket
**Scenario**: Claude is implementing Phase 3 (halfway through a 15-file ticket). Context compacts. Claude loses track of which files it already modified vs. which are pending. It re-modifies an already-changed file or skips a file.

**Mitigation**:
- At the start of Phase 3, Claude writes implementation checklist to the conversation (not just mental tracking)
- After compaction, Claude MUST run `git diff --name-only` to see what's already changed
- Claude MUST re-read the ticket scope from STAGING_TICKETS.md (which is on disk, survives compaction)
- If unsure what's done, run `git diff` on each file in scope to see current state

### FM-05: Test Files Not Protected by Fix-Guard
**Scenario**: Fix-guard checksums SOURCE code regions but not TEST files. Ticket STG-048 accidentally modifies a test file from STG-042. The source code is intact (fix-guard passes), but the test is broken — it no longer validates what STG-042 fixed.

**Mitigation**:
- Register BOTH source AND test regions in fix-guard: one entry for the source fix, one entry for the test
- Test entry example: `{"ticket":"STG-042","file":"src/__tests__/sell.stg-042.test.ts","start_line":1,"end_line":50,"description":"TEST: sell tile brand badge","test_file":"self"}`
- This way, if anyone modifies the test file, fix-guard catches it

### FM-06: Shared Utility Modified by One Ticket, Breaks Others
**Scenario**: Ticket STG-043 modifies `backend/src/utils/formatPrice.ts` (a shared helper used by 12 files). Fix-guard protects the specific region STG-043 changed, but the BEHAVIOR change breaks callers that weren't in STG-043's scope.

**Mitigation**:
- Phase 2 (Scope Analysis) MUST flag shared utilities: "This file is imported by [list]. Changes here affect all of them."
- If modifying a shared utility: run tests for ALL callers, not just the ticket's own tests
- Prefer adding a NEW function over modifying an existing one (existing callers untouched)
- If behavior must change: create tickets for all affected callers

### FM-07: STAGING_TICKETS.md Grows Too Large to Read
**Scenario**: After 100+ tickets, STAGING_TICKETS.md exceeds 25,000 tokens. Claude can't read it in one go. It misses context about earlier tickets. (This already happened — the file exceeded the read limit.)

**Mitigation**:
- Keep individual ticket entries concise (max 10 lines per ticket)
- After every 50 tickets, ARCHIVE completed tickets to `RELEASES/STAGING_TICKETS_ARCHIVE_001.md`
- Active file only contains: OPEN + IN_PROGRESS + recently PARKED (last 20)
- Summary table at top stays, pointing to archives for older tickets

### FM-08: Pre-Commit Hook Bypassed
**Scenario**: Claude or operator runs `git commit --no-verify` to skip the hook. Drifted code enters git history. Or operator uses a GUI that doesn't run hooks.

**Mitigation**:
- CLAUDE.md explicitly forbids `--no-verify` (already in production rules)
- Phase 6 (Regression Gate) runs `fix-guard.js check` independently of the hook — double coverage
- If operator commits outside Claude: next session's `session-start` catches drift before any new work
- Add `.gitattributes` note: "pre-commit hook required — do not bypass"

### FM-09: Overlapping Registered Regions
**Scenario**: STG-042 registers L100-150. STG-048 registers L140-180 in the same file. Lines 140-150 are in BOTH regions. Modifying line 145 triggers BOTH checksums. But only one ticket is being worked on — the other is a false alarm.

**Mitigation**:
- In Phase 2, Claude checks fix-guard for overlaps: "Lines 140-150 are in STG-042's region"
- If overlap is unavoidable: SUPERSEDE the overlapping portion of the older ticket and re-register with the combined scope
- fix-guard.js SHOULD warn about overlaps on `register` (enhancement to add)

### FM-10: Untracked Files Accumulate → Noisy `git status`
**Scenario**: After 50 tickets, 30+ untracked files pile up (temp files, screenshots, test outputs). `git status` becomes a wall of text. Claude can't tell what's real.

**Mitigation**:
- Phase 8 (Next Ticket Pre-Flight) includes: "If `git status` shows >5 untracked files, clean up"
- Add known noise to `.gitignore`: `*.png`, `pos_screen.png`, `cloud-sql-proxy.exe`, `*.log`
- Before Phase 7 (commit), run `git status` and explicitly list which untracked files are NOT part of this ticket

### FM-11: Operator Edits Files Outside Claude
**Scenario**: Operator opens a file in VS Code, makes a quick edit, saves. Claude doesn't know. Later, Claude reads the file and sees unexpected code. Or worse: the edit was in a registered region → fix-guard flags drift at commit time, but Claude doesn't know why.

**Mitigation**:
- Phase 1 (Pre-Flight) runs `git diff` to see if anything changed since last commit
- If unexpected changes exist: Claude asks operator "Did you modify [file]? Should I incorporate this?"
- NEVER auto-discard unexpected changes — they may be operator's intentional work

### FM-12: Migration Number Collision
**Scenario**: Two Claude sessions (or operator + Claude) both pick migration number 188. Both create different files with number 188. One overwrites the other or both exist with different content.

**Mitigation**:
- Migration number is determined at Phase 3 time by READING the filesystem: `ls backend/migrations/ | sort -n | tail -1`
- Single-session discipline: only one Claude session works at a time on this repo
- If parallel work is needed: assign non-overlapping migration ranges (e.g., session A gets 188-199, session B gets 200-211)

### FM-13: Tags Not Pushed → Lost on Disk Failure
**Scenario**: 50 tickets parked with local tags. Laptop disk fails before mega-batch push. All tags lost. Commits are on local main (also lost).

**Mitigation**:
- After every 10 tickets, push to remote as a checkpoint: `git push origin main --tags`
- This doesn't trigger full CI deploy — just preserves history
- Note: this is different from "push to deploy." Push to preserve ≠ push to release.
- Add to Phase 8: "Every 10 tickets, checkpoint push to remote"

### FM-14: `git revert` on Commit That Modified FIX_LEDGER.json Removes Fix Entries
**Scenario**: `git revert stg-045` also reverts the FIX_LEDGER.json changes from that commit. This removes STG-045's entries from the ledger. Fix-guard no longer knows those regions were ever protected. If a later revert or change touches those lines, no alarm fires.

**Mitigation**:
- ALWAYS revert with `--no-commit`: `git revert --no-commit stg-045`
- Then manually edit FIX_LEDGER.json: change STG-045 entries from ACTIVE to `"status": "REVERTED"` (don't delete them)
- Then commit the revert as one clean commit
- This preserves the audit trail in the ledger

### FM-15: Large Ticket = Unreviewable Commit
**Scenario**: A ticket touches 15 files across 4 layers (migration + 5 backend files + 6 frontend files + 3 test files). The single commit diff is 800 lines. No one can review it meaningfully.

**Mitigation**:
- If scope analysis shows >10 files or >500 lines of changes, SPLIT the ticket
- Split strategy: STG-042A (backend + migration), STG-042B (frontend), STG-042C (tests)
- Each sub-ticket gets its own commit and tag
- Sub-tickets are linked: "Part of: STG-042"

### FM-16: Business Logic Regression Not Caught by Region Checksums
**Scenario**: STG-042 fixes price calculation. Fix-guard protects the price calc function (L100-120). STG-050 modifies the TAX function (L200-220, different region). But the tax function is called BY the price function. The tax change breaks price calculation. Fix-guard shows zero drift because L100-120 is untouched.

**Mitigation**:
- Fix-guard catches CODE drift, not BEHAVIOR drift. Tests catch behavior drift.
- This is why Phase 6 runs the FULL test suite, not just the new ticket's tests
- Phase 4E (Business Logic Tests) specifically tests cross-function invariants
- If fix-guard passes but tests fail → the regression is real, investigate

### FM-17: Session Starts Without Running `session-start`
**Scenario**: New Claude session. Claude reads CLAUDE.md, sees "run session-start", but skips it because the operator said "quick fix on line 42." Proceeds without checking drift. Commits over a drifted region.

**Mitigation**:
- CLAUDE.md states this is MANDATORY, not optional
- Pre-commit hook is the safety net — even if session-start is skipped, the commit is blocked
- But prevention is better: Claude MUST run session-start. No "quick fix" exceptions.
- If operator says "skip the checks": Claude responds "I cannot skip session-start — it takes 2 seconds and protects all previous work"

### FM-18: Partial Commit — Missing Files
**Scenario**: Claude stages 4 of 5 files for a ticket. Commits. Tag created. But the 5th file (test file, or the migration) wasn't staged. The commit is incomplete. Tests fail on that commit. The tag points to a broken state. Next ticket starts from a broken baseline.

**Mitigation**:
- Phase 7A explicitly lists ALL files to stage — Claude MUST cross-check against Phase 2 scope
- After `git add`, run `git diff --cached --name-only` to verify staged files match scope
- After commit, run `pnpm -r typecheck` + test suite AGAIN — if they fail, the commit is incomplete
- If a file was missed: DO NOT amend. Create a follow-up commit: `fix(STG-042): add missing test file`
- The tag stays on the original commit. The follow-up commit is untagged (it's part of the same logical ticket)

### FM-19: Unstaged Changes Bleed Into Next Ticket
**Scenario**: Claude modifies file X for ticket A but decides not to commit it (or forgets). Starts ticket B. File X still has uncommitted changes from ticket A. When committing ticket B, if B also touches file X, the diff includes BOTH A and B's changes. "One ticket = one commit" is violated — ticket B's commit secretly contains ticket A's work.

**Mitigation**:
- Phase 8 (Next Ticket Pre-Flight) requires `git status` = clean tree
- If dirty: Claude MUST resolve before starting next ticket:
  - Changes belong to previous ticket → commit them as that ticket
  - Changes are abandoned → `git checkout -- <file>` to discard
  - Changes are for a future ticket → `git stash save "STG-XXX-WIP"` to park them
- Claude MUST NEVER start a new ticket with uncommitted changes in the working tree

### FM-20: Commit Message Metadata Is Wrong
**Scenario**: Commit message says "Migration: 188" but the actual file is `189-stg-xxx.sql`. Or says "Tests: 4 new" but only 3 exist. Six months later, someone searches commit messages for "migration 188" and finds the wrong commit.

**Mitigation**:
- Claude writes the commit message LAST — after all files are staged and verified
- Migration number in message MUST match the filename: `ls backend/migrations/*stg-xxx*`
- Test count MUST match: `grep -c 'it(' <test-file>`
- Commit message is the audit trail — wrong metadata is a production incident waiting to happen

### FM-21: Tag Created Before or On Wrong Commit
**Scenario**: Claude runs `git tag stg-042-2026-03-14` BEFORE `git commit`, or after a different commit. Tag now points to the wrong SHA. `git show stg-042-2026-03-14` shows the previous ticket's code. Rollback with `git revert stg-042-2026-03-14` reverts the WRONG ticket.

**Mitigation**:
- ALWAYS commit FIRST, then tag: `git commit ... && git tag stg-042-2026-03-14`
- Verify immediately: `git log --oneline -1` shows the correct message + `git tag --points-at HEAD` shows the tag
- If tag was placed wrong: `git tag -d stg-042-2026-03-14` then re-tag on correct commit
- NEVER tag before committing — tag is always the LAST step of Phase 7

### FM-22: FIX_LEDGER.json Not Committed With the Ticket
**Scenario**: Claude commits the source fix and test but forgets to `git add RELEASES/FIX_LEDGER.json`. The checksum registration doesn't travel with the commit. Next session, `session-start` doesn't know about this fix. A future ticket can modify the registered region without any alarm.

**Mitigation**:
- Phase 7A staging checklist ALWAYS includes: `git add RELEASES/FIX_LEDGER.json RELEASES/STAGING_TICKETS.md`
- After `git commit`, verify: `git show --stat HEAD` must include FIX_LEDGER.json
- If missed: immediate follow-up commit with just the ledger file

### FM-23: Checkpoint Push Triggers CI/CD Auto-Deploy
**Scenario**: FM-13 says "push every 10 tickets as checkpoint." But CI/CD pipeline auto-deploys on push to main. Pushing 10 of 100 tickets deploys an incomplete state to staging — half the fixes are live, half aren't. Cross-ticket dependencies break.

**Mitigation**:
- Checkpoint pushes should go to a DIFFERENT branch, not main: `git push origin main:checkpoint/stg-batch-2026-03-14`
- OR: CI/CD pipeline must NOT auto-deploy on main push — only on tag push (MEGA-RC-v2-*)
- OR: disable auto-deploy during the ticket batch: set a CI env var `DEPLOY_ENABLED=false`
- The current CD pipeline triggers on push to main — so checkpoint pushes MUST use a branch alias or the CD must be paused
- **Safest**: push to a non-main branch for checkpoint, push to main only at mega-batch time

### FM-24: Revert Creates an Untracked Commit on Main
**Scenario**: `git revert stg-045` creates a commit with message "Revert 'fix(STG-045)...'". This commit modifies files but doesn't follow the ticket workflow — no ticket ID, no fix-guard registration, no tag. It's an "orphan" commit in the linear history. Fix-guard flags drift on STG-045's regions. There's no tag for rollback of the revert itself.

**Mitigation**:
- Revert commits MUST be tagged: `git tag revert-stg-045-2026-03-15`
- Revert commit message MUST include the reason: `revert(STG-045): [why] — original fix caused [problem]`
- FIX_LEDGER must be updated: mark STG-045 entries as `"status": "REVERTED", "reverted_at": "...", "revert_reason": "..."`
- A revert IS a ticket — create `STG-045-REVERT` in STAGING_TICKETS.md

### FM-25: Git Hooks Not Portable — Fresh Clone Has No Protection
**Scenario**: Operator clones the repo on a new machine (or CI clones it). `.git/hooks/pre-commit` doesn't exist — git hooks aren't versioned. The new environment has ZERO drift protection. Commits go through unchecked.

**Mitigation**:
- Add a `postinstall` script in root `package.json`: `"postinstall": "node scripts/fix-guard.js install-hook"`
- This runs automatically after `npm install` / `pnpm install` — hook is always installed
- CI pipeline should run `node scripts/fix-guard.js check` as an explicit step (not rely on hooks)
- Document in README: "After cloning, run `node scripts/fix-guard.js install-hook`"

### FM-26: Secrets or .env Accidentally Staged
**Scenario**: Claude modifies `.env` while debugging (changes API URL to staging). Later, in Phase 7A, Claude stages it along with other files. `.env` contains database passwords, API keys, Firebase config. It gets committed to git history. Even if immediately removed, it's in git log forever.

**Mitigation**:
- `.env` MUST be in `.gitignore` (verify: `grep '.env' .gitignore`)
- Claude MUST NEVER stage files containing: `.env`, `credentials`, `sa-key`, `secret`, `token`, `password`
- Pre-commit hook enhancement: scan staged files for known secret patterns before allowing commit
- If accidentally committed: `git reset --soft HEAD~1`, unstage the secret file, recommit. Then rotate ALL secrets in the file.

### FM-27: Commit Order Violates Dependency Order
**Scenario**: Ticket STG-048 adds a new column via migration 190. Ticket STG-045 queries that column. If STG-045 is committed FIRST (wrong order), the codebase is broken between STG-045 and STG-048 commits. Tests fail on STG-045's commit. More importantly: reverting STG-048 breaks STG-045 even though STG-045 was committed first.

**Mitigation**:
- Phase 2 (Scope Analysis) MUST declare dependencies: "Depends on: STG-048 (migration 190 adds the column)"
- Dependent tickets MUST be committed AFTER their dependencies
- Commit order = dependency order. Always.
- If Claude discovers a dependency mid-implementation: STOP. Implement the dependency first (as a separate ticket), commit it, THEN continue the original ticket.

### FM-28: FIX_LEDGER Grows Huge → Slow Session Start
**Scenario**: After 200+ tickets with 3 regions each = 600+ entries. `fix-guard.js check` reads 600 entries, computes 600 checksums, and for any mismatches does fuzzy search (sliding window across entire files). Session-start takes 30+ seconds instead of 2 seconds.

**Mitigation**:
- After mega-batch deploy + operator verification, ARCHIVE old fix entries:
  - Move entries with status PARKED+DEPLOYED+VERIFIED to `RELEASES/FIX_LEDGER_ARCHIVE_001.json`
  - Keep only ACTIVE (undeployed) entries in the main ledger
- Add a `fix-guard.js archive` command that moves all deployed entries to archive
- Fuzzy search optimization: search ±100 lines from registered position first, before full-file scan
- Target: session-start < 5 seconds even with 100 active entries

### FM-29: Stale STAGING_TICKETS.md Ticket Stays IN_PROGRESS Forever
**Scenario**: Claude starts ticket STG-045, sets status to IN_PROGRESS. Context window runs out / session crashes / operator says "stop, do something else." The ticket stays IN_PROGRESS in the file forever. Next session, Claude sees it and thinks someone is working on it — or worse, tries to continue with no context on what was already done.

**Mitigation**:
- Phase 1 (Pre-Flight) scans STAGING_TICKETS.md for IN_PROGRESS tickets
- If found: Claude checks `git diff` and `git status` to see if work exists for that ticket
- If work exists (uncommitted changes): ask operator "Ticket STG-045 is IN_PROGRESS with uncommitted changes. Continue, commit, or abandon?"
- If no work exists: reset status to OPEN and start fresh
- Rule: a ticket should be IN_PROGRESS for ONE session only. If session ends without PARKED, status goes back to OPEN.

### FM-30: Two Tickets Modify the Same File in Different Regions — Git Diff Becomes Confusing
**Scenario**: STG-042 modifies lines 50-80 of `SellTile.tsx`. Later, STG-048 modifies lines 150-180 of the same file. Both are legitimate non-overlapping changes. But `git show stg-048` shows a diff that includes ONLY STG-048's changes, while `git diff stg-042..stg-048 -- SellTile.tsx` shows BOTH. This confuses debugging — "which ticket changed line 75?"

**Mitigation**:
- FIX_LEDGER is the source of truth for "which ticket owns which lines"
- `fix-guard.js report` groups regions by file and shows all ticket owners
- For debugging: `node scripts/fix-guard.js snapshot SellTile.tsx 50 80` shows the content + which ticket registered it
- `git log --follow -p -- SellTile.tsx` shows the full history of changes to that file

### FM-31: Claude Creates New File but Doesn't Add to .gitignore — Future `git status` Noise
**Scenario**: Claude creates a test fixture file `__tests__/fixtures/mock-products.json` for STG-042. It's committed. But for STG-048, Claude generates a temporary `test-output.json` in the same directory. Now `git status` shows `test-output.json` as untracked. Over 50 tickets, dozens of such temp files accumulate.

**Mitigation**:
- Every new file Claude creates must be either:
  1. Committed (part of the ticket), OR
  2. Added to `.gitignore` (if it's generated/temporary)
- Phase 7D (Verify Clean State) catches this: `git status` must show no unexpected untracked files
- Generated files (test outputs, build artifacts) go in `.gitignore` IMMEDIATELY, not "later"

---

## File Map

```
RELEASES/
├── STAGING_TICKETS.md      — Ticket registry (operator + Claude)
├── FIX_LEDGER.json         — Machine state (checksums, regions, status)
├── CLAUDE_WORKFLOW.md       — This file (the workflow)
├── CLAUDE_PRODUCTION_RULES.md — Coding rules
├── ZERO_REGRESSION_RULES.md   — Deploy rules
└── MASTER_PLAN.md             — Overall plan

scripts/
└── fix-guard.js             — Zero-drift enforcement tool
```
