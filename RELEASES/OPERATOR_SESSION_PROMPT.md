# Operator Session Prompt — Copy/Paste Into Each New Claude Session

> **Usage**: Copy everything below the `---` line and paste as your first message to Claude.
> Fill in `[YOUR NOTES]` with your focus for that session.
> This keeps Claude in the correct machine state across sessions.

---

These are your machine state files. Read ALL of them BEFORE doing anything else:

1. `RELEASES/FIX_LEDGER.json` — active fix checksums (source of truth for drift detection)
2. `scripts/fix-guard.js` — 14-gate pre-commit + 21-item per-ticket checklist (do NOT modify without operator approval)
3. `RELEASES/CLAUDE_WORKFLOW.md` — 9-phase ticket lifecycle + git discipline + 31 failure modes
4. `RELEASES/STAGING_TICKETS.md` — ticket registry (STG-001+). Next ticket: check `<!-- next ticket -->` comment at bottom
5. `CLAUDE.md` — project rules, architecture, hard lessons, store isolation, test discipline
6. `RELEASES/IMPLEMENTATION_STATE.json` — machine state: reiteration status, mandatory gates, layer progress

After reading all 6 files, run: `node scripts/fix-guard.js session-start`

Then confirm to me:
- How many active fixes exist and are all intact?
- Any drift or missing files?
- Any uncommitted changes from previous session?
- What is the current reiteration layer and next ticket?

Do NOT write any code until session-start passes with zero drift.

---

## MANDATORY Reiteration Protocol (ALL 501 tickets)

> Root cause of reiteration: Previous auto-implement sessions + parallel agents violated
> one-ticket-one-commit discipline, bypassed Gate 11 regex, bulk-committed 10-44 tickets
> per commit, and caused multi-agent drift on shared files.

### Reiteration Rules (MANDATORY — NOT advisory):
1. **One ticket = one commit = one tag** — NO EXCEPTIONS. Gate 11 BLOCKS all bypass patterns.
2. **Every commit MUST pass 14-gate pre-commit + commit-msg hook** — NO `--no-verify`.
3. **Every ticket MUST pass 21-item checklist across 7 layers** — Gate 14 BLOCKS incomplete checklists.
4. **Read FIX_LEDGER before modifying any file** — if the file has registered fixes, preserve them.
5. **Never use auto-implement scripts** — DELETED and FORBIDDEN. They bypass human gates.
6. **Never use `--dangerously-skip-permissions`** — bypasses all safety checks.
7. **Never run parallel agents on same files** — causes drift and regression.
8. **Claude MUST announce scope before coding** — operator reviews before implementation.

---

## 21-Item Per-Ticket Verification Checklist (7 Layers)

**Machine-enforced by Gate 14 in fix-guard.js. BLOCKS commit if ANY required item is incomplete.**

### Layer A: UI / UX / Frontend
| Gate | Label | What to verify | Applies to |
|------|-------|----------------|------------|
| A1 | UI Elements | All buttons, fields, headers, footers, modals render correctly on device/browser | POS/Portal |
| A2 | UX 4-State | Loading / success / empty / error states ALL handled — no blank screens | POS/Portal |
| A3 | UI Wiring | Every UI event → handler → API call → state update → re-render chain verified | POS/Portal |
| A4 | Navigation Guards | Screen transitions, back button, auth redirects, deep links all intact | POS/Portal |
| A5 | i18n Keys | All user-facing strings use t() with keys in both en.json and hi.json | POS/Portal |

### Layer B: API / Backend
| Gate | Label | What to verify | Applies to |
|------|-------|----------------|------------|
| B1 | Backend API | Endpoint exists, correct HTTP method, request/response schema validated | Backend |
| B2 | API Error Handling | All error paths return proper status codes (400/401/403/404/500) | Backend |
| B3 | Store Isolation | storeId derived from JWT only, WHERE store_id=$token.storeId on ALL queries | Backend |

### Layer C: Business Logic / Behaviour (ALWAYS MANDATORY)
| Gate | Label | What to verify | Applies to |
|------|-------|----------------|------------|
| C1 | Business Logic | Domain invariants hold: stock accuracy, ledger balance, price integrity, idempotency | ALL tickets |
| C2 | Business Behaviour | End-to-end user workflow works: scan→add→checkout→payment→receipt | ALL tickets |

### Layer D: DB / Tables / Migrations
| Gate | Label | What to verify | Applies to |
|------|-------|----------------|------------|
| D1 | DB Schema | Tables/columns exist, constraints correct, indexes present, data types match | DB tickets |
| D2 | Migration Safety | Additive only, has ROLLBACK comment, correct sequence number, idempotent | Migration tickets |

### Layer E: Impact / Drift / Multi-Agent Safety (ALWAYS MANDATORY)
| Gate | Label | What to verify | Applies to |
|------|-------|----------------|------------|
| E1 | Impacted Files | ALL modified files listed in commit, no untracked changes left behind | ALL tickets |
| E2 | FIX_LEDGER Check | All registered fixes in modified files preserved, zero drift after change | ALL tickets |
| E3 | No Agent Conflict | No parallel agent modified same files — git diff shows only this ticket | ALL tickets |

