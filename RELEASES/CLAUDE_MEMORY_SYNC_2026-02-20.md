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
- `workflow/state/staging_batch.json`
- `workflow/state/workflow_state.json`
- `workflow/templates/freeze_manifest.example.json`
- `workflow/templates/screen.example.json`
- `workflow/templates/staging_batch.example.json`
- `workflow/templates/ticket.example.json`
- `workflow/tickets/.gitkeep`

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
- Claude must read `RELEASES/CLAUDE_NEXT_ACTION_FIX001.md` in every FIX-001 session before attempting deploy.
