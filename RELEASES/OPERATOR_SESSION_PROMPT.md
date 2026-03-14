# Operator Session Prompt — Copy/Paste Into Each New Claude Session

> **Usage**: Copy everything below the `---` line and paste as your first message to Claude.
> Fill in `[YOUR NOTES]` with your focus for that session.
> This keeps Claude in the correct machine state across sessions.

---

these are files Read these files BEFORE doing anything else — they are your machine state:

1. `RELEASES/FIX_LEDGER.json` — active fix checksums (source of truth for drift detection)
2. `scripts/fix-guard.js` — 14-gate pre-commit enforcement (do NOT modify without operator approval)
3. `RELEASES/CLAUDE_WORKFLOW.md` — 9-phase ticket lifecycle + git discipline + 31 failure modes
4. `RELEASES/STAGING_TICKETS.md` — post-GCP deploy ticket registry (STG-001+). Next ticket: check `<!-- next ticket -->` comment at bottom
5. `CLAUDE.md` — project rules, architecture, hard lessons, store isolation, test discipline
6. `RELEASES/IMPLEMENTATION_STATE.json` — machine state: current layer, ticket count, reiteration status

After reading all 6 files, run: `node scripts/fix-guard.js session-start`

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

---

## MANDATORY Reiteration Protocol (ALL 501 tickets)

> **Status**: Full reiteration of all 501 tickets under strict machine state.
> Root cause: Previous auto-implement sessions violated one-ticket-one-commit discipline,
> bypassed Gate 11 (regex only caught explicit `STG-` prefixes), and bulk-committed 10-44
> tickets per commit — causing drift, untested code, and regression.

### Reiteration Rules (MANDATORY — NOT advisory):
1. **One ticket = one commit = one tag** — NO EXCEPTIONS. Gate 11 now catches comma-separated, space-separated, and bulk patterns.
2. **Every commit MUST pass 14-gate pre-commit** — Gate 12 BLOCKS on >15 staged source files. Gate 13 BLOCKS on TypeScript errors. NO `--no-verify`.
3. **Every ticket gets tested** — no "too small", no "obvious fix", no "just a typo". Gate 14 BLOCKS on incomplete checklist.
4. **Read FIX_LEDGER before modifying any file** — if the file has registered fixes, understand and preserve them.
5. **Never use auto-implement scripts** — `scripts/auto-implement.sh` and `scripts/auto-implement.ps1` are FORBIDDEN. They bypass human gates.
6. **Never use `--dangerously-skip-permissions`** — this flag bypasses all safety checks.
7. **Claude MUST announce scope before coding** — operator reviews the scope before implementation begins.

---

## 14-Gate Pre-Commit Enforcement

Machine-enforced by `fix-guard.js` — Claude CANNOT bypass. ALL gates are BLOCKING unless explicitly noted as WARN-only.

```
Gate  1: Fix drift check          — BLOCKS if any registered fix checksum drifted
Gate  2: Secret scanner           — BLOCKS if .env, credentials, API keys in staged files
Gate  3: Staged files validation   — BLOCKS if forbidden files staged
Gate  4: Ticket consistency        — BLOCKS if ticket references are invalid
Gate  5: Migration sequence        — BLOCKS if migration numbers have gaps or collisions
Gate  6: Dev URL scanner           — BLOCKS if localhost/127.0.0.1 in staged source files
Gate  7: Commit hygiene            — BLOCKS if 0 files staged, WARNS if >20 files
Gate  8: Ledger co-commit          — WARNS if source files staged without FIX_LEDGER.json
Gate  9: No amend on tagged        — WARNS if HEAD has stg-/prestage- tags
Gate 10: Commit message format     — BLOCKS if not type(SCOPE): description format
Gate 11: Single ticket per commit  — BLOCKS if multiple tickets referenced (comma, space, or bulk pattern)
Gate 12: Max staged files          — BLOCKS if >15 source files staged (ticket scope too broad)
Gate 13: TypeScript typecheck      — BLOCKS if TypeScript has compilation errors
Gate 14: Completion checklist      — BLOCKS if any active fix has incomplete checklist
```

**Key hardening (v5 vs v4)**:
- Gate 10: Upgraded from WARN → BLOCK
- Gate 11: Hardened regex — catches `STG-001,002,003`, `STG-001 STG-002`, `Layer X — N tickets`
- Gate 12: NEW — max 15 staged source files (was 20 warn-only in Gate 7)
- Gate 13: NEW — TypeScript typecheck as pre-commit BLOCK (was only advisory)
- Gate 14: Renumbered from old Gate 12

---

## Per-Ticket Completion Protocol (ALL 9 phases MANDATORY)

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

---

## Git Discipline (MANDATORY — NOT advisory)

- Linear commits on main, one ticket = one commit = one tag
- Every commit MUST pass 14-gate pre-commit (`fix-guard.js`) — NEVER use `--no-verify`
- Stage files by name (NEVER `git add .` or `git add -A`) — Gate 12 catches broad staging
- ALWAYS co-stage: `FIX_LEDGER.json` + `STAGING_TICKETS.md` with source files — Gate 8 enforces
- Commit format: `fix(STG-XXX): description` — Gate 10 BLOCKS wrong format, Gate 11 BLOCKS multiple tickets
- Tag AFTER commit: `git tag stg-XXX-YYYY-MM-DD` — Gate 9 prevents amending tagged commits
- Verify after commit: `git status` clean + `git log --oneline -1` correct + `fix-guard check` zero drift
- NEVER amend, NEVER force push, NEVER skip hooks — Gates 9/10/11 catch violations
- Update ticket status to PARKED in STAGING_TICKETS.md with commit SHA + tag

## Git Anti-Patterns (FORBIDDEN)

- `git add .` or `git add -A` → Gate 12 BLOCKS on >15 files, Gate 2 blocks secrets
- Two tickets in one commit → Gate 11 BLOCKS (hardened regex catches ALL patterns)
- Commit without fix-guard → pre-commit hook prevents
- Amending tagged commit → Gate 9 warns
- `test.skip()` or `test.todo()` → Gate 14 blocks (checklist requires test_guard=true)
- Touching files outside ticket scope → create new ticket instead
- Source files without FIX_LEDGER.json → Gate 8 warns
- "Will add tests later" → Gate 14 BLOCKS (no test = no commit)
- Bulk commit patterns ("Layer X — N tickets") → Gate 11 BLOCKS
- Using `--dangerously-skip-permissions` → FORBIDDEN, bypasses all safety
- Using `auto-implement.sh` or `auto-implement.ps1` → FORBIDDEN, bypasses human gates

## Ticket Status Lifecycle

```
OPEN → IN_PROGRESS → PARKED (committed + tagged on main)
```
PARKED entry MUST include: commit SHA, tag name, fix ledger region count, test file, migration number (if any)

Current operator context: [YOUR NOTES — e.g. "reiteration mode: verifying Layer 0 tickets" or "staging deploy is frozen" or "focus on STG-492" or "skip DPDP tickets, focus on P0 bugs only"]
