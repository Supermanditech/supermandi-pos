# CLAUDE EXECUTION DISCIPLINE - POST DEPLOY SCOPE

Reference:

- `REF: POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203`
- Baseline deploy: SHA `badc3fbe`, run `22305359033`

## Source Of Truth (must read first)

1. `RELEASES/POST_DEPLOY_SCOPE_BADC3FBE_AUDIT_R1234_CANONICAL_203.md`
2. `RELEASES/AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json`
3. `RELEASES/CLAUDE_NEXT_ACTION_AUDIT_R1234_FINAL_EXECUTION_2026-02-23.md`
4. `RELEASES/CLAUDE_NEXT_ACTION_STAGING_AUDIT_FIX_BATCH_2026-02-23.md`
5. `workflow/state/workflow_state.json`

## One-Time Bootstrap (create canonical ticket files)

```bash
pnpm workflow:scope:bootstrap:dry
pnpm workflow:scope:bootstrap
pnpm workflow:scope:sync
pnpm workflow:validate
pnpm workflow:monitor
```

Expected: `missingTicketFiles` becomes `0` in scope check.

## Per-Ticket Execution Loop (WIP=1, strict)

For each canonical ticket in order:

1. Session boot:
```bash
pnpm workflow:session-boot -- --file workflow/tickets/<TICKET_ID>.json
```
2. Transition to execution:
```bash
pnpm workflow:ticket-transition -- --file workflow/tickets/<TICKET_ID>.json --to in_progress --actor claude --reason "<scope-ref + implementation start>"
```
3. Implement fix to 100% production-grade (no partial).
4. Run mandatory gates:
```bash
pnpm workflow:validate
pnpm workflow:monitor
bash scripts/gates/git-discipline.sh
pnpm workflow:scope:check
```
5. Update ticket evidence/layers/readiness/gitDiscipline.
6. Transition to done:
```bash
pnpm workflow:ticket-transition -- --file workflow/tickets/<TICKET_ID>.json --to done --actor claude --reason "<scope-ref + implementation complete>"
```
7. Commit scope-only:
```bash
git add <ticket-scope-files-only>
git commit -m "fix(<TICKET_ID>): <summary>"
git push
```

## Completion Claim Gate (hard stop)

Before any "all tickets complete" statement:

```bash
pnpm workflow:scope:check:strict
```

If non-zero exit, completion claim is invalid.

## Deploy Gate

- Deploy hold remains active until full scope closure.
- `pnpm workflow:pre-staging` will block if canonical scope is not fully closed.
- Cumulative deploy can start only after strict scope check passes.
