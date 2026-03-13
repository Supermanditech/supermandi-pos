# Operator Session Prompt — Copy/Paste Into Each New Claude Session

> **Usage**: Copy everything below the `---` line and paste as your first message to Claude.
> Fill in `[YOUR NOTES]` with your focus for that session.
> This keeps Claude in the correct machine state across sessions.

---

Read these files BEFORE doing anything else — they are your machine state:

1. `RELEASES/FIX_LEDGER.json` — active fix checksums (source of truth for drift detection)
2. `scripts/fix-guard.js` — 12-gate pre-commit enforcement (do NOT modify without operator approval)
3. `RELEASES/CLAUDE_WORKFLOW.md` — 9-phase ticket lifecycle + git discipline + 31 failure modes
4. `RELEASES/STAGING_TICKETS.md` — post-GCP deploy ticket registry (STG-001+). Next ticket: check `<!-- next ticket -->` comment at bottom
5. `CLAUDE.md` — project rules, architecture, hard lessons, store isolation, test discipline

After reading all 5 files, run: `node scripts/fix-guard.js session-start`

Then confirm to me:
- How many active fixes exist and are all intact?
- Any drift or missing files?
- Any uncommitted changes from previous session?
- Any IN_PROGRESS tickets that need resuming?
- What is the next ticket number (from STAGING_TICKETS.md bottom comment)?

Do NOT write any code until session-start passes with zero drift.

Source of truth:
- Code state: `main` branch HEAD
- Fix integrity: `FIX_LEDGER.json` checksums
- Ticket registry: `STAGING_TICKETS.md` (492 tickets, 18 layers, STG-001+)
- Archived tickets: `STAGING_TICKETS_V1.md` (440 pre-deploy tickets, read-only)
- Revert anchors: `stg-XXX-YYYY-MM-DD` tags
- GCP staging baseline: SHA `81c3a2a4` (deployed 2026-03-13)

Implementation plan:
- 18 layers (L0–L18), dependency-ordered, complete each layer before next
- 29 loophole guards (LH-001–029) — mandatory, no skipping
- 12 GUARD prereq tickets (STG-481–492) — must complete before dependent tickets
- Layer 0 first: Security, DPDP, P0 bugs (17 tickets)
- One ticket = one commit = one tag, linear on main

Per-ticket completion protocol (ALL 9 phases mandatory, no skipping):
```
Phase 0: Read ticket from STAGING_TICKETS.md
Phase 1: Pre-flight — fix-guard check, git status clean, read FIX_LEDGER, typecheck baseline
Phase 2: Scope analysis — announce files, registered fixes, migration needs, test plan to operator
Phase 3: Implement — DB layer → backend → frontend → cross-layer wiring
Phase 4: Test — typecheck + unit + integration + UI + business logic + edge cases (ALL applicable)
Phase 5: Register — fix-guard register every modified region, verify zero drift
Phase 6: Regression gate — FULL test suite (not just new tests), production build, GCP parity
Phase 7: Git commit — stage by name, one commit per ticket, tag, verify clean state, update ticket status
Phase 8: Next ticket pre-flight — clean tree, fix-guard check, typecheck
```

Git discipline (per commit):
- Linear commits on main, one ticket = one commit = one tag
- Every commit must pass 12-gate pre-commit (`fix-guard.js`)
- Stage files by name (NEVER `git add .` or `git add -A`)
- ALWAYS stage with source files: `FIX_LEDGER.json` + `STAGING_TICKETS.md`
- Commit format: `fix(STG-XXX): description` with body listing files, migration, tests, fix ledger entries
- Tag AFTER commit: `git tag stg-XXX-YYYY-MM-DD` (tag is rollback anchor)
- Verify after commit: `git status` clean + `git log --oneline -1` correct + `fix-guard check` zero drift
- Never amend, never force push, never skip hooks, never `--no-verify`
- Update ticket status to PARKED in STAGING_TICKETS.md with commit SHA + tag

Git anti-patterns (FORBIDDEN):
- `git add .` or `git add -A` (catches .env, temp files)
- Two tickets in one commit (can't revert independently)
- Commit without fix-guard passing (drift enters history)
- Amending a previous ticket's commit (rewrites history, breaks tags)
- `test.skip()` or `test.todo()` (hides broken tests)
- Touching files outside ticket scope (create new ticket instead)
- Committing STAGING_TICKETS.md without FIX_LEDGER.json
- "Will add tests later" (tests are part of the fix, not a follow-up)

Ticket status lifecycle:
```
OPEN → IN_PROGRESS → PARKED (committed + tagged on main)
```
PARKED entry must include: commit SHA, tag name, fix ledger region count, test file, migration number (if any)

Current operator context: [YOUR NOTES — e.g. "today we're working on Layer 0 GUARD tickets" or "staging deploy is frozen" or "focus on STG-492 PENDING_UPI_KEY fix" or "skip DPDP tickets, focus on P0 bugs only"]
