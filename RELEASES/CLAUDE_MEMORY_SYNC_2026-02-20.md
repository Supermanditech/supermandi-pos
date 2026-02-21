---
name: supermandi-operating-system-memory-sync
description: Use when starting or resuming SuperMandi work to load machine-enforced workflow artifacts, commands, and guardrails for staging-first delivery.
---

# CLAUDE MEMORY SYNC PACK (2026-02-20)

Use this file to sync Claude memory/rules with the latest machine-enforced workflow for SuperMandi.

## 1. Authoritative Load Order

1. `RELEASES/CLAUDE_STATE.md`
2. `RELEASES/CLAUDE_CURRENT_STATE.json`
3. `workflow/state/workflow_state.json`
4. `workflow/schemas/ticket.schema.json`
5. `workflow/schemas/screen_state.schema.json`
6. `workflow/state/staging_batch.json`
7. `workflow/state/freeze_manifest.json`
8. `workflow/README.md`
9. `workflow/production_boundary_iam.md`
10. `RELEASES/CLAUDE_NEXT_ACTION_FIX001.md`

## 2. Mandatory Session Commands

```bash
pnpm workflow:validate
pnpm workflow:monitor
```

For live-ticketization sessions, also run:

```bash
pnpm workflow:manifest:live
```

Then use `workflow/state/live_page_manifest.json` as the required coverage checklist source.

Before a ticket moves from `todo` to `in_progress`:

```bash
pnpm workflow:session-boot -- --file workflow/tickets/<ticket>.json
```

## 2A. Staging Deploy Hotfix (2026-02-20)

When running `pnpm workflow:pre-staging`:

- `workflow/state/staging_batch.json` is the only file allowed to be dirty for deploy-intent `commitSha` updates.
- If any other file is dirty, staging gate must fail.
- `staging_batch.commitSha` MUST match current `git rev-parse --short HEAD`.

Required retry order:

1. Commit and push any non-batch dirty files first.
2. Set `workflow/state/staging_batch.json.commitSha` to current HEAD.
3. Verify `git status --short` shows only:
   `M workflow/state/staging_batch.json`
4. Run:
   `pnpm workflow:pre-staging:attempt`

Do not bypass this sequence.

## 2B. Active Objective (Current Wave)

Current objective is a zero-regression GCP staging deployment of work completed in the last 10 days across:

- Retailer web frontend
- Supplier web frontend
- Superadmin web frontend
- POS app frontend
- Backend services + API gateway
- DB migrations and staging infra parity

For this wave, Claude must treat `FIX-001` as deploy-orchestration for the full scope above.
Claude must not claim deployment complete until Cloud Run staging evidence is real (no placeholders).

Minimum completion evidence per attempt:

1. `commitSha` used for deploy
2. GitHub Actions / Cloud Build run URL
3. Migration execution result summary
4. Cloud Run revision IDs for all 6 staging services
5. `https://staging.supermandi.tech/api/health` response
6. Operator test handoff status (laptop + Redmi)

If any evidence item is missing, status remains `ready_for_operator_test` (not `locked`).

## 2D. Full-Surface Version Consistency (No Stale Services)

When deploying new work (including the last 10-day mega-batch), staging must not run mixed versions.

After deploy, all 6 services must point to the target release version for the deployment wave:

- `main-backend`
- `api-gateway`
- `retailer-admin`
- `supplier-portal`
- `superadmin`
- `landing`

Acceptable proof per service:

1. active revision ID
2. active image digest/tag
3. traffic split shows target revision serving production traffic for staging (no stale older revision active for this wave)

If any service remains on stale version for the wave, deployment is incomplete and ticket cannot progress to `locked`.

## 2E. 100% Production Completion Gate (No Score-Based Stops)

For live testing and fix cycles, percentage scores (for example `78%`, `83%`) are progress telemetry only and are never acceptance criteria.

Claude must continue iterating until all required user-facing micro checks are either:

1. `PASS` with evidence, or
2. explicitly `BLOCKED` with owner, reason, and unblock plan

