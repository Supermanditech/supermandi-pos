# CLAUDE NEXT ACTION: IMPLEMENTATION-ONLY (NO DEPLOY)

Effective date: 2026-02-23

## Hard Gate

- GCP staging deploy is blocked in this session.
- Machine-state deploy gate is active:
  - `progress.liveIteration.phase = implementation`
  - `progress.liveIteration.deployApproval.approved = false`
  - approval token required for deploy phase: `GO_DEPLOY`
- Do not run `pnpm workflow:pre-staging:attempt` until operator explicitly approves deploy in next session.

## Required Files To Read First (in order)

1. `RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md`
2. `RELEASES/CLAUDE_CURRENT_STATE.json`
3. `workflow/state/workflow_state.json`
4. `workflow/state/staging_batch.json`
5. `workflow/state/live_page_manifest.json`
6. `workflow/state/live_ticketization_progress.json`
7. `scripts/workflow/guard.js`
8. `scripts/workflow/ticket-monitor.js`
9. `scripts/gates/git-discipline.sh`
10. `RELEASES/CLAUDE_NEXT_ACTION_FIX001.md`

## Implementation Queue Rule (One-by-One)

1. Run:
   - `pnpm workflow:validate`
   - `pnpm workflow:monitor`
2. Build execution queue from `workflow/tickets/*.json` where status in:
   - `todo`, `in_progress`, `operator_failed`, `impact_retest_failed`
3. Execute exactly one ticket at a time (WIP=1):
   - session boot
   - transition `todo -> in_progress`
   - implement 100% production-grade (all required layers pass)
   - update evidence/state
   - transition to next valid status
4. Git discipline per ticket:
   - stage only ticket-scoped files
   - no mixed-scope commits
   - no conflict markers
   - keep working tree clean between tickets

### Current Mandatory Queue

- `LIVE.TICKETIZATION.UNMAPPED.001` through `LIVE.TICKETIZATION.UNMAPPED.046` are now `todo`.
- These were backfilled from previously unmapped `CODE_REVIEW_ISSUE` entries in `workflow/state/live_ticketization_progress.json`.
- Deploy is blocked until all 46 are closed (`done/locked/cancelled`) and guard passes.

## If Queue Is Empty

- Publish checkpoint: `No implementable tickets in todo/in_progress status.`
- Keep deploy hold active.
- Wait for operator to provide `GO_DEPLOY` in next session.

## Mandatory Checkpoint After Each Ticket

- `HEAD SHA`
- ticket ID + status transition
- changed files list
- `pnpm workflow:validate` result
- `pnpm workflow:monitor` result
- git discipline summary (`git status --short` + scope confirmation)
- next blocker
