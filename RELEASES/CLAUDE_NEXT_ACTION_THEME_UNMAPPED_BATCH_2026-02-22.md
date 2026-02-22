# CLAUDE NEXT ACTION — CUMULATIVE BATCH (NO DEPLOY)

Date: 2026-02-22
Operator intent: Implementation-only session. No GCP staging deploy in this run.

## Source-of-Truth Reconciliation (must accept)

1. Last successful deploy exists:
- Run: github://run/22278771609
- SHA: 61f65530
- Date: 2026-02-22

2. Claim "all 46 unmapped tickets done" is NOT true in ticket JSON source-of-truth.
- `LIVE.TICKETIZATION.UNMAPPED.030` to `.038` are still `todo`.
- Current open implementation queue is 12 tickets total (9 unmapped + 3 theme/hydration).

3. Guard/monitor baseline:
- `node scripts/workflow/guard.js validate-state` must stay PASS.
- `node scripts/workflow/ticket-monitor.js --once` must stay PASS.
- `bash -lc 'BASE_REF=origin/main scripts/gates/git-discipline.sh'` must stay 0 FAIL / 0 WARN.

## Mandatory File Read Order

1. `RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md`
2. `RELEASES/CLAUDE_CURRENT_STATE.json`
3. `workflow/state/workflow_state.json`
4. `workflow/schemas/ticket.schema.json`
5. `scripts/workflow/guard.js`
6. `workflow/state/live_ticketization_progress.json`
7. Ticket files listed in "Execution Queue" below

## Execution Queue (WIP=1, exact order)

1. `LIVE.TICKETIZATION.UNMAPPED.030`
2. `LIVE.TICKETIZATION.UNMAPPED.031`
3. `LIVE.TICKETIZATION.UNMAPPED.032`
4. `LIVE.TICKETIZATION.UNMAPPED.033`
5. `LIVE.TICKETIZATION.UNMAPPED.034`
6. `LIVE.TICKETIZATION.UNMAPPED.035`
7. `LIVE.TICKETIZATION.UNMAPPED.036`
8. `LIVE.TICKETIZATION.UNMAPPED.037`
9. `LIVE.TICKETIZATION.UNMAPPED.038`
10. `LIVE.SUPPLIER.AUTH.BUILDSTAMP_HYDRATION_MISMATCH.001`
11. `LIVE.THEME.TOGGLE.OPENCLAW_STYLE_SECRET_ENTRY.001`
12. `LIVE.THEME.TOKENS.CROSS_SURFACE_APPLICATION.001`

## Theme Toggle UX Contract (locked)

For `LIVE.THEME.TOGGLE.OPENCLAW_STYLE_SECRET_ENTRY.001`, implement exactly:
- small, subtle, top-right circular icon button
- sun/moon style iconography
- low visual noise (no bulky settings panel)
- keyboard accessible with aria label
- persisted preference across refresh/navigation
- must be product UI control, not devtools preference UI

## Per-Ticket Discipline (repeat for each ticket)

1. Session boot:
- `pnpm workflow:session-boot -- --file workflow/tickets/<ticket>.json`

2. Transition:
- `todo -> in_progress`

3. Implement 100% production-grade (no partial, no deferral)

4. Update ticket evidence + status history + state sync:
- set ticket `status` to `done` only when complete
- maintain hash chain in `statusHistory`
- update `workflow/state/workflow_state.json`
- update `RELEASES/CLAUDE_CURRENT_STATE.json` parity

5. Run gates:
- `node scripts/workflow/guard.js validate-state`
- `node scripts/workflow/ticket-monitor.js --once`
- `bash -lc 'BASE_REF=origin/main scripts/gates/git-discipline.sh'`

6. Commit only ticket scope files (no mixed scope), then push.

## Deploy Hold (strict)

- Keep `progress.liveIteration.phase = implementation`
- Keep `progress.liveIteration.deployApproval.approved = false`
- Do NOT run `workflow:pre-staging:attempt`
- Do NOT trigger any deploy workflow

## Completion Condition For This Session

Only when all 12 tickets are `done`:
- update implementation summary to COMPLETE
- queue must be zero
- keep deploy blocked (operator approval in next session)
- publish final checkpoint: HEAD SHA, ticket list done, guard/monitor/git-discipline results