Mandatory no-stop conditions:

- A cycle cannot close because of average page score.
- A surface cannot be marked complete while any required field/component/flow remains unverified.
- A deploy cannot be triggered while any open `P0`/`P1` issue exists for the active surface batch.
- `ready_for_operator_test` is allowed only after 100% required micro-check coverage for the batch.

Required per-page completion record:

1. UI
2. UX
3. wiring
4. navigation
5. API contract
6. backend behavior
7. DB/migration impact
8. GCP staging parity

## 2F. Deploy-Then-Live Ticketization Protocol (Mandatory)

For active FIX-001 live-iteration cycles, Claude must execute this sequence:

1. Merge CI-green cumulative fixes from the active work window.
2. Run one staging deploy wave for those cumulative fixes (follow Section 2A exactly).
3. Perform full live testing on staging across all surfaces:
   - retailer web
   - supplier web
   - superadmin web
   - POS app
   - cross-function matrix flows
4. Create/update micro-level tickets for every discovered issue:
   - one issue per ticket
   - page/component/field-level granularity
5. Start implementation only after full-surface coverage is enumerated and ticketized.

No sampling and no page skipping are allowed.
If coverage or ticketization is incomplete, implementation must not start.

## 2G. Live Ticket Origin Rule (Mandatory)

All new tickets for active live-iteration cycles must come from live GCP staging evidence.

Required evidence in each new ticket:

1. staging URL/page/flow where issue was observed
2. timestamp (IST or UTC) of observation
3. runtime evidence (HTTP response, API payload, log line, or screenshot/video)
4. active Cloud Run revision ID(s) relevant to the issue

Tickets created from local-only assumptions, static code reading alone, or non-staging environments are invalid for closure flow and must be replaced with live-evidence tickets.

## 2H. Post-Deploy Ticket Intake Gate (Mandatory)

For active FIX-001 live-iteration sessions, new ticket intake is allowed only after a successful staging deploy has completed.
This gate applies to new intake created after policy activation and is machine-enforced by workflow guard rules.

Mandatory intake preconditions:

1. successful staging deploy reference is available (`deploy run URL/ref`)
2. successful staging deploy timestamp is recorded
3. observed ticket timestamp is after that deploy timestamp
4. ticket includes deploy ref + Cloud Run revision IDs + runtime evidence

If no successful staging deploy evidence exists for the current wave, Claude must not create new intake tickets and must first complete deploy evidence collection.

## 2I. Staging Execution Ownership (Mandatory for LIVE Blockers)

For active FIX-001 live blockers (for example `LIVE.URLMAP.STORE_ROUTES.001`, `LIVE.BACKEND.PROXY_404.001`, `LIVE.BACKEND.CONN_TIMEOUT.001`), Claude must execute staging-remediable work directly and must not defer as "operator-only action" by default.

Ownership rule:

1. Claude executes code/config/infra changes that are possible from workspace + approved staging access.
2. Operator scope is final verification/signoff (laptop + Redmi) and production-bound approvals.
3. If Claude is blocked by IAM/permission, ticket must be marked `BLOCKED` with:
   - exact command attempted
   - principal used
   - returned error
   - explicit unblock owner

Git discipline addendum for these cycles:

1. Repo may contain unrelated modified/untracked files.
2. Claude must stage only files changed for the active fix/ticket.
3. Claude must not stage unrelated work.

## 2J. Exhaustive Micro-Ticketization Gate (Mandatory)

For active FIX-001 live-iteration cycles, Claude must finish full micro-ingredient staging testing and ticketization before implementation/deploy continuation.

Mandatory rules:

1. Use `workflow/state/live_page_manifest.json` as exhaustive coverage source (no page/flow/component skipping).
2. Create one ticket per issue with live evidence and revision IDs.
3. Ticket count must reflect real findings; high volumes (including 1000-2000 tickets) are valid and must not be truncated.
4. Do not start implementation while any required micro-check remains unticketized.
5. Do not claim deploy readiness while micro-ticketization coverage is incomplete.

