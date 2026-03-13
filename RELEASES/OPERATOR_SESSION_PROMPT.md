# Operator Session Prompt — Copy/Paste Into Each New Claude Session

> **Usage**: Copy everything below the `---` line and paste as your first message to Claude.
> Fill in `[YOUR NOTES]` with your focus for that session.
> This keeps Claude in the correct machine state across sessions.

---

these are files Read these files BEFORE doing anything else — they are your machine state:

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
- 18 layers (L0-L18), dependency-ordered, complete each layer before next
- 29 loophole guards (LH-001-029) — MANDATORY, no skipping
- 12 GUARD prereq tickets (STG-481-492) — MUST complete before dependent tickets
- Layer 0 first: Security, DPDP, P0 bugs (17 tickets)
- One ticket = one commit = one tag, linear on main

Per-ticket completion protocol (ALL 9 phases MANDATORY — Claude MUST NOT skip any phase):
```
Phase 0: Read ticket from STAGING_TICKETS.md — understand problem, fix, test plan
Phase 1: Pre-flight — fix-guard check (MUST exit 0), git status (MUST be clean), read FIX_LEDGER, pnpm -r typecheck (MUST pass)
Phase 2: Scope analysis — announce to operator: files in scope, registered fixes to preserve, migration needs, test plan. WAIT for operator review.
Phase 3: Implement — DB layer → backend → frontend → cross-layer wiring. Check FIX_LEDGER BEFORE modifying any file.
Phase 4: Test — typecheck + unit + integration + UI + business logic + edge cases. ALL applicable types. Zero test.skip(). Zero test.todo().
Phase 5: Register — fix-guard register every modified region with test_file. Run fix-guard check — MUST show zero drift.
Phase 6: Regression gate — run FULL test suite (not just new tests). Production build MUST succeed. GCP parity check.
Phase 7: Git commit — stage files by name, commit with fix(STG-XXX): format, tag stg-XXX-YYYY-MM-DD, verify clean state, update ticket to PARKED.
Phase 8: Next ticket pre-flight — git status clean, fix-guard check zero drift, pnpm -r typecheck passes.
```

12-gate pre-commit enforcement (machine-enforced by `fix-guard.js` — Claude CANNOT bypass):
```
Gate  1: Fix drift check         — BLOCKS if any registered fix checksum drifted
Gate  2: Secret scanner          — BLOCKS if .env, credentials, API keys in staged files
Gate  3: Staged files validation  — BLOCKS if forbidden files staged
Gate  4: Ticket consistency       — BLOCKS if ticket references are invalid
Gate  5: Migration sequence       — BLOCKS if migration numbers have gaps or collisions
Gate  6: Dev URL scanner          — BLOCKS if localhost/127.0.0.1 in staged source files
Gate  7: Commit hygiene           — WARNS if >20 files staged, BLOCKS if 0 files staged
Gate  8: Ledger co-commit         — WARNS if source files staged without FIX_LEDGER.json
Gate  9: No amend on tagged       — WARNS if HEAD has stg-/prestage- tags (amend would orphan rollback anchor)
Gate 10: Commit message format    — WARNS if not type(SCOPE): description format
Gate 11: Single ticket per commit — BLOCKS if multiple STG-XXX tickets referenced in commit message
Gate 12: Completion checklist     — BLOCKS if any active fix has incomplete checklist (missing test guard, etc.)
```

Git discipline (per commit — ALL MANDATORY, not advisory):
- Linear commits on main, one ticket = one commit = one tag
- Every commit MUST pass 12-gate pre-commit (`fix-guard.js`) — no `--no-verify`
- Stage files by name (NEVER `git add .` or `git add -A`) — Gate 7 catches broad staging
- ALWAYS co-stage: `FIX_LEDGER.json` + `STAGING_TICKETS.md` with source files — Gate 8 enforces
- Commit format: `fix(STG-XXX): description` — Gate 10 enforces format, Gate 11 enforces single ticket
- Tag AFTER commit: `git tag stg-XXX-YYYY-MM-DD` — Gate 9 prevents amending tagged commits
- Verify after commit: `git status` clean + `git log --oneline -1` correct + `fix-guard check` zero drift
- NEVER amend, NEVER force push, NEVER skip hooks — Gates 9/10/11 catch violations
- Update ticket status to PARKED in STAGING_TICKETS.md with commit SHA + tag

Git anti-patterns (FORBIDDEN — Gate enforcement noted):
- `git add .` or `git add -A` → Gate 7 warns on >20 files, Gate 2 blocks secrets
- Two tickets in one commit → Gate 11 BLOCKS
- Commit without fix-guard → pre-commit hook prevents
- Amending tagged commit → Gate 9 warns
- `test.skip()` or `test.todo()` → Gate 12 blocks (checklist requires test_guard=true)
- Touching files outside ticket scope → create new ticket instead
- Source files without FIX_LEDGER.json → Gate 8 warns
- "Will add tests later" → Gate 12 BLOCKS (no test = no commit)

Ticket status lifecycle:
```
OPEN → IN_PROGRESS → PARKED (committed + tagged on main)
```
PARKED entry MUST include: commit SHA, tag name, fix ledger region count, test file, migration number (if any)

Current operator context: [YOUR NOTES — e.g. "today we're working on Layer 0 GUARD tickets" or "staging deploy is frozen" or "focus on STG-492 PENDING_UPI_KEY fix" or "skip DPDP tickets, focus on P0 bugs only"]
