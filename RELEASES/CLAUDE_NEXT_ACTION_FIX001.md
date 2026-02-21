# CLAUDE NEXT ACTION: FIX-001 (Live Iteration Batch-First)

## Priority Override (Effective 2026-02-21, Immediate)

This override is ACTIVE now and takes precedence over older deploy-first wording in this file if any conflict exists.

### Agent Quality Rule (Hard)

- Use only `Claude Opus` agents for parallel audit/fix support.
- Parallel agent count has no fixed cap, but all agents must be `Claude Opus`.
- Do NOT use Haiku or mixed-model fanout for quality-critical testing.
- If these rules are violated, the pass is invalid and must be rerun.

### Prompt-Length / Context Control (Hard)

- Work in small page batches to keep prompt/context bounded.
- Keep only active-surface context; archive old logs into concise checkpoints.
- Update machine state after each page batch before continuing.
- If `prompt too long` or context drift occurs, resume strictly from last checkpoint (no memory-based continuation).

### No-Skip Coverage Rule

- No sampling, no skipping fields/components/states.
- Test each micro ingredient one-by-one:
  - fields/inputs, dropdowns, toggles/radios, CTAs
  - table columns/actions, modals/drawers, empty/loading/error states
  - navigation guards, API payload/response mapping, DB parity, migration impact
- Ticket cannot close unless mapped checks are PASS (or BLOCKED with evidence + owner).
- Surface deploy is blocked unless per-page micro coverage is 100% and no open P0/P1 blockers.

### 100% Completion Rule (Hard Stop Against Score-Only Reporting)

- Do not stop on percentage summaries such as `78%`, `83%`, or `Cycle score`.
- Percentage is allowed only as interim telemetry; it is never completion.
- Continue iterating until each required micro check is resolved to:
  - `PASS` with evidence, or
  - `BLOCKED` with owner + unblock action.
- Any unresolved required check means the page remains open.
- Any open `P0`/`P1` on the active batch blocks deploy.
- Acceptance statement must be binary:
  - `100% required checks resolved for this batch` or
  - `NOT COMPLETE` with remaining check IDs.

### Deploy-Then-Ticketize Rule (Hard)

- After CI-green cumulative fixes, Claude must deploy one staging wave for the full cumulative batch.
- After that deploy, Claude must run full live testing before starting new code implementation.
- Live testing must cover all pages/surfaces:
  - retailer web
  - supplier web
  - superadmin web
  - POS app
  - cross-function matrix flows
- For every failure/gap found in live testing, Claude must create/update micro tickets (page/component/field granularity; one issue per ticket).
- Implementation may start only after full-surface coverage map is complete and all discovered issues are ticketized.

### Live Ticket Origin Rule (Hard)

- New tickets must be created from live GCP staging observations only.
- Every ticket must include:
  - staging URL/flow
  - observation timestamp
  - runtime evidence (response/log/screenshot)
  - relevant Cloud Run revision ID(s)
- Local-only or code-only assumption tickets are not valid for completion flow.

### Post-Deploy Ticket Intake Gate (Hard)

- New ticket intake is blocked until a successful staging deploy is completed for the active wave.
- Every newly-intaked ticket must point to that successful deploy:
  - deployment ref/run URL
  - deploy timestamp
  - observed-at timestamp after deploy
  - runtime evidence + Cloud Run revision IDs
- If deploy evidence is missing, do not intake tickets; finish deploy and publish evidence first.

## Effective Date
2026-02-20

## Mandatory Immediate Objective
Deploy the latest 10-day work to GCP staging with zero mixed-version drift across all surfaces:

- retailer web
- supplier web
- superadmin web
- POS app backend/API connectivity
- backend + API gateway
- DB migration/state parity

No new feature ticket coding is allowed until FIX-001 deployment evidence is complete.

## Execute Now (In Order)

1. Re-read:
   - `RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md`
   - `workflow/state/staging_batch.json`
   - `workflow/tickets/FIX-001.json`
2. Run:
   - `pnpm workflow:validate`
   - `pnpm workflow:monitor`
3. Run deploy gate attempt for the cumulative active fix batch:
   - `pnpm workflow:pre-staging:attempt`
4. If gate passes, trigger staging deploy pipeline for `main` and monitor to completion.
5. Publish evidence for completion:
   - commit SHA used
   - deploy run URL
   - migration execution summary
   - active revision IDs for all 6 services
   - active image digest/tag for all 6 services
   - traffic proof that target revision is active for all 6 services
   - `https://staging.supermandi.tech/api/health` response
   - operator handoff status (laptop + Redmi)
6. After deploy evidence, execute full-surface live testing (all pages + cross-function matrix) with per-page micro checks:
   - run `pnpm workflow:manifest:live`
   - use `workflow/state/live_page_manifest.json` as the page/flow coverage source
   - UI
   - UX
   - wiring
   - navigation
   - API contract
   - backend behavior
   - DB/migration impact
   - GCP staging parity
7. Create/update micro tickets for all discovered failures before coding new fixes.
   - each ticket must include live staging evidence + revision IDs
8. Start implementation only after full coverage + ticketization is complete.

## Hard Stop Rule
If any of the above evidence is missing, FIX-001 remains `ready_for_operator_test` and no ticket may move to `in_progress`.