Required completion evidence:

1. full-surface coverage checklist with each micro check marked
2. ticket list covering all discovered issues
3. explicit statement: `100% micro-ingredient ticketization complete` OR `NOT COMPLETE` with remaining check IDs

## 2K. Transient Green-Run Closure Rule (Mandatory)

For runtime/staging blockers, a single green CI/staging run is not sufficient for closure.

Mandatory rules:

1. Claude must collect repeated stability evidence (minimum 3 successful runs over time).
2. At least one evidence window must include cold/warm behavior validation.
3. `LIVE.URLMAP.STORE_ROUTES.001` cannot close until `/s` and `/s/*` are directly verified.
4. `LIVE.BACKEND.PROXY_404.001` cannot close until proxied auth/POS endpoints are stable across repeated runs.
5. Claude must not defer these validations as operator-only tasks unless IAM-blocked per Section 2I.

## 2L. Ticketization-First Execution Phase Gate (Machine-Enforced)

For active `LIVE_FIX` cycles in GCP staging, Claude must obey strict phase order:

1. `ticketization` phase
2. `implementation` phase
3. `deploy` phase

Mandatory rules:

1. While `progress.liveIteration.phase = ticketization`, Claude must not move tickets into execution statuses (`in_progress`, `ready_for_operator_test`) until ticketization is complete.
2. Ticketization completion requires:
   - `progress.liveIteration.ticketization.complete = true`
   - `progress.liveIteration.ticketization.statement` starts with `100% micro-ingredient ticketization complete`
   - full `coverageBySurface` true for: retailer, supplier, superadmin, POS app, cross-function matrix
   - `remainingCheckIds` empty
3. Implementation completion requires:
   - `progress.liveIteration.implementation.complete = true`
   - no remaining implementation ticket IDs
4. Staging deploy is blocked unless:
   - phase is `deploy`
   - ticketization is complete
   - implementation is complete
5. Coverage source for this gate is mandatory:
   - `workflow/state/live_page_manifest.json`

## 2M. Claude Current State Narrative Sync Gate (Machine-Enforced)

When `progress.liveIteration.phase = ticketization` and ticketization is `NOT COMPLETE`:

1. `RELEASES/CLAUDE_CURRENT_STATE.json.nextAction` must explicitly contain `NOT COMPLETE` and `ticketization`.
2. `nextAction` must not contain deploy/commit-forward closure language.
3. `lastActions` must not include global closure claims (for example "all LIVE tickets resolved") while ticketization is incomplete.
4. Any `ticketStatus.<ticketId>` in `RELEASES/CLAUDE_CURRENT_STATE.json` cannot be `DONE*` if the corresponding workflow ticket is still active.

## 2N. Locked Brand Asset Sync (Play Store + Facebook/OG) (Machine-Enforced)

For active branding and store-profile sync cycles, Claude must treat these files as canonical and locked:

1. `supermandi-landing/playstore-assets/developer-icon-512.png`
2. `supermandi-landing/playstore-assets/developer-header-4096x2304.jpg`
3. `supermandi-landing/playstore-assets/preview-local.html`

Mandatory rules:

1. Claude must update only canonical filenames above (no final-v* references in final output paths).
2. `preview-local.html` must reference canonical filenames only.
3. Play Console dimensions and limits must remain valid:
   - icon: `512x512`, PNG/JPEG, `< 1 MB`
   - header: `4096x2304`, PNG/JPEG, `< 1 MB`
4. Staging propagation path is `supermandi-landing/` image build + deploy via `.github/workflows/deploy.yml` (`landing` service).
5. Facebook/OpenGraph parity must be kept in sync with locked branding:
   - `supermandi-landing/og-image.png` (recommended `1200x630`)
   - OG meta tags in `supermandi-landing/index.html`
   - OG meta tags in `supermandi-landing/pos.html`
6. Claude cannot mark brand sync complete until staging deploy evidence for `landing` is captured (run/ref + timestamp).

