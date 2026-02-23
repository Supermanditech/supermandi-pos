# STAGING AUDIT BACKLOG DRAFT (2026-02-23)

Status: Draft only. Not activated in workflow state yet.
Policy: 100% production-grade per ticket. No 93/95/97/99 acceptance.
Execution mode when activated: WIP=1, strict one-by-one, scope-only commits, no deploy until batch complete.
Staging baseline evidence: SHA `badc3fbe`, deploy run `github://run/22305359033`.

## Draft Atomic Tickets (to activate when you provide final audit update)

1. `LIVE.API.PLATFORM_STORES_PUBLIC_CONTRACT.001` (P1, backend)
- Finding: `/api/v1/platform/stores` returns 401 while expected contract is public-safe for enrollment lookup.
- Must close only with: contract decision implemented + caller parity + staging runtime proof.

2. `LIVE.API.HEALTH_GITSHA_RUNTIME_PARITY.001` (P1, backend)
- Finding: health/version `gitSha` mismatch vs deployed `GIT_SHA`.
- Must close only with: unified SHA source + `/health` `/version` parity proof on staging.

3. `LIVE.POS.FORCE_UPDATE_IOS_APPSTORE_URL.001` (P1, pos)
- Finding: iOS App Store URL empty in force-update path.
- Must close only with: valid iOS+Android update targets + runtime force-update verification.

4. `LIVE.POS.SELLSCAN_EMPTY_STATE_ZERO_RESULTS.001` (P2, pos)
- Finding: missing explicit empty-state UX for zero products/zero match.
- Must close only with: deterministic empty-state UX + tests + no regression.

5. `LIVE.POS.BUY_SEARCH_EMPTY_STATE.001` (P2, pos)
- Finding: missing explicit search-empty feedback in Buy screen.
- Must close only with: clear UX recovery action + tests + staging parity.

6. `LIVE.POS.ENROLL_DEEPLINK_AUTOFILL_RUNTIME_PARITY.001` (P2, pos)
- Finding: deep-link enrollment autofill needs deterministic runtime behavior validation.
- Must close only with: cold/warm launch proof + refresh/resume semantics + no data loss.

7. `LIVE.API.SUPERADMIN_AUTH_RATE_LIMIT_TUNING.001` (P2, backend)
- Finding: auth rate limit too aggressive on empty/invalid attempts.
- Must close only with: tuned anti-abuse policy + operator-safe retry UX + staging proof.

8. `LIVE.DB.MIGRATION_SEQUENCE_GAP_DOCUMENTATION.001` (P3, shared)
- Finding: migration numeric gaps (115,116,117,158) not canonically documented for replay safety.
- Must close only with: canonical rationale doc + workflow evidence links.

## Activation Checklist (when you say go)

1. Convert each draft ID into `workflow/tickets/<ID>.json` with schema-valid payload.
2. Set machine state:
- `progress.liveIteration.phase = implementation`
- `implementation.complete = false`
- `implementation.remainingTicketIds = [all 8 IDs in strict order]`
- `deployApproval.approved = false`
3. Enforce WIP=1 and 100% closure gates for this batch.
4. Run:
- `node scripts/workflow/guard.js validate-state`
- `node scripts/workflow/ticket-monitor.js --once`
- `bash scripts/gates/git-discipline.sh`

## Per-ticket Git Discipline (mandatory when activated)

- `pnpm workflow:session-boot -- --file workflow/tickets/<ID>.json`
- `ticket-transition todo -> in_progress` before code changes
- only ticket-scope files in commit
- run guard + monitor + git-discipline before commit
- no deploy in implementation phase
- park all commits at git for later cumulative staging deployment
