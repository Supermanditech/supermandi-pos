# CLAUDE NEXT ACTION - CANONICAL 203 EXECUTION

REF: `POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203`

## Objective

Execute canonical post-deploy implementation tickets one-by-one to 100% production grade with strict git discipline.  
No deploy in this session.

## Read First (mandatory)

1. `RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md`
2. `workflow/state/workflow_state.json`
3. `scripts/workflow/guard.js`
4. `RELEASES/POST_DEPLOY_SCOPE_BADC3FBE_AUDIT_R1234_CANONICAL_203.md`
5. `RELEASES/AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json`
6. `RELEASES/CLAUDE_NEXT_ACTION_POST_DEPLOY_SCOPE_EXECUTION_DISCIPLINE_2026-02-23.md`

## One-Time Scope Setup

```bash
pnpm workflow:scope:bootstrap:dry
pnpm workflow:scope:bootstrap
pnpm workflow:scope:sync
pnpm workflow:validate
pnpm workflow:monitor
pnpm workflow:scope:check
```

Expected:

- canonical total remains `203`
- no missing canonical ticket files
- implementation queue populated from canonical scope

## Strict Execution Contract (machine-enforced)

- `WIP=1`
- `todo -> in_progress` only from queue head
- blocked if working tree is dirty before starting next ticket
- blocked if any other ticket is currently `in_progress`
- blocked if implementation phase is not active

## Per-Ticket Loop (repeat until queue empty)

```bash
pnpm workflow:session-boot -- --file workflow/tickets/<TICKET_ID>.json
pnpm workflow:ticket-transition -- --file workflow/tickets/<TICKET_ID>.json --to in_progress --actor claude --reason "REF: POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203 start"
```

Implement ticket fully (no partial, no score-based completion), then run:

```bash
pnpm workflow:validate
pnpm workflow:monitor
bash scripts/gates/git-discipline.sh
pnpm workflow:scope:check
pnpm workflow:ticket-transition -- --file workflow/tickets/<TICKET_ID>.json --to done --actor claude --reason "REF: POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203 complete"
git add <ticket-scope-files-only>
git commit -m "fix(<TICKET_ID>): <summary>"
git push
pnpm workflow:scope:sync
```

## Delta Ticket Included

Must execute as part of current implementation queue:

- `LIVE.RETAILER.REGISTER.OTP_SUCCESS_ERROR_CONFLICT.001`

## Hard Stop Rules

- Do not deploy in this session.
- Do not start next ticket until current ticket is committed and queue sync is updated.
- Do not claim completion unless strict scope check passes:

```bash
pnpm workflow:scope:check:strict
```