## 2C. Tracking Protocol (Codex + Claude)

At each retry, Claude must publish a short checkpoint containing:

- `Attempt #`
- `HEAD SHA`
- `staging_batch.commitSha`
- `git status --short` summary
- `pnpm workflow:pre-staging` result
- next blocking item (if failed)

No silent retries.

## 3. Updated Files To Keep In Memory

- `.github/workflows/ci-gates.yml`
- `.gitignore`
- `package.json`
- `RELEASES/CLAUDE_STATE.md`
- `RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md`
- `RELEASES/CLAUDE_NEXT_ACTION_FIX001.md`
- `scripts/deploy-cloud-run.sh`
- `scripts/gates/git-discipline.sh`
- `scripts/promote-to-prod.sh`
- `scripts/release-gate.js`
- `scripts/workflow/guard.js`
- `scripts/workflow/generate-live-page-manifest.js`
- `scripts/workflow/production-identity-guard.sh`
- `scripts/workflow/session-boot.js`
- `scripts/workflow/ticket-monitor.js`
- `scripts/workflow/pre-staging-attempt.js`
- `workflow/README.md`
- `workflow/legacy_conflicts.json`
- `workflow/production_boundary_iam.md`
- `workflow/schemas/freeze_manifest.schema.json`
- `workflow/schemas/screen_state.schema.json`
- `workflow/schemas/staging_batch.schema.json`
- `workflow/schemas/ticket.schema.json`
- `workflow/screens/.gitkeep`
- `workflow/state/freeze_manifest.json`
- `workflow/state/live_page_manifest.json`
- `workflow/state/staging_batch.json`
- `workflow/state/workflow_state.json`
- `workflow/templates/freeze_manifest.example.json`
- `workflow/templates/live_ticket_intake.example.md`
- `workflow/templates/screen.example.json`
- `workflow/templates/staging_batch.example.json`
- `workflow/templates/ticket.example.json`
- `workflow/tickets/.gitkeep`
- `supermandi-landing/playstore-assets/developer-icon-512.png`
- `supermandi-landing/playstore-assets/developer-header-4096x2304.jpg`
- `supermandi-landing/playstore-assets/preview-local.html`
- `supermandi-landing/og-image.png`
- `supermandi-landing/index.html`
- `supermandi-landing/pos.html`
- `.github/workflows/deploy.yml`

## 4. Guardrails

- Claude is staging-only; production promotion requires explicit operator approval.
- No ticket can be locked without passing all production layers and operator signoff.
- No screen certification without linked ticket locks and impact re-test pass.
- No freeze without pinned image digests, revision IDs, and migration lock.
- No production promote without `FREEZE_READY` and principal-bound operator approval.
- For `FIX-001` staging deploy attempts, Claude must re-read this file before each retry and follow Section 2A exactly.
- For this active wave, Claude must also enforce Section 2B and Section 2C on every deploy attempt.
- For deployment completion, Claude must enforce Section 2D and prove all 6 staging services are on the target wave version.
- For live testing completion, Claude must enforce Section 2E and reject score-based completion claims.
- For active live-iteration sessions, Claude must enforce Section 2F: cumulative deploy first, then full micro ticketization, then implementation.
- For ticket intake quality, Claude must enforce Section 2G: new tickets must be sourced from live GCP staging evidence.
- For ticket intake timing, Claude must enforce Section 2H: no new ticket intake before successful staging deploy evidence.
- For active live-iteration execution order, Claude must enforce Section 2L machine phase gates (ticketization -> implementation -> deploy) with no bypass.
- For active ticketization phases, Claude must also enforce Section 2M narrative sync checks for `RELEASES/CLAUDE_CURRENT_STATE.json` (no premature closure language).
- For locked Play/Facebook brand assets, Claude must enforce Section 2N canonical file sync and staging `landing` deploy evidence.
- Claude must read `RELEASES/CLAUDE_NEXT_ACTION_FIX001.md` in every FIX-001 session before attempting deploy.