### Layer F: GCP / Staging Parity (ALWAYS MANDATORY)
| Gate | Label | What to verify | Applies to |
|------|-------|----------------|------------|
| F1 | GCP Parity | No localhost URLs, env vars used, staging.supermandi.tech compatible | ALL tickets |
| F2 | Regression Check | Full test suite passes AFTER this change — not just new tests | ALL tickets |
| F3 | Test Guard | Ticket-specific test file exists, runs, and passes | ALL tickets |

### Layer G: Git Discipline (ALWAYS MANDATORY)
| Gate | Label | What to verify | Applies to |
|------|-------|----------------|------------|
| G1 | Single Commit | One ticket = one commit = one tag, format fix(STG-XXX): description | ALL tickets |
| G2 | Ticket Parked | STAGING_TICKETS.md updated to PARKED with commit SHA and tag | ALL tickets |

**N/A Rules**: Only Layer A (UI) can be N/A for pure backend tickets. Only Layer B (API) can be N/A for pure cosmetic UI tickets. Only Layer D (DB) can be N/A for non-DB tickets. Layers C, E, F, G are **NEVER** N/A.

---

## 14-Gate Pre-Commit Enforcement

Machine-enforced by `fix-guard.js` pre-commit + commit-msg hooks.

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
Gate 10: Commit message format     — BLOCKS if not type(SCOPE): description (commit-msg hook)
Gate 11: Single ticket per commit  — BLOCKS if multiple tickets referenced (commit-msg hook)
Gate 12: Max staged files          — BLOCKS if >15 source files staged
Gate 13: TypeScript typecheck      — BLOCKS if TypeScript has compilation errors
Gate 14: Completion checklist      — BLOCKS if any active fix has incomplete 21-item checklist
```

---

## Per-Ticket Completion Protocol (ALL 9 phases MANDATORY)

```
Phase 0: READ — Read ticket from STAGING_TICKETS.md. Understand problem, scope, fix, test plan.
Phase 1: PRE-FLIGHT — fix-guard check (exit 0), git status (clean), read FIX_LEDGER, typecheck (pass).
Phase 2: SCOPE — Announce to operator: files in scope, registered fixes to preserve, test plan. WAIT.
Phase 3: IMPLEMENT — DB → backend → frontend → wiring. Check FIX_LEDGER BEFORE modifying any file.
Phase 4: TEST — Run ALL applicable tests. Zero test.skip(). Zero test.todo(). Create missing tests.
Phase 5: VERIFY GATES — Walk through 21-item checklist (Layers A-G). Mark each PASS/N/A with evidence.
Phase 6: REGISTER — fix-guard register with checklist_version:5. fix-guard check = zero drift.
Phase 7: COMMIT — Stage by name. Commit fix(STG-XXX): format. Tag stg-XXX-YYYY-MM-DD. Verify clean.
Phase 8: PARK — Update STAGING_TICKETS.md to PARKED with SHA + tag. Update IMPLEMENTATION_STATE.json.
```

---

## Multi-Agent Safety Rules (MANDATORY)

Previous sessions used parallel agents that modified the same files simultaneously, causing:
- Conflicting edits overwriting each other
- FIX_LEDGER checksums drifting without detection
- Regression in files touched by multiple agents

**Rules to prevent this:**
1. **NEVER run parallel agents on the same file** — check `git diff` before launching agents
2. **NEVER run parallel agents on overlapping ticket scopes** — verify no file overlap
3. **After ANY agent completes**: run `node scripts/fix-guard.js check` — MUST show zero drift
4. **If drift detected after agent work**: STOP, investigate, fix before continuing
5. **Each agent MUST operate on isolated files** — if two tickets touch the same file, do them sequentially

---

## Git Discipline (MANDATORY — NOT advisory)

- Linear commits on main, one ticket = one commit = one tag
- Every commit MUST pass 14-gate pre-commit + commit-msg hook — NEVER use `--no-verify`
- Stage files by name (NEVER `git add .` or `git add -A`) — Gate 12 catches broad staging
- ALWAYS co-stage: `FIX_LEDGER.json` + `STAGING_TICKETS.md` with source files — Gate 8 enforces
- Commit format: `fix(STG-XXX): description` — Gate 10 BLOCKS, Gate 11 BLOCKS multi-ticket
- Tag AFTER commit: `git tag stg-XXX-YYYY-MM-DD` — Gate 9 prevents amending tagged commits
- Verify after commit: `git status` clean + `git log --oneline -1` + `fix-guard check` zero drift
- NEVER amend, NEVER force push, NEVER skip hooks
- Update ticket to PARKED in STAGING_TICKETS.md with SHA + tag

## FORBIDDEN Actions

- `git add .` or `git add -A` → use named files only
- Two tickets in one commit → Gate 11 BLOCKS
- `--no-verify` or `--dangerously-skip-permissions` → FORBIDDEN
- `test.skip()` or `test.todo()` → Gate 14 blocks
- `auto-implement.sh` or `auto-implement.ps1` → DELETED and FORBIDDEN
- Parallel agents on same files → causes drift, FORBIDDEN
- "Will add tests later" → Gate 14 BLOCKS (no test = no commit)
- Touching files outside ticket scope → create new ticket instead

---

Current operator context: [YOUR NOTES — e.g. "reiteration Layer 0: verifying STG-001 through STG-017" or "focus on backend API tickets only"]
